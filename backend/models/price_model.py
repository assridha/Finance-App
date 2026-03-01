from datetime import date
import enum
from sqlalchemy import Date, Enum, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class PriceModelType(str, enum.Enum):
    stock = "stock"
    bitcoin = "bitcoin"
    ibit = "ibit"


class PriceModel(Base):
    """Stored regression model per symbol. Fair value, floor (5th %ile), ceiling (95th %ile) computed on read."""

    __tablename__ = "price_models"

    symbol: Mapped[str] = mapped_column(String(20), primary_key=True)
    model_type: Mapped[str] = mapped_column(Enum(PriceModelType), nullable=False)
    updated_at: Mapped[date] = mapped_column(Date, nullable=False)

    # Stock: log(price) = param_intercept + param_slope * t (t in years)
    param_intercept: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)
    param_slope: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)
    # Bitcoin: log(price) = param_intercept + param_exponent * log(days_since_genesis)
    param_exponent: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)
    # Both: std of residuals in log space for 5th/95th bands
    residual_std_log: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)

    fit_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # stock only
    fit_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # stock, bitcoin

    # IBIT only: IBIT_fair = BTC_fair * btc_to_ibit_ratio (ratio from same-timestamp closes)
    btc_to_ibit_ratio: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)
    ratio_as_of_date: Mapped[date | None] = mapped_column(Date, nullable=True)
