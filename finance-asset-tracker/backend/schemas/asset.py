from pydantic import BaseModel


class AssetCreate(BaseModel):
    # Type-specific; only set the ones for this account type
    balance: float | None = None
    currency: str | None = None
    debt_interest_rate: float | None = None
    symbol: str | None = None
    shares: float | None = None
    btc_amount: float | None = None
    property_value: float | None = None
    mortgage_balance: float | None = None
    appreciation_cagr: float | None = None
    mortgage_annual_rate: float | None = None
    mortgage_term_remaining_months: int | None = None
    payment_frequency: str | None = "monthly"


class AssetUpdate(BaseModel):
    balance: float | None = None
    currency: str | None = None
    debt_interest_rate: float | None = None
    symbol: str | None = None
    shares: float | None = None
    btc_amount: float | None = None
    property_value: float | None = None
    mortgage_balance: float | None = None
    appreciation_cagr: float | None = None
    mortgage_annual_rate: float | None = None
    mortgage_term_remaining_months: int | None = None
    payment_frequency: str | None = None


class AssetResponse(BaseModel):
    id: int
    account_id: int
    balance: float | None
    currency: str | None
    debt_interest_rate: float | None
    symbol: str | None
    shares: float | None
    btc_amount: float | None
    property_value: float | None
    mortgage_balance: float | None
    appreciation_cagr: float | None
    mortgage_annual_rate: float | None
    mortgage_term_remaining_months: int | None
    payment_frequency: str | None

    class Config:
        from_attributes = True
