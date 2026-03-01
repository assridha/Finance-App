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
