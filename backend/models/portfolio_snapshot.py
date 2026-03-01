from datetime import date
from sqlalchemy import Date, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    total_value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    breakdown_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # optional per-account breakdown
