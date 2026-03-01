from datetime import datetime
from sqlalchemy import DateTime, Numeric, String, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class AssetQuantityHistory(Base):
    __tablename__ = "asset_quantity_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Snapshot of quantity (interpretation depends on asset type: shares, btc_amount, balance, property_value, mortgage_balance)
    quantity_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: {"shares": 10} or {"balance": 1000} etc.
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="quantity_history")
