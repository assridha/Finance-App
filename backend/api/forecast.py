from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from schemas.forecast import (
    ForecastBreakdownItem,
    ForecastRequest,
    ForecastResponse,
    ForecastSeriesAccountItem,
    ForecastSeriesItem,
)
from forecast.forecast_engine import run_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("", response_model=ForecastResponse)
async def post_forecast(req: ForecastRequest, db: AsyncSession = Depends(get_db)):
    series, breakdown = await run_forecast(
        db,
        horizon_years=req.horizon_years,
        margin_interest_rate=req.margin_interest_rate,
        cashflow_bucket_cagr=req.cashflow_bucket_cagr,
    )
    out_series = []
    for s in series:
        by_account = s.get("by_account", [])
        account_values = {a["account_name"]: a["value"] for a in by_account}
        out_series.append(
            ForecastSeriesItem(
                date=s["date"],
                total_value=s["total_value"],
                cashflow_bucket=s.get("cashflow_bucket"),
                by_account=[ForecastSeriesAccountItem(**a) for a in by_account],
                account_values=account_values,
            )
        )
    return ForecastResponse(
        series=out_series,
        breakdown=[ForecastBreakdownItem(year=b["year"], date=b["date"], label=b["label"], type=b["type"], value=b["value"], details=b.get("details") or {}) for b in breakdown],
    )
