import enum
from sqlalchemy import String, Numeric, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class AssetType(str, enum.Enum):
    cash = "cash"
    brokerage = "brokerage"
    bitcoin = "bitcoin"
    property = "property"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)

    # Type-specific fields (only one set used per type)
    # Cash: balance in currency. debt_interest_rate: annual rate when balance < 0 (margin/overdraft).
    balance: Mapped[float | None] = mapped_column(Numeric(20, 4), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    debt_interest_rate: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)

    # Brokerage: symbol + shares
    symbol: Mapped[str | None] = mapped_column(String(20), nullable=True)
    shares: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)

    # Bitcoin: amount in BTC
    btc_amount: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)

    # Property: value and mortgage
    property_value: Mapped[float | None] = mapped_column(Numeric(20, 4), nullable=True)
    mortgage_balance: Mapped[float | None] = mapped_column(Numeric(20, 4), nullable=True)
    appreciation_cagr: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    mortgage_annual_rate: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    mortgage_term_remaining_months: Mapped[int | None] = mapped_column(nullable=True)
    payment_frequency: Mapped[str | None] = mapped_column(String(20), default="monthly", nullable=True)

    account: Mapped["Account"] = relationship("Account", back_populates="assets")
    quantity_history: Mapped[list["AssetQuantityHistory"]] = relationship(
        "AssetQuantityHistory", back_populates="asset", cascade="all, delete-orphan", order_by="AssetQuantityHistory.changed_at.desc()"
    )

    def __repr__(self) -> str:
        return f"<Asset(id={self.id}, account_id={self.account_id})>"
