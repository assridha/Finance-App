from datetime import date
from pydantic import BaseModel
from models import CashflowType, CashflowFrequency


class CashflowCreate(BaseModel):
    type: CashflowType
    amount: float
    currency: str = "USD"
    frequency: CashflowFrequency = CashflowFrequency.monthly
    start_date: date
    end_date: date
    name: str | None = None
    category: str | None = None


class CashflowUpdate(BaseModel):
    type: CashflowType | None = None
    amount: float | None = None
    currency: str | None = None
    frequency: CashflowFrequency | None = None
    start_date: date | None = None
    end_date: date | None = None
    name: str | None = None
    category: str | None = None


class CashflowResponse(BaseModel):
    id: int
    type: CashflowType
    amount: float
    currency: str
    frequency: CashflowFrequency
    start_date: date
    end_date: date
    name: str | None
    category: str | None

    class Config:
        from_attributes = True
