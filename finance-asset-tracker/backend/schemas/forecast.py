from typing import Literal

from pydantic import BaseModel, ConfigDict


class ForecastRequest(BaseModel):
    horizon_years: float = 10
    # Global defaults (can be overridden per asset in future)
    margin_interest_rate: float = 0.08
    cashflow_bucket_cagr: float = 0.05
    price_level: Literal["fair", "optimistic", "worst_case"] = "fair"


class ForecastSeriesAccountItem(BaseModel):
    account_id: int
    account_name: str
    value: float
    color: str | None = None


class ForecastSeriesItem(BaseModel):
    date: str
    total_value: float
    cashflow_bucket: float | None = None
    by_account: list[ForecastSeriesAccountItem] = []
    account_values: dict[str, float] = {}  # account_name -> value for chart stacking


class ForecastBreakdownItem(BaseModel):
    year: int
    date: str
    label: str
    type: str  # cash | brokerage | bitcoin | property | margin
    value: float  # USD
    details: dict[str, float | str] = {}  # numeric values in USD; may include "currency" for display


class ForecastResponse(BaseModel):
    unit_of_account: str = "USD"  # all value fields in series and breakdown are in USD
    series: list[ForecastSeriesItem]
    breakdown: list[ForecastBreakdownItem] = []
