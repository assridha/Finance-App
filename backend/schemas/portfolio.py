from datetime import date
from pydantic import BaseModel


class AccountValueItem(BaseModel):
    account_id: int
    account_name: str
    value: float  # fair value
    market_value: float | None = None  # market price–based value
    value_floor_5: float | None = None  # 5th percentile (worst case) when model exists
    value_ceiling_95: float | None = None  # 95th percentile (optimistic) when model exists
    color: str | None = None


class PortfolioCurrentResponse(BaseModel):
    unit_of_account: str = "USD"  # all value/price fields in this response are in USD
    total_value: float  # fair value total (USD)
    total_market_value: float | None = None  # market price total (USD)
    by_account: list[AccountValueItem]
    assets: list[dict]  # per-asset value breakdown (value, market_value in USD)


class PortfolioHistoryItem(BaseModel):
    date: str  # YYYY-MM-DD
    total_value: float
    total_market_value: float | None = None  # market price total when stored in snapshot
    by_account: list[AccountValueItem] | None = None  # per-account breakdown when stored in snapshot


class PortfolioHistoryResponse(BaseModel):
    unit_of_account: str = "USD"  # all value fields in history are in USD
    history: list[PortfolioHistoryItem]


class PriceItem(BaseModel):
    price: float
    change24h: float | None
    # Regression model (fair value, bands, quantile)
    fair_value: float | None = None
    floor_5: float | None = None
    ceiling_95: float | None = None
    quantile: float | None = None
    model_updated_at: str | None = None
    model_type: str | None = None  # stock | bitcoin | ibit
    model_params: dict[str, float] | None = None  # intercept, slope, residual_std_log, etc.
    ratio_as_of_date: str | None = None  # IBIT only


class PriceResponse(BaseModel):
    unit_of_account: str = "USD"  # price, fair_value, floor_5, ceiling_95 are in USD
    prices: dict[str, PriceItem]  # symbol -> PriceItem
