from pydantic import BaseModel
from models import AccountType


class AccountCreate(BaseModel):
    name: str
    type: AccountType
    currency: str = "USD"
    color: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    color: str | None = None


class AccountResponse(BaseModel):
    id: int
    name: str
    type: AccountType
    currency: str
    color: str | None = None

    class Config:
        from_attributes = True
