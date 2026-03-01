from pydantic import BaseModel, ConfigDict


class ForecastRequest(BaseModel):
    horizon_years: float = 10
    # Global defaults (can be overridden per asset in future)
    margin_interest_rate: float = 0.08
    cashflow_bucket_cagr: float = 0.05


class ForecastSeriesAccountItem(BaseModel):
    account_id: int
    account_name: str
    value: float


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
    value: float
    details: dict[str, float] = {}


class ForecastResponse(BaseModel):
    series: list[ForecastSeriesItem]
    breakdown: list[ForecastBreakdownItem] = []
