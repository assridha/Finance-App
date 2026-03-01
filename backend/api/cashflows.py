from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db import get_db
from models import Cashflow
from schemas.cashflow import CashflowCreate, CashflowUpdate, CashflowResponse

router = APIRouter(prefix="/cashflows", tags=["cashflows"])


@router.get("", response_model=list[CashflowResponse])
async def list_cashflows(db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Cashflow).order_by(Cashflow.id))
    return list(r.scalars().all())


@router.post("", response_model=CashflowResponse)
async def create_cashflow(data: CashflowCreate, db: AsyncSession = Depends(get_db)):
    cf = Cashflow(
        type=data.type,
        amount=data.amount,
        currency=data.currency,
        frequency=data.frequency,
        start_date=data.start_date,
        end_date=data.end_date,
        name=data.name,
        category=data.category,
    )
    db.add(cf)
    await db.flush()
    await db.refresh(cf)
    return cf


@router.get("/{cashflow_id}", response_model=CashflowResponse)
async def get_cashflow(cashflow_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Cashflow).where(Cashflow.id == cashflow_id))
    cf = r.scalar_one_or_none()
    if not cf:
        raise HTTPException(404, "Cashflow not found")
    return cf


@router.patch("/{cashflow_id}", response_model=CashflowResponse)
async def update_cashflow(cashflow_id: int, data: CashflowUpdate, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Cashflow).where(Cashflow.id == cashflow_id))
    cf = r.scalar_one_or_none()
    if not cf:
        raise HTTPException(404, "Cashflow not found")
    for field in ("type", "amount", "currency", "frequency", "start_date", "end_date", "name", "category"):
        v = getattr(data, field, None)
        if v is not None:
            setattr(cf, field, v)
    await db.flush()
    await db.refresh(cf)
    return cf


@router.delete("/{cashflow_id}", status_code=204)
async def delete_cashflow(cashflow_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Cashflow).where(Cashflow.id == cashflow_id))
    cf = r.scalar_one_or_none()
    if not cf:
        raise HTTPException(404, "Cashflow not found")
    await db.delete(cf)
    return None
