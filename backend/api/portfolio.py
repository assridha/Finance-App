import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db import get_db
from models import PortfolioSnapshot, Account, Asset, AccountType
from schemas.portfolio import PortfolioCurrentResponse, PortfolioHistoryResponse, PortfolioHistoryItem, AccountValueItem
from services.portfolio_service import compute_portfolio_current
from forecast.property_forecast import annuity_payment

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/current", response_model=PortfolioCurrentResponse)
async def get_portfolio_current(db: AsyncSession = Depends(get_db)):
    total_fair, total_market, by_account, assets = await compute_portfolio_current(db)
    return PortfolioCurrentResponse(
        total_value=total_fair,
        total_market_value=total_market,
        by_account=[
            AccountValueItem(
                account_id=x["account_id"],
                account_name=x["account_name"],
                value=x["value"],
                market_value=x.get("market_value"),
                color=x.get("color"),
            )
            for x in by_account
        ],
        assets=assets,
    )


@router.get("/history", response_model=PortfolioHistoryResponse)
async def get_portfolio_history(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(PortfolioSnapshot).order_by(PortfolioSnapshot.date)
    if from_date:
        q = q.where(PortfolioSnapshot.date >= from_date)
    if to_date:
        q = q.where(PortfolioSnapshot.date <= to_date)
    r = await db.execute(q)
    rows = r.scalars().all()
    history_items = []
    for s in rows:
        by_account = None
        if s.breakdown_json:
            try:
                raw = json.loads(s.breakdown_json)
                by_account = [
                    AccountValueItem(account_id=x["account_id"], account_name=x["account_name"], value=float(x["value"]))
                    for x in raw
                ]
            except (json.JSONDecodeError, KeyError, TypeError):
                pass
        history_items.append(
            PortfolioHistoryItem(date=s.date.isoformat(), total_value=float(s.total_value), by_account=by_account)
        )
    return PortfolioHistoryResponse(history=history_items)


@router.get("/estimated-mortgage-payments")
async def get_estimated_mortgage_payments(db: AsyncSession = Depends(get_db)):
    """Return estimated current monthly mortgage payment for each property asset that has an active mortgage."""
    r = await db.execute(
        select(Account, Asset)
        .join(Asset, Asset.account_id == Account.id)
        .where(Account.type == AccountType.property)
        .where(Asset.property_value.isnot(None))
        .where(Asset.mortgage_balance.isnot(None))
        .where(Asset.mortgage_annual_rate.isnot(None))
        .where(Asset.mortgage_term_remaining_months.isnot(None))
    )
    rows = r.all()
    result = []
    for acc, a in rows:
        mb = float(a.mortgage_balance)
        if mb <= 0:
            continue
        rate = float(a.mortgage_annual_rate)
        n = a.mortgage_term_remaining_months
        if n <= 0:
            continue
        monthly = annuity_payment(mb, rate, n, 12)
        result.append({
            "account_name": acc.name,
            "asset_id": a.id,
            "monthly_payment": round(monthly, 2),
            "mortgage_balance": mb,
        })
    return {"payments": result}
