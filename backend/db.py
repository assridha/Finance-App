from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import get_database_url


DATABASE_URL = get_database_url()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


def _migrate_account_color(sync_conn):
    """Add accounts.color column if missing (transition from pre-color schema)."""
    r = sync_conn.execute(text("PRAGMA table_info(accounts)"))
    rows = r.fetchall()
    # SQLite: (cid, name, type, notnull, dflt_value, pk)
    if not any(len(row) > 1 and row[1] == "color" for row in rows):
        sync_conn.execute(text("ALTER TABLE accounts ADD COLUMN color VARCHAR(7)"))


def _migrate_margin_to_cash_assets(sync_conn):
    """One-off: for accounts with is_margin=1 and margin_debt > 0, create a cash asset with balance=-margin_debt."""
    sync_conn.execute(text(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (version TEXT PRIMARY KEY)")
    )
    r = sync_conn.execute(text("INSERT OR IGNORE INTO _schema_migrations (version) VALUES ('margin_to_cash')"))
    if r.rowcount == 0:
        return  # already applied
    rows = sync_conn.execute(text(
        "SELECT id, currency, margin_debt FROM accounts WHERE is_margin = 1 AND margin_debt IS NOT NULL AND margin_debt > 0"
    )).fetchall()
    for row in rows:
        acc_id, currency, margin_debt = row[0], row[1] or "USD", float(row[2])
        sync_conn.execute(
            text(
                "INSERT INTO assets (account_id, balance, currency) VALUES (:aid, :bal, :cur)"
            ),
            {"aid": acc_id, "bal": -margin_debt, "cur": currency},
        )


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_account_color)
        await conn.run_sync(_migrate_margin_to_cash_assets)
