from typing import Any

import pandas as pd
import yfinance as yf


# Simple in-memory cache: symbol -> (price, change24h), no TTL for now (can add later)
_cache: dict[str, tuple[float, float | None]] = {}


def get_history(symbol: str, period: str = "5y") -> pd.DataFrame | None:
    """Fetch daily OHLCV history. period: '5y', 'max', etc. Returns DataFrame with DatetimeIndex and Close column, or None."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        if hist is None or len(hist) < 30:
            return None
        # Normalize index to date and ensure we have Close
        hist = hist[["Close"]].copy()
        hist.index = hist.index.tz_localize(None) if hist.index.tz else hist.index
        hist.index = hist.index.normalize()
        return hist.dropna()
    except Exception:
        return None


def get_ibit_btc_ratio_same_timestamp() -> tuple[float, Any] | None:
    """Get IBIT/BTC-USD ratio using same-timestamp (same trading-day close). Returns (ratio, as_of_date) or None."""
    ibit = get_history("IBIT", period="10d")
    btc = get_history("BTC-USD", period="10d")
    if ibit is None or btc is None or ibit.empty or btc.empty:
        return None
    common = ibit.join(btc, how="inner", lsuffix="_ibit", rsuffix="_btc")
    if common.empty:
        return None
    row = common.iloc[-1]
    ibit_close = float(row["Close_ibit"])
    btc_close = float(row["Close_btc"])
    if btc_close <= 0:
        return None
    ratio = ibit_close / btc_close
    as_of_date = common.index[-1]
    if hasattr(as_of_date, "date"):
        as_of_date = as_of_date.date()
    return (ratio, as_of_date)


def get_prices(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch current price and 24h change for each symbol. Includes BTC-USD if not in list for crypto."""
    result = {}
    need_btc = "BTC-USD" not in symbols
    to_fetch = list(set(symbols) | ({"BTC-USD"} if need_btc else set()))
    for sym in to_fetch:
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info
            hist = ticker.history(period="5d")
            price = None
            if "currentPrice" in info and info["currentPrice"]:
                price = float(info["currentPrice"])
            if price is None and "regularMarketPrice" in info and info["regularMarketPrice"]:
                price = float(info["regularMarketPrice"])
            if price is None and not hist.empty:
                price = float(hist["Close"].iloc[-1])
            if price is None:
                result[sym] = {"price": 0.0, "change24h": None}
                continue
            change = None
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                if prev and prev != 0:
                    change = round((price - prev) / prev * 100, 2)
            result[sym] = {"price": round(price, 4), "change24h": change}
        except Exception:
            result[sym] = {"price": 0.0, "change24h": None}
    return result
