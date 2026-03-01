from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db import get_db
from models import Account
from schemas.account import AccountCreate, AccountUpdate, AccountResponse

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountResponse])
async def list_accounts(db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Account).order_by(Account.id))
    return list(r.scalars().all())


@router.post("", response_model=AccountResponse)
async def create_account(data: AccountCreate, db: AsyncSession = Depends(get_db)):
    acc = Account(
        name=data.name,
        type=data.type,
        currency=data.currency,
        is_margin=data.is_margin,
        margin_debt=data.margin_debt if data.is_margin else None,
        color=data.color,
    )
    db.add(acc)
    await db.flush()
    await db.refresh(acc)
    return acc


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Account).where(Account.id == account_id))
    acc = r.scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(account_id: int, data: AccountUpdate, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Account).where(Account.id == account_id))
    acc = r.scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    if data.name is not None:
        acc.name = data.name
    if data.currency is not None:
        acc.currency = data.currency
    if data.is_margin is not None:
        acc.is_margin = data.is_margin
        if not data.is_margin:
            acc.margin_debt = None
    if data.margin_debt is not None and acc.is_margin:
        from models import AccountMarginHistory
        acc.margin_debt = data.margin_debt
        db.add(AccountMarginHistory(account_id=acc.id, margin_debt=float(acc.margin_debt)))
    if data.color is not None:
        acc.color = data.color
    await db.flush()
    await db.refresh(acc)
    return acc


@router.delete("/{account_id}", status_code=204)
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Account).where(Account.id == account_id))
    acc = r.scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    await db.delete(acc)
    return None
