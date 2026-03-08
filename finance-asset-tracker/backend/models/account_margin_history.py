from datetime import datetime
from sqlalchemy import DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class AccountMarginHistory(Base):
    __tablename__ = "account_margin_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    margin_debt: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
