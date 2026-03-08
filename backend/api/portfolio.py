import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db import get_db
from models import PortfolioSnapshot, Account, Asset, AccountType
from schemas.portfolio import PortfolioCurrentResponse, PortfolioHistoryResponse, PortfolioHistoryItem, AccountValueItem
from services.portfolio_service import compute_portfolio_current
from services.fx_service import amount_to_usd
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
                value_floor_5=x.get("value_floor_5"),
                value_ceiling_95=x.get("value_ceiling_95"),
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
                    AccountValueItem(
                        account_id=x["account_id"],
                        account_name=x["account_name"],
                        value=float(x["value"]),
                        market_value=float(x["market_value"]) if x.get("market_value") is not None else None,
                        color=x.get("color"),
                    )
                    for x in raw
                ]
            except (json.JSONDecodeError, KeyError, TypeError):
                pass
        history_items.append(
            PortfolioHistoryItem(
                date=s.date.isoformat(),
                total_value=float(s.total_value),
                total_market_value=float(s.total_market_value) if s.total_market_value is not None else None,
                by_account=by_account,
            )
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
        prop_currency = getattr(a, "currency", None) or "USD"
        mb_usd = amount_to_usd(mb, prop_currency)
        rate = float(a.mortgage_annual_rate)
        n = a.mortgage_term_remaining_months
        if n <= 0:
            continue
        monthly = annuity_payment(mb_usd, rate, n, 12)
        result.append({
            "account_name": acc.name,
            "asset_id": a.id,
            "monthly_payment": round(monthly, 2),
            "mortgage_balance": round(mb_usd, 2),
        })
    return {"payments": result}


@router.get("/cash-debt-interest")
async def get_cash_debt_interest(
    margin_interest_rate: float = Query(0.08, description="Default annual rate when asset has no debt_interest_rate"),
    db: AsyncSession = Depends(get_db),
):
    """Return net monthly interest expense from all negative cash balances (cash accounts and brokerage margin debt). Values in USD. Uses per-asset debt_interest_rate when set, else default."""
    # Negative cash balance = debt (cash account or brokerage margin). Exclude brokerage positions (they have symbol).
    r = await db.execute(
        select(Account, Asset)
        .join(Asset, Asset.account_id == Account.id)
        .where(Asset.balance.isnot(None))
        .where(Asset.balance < 0)
        .where(
            (Account.type == AccountType.cash) | ((Account.type == AccountType.brokerage) & (Asset.symbol.is_(None))),
        )
        .order_by(Account.id),
    )
    rows = r.all()
    by_account: list[dict] = []
    total_monthly_interest_usd = 0.0
    seen_accounts: dict[int, dict] = {}
    for acc, a in rows:
        balance_raw = float(a.balance)
        if balance_raw >= 0:
            continue
        rate = getattr(a, "debt_interest_rate", None)
        if rate is None:
            rate = margin_interest_rate
        else:
            rate = float(rate)
        currency = getattr(a, "currency", None) or acc.currency
        debt_usd = abs(amount_to_usd(balance_raw, currency))
        monthly_interest_usd = debt_usd * (rate / 12)
        total_monthly_interest_usd += monthly_interest_usd
        if acc.id not in seen_accounts:
            seen_accounts[acc.id] = {
                "account_id": acc.id,
                "account_name": acc.name,
                "monthly_interest_usd": 0.0,
                "debt_balance_usd": 0.0,
            }
            by_account.append(seen_accounts[acc.id])
        seen_accounts[acc.id]["monthly_interest_usd"] += monthly_interest_usd
        seen_accounts[acc.id]["debt_balance_usd"] += debt_usd
    for item in by_account:
        item["monthly_interest_usd"] = round(item["monthly_interest_usd"], 2)
        item["debt_balance_usd"] = round(item["debt_balance_usd"], 2)
    return {
        "unit_of_account": "USD",
        "total_monthly_interest_usd": round(total_monthly_interest_usd, 2),
        "margin_interest_rate": margin_interest_rate,
        "by_account": by_account,
    }
