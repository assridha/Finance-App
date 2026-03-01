import enum
from datetime import date
from sqlalchemy import String, Numeric, Date, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class CashflowType(str, enum.Enum):
    income = "income"
    expense = "expense"


class CashflowFrequency(str, enum.Enum):
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class Cashflow(Base):
    __tablename__ = "cashflows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    type: Mapped[CashflowType] = mapped_column(Enum(CashflowType), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    frequency: Mapped[CashflowFrequency] = mapped_column(Enum(CashflowFrequency), default=CashflowFrequency.monthly)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
