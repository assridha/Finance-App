from datetime import date
from typing import Any
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import Account, Asset, Cashflow, AccountType, CashflowType, CashflowFrequency
from services.yfinance_service import get_prices
from services.price_model_service import get_or_compute_model, get_fair_floor_ceiling_at_date
from services.fx_service import amount_to_usd
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
    if acc.type == AccountType.brokerage and a.balance is not None:
        return f"{acc.name} (Margin debt)" if float(a.balance) < 0 else f"{acc.name} (Cash)"
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
            prop_currency = getattr(a, "currency", None) or "USD"
            P = amount_to_usd(float(a.mortgage_balance), prop_currency)
            r = float(a.mortgage_annual_rate)
            n = a.mortgage_term_remaining_months
            pay = annuity_payment(P, r, n, 12)
            # Spread annual payment by year
            for y in range(today.year, today.year + int(horizon_years) + 1):
                mortgage_payments_by_year[y] += pay * 12  # annual

    # Net cashflow per year (income - expenses - mortgage payments), in USD
    def net_cashflow_for_year(y: int) -> float:
        total_usd = 0.0
        for cf in cashflows:
            if cf.start_date.year > y or (cf.end_date and cf.end_date.year < y):
                continue
            if cf.frequency == CashflowFrequency.yearly:
                amt = float(cf.amount)
            elif cf.frequency == CashflowFrequency.monthly:
                amt = float(cf.amount) * 12
            else:
                amt = float(cf.amount) * 52
            amt_usd = amount_to_usd(amt, getattr(cf, "currency", None))
            if cf.type == CashflowType.income:
                total_usd += amt_usd
            else:
                total_usd -= amt_usd
        total_usd -= mortgage_payments_by_year.get(y, 0)
        return total_usd

    def _round_details(d: dict[str, Any]) -> dict[str, Any]:
        return {k: round(v, 4) if isinstance(v, (int, float)) else v for k, v in d.items()}

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
                    balance_raw = float(a.balance)
                    currency = getattr(a, "currency", None) or getattr(acc, "currency", None)
                    balance_usd = amount_to_usd(balance_raw, currency)
                    if balance_raw < 0:
                        rate = getattr(a, "debt_interest_rate", None)
                        if rate is None:
                            rate = margin_interest_rate
                        else:
                            rate = float(rate)
                        val_at_year_usd = balance_usd * ((1 + rate) ** year_offset)
                        acc_value += val_at_year_usd
                        breakdown.append({
                            "year": d.year,
                            "date": date_str,
                            "label": _asset_label(acc, a),
                            "type": "margin",
                            "value": round(val_at_year_usd, 2),
                            "details": _round_details({
                                "balance_start": balance_raw,
                                "currency": currency or "USD",
                                "margin_interest_rate": rate,
                                "balance_at_year_usd": val_at_year_usd,
                            }),
                        })
                    else:
                        acc_value += balance_usd
                        breakdown.append({
                            "year": d.year,
                            "date": date_str,
                            "label": _asset_label(acc, a),
                            "type": "cash",
                            "value": round(balance_usd, 2),
                            "details": _round_details({"balance": balance_usd, "currency": currency or "USD"}),
                        })
                elif acc.type == AccountType.brokerage and a.balance is not None and not a.symbol:
                    balance_raw = float(a.balance)
                    currency = getattr(a, "currency", None) or getattr(acc, "currency", None)
                    if balance_raw < 0:
                        rate = getattr(a, "debt_interest_rate", None)
                        if rate is None:
                            rate = margin_interest_rate
                        else:
                            rate = float(rate)
                        debt_usd = amount_to_usd(balance_raw, currency)
                        val_at_year_usd = debt_usd * ((1 + rate) ** year_offset)
                        acc_value += val_at_year_usd
                        breakdown.append({
                            "year": d.year,
                            "date": date_str,
                            "label": _asset_label(acc, a),
                            "type": "margin",
                            "value": round(val_at_year_usd, 2),
                            "details": _round_details({
                                "balance_start": balance_raw,
                                "currency": currency or "USD",
                                "margin_interest_rate": rate,
                                "balance_at_year_usd": val_at_year_usd,
                            }),
                        })
                    else:
                        balance_usd = amount_to_usd(balance_raw, currency)
                        acc_value += balance_usd
                        breakdown.append({
                            "year": d.year,
                            "date": date_str,
                            "label": _asset_label(acc, a),
                            "type": "cash",
                            "value": round(balance_usd, 2),
                            "details": _round_details({"balance": balance_usd, "currency": currency or "USD"}),
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
                    prop_currency = getattr(a, "currency", None) or "USD"
                    pv = amount_to_usd(float(a.property_value or 0), prop_currency)
                    mb = amount_to_usd(float(a.mortgage_balance or 0), prop_currency)
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

            portfolio_value += acc_value
            by_account.append({"account_id": acc.id, "account_name": acc.name, "value": round(acc_value, 2), "color": getattr(acc, "color", None)})

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
