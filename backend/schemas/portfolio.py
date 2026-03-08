from datetime import date
from pydantic import BaseModel


class AccountValueItem(BaseModel):
    account_id: int
    account_name: str
    value: float  # fair value
    market_value: float | None = None  # market price–based value
    color: str | None = None


class PortfolioCurrentResponse(BaseModel):
    total_value: float  # fair value total
    total_market_value: float | None = None  # market price total (when different)
    by_account: list[AccountValueItem]
    assets: list[dict]  # per-asset value breakdown (value=fair, market_value, fair_price, market_price)


class PortfolioHistoryItem(BaseModel):
    date: str  # YYYY-MM-DD
    total_value: float
    by_account: list[AccountValueItem] | None = None  # per-account breakdown when stored in snapshot


class PortfolioHistoryResponse(BaseModel):
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
    prices: dict[str, PriceItem]  # symbol -> PriceItem
