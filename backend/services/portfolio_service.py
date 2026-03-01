from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import Account, Asset, AccountType
from services.yfinance_service import get_prices
from services.price_model_service import get_or_compute_model


async def compute_portfolio_current(db: AsyncSession, prices: dict[str, dict] | None = None) -> tuple[float, float, list[dict], list[dict]]:
    """Returns (total_fair_value, total_market_value, by_account list, per-asset list). Uses fair value for stocks/BTC/IBIT when model exists."""
    r = await db.execute(select(Account).options(selectinload(Account.assets)).order_by(Account.id))
    accounts = list(r.scalars().all())
    symbols_set = set()
    for acc in accounts:
        for a in acc.assets:
            if a.symbol:
                symbols_set.add(a.symbol)
            if acc.type == AccountType.bitcoin and (a.btc_amount or 0) != 0:
                symbols_set.add("BTC-USD")
    symbols = list(symbols_set)
    if not prices:
        prices = get_prices(symbols) if symbols else {}
    # Get fair value (and market price) from models where available
    model_by_symbol = {}
    for sym in symbols:
        model = await get_or_compute_model(db, sym, force_refresh=False)
        if model:
            model_by_symbol[sym] = model
    by_account = []
    assets_detail = []
    total_fair = Decimal("0")
    total_market = Decimal("0")
    for acc in accounts:
        acc_value_fair = Decimal("0")
        acc_value_market = Decimal("0")
        for a in acc.assets:
            if acc.type == AccountType.cash and a.balance is not None:
                v = Decimal(str(a.balance))
                acc_value_fair += v
                acc_value_market += v
                assets_detail.append({
                    "asset_id": a.id,
                    "account_id": acc.id,
                    "symbol": a.symbol,
                    "shares": float(a.shares) if a.shares is not None else None,
                    "btc_amount": float(a.btc_amount) if a.btc_amount is not None else None,
                    "balance": float(a.balance) if a.balance is not None else None,
                    "property_value": float(a.property_value) if a.property_value is not None else None,
                    "mortgage_balance": float(a.mortgage_balance) if a.mortgage_balance is not None else None,
                    "value": float(v),
                    "market_value": float(v),
                    "fair_price": None,
                    "market_price": None,
                })
            elif acc.type == AccountType.brokerage and a.symbol and a.shares is not None:
                sym = a.symbol
                shares_f = float(a.shares)
                model = model_by_symbol.get(sym)
                market_p = (prices.get(sym, {}).get("price") or 0) if not model else (model.get("market_price") or prices.get(sym, {}).get("price") or 0)
                if model and model.get("fair_value") is not None:
                    fair_p = model["fair_value"]
                    v_fair = Decimal(str(shares_f)) * Decimal(str(fair_p))
                else:
                    fair_p = market_p
                    v_fair = Decimal(str(shares_f)) * Decimal(str(market_p))
                v_market = Decimal(str(shares_f)) * Decimal(str(market_p))
                acc_value_fair += v_fair
                acc_value_market += v_market
                assets_detail.append({
                    "asset_id": a.id,
                    "account_id": acc.id,
                    "symbol": a.symbol,
                    "shares": shares_f,
                    "btc_amount": None,
                    "balance": None,
                    "property_value": None,
                    "mortgage_balance": None,
                    "value": float(v_fair),
                    "market_value": float(v_market),
                    "fair_price": fair_p,
                    "market_price": market_p,
                })
            elif acc.type == AccountType.bitcoin and a.btc_amount is not None:
                btc_amount_f = float(a.btc_amount)
                model = model_by_symbol.get("BTC-USD")
                market_p = (prices.get("BTC-USD", {}).get("price") or 0) if not model else (model.get("market_price") or prices.get("BTC-USD", {}).get("price") or 0)
                if model and model.get("fair_value") is not None:
                    fair_p = model["fair_value"]
                    v_fair = Decimal(str(btc_amount_f)) * Decimal(str(fair_p))
                else:
                    fair_p = market_p
                    v_fair = Decimal(str(btc_amount_f)) * Decimal(str(market_p))
                v_market = Decimal(str(btc_amount_f)) * Decimal(str(market_p))
                acc_value_fair += v_fair
                acc_value_market += v_market
                assets_detail.append({
                    "asset_id": a.id,
                    "account_id": acc.id,
                    "symbol": "BTC-USD",
                    "shares": None,
                    "btc_amount": btc_amount_f,
                    "balance": None,
                    "property_value": None,
                    "mortgage_balance": None,
                    "value": float(v_fair),
                    "market_value": float(v_market),
                    "fair_price": fair_p,
                    "market_price": market_p,
                })
            elif acc.type == AccountType.property and a.property_value is not None and a.mortgage_balance is not None:
                v = Decimal(str(a.property_value)) - Decimal(str(a.mortgage_balance))
                acc_value_fair += v
                acc_value_market += v
                assets_detail.append({
                    "asset_id": a.id,
                    "account_id": acc.id,
                    "symbol": a.symbol,
                    "shares": None,
                    "btc_amount": None,
                    "balance": None,
                    "property_value": float(a.property_value),
                    "mortgage_balance": float(a.mortgage_balance),
                    "value": float(v),
                    "market_value": float(v),
                    "fair_price": None,
                    "market_price": None,
                })
            elif acc.type == AccountType.property and a.property_value is not None:
                v = Decimal(str(a.property_value))
                acc_value_fair += v
                acc_value_market += v
                assets_detail.append({
                    "asset_id": a.id,
                    "account_id": acc.id,
                    "symbol": a.symbol,
                    "shares": None,
                    "btc_amount": None,
                    "balance": None,
                    "property_value": float(a.property_value),
                    "mortgage_balance": float(a.mortgage_balance) if a.mortgage_balance is not None else None,
                    "value": float(v),
                    "market_value": float(v),
                    "fair_price": None,
                    "market_price": None,
                })
            else:
                assets_detail.append({
                    "asset_id": a.id,
                    "account_id": acc.id,
                    "symbol": a.symbol,
                    "shares": float(a.shares) if a.shares is not None else None,
                    "btc_amount": float(a.btc_amount) if a.btc_amount is not None else None,
                    "balance": float(a.balance) if a.balance is not None else None,
                    "property_value": float(a.property_value) if a.property_value is not None else None,
                    "mortgage_balance": float(a.mortgage_balance) if a.mortgage_balance is not None else None,
                    "value": 0.0,
                    "market_value": 0.0,
                    "fair_price": None,
                    "market_price": None,
                })
        if acc.is_margin and acc.margin_debt is not None:
            debt = Decimal(str(acc.margin_debt))
            acc_value_fair -= debt
            acc_value_market -= debt
        by_account.append({
            "account_id": acc.id,
            "account_name": acc.name,
            "value": float(acc_value_fair),
            "market_value": float(acc_value_market),
            "color": getattr(acc, "color", None),
        })
        total_fair += acc_value_fair
        total_market += acc_value_market
    return float(total_fair), float(total_market), by_account, assets_detail
