from fastapi import APIRouter, Query

from services.yfinance_service import validate_symbol

router = APIRouter(prefix="/symbols", tags=["symbols"])


@router.get("/validate")
def validate_ticker(symbol: str = Query(..., description="Ticker symbol to validate (e.g. AAPL)")):
    """Validate that a symbol exists on Yahoo Finance. Returns valid=true/false and optional message."""
    valid, message = validate_symbol(symbol)
    return {"valid": valid, "message": message}
