from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import get_db
from models import Asset, AccountType
from schemas.price_models import PriceModelChartResponse, PriceModelChartPoint, PriceModelSymbolsResponse
from services.price_model_service import get_chart_data

router = APIRouter(prefix="/price-models", tags=["price-models"])


@router.get("/symbols", response_model=PriceModelSymbolsResponse)
async def get_price_model_symbols(db: AsyncSession = Depends(get_db)):
    """Return symbols that can be charted: only symbols from portfolio assets (same as Prices page)."""
    r = await db.execute(select(Asset).options(selectinload(Asset.account)))
    assets = r.scalars().all()
    symbols = set()
    for a in assets:
        if a.symbol:
            symbols.add(a.symbol)
        if a.account and a.account.type == AccountType.bitcoin and a.btc_amount and float(a.btc_amount) != 0:
            symbols.add("BTC-USD")
    return PriceModelSymbolsResponse(symbols=sorted(symbols))


@router.get("/chart", response_model=PriceModelChartResponse)
async def get_price_model_chart(
    symbol: str = Query(..., description="Asset ticker (e.g. AAPL, BTC-USD, IBIT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return historical price and fitted model (fair value + 5th/95th percentile bands) for charting."""
    symbol = (symbol or "").strip()
    if symbol:
        symbol = symbol.upper()
    if not symbol:
        raise HTTPException(status_code=422, detail="Symbol is required")
    payload = await get_chart_data(db, symbol)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No model or history available for this symbol. For IBIT, ensure BTC-USD and IBIT price data can be fetched (e.g. from Yahoo Finance).",
        )
    return PriceModelChartResponse(
        symbol=payload["symbol"],
        model_type=payload["model_type"],
        fit_start_date=payload.get("fit_start_date"),
        fit_end_date=payload.get("fit_end_date"),
        data=[PriceModelChartPoint(**p) for p in payload["data"]],
    )
