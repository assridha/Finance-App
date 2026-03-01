import enum
from sqlalchemy import String, Boolean, Numeric, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class AccountType(str, enum.Enum):
    cash = "cash"
    brokerage = "brokerage"
    bitcoin = "bitcoin"
    property = "property"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    is_margin: Mapped[bool] = mapped_column(Boolean, default=False)
    margin_debt: Mapped[float | None] = mapped_column(Numeric(20, 4), default=0, nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)

    assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="account", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Account(id={self.id}, name={self.name}, type={self.type})>"
