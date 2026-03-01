from datetime import datetime, date

# Bitcoin genesis block date
BITCOIN_GENESIS = date(2009, 1, 3)


def floor_stock(t: date, F0: float, cagr: float, t0: date) -> float:
    """Exponential floor: Floor(t) = F0 * (1 + cagr)^(years from t0)."""
    years = (t - t0).days / 365.25
    return F0 * ((1 + cagr) ** years)


def days_since_genesis(d: date) -> float:
    return (d - BITCOIN_GENESIS).days


def floor_bitcoin(t: date, A: float, b: float) -> float:
    """Power law: Floor(t) = A * (days_since_genesis)^b."""
    days = days_since_genesis(t)
    if days <= 0:
        return A
    return A * (days ** b)
