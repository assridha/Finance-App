from datetime import date
from typing import Iterator


def property_value_path(
    start_value: float,
    start_date: date,
    end_date: date,
    appreciation_cagr: float,
) -> Iterator[tuple[date, float]]:
    """Yield (date, value) for each year. Value grows at appreciation_cagr."""
    current = start_date
    value = start_value
    while current <= end_date:
        yield current, value
        # Advance one year
        try:
            current = current.replace(year=current.year + 1)
        except ValueError:
            current = date(current.year + 1, 2, 28)
        years = 1.0
        value = value * ((1 + appreciation_cagr) ** years)


def annuity_payment(P: float, annual_rate: float, n_periods: int, periods_per_year: int = 12) -> float:
    """Periodic payment for amortizing loan. P=principal, annual_rate=annual rate, n_periods=remaining periods."""
    if n_periods <= 0 or P <= 0:
        return 0.0
    r = annual_rate / periods_per_year
    if r <= 0:
        return P / n_periods
    return P * r / (1 - (1 + r) ** (-n_periods))


def mortgage_balance_path(
    initial_balance: float,
    annual_rate: float,
    payment: float,
    start_date: date,
    periods_per_year: int = 12,
) -> Iterator[tuple[date, float]]:
    """Yield (date, balance) at start of each month. Payment assumed monthly."""
    balance = initial_balance
    current = start_date
    r = annual_rate / periods_per_year
    while balance > 0.01 and current.year < start_date.year + 50:
        yield current, balance
        # Apply payment: interest first, then principal
        interest = balance * r
        principal = payment - interest
        if principal <= 0:
            break
        balance = max(0, balance - principal)
        # Next month
        if current.month == 12:
            current = date(current.year + 1, 1, current.day)
        else:
            current = date(current.year, current.month + 1, current.day)
    if balance > 0.01:
        yield current, balance
