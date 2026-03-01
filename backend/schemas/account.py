from pydantic import BaseModel
from models import AccountType


class AccountCreate(BaseModel):
    name: str
    type: AccountType
    currency: str = "USD"
    is_margin: bool = False
    margin_debt: float | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    is_margin: bool | None = None
    margin_debt: float | None = None


class AccountResponse(BaseModel):
    id: int
    name: str
    type: AccountType
    currency: str
    is_margin: bool
    margin_debt: float | None

    class Config:
        from_attributes = True
