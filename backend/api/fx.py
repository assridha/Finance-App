from datetime import date
from fastapi import APIRouter, Query

from services.fx_service import rate_to_usd

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/rate")
def get_rate(
    from_currency: str = Query(..., alias="from", description="Source currency code (e.g. USD)"),
    to_currency: str = Query(..., alias="to", description="Target currency code (e.g. EUR)"),
    as_of_date: date | None = Query(None, alias="date", description="Optional date for historical rate (YYYY-MM-DD)"),
):
    """
    Return FX rate such that amount_from * rate = amount_to.
    When date is omitted, use current rate; when provided, use historical rate for that day.
    """
    from_c = (from_currency or "USD").upper()[:3]
    to_c = (to_currency or "USD").upper()[:3]
    if from_c == to_c:
        return {"rate": 1.0}
    # Convert via USD: amount_from * rate_to_usd(from) = usd; usd * (1/rate_to_usd(to)) = amount_to
    # So rate = rate_to_usd(from_c) / rate_to_usd(to_c)
    rate_from_to_usd = rate_to_usd(from_c, as_of_date=as_of_date)
    rate_to_to_usd = rate_to_usd(to_c, as_of_date=as_of_date)
    rate = rate_from_to_usd / rate_to_to_usd
    return {"rate": rate}
