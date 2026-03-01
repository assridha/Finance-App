from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import PortfolioSnapshot
from services.portfolio_service import compute_portfolio_current


async def take_snapshot(db: AsyncSession) -> PortfolioSnapshot:
    """Compute current portfolio value and store as today's snapshot. Upsert by date."""
    total_fair, _total_market, by_account, _ = await compute_portfolio_current(db)
    import json
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
