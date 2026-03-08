from datetime import date
from typing import Optional
import yfinance as yf


def present_var(current_price: float, floor_price: float) -> float:
    """Present VaR = current price - floor price."""
    return max(0.0, current_price - floor_price)


def historical_volatility(symbol: str, days: int = 252) -> Optional[float]:
    """Annualized volatility (std of daily returns). Returns None if insufficient data."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=f"{max(days, 365)}d")
        if hist is None or len(hist) < 30:
            return None
        returns = hist["Close"].pct_change().dropna()
        if len(returns) < 20:
            return None
        import numpy as np
        return float(returns.std() * (252 ** 0.5))  # annualized
    except Exception:
        return None


def projected_var(
    var_t0: float,
    vol: Optional[float],
    years: float,
    conservative: bool = True,
) -> float:
    """Project VaR forward. Simple: assume VaR scales with sqrt(time) by vol, or constant if no vol."""
    if vol is None or vol <= 0:
        return var_t0
    # Scale by sqrt(years) for dispersion
    scale = 1.0 + (vol * (years ** 0.5)) if conservative else (vol * (years ** 0.5))
    return max(0.0, var_t0 * scale)
