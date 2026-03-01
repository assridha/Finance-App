from datetime import date
from typing import Any
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import Account, Asset, Cashflow, AccountType, CashflowType, CashflowFrequency
from services.yfinance_service import get_prices
from services.price_model_service import get_or_compute_model, get_fair_floor_ceiling_at_date
from forecast.property_forecast import (
    property_value_path,
    annuity_payment,
    mortgage_balance_path,
)


def _asset_label(acc: Account, a: Asset) -> str:
    """Human-readable label for an asset (account + identifier)."""
    if acc.type == AccountType.cash:
        return f"{acc.name} (Cash)"
    if acc.type == AccountType.brokerage and a.symbol:
        return f"{acc.name} – {a.symbol}"
    if acc.type == AccountType.bitcoin:
        return f"{acc.name} (BTC)"
    if acc.type == AccountType.property:
        return f"{acc.name} (Property)"
    return acc.name


async def run_forecast(
    db: AsyncSession,
    horizon_years: float = 10,
    margin_interest_rate: float = 0.08,
    cashflow_bucket_cagr: float = 0.05,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (series, breakdown). Uses regression-based fair value per asset (stocks, Bitcoin, IBIT)."""
    today = date.today()
    end_date = today.replace(year=today.year + int(horizon_years))

    r = await db.execute(
        select(Account).options(selectinload(Account.assets)).order_by(Account.id)
    )
    accounts = list(r.scalars().all())

    symbols = set()
    for acc in accounts:
        for a in acc.assets:
            if a.symbol:
                symbols.add(a.symbol)
            if acc.type == AccountType.bitcoin and a.btc_amount and float(a.btc_amount) != 0:
                symbols.add("BTC-USD")
    # Ensure price models exist (so we can use get_fair_floor_ceiling_at_date in the loop)
    for sym in symbols:
        await get_or_compute_model(db, sym, force_refresh=False)
    prices = get_prices(list(symbols)) if symbols else {}

    # Cashflows for bucket
    r_cf = await db.execute(select(Cashflow))
    cashflows = list(r_cf.scalars().all())

    # Mortgage payments from property assets (so we don't double-count if user also added as expense)
    mortgage_payments_by_year: dict[int, float] = defaultdict(float)
    for acc in accounts:
        for a in acc.assets:
            if acc.type != AccountType.property or not a.mortgage_balance or not a.mortgage_annual_rate or not a.mortgage_term_remaining_months:
                continue
            P = float(a.mortgage_balance)
            r = float(a.mortgage_annual_rate)
            n = a.mortgage_term_remaining_months
            pay = annuity_payment(P, r, n, 12)
            # Spread annual payment by year
            for y in range(today.year, today.year + int(horizon_years) + 1):
                mortgage_payments_by_year[y] += pay * 12  # annual

    # Net cashflow per year (income - expenses - mortgage payments)
    def net_cashflow_for_year(y: int) -> float:
        total = 0.0
        for cf in cashflows:
            if cf.start_date.year > y or (cf.end_date and cf.end_date.year < y):
                continue
            if cf.frequency == CashflowFrequency.yearly:
                amt = float(cf.amount)
            elif cf.frequency == CashflowFrequency.monthly:
                amt = float(cf.amount) * 12
            else:
                amt = float(cf.amount) * 52
            if cf.type == CashflowType.income:
                total += amt
            else:
                total -= amt
        total -= mortgage_payments_by_year.get(y, 0)
        return total

    def _round_details(d: dict[str, float]) -> dict[str, float]:
        return {k: round(v, 4) for k, v in d.items()}

    # Build yearly series and per-asset, per-year breakdown
    result = []
    breakdown: list[dict[str, Any]] = []
    cashflow_bucket = 0.0
    for year_offset in range(int(horizon_years) + 1):
        d = today.replace(year=today.year + year_offset)
        if d > end_date:
            break
        portfolio_value = 0.0
        date_str = d.isoformat()

        by_account: list[dict[str, Any]] = []
        for acc in accounts:
            acc_value = 0.0
            for a in acc.assets:
                if acc.type == AccountType.cash and a.balance is not None:
                    val = float(a.balance)
                    acc_value += val
                    breakdown.append({
                        "year": d.year,
                        "date": date_str,
                        "label": _asset_label(acc, a),
                        "type": "cash",
                        "value": round(val, 2),
                        "details": _round_details({"balance": val}),
                    })
                elif acc.type == AccountType.brokerage and a.symbol and a.shares is not None:
                    sym = a.symbol
                    bands = await get_fair_floor_ceiling_at_date(db, sym, d)
                    if bands:
                        fair_price, floor_5, ceiling_95 = bands
                    else:
                        fair_price = (prices.get(sym) or {}).get("price") or 0.0
                        floor_5 = ceiling_95 = fair_price
                    val = float(a.shares) * fair_price
                    acc_value += val
                    breakdown.append({
                        "year": d.year,
                        "date": date_str,
                        "label": _asset_label(acc, a),
                        "type": "brokerage",
                        "value": round(val, 2),
                        "details": _round_details({
                            "fair_price": fair_price,
                            "floor_5": floor_5,
                            "ceiling_95": ceiling_95,
                            "shares": float(a.shares),
                        }),
                    })
                elif acc.type == AccountType.bitcoin and a.btc_amount is not None:
                    bands = await get_fair_floor_ceiling_at_date(db, "BTC-USD", d)
                    if bands:
                        fair_price, floor_5, ceiling_95 = bands
                    else:
                        fair_price = (prices.get("BTC-USD") or {}).get("price") or 0.0
                        floor_5 = ceiling_95 = fair_price
                    val = float(a.btc_amount) * fair_price
                    acc_value += val
                    breakdown.append({
                        "year": d.year,
                        "date": date_str,
                        "label": _asset_label(acc, a),
                        "type": "bitcoin",
                        "value": round(val, 2),
                        "details": _round_details({
                            "fair_price": fair_price,
                            "floor_5": floor_5,
                            "ceiling_95": ceiling_95,
                            "btc_amount": float(a.btc_amount),
                        }),
                    })
                elif acc.type == AccountType.property:
                    pv = a.property_value and float(a.property_value) or 0.0
                    mb = a.mortgage_balance and float(a.mortgage_balance) or 0.0
                    cagr = (a.appreciation_cagr and float(a.appreciation_cagr)) or 0.03
                    pv_at_d = pv * ((1 + cagr) ** year_offset)
                    bal_at_d = mb
                    if mb > 0 and a.mortgage_annual_rate is not None and a.mortgage_term_remaining_months:
                        pay = annuity_payment(mb, float(a.mortgage_annual_rate), a.mortgage_term_remaining_months, 12)
                        months_ahead = year_offset * 12
                        for i, (pd, b) in enumerate(mortgage_balance_path(mb, float(a.mortgage_annual_rate), pay, today, 12)):
                            bal_at_d = b
                            if i >= months_ahead:
                                break
                        val = pv_at_d - bal_at_d
                    else:
                        val = pv_at_d
                    acc_value += val
                    breakdown.append({
                        "year": d.year,
                        "date": date_str,
                        "label": _asset_label(acc, a),
                        "type": "property",
                        "value": round(val, 2),
                        "details": _round_details({
                            "property_value_start": pv,
                            "appreciation_cagr": cagr,
                            "property_value_at_year": pv_at_d,
                            "mortgage_balance_start": mb,
                            "mortgage_balance_at_year": bal_at_d,
                        }),
                    })

            if acc.is_margin and acc.margin_debt is not None and float(acc.margin_debt) > 0:
                debt = float(acc.margin_debt) * ((1 + margin_interest_rate) ** year_offset)
                acc_value -= debt
                breakdown.append({
                    "year": d.year,
                    "date": date_str,
                    "label": f"{acc.name} (Margin debt)",
                    "type": "margin",
                    "value": round(-debt, 2),
                    "details": _round_details({
                        "margin_debt_start": float(acc.margin_debt),
                        "margin_interest_rate": margin_interest_rate,
                        "margin_debt_at_year": debt,
                    }),
                })
            portfolio_value += acc_value
            by_account.append({"account_id": acc.id, "account_name": acc.name, "value": round(acc_value, 2)})

        # Cashflow bucket: add net cashflow for this year, then grow
        net = net_cashflow_for_year(d.year)
        cashflow_bucket += net
        cashflow_bucket *= (1 + cashflow_bucket_cagr)

        row: dict[str, Any] = {
            "date": date_str,
            "total_value": round(portfolio_value + cashflow_bucket, 2),
            "cashflow_bucket": round(cashflow_bucket, 2),
            "by_account": by_account,
        }
        for item in by_account:
            row[item["account_name"]] = item["value"]
        result.append(row)

    return result, breakdown
