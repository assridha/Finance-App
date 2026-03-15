from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import get_db
from models import Asset, AccountType
from schemas.portfolio import PriceResponse, PriceItem
from services.yfinance_service import get_prices
from services.price_model_service import get_or_compute_model

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("", response_model=PriceResponse)
async def get_prices_endpoint(
    db: AsyncSession = Depends(get_db),
    recalculate: str | None = Query(None, description="Comma-separated symbols to force model refresh"),
):
    r = await db.execute(select(Asset).options(selectinload(Asset.account)))
    assets = r.scalars().all()
    symbols = set()
    for a in assets:
        if a.symbol:
            symbols.add(a.symbol)
        if a.account and a.account.type == AccountType.bitcoin and a.btc_amount and float(a.btc_amount) != 0:
            symbols.add("BTC-USD")
    symbols = list(symbols)
    raw = get_prices(symbols)
    recalc_set = set()
    if recalculate:
        recalc_set = {s.strip().upper() for s in recalculate.split(",") if s.strip()}
    prices = {}
    for sym in symbols:
        market = raw.get(sym, {})
        price = market.get("price") or 0.0
        change24h = market.get("change24h")
        item = PriceItem(price=price, change24h=change24h)
        force = sym.upper() in recalc_set
        model = await get_or_compute_model(db, sym, force_refresh=force)
        if model:
            item.fair_value = model.get("fair_value")
            item.floor_5 = model.get("floor_5")
            item.ceiling_95 = model.get("ceiling_95")
            item.quantile = model.get("quantile")
            item.model_updated_at = model.get("updated_at")
            item.model_type = model.get("model_type")
            item.ratio_as_of_date = model.get("ratio_as_of_date")
            params = {}
            if model.get("param_intercept") is not None:
                params["intercept"] = model["param_intercept"]
            if model.get("param_slope") is not None:
                params["slope"] = model["param_slope"]
            if model.get("param_exponent") is not None:
                params["exponent"] = model["param_exponent"]
            if model.get("residual_std_log") is not None:
                params["residual_std_log"] = model["residual_std_log"]
            if model.get("btc_to_ibit_ratio") is not None:
                params["btc_to_ibit_ratio"] = model["btc_to_ibit_ratio"]
            if params:
                item.model_params = params
        prices[sym] = item
    return PriceResponse(prices=prices)


class RecalculateBody(BaseModel):
    symbols: list[str] = []


@router.post("/recalculate")
async def recalculate_models(
    body: RecalculateBody,
    db: AsyncSession = Depends(get_db),
):
    """Force refresh price models for the given symbols. Returns after recomputing; client should then GET /prices."""
    symbols = [s.strip() for s in body.symbols if s.strip()]
    # Process BTC-USD before IBIT so the BTC model exists when deriving IBIT
    def recalc_order(s: str) -> tuple[int, str]:
        u = s.upper()
        if u == "BTC-USD":
            return (0, s)
        if u == "IBIT":
            return (1, s)
        return (2, s)
    for sym in sorted(symbols, key=recalc_order):
        await get_or_compute_model(db, sym, force_refresh=True)
    return {"recalculated": symbols}
