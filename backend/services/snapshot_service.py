import json
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import PortfolioSnapshot
from services.portfolio_service import compute_portfolio_current

OTHER_DELETED_ACCOUNTS_LABEL = "Other (deleted accounts)"


async def rewrite_snapshots_after_account_delete(db: AsyncSession, account_id: int) -> None:
    """Update all portfolio snapshots: remove the deleted account from breakdown and add an
    'Other (deleted accounts)' entry so breakdown still sums to total_value."""
    r = await db.execute(
        select(PortfolioSnapshot).where(PortfolioSnapshot.breakdown_json.isnot(None))
    )
    for snap in r.scalars().all():
        try:
            raw = json.loads(snap.breakdown_json)
        except (json.JSONDecodeError, TypeError):
            continue
        if not raw:
            continue
        # Keep only entries for accounts that still exist (not the one we're deleting)
        # and merge any existing 'Other (deleted accounts)' into one we'll recompute
        remaining = [
            x for x in raw
            if int(x.get("account_id", 0)) != account_id
            and x.get("account_name") != OTHER_DELETED_ACCOUNTS_LABEL
            and int(x.get("account_id", 0)) != -1
        ]
        sum_remaining = sum(float(x.get("value", 0)) for x in remaining)
        total = float(snap.total_value)
        other_value = round(total - sum_remaining, 4)
        remaining.append({
            "account_id": -1,
            "account_name": OTHER_DELETED_ACCOUNTS_LABEL,
            "value": other_value,
        })
        snap.breakdown_json = json.dumps(remaining)
    await db.flush()


async def take_snapshot(db: AsyncSession) -> PortfolioSnapshot:
    """Compute current portfolio value and store as today's snapshot. Upsert by date."""
    total_fair, _total_market, by_account, _ = await compute_portfolio_current(db)
    today = date.today()
    r = await db.execute(select(PortfolioSnapshot).where(PortfolioSnapshot.date == today))
    existing = r.scalar_one_or_none()
    if existing:
        existing.total_value = total_fair
        existing.breakdown_json = json.dumps(by_account)
        await db.flush()
        await db.refresh(existing)
        return existing
    snap = PortfolioSnapshot(date=today, total_value=total_fair, breakdown_json=json.dumps(by_account))
    db.add(snap)
    await db.flush()
    await db.refresh(snap)
    return snap
