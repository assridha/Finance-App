from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from db import init_db, get_db
import models  # noqa: F401 - register tables
from api import accounts, assets, cashflows, portfolio, prices, forecast, backup
from services.snapshot_service import take_snapshot


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    # shutdown if needed
    pass


app = FastAPI(title="Personal Finance Asset Tracker", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(accounts.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(cashflows.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(forecast.router, prefix="/api")
app.include_router(backup.router, prefix="/api")

# Snapshot on-demand endpoint for portfolio history
@app.post("/api/portfolio/snapshot")
async def take_portfolio_snapshot(db: AsyncSession = Depends(get_db)):
    snap = await take_snapshot(db)
    return {"date": snap.date.isoformat(), "total_value": float(snap.total_value)}


# Mount static frontend in production (when built). Dev: repo/frontend/dist; Docker: /app/frontend/dist
_base = Path(__file__).resolve().parent
frontend_dist = _base.parent / "frontend" / "dist" if (_base.parent / "frontend" / "dist").exists() else _base / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
