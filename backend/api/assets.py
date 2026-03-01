import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import get_db
from models import Account, Asset, AssetQuantityHistory, AccountType
from schemas.asset import AssetCreate, AssetUpdate, AssetResponse

router = APIRouter(prefix="/assets", tags=["assets"])


def _quantity_json(asset: Asset) -> str:
    """Build quantity snapshot JSON for history."""
    data = {}
    if asset.balance is not None:
        data["balance"] = float(asset.balance)
    if asset.currency:
        data["currency"] = asset.currency
    if asset.symbol:
        data["symbol"] = asset.symbol
    if asset.shares is not None:
        data["shares"] = float(asset.shares)
    if asset.btc_amount is not None:
        data["btc_amount"] = float(asset.btc_amount)
    if asset.property_value is not None:
        data["property_value"] = float(asset.property_value)
    if asset.mortgage_balance is not None:
        data["mortgage_balance"] = float(asset.mortgage_balance)
    return json.dumps(data)


@router.get("/account/{account_id}", response_model=list[AssetResponse])
async def list_assets(account_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Asset).where(Asset.account_id == account_id).order_by(Asset.id))
    return list(r.scalars().all())


@router.post("/account/{account_id}", response_model=AssetResponse)
async def create_asset(account_id: int, data: AssetCreate, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Account).where(Account.id == account_id))
    acc = r.scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    if acc.type == AccountType.property:
        existing = await db.execute(select(Asset).where(Asset.account_id == account_id))
        if len(existing.scalars().all()) >= 1:
            raise HTTPException(
                400,
                "A property account can have only one property. Create another account for another property.",
            )
    asset = Asset(
        account_id=account_id,
        balance=data.balance,
        currency=data.currency,
        symbol=data.symbol,
        shares=data.shares,
        btc_amount=data.btc_amount,
        property_value=data.property_value,
        mortgage_balance=data.mortgage_balance,
        appreciation_cagr=data.appreciation_cagr,
        mortgage_annual_rate=data.mortgage_annual_rate,
        mortgage_term_remaining_months=data.mortgage_term_remaining_months,
        payment_frequency=data.payment_frequency or "monthly",
    )
    db.add(asset)
    await db.flush()
    # Record initial quantity in history
    db.add(AssetQuantityHistory(asset_id=asset.id, quantity_json=_quantity_json(asset)))
    await db.refresh(asset)
    return asset


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = r.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


@router.patch("/{asset_id}", response_model=AssetResponse)
async def update_asset(asset_id: int, data: AssetUpdate, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = r.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    updated = False
    for field in ("balance", "currency", "symbol", "shares", "btc_amount", "property_value", "mortgage_balance",
                  "appreciation_cagr", "mortgage_annual_rate", "mortgage_term_remaining_months", "payment_frequency"):
        v = getattr(data, field, None)
        if v is not None:
            setattr(asset, field, v)
            updated = True
    if updated:
        db.add(AssetQuantityHistory(asset_id=asset.id, quantity_json=_quantity_json(asset)))
    await db.flush()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = r.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    await db.delete(asset)
    return None


@router.get("/{asset_id}/history")
async def get_asset_history(asset_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(AssetQuantityHistory)
        .where(AssetQuantityHistory.asset_id == asset_id)
        .order_by(AssetQuantityHistory.changed_at.desc())
    )
    rows = r.scalars().all()
    return [{"changed_at": h.changed_at.isoformat(), "quantity_json": json.loads(h.quantity_json), "note": h.note} for h in rows]
