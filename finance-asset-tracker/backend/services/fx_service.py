"""
FX rates for converting amounts to USD (unit of account).
rate_to_usd(currency) returns how many USD per 1 unit of the given currency.
E.g. amount_eur * rate_to_usd("EUR") = amount_usd.
"""
import time
from datetime import date, timedelta
from typing import Any

import yfinance as yf

UNIT_OF_ACCOUNT = "USD"

# Cache: currency -> (rate, cached_at). TTL 1 hour. Used only for current rate.
_fx_cache: dict[str, tuple[float, float]] = {}
_FX_CACHE_TTL = 3600.0

# Yahoo Finance: XXXUSD = USD per 1 XXX (e.g. EURUSD=X gives USD per EUR).
# USDXXX = XXX per 1 USD (e.g. USDJPY=X gives JPY per USD), so we use 1/price.
_FX_PAIRS_USD_QUOTE = {"EUR": "EURUSD=X", "GBP": "GBPUSD=X", "AUD": "AUDUSD=X", "CHF": "CHFUSD=X"}
_FX_PAIRS_USD_BASE = {"JPY": "USDJPY=X", "INR": "USDINR=X", "CNY": "USDCNY=X", "SGD": "USDSGD=X", "HKD": "USDHKD=X", "CAD": "USDCAD=X"}


def _fetch_rate_yf(symbol: str, usd_per_unit: bool, as_of_date: date | None = None) -> float | None:
    """Fetch FX rate from yfinance. usd_per_unit=True means price is already USD per unit; False means 1/price.
    If as_of_date is set, fetch historical close for that date; otherwise use latest."""
    try:
        ticker = yf.Ticker(symbol)
        if as_of_date is not None:
            start = as_of_date.isoformat()
            end = (as_of_date + timedelta(days=1)).isoformat()
            hist = ticker.history(start=start, end=end)
            if hist is None or hist.empty:
                return None
            price = float(hist["Close"].iloc[-1])
        else:
            hist = ticker.history(period="5d")
            if hist is None or hist.empty:
                info = getattr(ticker, "info", None) or {}
                price = info.get("regularMarketPrice") or info.get("previousClose")
                if price is None:
                    return None
                price = float(price)
            else:
                price = float(hist["Close"].iloc[-1])
        if price <= 0:
            return None
        return price if usd_per_unit else (1.0 / price)
    except Exception:
        return None


def rate_to_usd(currency: str, as_of_date: date | None = None) -> float:
    """
    Return how many USD per 1 unit of the given currency.
    E.g. amount_eur * rate_to_usd("EUR") = amount_usd.
    USD returns 1.0. Unknown currencies default to 1.0 (assume USD) to avoid breaking.
    When as_of_date is set, returns the historical rate for that date; otherwise current rate (cached).
    """
    if not currency or currency.upper() == "USD":
        return 1.0
    code = currency.upper()[:3]
    if as_of_date is not None:
        # Historical: no cache, fetch for that date
        rate = 1.0
        if code in _FX_PAIRS_USD_QUOTE:
            raw = _fetch_rate_yf(_FX_PAIRS_USD_QUOTE[code], usd_per_unit=True, as_of_date=as_of_date)
            if raw is not None:
                rate = raw
        elif code in _FX_PAIRS_USD_BASE:
            raw = _fetch_rate_yf(_FX_PAIRS_USD_BASE[code], usd_per_unit=False, as_of_date=as_of_date)
            if raw is not None:
                rate = raw
        else:
            try:
                raw = _fetch_rate_yf(f"{code}USD=X", usd_per_unit=True, as_of_date=as_of_date)
                if raw is not None:
                    rate = raw
            except Exception:
                pass
        return rate
    # Current rate: use cache
    now = time.time()
    if code in _fx_cache:
        rate, cached_at = _fx_cache[code]
        if now - cached_at < _FX_CACHE_TTL:
            return rate
    rate = 1.0
    if code in _FX_PAIRS_USD_QUOTE:
        raw = _fetch_rate_yf(_FX_PAIRS_USD_QUOTE[code], usd_per_unit=True)
        if raw is not None:
            rate = raw
    elif code in _FX_PAIRS_USD_BASE:
        raw = _fetch_rate_yf(_FX_PAIRS_USD_BASE[code], usd_per_unit=False)
        if raw is not None:
            rate = raw
    else:
        try:
            raw = _fetch_rate_yf(f"{code}USD=X", usd_per_unit=True)
            if raw is not None:
                rate = raw
        except Exception:
            pass
    _fx_cache[code] = (rate, now)
    return rate


def amount_to_usd(amount: float, currency: str | None) -> float:
    """Convert an amount in the given currency to USD. If currency is None or USD, returns amount."""
    if currency is None or (currency or "").upper() == "USD":
        return amount
    return amount * rate_to_usd(currency)
