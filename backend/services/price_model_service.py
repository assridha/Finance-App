"""Regression-based price models: stock (log vs time), Bitcoin (log vs log age), IBIT (BTC model + ratio)."""

from datetime import date
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecast.floor_models import days_since_genesis
from models import PriceModel, PriceModelType
from services.yfinance_service import get_history, get_ibit_btc_ratio_same_timestamp, get_prices

# Approximate normal quantiles for 5th and 95th percentile
K_5TH = 1.6448536269514722
K_95TH = 1.6448536269514722


def _years_since(start: date, d: date) -> float:
    return (d - start).days / 365.25


def _stock_fair_floor_ceiling(
    d: date,
    param_intercept: float,
    param_slope: float,
    residual_std_log: float,
    fit_start_date: date,
) -> tuple[float, float, float]:
    t = _years_since(fit_start_date, d)
    log_fair = param_intercept + param_slope * t
    fair = float(np.exp(log_fair))
    log_floor = log_fair - K_5TH * residual_std_log
    log_ceiling = log_fair + K_95TH * residual_std_log
    return fair, float(np.exp(log_floor)), float(np.exp(log_ceiling))


def _bitcoin_fair_floor_ceiling(
    d: date,
    param_intercept: float,
    param_exponent: float,
    residual_std_log: float,
) -> tuple[float, float, float]:
    days = days_since_genesis(d)
    if days <= 0:
        days = 1.0
    log_days = np.log(days)
    log_fair = param_intercept + param_exponent * log_days
    fair = float(np.exp(log_fair))
    log_floor = log_fair - K_5TH * residual_std_log
    log_ceiling = log_fair + K_95TH * residual_std_log
    return fair, float(np.exp(log_floor)), float(np.exp(log_ceiling))


def _quantile_from_bands(market_price: float, fair: float, floor_5: float, ceiling_95: float) -> float | None:
    """Linear interpolation: floor->5, fair->50, ceiling->95. Returns None if degenerate."""
    if fair <= floor_5 or fair >= ceiling_95:
        return None
    if market_price <= floor_5:
        return 5.0
    if market_price >= ceiling_95:
        return 95.0
    if market_price <= fair:
        return 5.0 + 45.0 * (market_price - floor_5) / (fair - floor_5)
    return 50.0 + 45.0 * (market_price - fair) / (ceiling_95 - fair)


def fit_stock_model(symbol: str) -> dict[str, Any] | None:
    """Fit log(price) = a + b*t. Returns dict with params and fit window, or None."""
    hist = get_history(symbol, period="5y")
    if hist is None or len(hist) < 252:  # ~1 year of trading days
        return None
    hist = hist.sort_index()
    start_date = hist.index[0]
    if hasattr(start_date, "date"):
        start_date = start_date.date()
    end_date = hist.index[-1]
    if hasattr(end_date, "date"):
        end_date = end_date.date()
    t0 = start_date
    t = np.array([_years_since(t0, d.date() if hasattr(d, "date") else d) for d in hist.index])
    y = np.log(hist["Close"].values.astype(float))
    coeffs = np.polyfit(t, y, 1)
    slope, intercept = float(coeffs[0]), float(coeffs[1])
    fitted = intercept + slope * t
    residuals = y - fitted
    residual_std_log = float(np.std(residuals))
    if residual_std_log <= 0:
        residual_std_log = 0.01
    return {
        "model_type": PriceModelType.stock,
        "param_intercept": intercept,
        "param_slope": slope,
        "residual_std_log": residual_std_log,
        "fit_start_date": start_date,
        "fit_end_date": end_date,
        "fit_end_date_only": end_date,
    }


def fit_bitcoin_model() -> dict[str, Any] | None:
    """Fit log(price) = a + b*log(days_since_genesis). Uses period=max, fallback 5y."""
    hist = get_history("BTC-USD", period="max")
    if hist is None or len(hist) < 252:
        hist = get_history("BTC-USD", period="5y")
    if hist is None or len(hist) < 252:
        return None
    hist = hist.sort_index()
    end_date = hist.index[-1]
    if hasattr(end_date, "date"):
        end_date = end_date.date()
    days = np.array([days_since_genesis(d.date() if hasattr(d, "date") else d) for d in hist.index])
    days = np.maximum(days, 1.0)
    x = np.log(days)
    y = np.log(hist["Close"].values.astype(float))
    coeffs = np.polyfit(x, y, 1)
    exponent, intercept = float(coeffs[0]), float(coeffs[1])
    fitted = intercept + exponent * x
    residuals = y - fitted
    residual_std_log = float(np.std(residuals))
    if residual_std_log <= 0:
        residual_std_log = 0.01
    return {
        "model_type": PriceModelType.bitcoin,
        "param_intercept": intercept,
        "param_exponent": exponent,
        "residual_std_log": residual_std_log,
        "fit_end_date": end_date,
    }


def fit_ibit_model() -> dict[str, Any] | None:
    """IBIT = BTC model + same-timestamp ratio. Requires BTC model to exist in DB or we compute it."""
    ratio_result = get_ibit_btc_ratio_same_timestamp()
    if ratio_result is None:
        return None
    ratio, ratio_as_of_date = ratio_result
    return {
        "model_type": PriceModelType.ibit,
        "btc_to_ibit_ratio": ratio,
        "ratio_as_of_date": ratio_as_of_date,
    }


async def get_price_model(db: AsyncSession, symbol: str) -> PriceModel | None:
    """Load stored PriceModel by symbol."""
    r = await db.execute(select(PriceModel).where(PriceModel.symbol == symbol))
    return r.scalar_one_or_none()


def _is_stale(updated_at: date, max_age_days: int = 365) -> bool:
    return (date.today() - updated_at).days > max_age_days


async def _save_model(db: AsyncSession, symbol: str, data: dict[str, Any]) -> PriceModel:
    """Insert or update PriceModel row."""
    r = await db.execute(select(PriceModel).where(PriceModel.symbol == symbol))
    row = r.scalar_one_or_none()
    today = date.today()
    if row is None:
        row = PriceModel(
            symbol=symbol,
            model_type=data["model_type"],
            updated_at=today,
            param_intercept=data.get("param_intercept"),
            param_slope=data.get("param_slope"),
            param_exponent=data.get("param_exponent"),
            residual_std_log=data.get("residual_std_log"),
            fit_start_date=data.get("fit_start_date"),
            fit_end_date=data.get("fit_end_date"),
            btc_to_ibit_ratio=data.get("btc_to_ibit_ratio"),
            ratio_as_of_date=data.get("ratio_as_of_date"),
        )
        db.add(row)
    else:
        row.model_type = data["model_type"]
        row.updated_at = today
        row.param_intercept = data.get("param_intercept")
        row.param_slope = data.get("param_slope")
        row.param_exponent = data.get("param_exponent")
        row.residual_std_log = data.get("residual_std_log")
        row.fit_start_date = data.get("fit_start_date")
        row.fit_end_date = data.get("fit_end_date")
        row.btc_to_ibit_ratio = data.get("btc_to_ibit_ratio")
        row.ratio_as_of_date = data.get("ratio_as_of_date")
    await db.flush()
    await db.refresh(row)
    return row


def _ibit_model_response(
    btc: dict[str, Any],
    ratio: float,
    ratio_as_of: Any,
    updated_at: str,
) -> dict[str, Any]:
    """Build IBIT model response dict from BTC model and ratio (no DB write)."""
    ibit_fair = btc["fair_value"] * ratio
    floor_5 = btc["floor_5"] * ratio
    ceiling_95 = btc["ceiling_95"] * ratio
    prices = get_prices(["IBIT"])
    market_price = (prices.get("IBIT") or {}).get("price") or 0.0
    quantile = _quantile_from_bands(market_price, ibit_fair, floor_5, ceiling_95) if market_price else None
    if hasattr(ratio_as_of, "date") and callable(getattr(ratio_as_of, "date", None)):
        ratio_as_of = ratio_as_of.date()
    ratio_as_of_str = ratio_as_of.isoformat() if hasattr(ratio_as_of, "isoformat") else str(ratio_as_of)
    return {
        "symbol": "IBIT",
        "model_type": "ibit",
        "fair_value": round(ibit_fair, 4),
        "floor_5": round(floor_5, 4),
        "ceiling_95": round(ceiling_95, 4),
        "market_price": round(market_price, 4) if market_price else None,
        "quantile": round(quantile, 1) if quantile is not None else None,
        "updated_at": updated_at,
        "btc_to_ibit_ratio": round(ratio, 6),
        "ratio_as_of_date": ratio_as_of_str,
    }


async def get_or_compute_model(
    db: AsyncSession,
    symbol: str,
    force_refresh: bool = False,
) -> dict[str, Any] | None:
    """
    Return model result for symbol: fair_value, floor_5, ceiling_95 (at today), plus params and quantile if market price provided.
    Computes and stores model if missing or stale (>1yr) or force_refresh.
    """
    today = date.today()
    symbol_upper = symbol.upper()

    # IBIT: use Bitcoin model + ratio (same-timestamp when recomputing)
    if symbol_upper == "IBIT":
        btc = await get_or_compute_model(db, "BTC-USD", force_refresh=force_refresh)
        if btc is None:
            btc = await get_or_compute_model(db, "BTC-USD", force_refresh=True)
        if btc is None:
            return None
        existing = await get_price_model(db, "IBIT")
        if not force_refresh and existing is not None and not _is_stale(existing.updated_at):
            ratio = float(existing.btc_to_ibit_ratio or 0)
            ratio_as_of = existing.ratio_as_of_date or today
            return _ibit_model_response(btc, ratio, ratio_as_of, existing.updated_at.isoformat())
        ratio_data = fit_ibit_model()
        if ratio_data is not None:
            row = await _save_model(db, "IBIT", {**ratio_data, "model_type": PriceModelType.ibit})
            ratio_as_of = ratio_data.get("ratio_as_of_date", today)
            return _ibit_model_response(
                btc, ratio_data["btc_to_ibit_ratio"], ratio_as_of, row.updated_at.isoformat()
            )
        if existing is not None and existing.btc_to_ibit_ratio is not None:
            ratio = float(existing.btc_to_ibit_ratio)
            ratio_as_of = existing.ratio_as_of_date or today
            return _ibit_model_response(btc, ratio, ratio_as_of, existing.updated_at.isoformat())
        spot = get_prices(["IBIT", "BTC-USD"])
        ibit_price = (spot.get("IBIT") or {}).get("price") or 0.0
        btc_price = (spot.get("BTC-USD") or {}).get("price") or 0.0
        if btc_price <= 0 and btc.get("market_price"):
            btc_price = float(btc["market_price"])
        if ibit_price > 0 and btc_price > 0:
            ratio = ibit_price / btc_price
            row = await _save_model(
                db,
                "IBIT",
                {
                    "model_type": PriceModelType.ibit,
                    "btc_to_ibit_ratio": ratio,
                    "ratio_as_of_date": today,
                },
            )
            return _ibit_model_response(btc, ratio, today, row.updated_at.isoformat())
        return None

    # BTC-USD
    if symbol_upper == "BTC-USD":
        existing = await get_price_model(db, "BTC-USD")
        if not force_refresh and existing is not None and not _is_stale(existing.updated_at):
            intercept = float(existing.param_intercept) if existing.param_intercept is not None else 0
            exponent = float(existing.param_exponent) if existing.param_exponent is not None else 0
            res_std = float(existing.residual_std_log) if existing.residual_std_log is not None else 0.1
            fair, floor_5, ceiling_95 = _bitcoin_fair_floor_ceiling(today, intercept, exponent, res_std)
            prices = get_prices(["BTC-USD"])
            market_price = (prices.get("BTC-USD") or {}).get("price") or 0.0
            quantile = _quantile_from_bands(market_price, fair, floor_5, ceiling_95) if market_price else None
            return {
                "symbol": "BTC-USD",
                "model_type": "bitcoin",
                "fair_value": round(fair, 4),
                "floor_5": round(floor_5, 4),
                "ceiling_95": round(ceiling_95, 4),
                "market_price": round(market_price, 4) if market_price else None,
                "quantile": round(quantile, 1) if quantile is not None else None,
                "updated_at": existing.updated_at.isoformat(),
                "param_intercept": intercept,
                "param_exponent": exponent,
                "residual_std_log": res_std,
                "fit_end_date": existing.fit_end_date.isoformat() if existing.fit_end_date else None,
            }
        data = fit_bitcoin_model()
        if data is None:
            return None
        row = await _save_model(db, "BTC-USD", data)
        intercept = float(row.param_intercept or 0)
        exponent = float(row.param_exponent or 0)
        res_std = float(row.residual_std_log or 0.1)
        fair, floor_5, ceiling_95 = _bitcoin_fair_floor_ceiling(today, intercept, exponent, res_std)
        prices = get_prices(["BTC-USD"])
        market_price = (prices.get("BTC-USD") or {}).get("price") or 0.0
        quantile = _quantile_from_bands(market_price, fair, floor_5, ceiling_95) if market_price else None
        return {
            "symbol": "BTC-USD",
            "model_type": "bitcoin",
            "fair_value": round(fair, 4),
            "floor_5": round(floor_5, 4),
            "ceiling_95": round(ceiling_95, 4),
            "market_price": round(market_price, 4) if market_price else None,
            "quantile": round(quantile, 1) if quantile is not None else None,
            "updated_at": row.updated_at.isoformat(),
            "param_intercept": intercept,
            "param_exponent": exponent,
            "residual_std_log": res_std,
            "fit_end_date": row.fit_end_date.isoformat() if row.fit_end_date else None,
        }

    # Stocks (including IBIT handled above)
    existing = await get_price_model(db, symbol)
    if not force_refresh and existing is not None and not _is_stale(existing.updated_at):
        intercept = float(existing.param_intercept or 0)
        slope = float(existing.param_slope or 0)
        res_std = float(existing.residual_std_log or 0.1)
        fit_start = existing.fit_start_date or today
        fair, floor_5, ceiling_95 = _stock_fair_floor_ceiling(today, intercept, slope, res_std, fit_start)
        prices = get_prices([symbol])
        market_price = (prices.get(symbol) or {}).get("price") or 0.0
        quantile = _quantile_from_bands(market_price, fair, floor_5, ceiling_95) if market_price else None
        return {
            "symbol": symbol,
            "model_type": "stock",
            "fair_value": round(fair, 4),
            "floor_5": round(floor_5, 4),
            "ceiling_95": round(ceiling_95, 4),
            "market_price": round(market_price, 4) if market_price else None,
            "quantile": round(quantile, 1) if quantile is not None else None,
            "updated_at": existing.updated_at.isoformat(),
            "param_intercept": intercept,
            "param_slope": slope,
            "residual_std_log": res_std,
            "fit_start_date": existing.fit_start_date.isoformat() if existing.fit_start_date else None,
            "fit_end_date": existing.fit_end_date.isoformat() if existing.fit_end_date else None,
        }
    data = fit_stock_model(symbol)
    if data is None:
        return None
    row = await _save_model(db, symbol, data)
    intercept = float(row.param_intercept or 0)
    slope = float(row.param_slope or 0)
    res_std = float(row.residual_std_log or 0.1)
    fit_start = row.fit_start_date or today
    fair, floor_5, ceiling_95 = _stock_fair_floor_ceiling(today, intercept, slope, res_std, fit_start)
    prices = get_prices([symbol])
    market_price = (prices.get(symbol) or {}).get("price") or 0.0
    quantile = _quantile_from_bands(market_price, fair, floor_5, ceiling_95) if market_price else None
    return {
        "symbol": symbol,
        "model_type": "stock",
        "fair_value": round(fair, 4),
        "floor_5": round(floor_5, 4),
        "ceiling_95": round(ceiling_95, 4),
        "market_price": round(market_price, 4) if market_price else None,
        "quantile": round(quantile, 1) if quantile is not None else None,
        "updated_at": row.updated_at.isoformat(),
        "param_intercept": intercept,
        "param_slope": slope,
        "residual_std_log": res_std,
        "fit_start_date": row.fit_start_date.isoformat() if row.fit_start_date else None,
        "fit_end_date": row.fit_end_date.isoformat() if row.fit_end_date else None,
    }


def fair_value_at_date(
    symbol: str,
    d: date,
    model_row: PriceModel,
) -> tuple[float, float, float]:
    """Given stored PriceModel, return (fair_value, floor_5, ceiling_95) at date d."""
    if model_row.model_type == PriceModelType.stock:
        fit_start = model_row.fit_start_date or d
        return _stock_fair_floor_ceiling(
            d,
            float(model_row.param_intercept or 0),
            float(model_row.param_slope or 0),
            float(model_row.residual_std_log or 0.1),
            fit_start,
        )
    if model_row.model_type == PriceModelType.bitcoin:
        return _bitcoin_fair_floor_ceiling(
            d,
            float(model_row.param_intercept or 0),
            float(model_row.param_exponent or 0),
            float(model_row.residual_std_log or 0.1),
        )
    # IBIT: need BTC model and ratio; caller should use get_or_compute_model for IBIT
    return (0.0, 0.0, 0.0)


async def get_fair_floor_ceiling_at_date(
    db: AsyncSession,
    symbol: str,
    d: date,
) -> tuple[float, float, float] | None:
    """Return (fair_value, floor_5, ceiling_95) at date d for symbol, using stored model. None if no model."""
    symbol_upper = symbol.upper()
    if symbol_upper == "IBIT":
        btc_row = await get_price_model(db, "BTC-USD")
        ibit_row = await get_price_model(db, "IBIT")
        if btc_row is None or ibit_row is None or ibit_row.btc_to_ibit_ratio is None:
            return None
        fair_btc, floor_btc, ceiling_btc = fair_value_at_date("BTC-USD", d, btc_row)
        ratio = float(ibit_row.btc_to_ibit_ratio)
        return (fair_btc * ratio, floor_btc * ratio, ceiling_btc * ratio)
    row = await get_price_model(db, symbol)
    if row is None:
        return None
    return fair_value_at_date(symbol, d, row)


def _chart_point(d: date, price: float, fair: float, floor_5: float, ceiling_95: float) -> dict[str, Any]:
    return {
        "date": d.isoformat(),
        "price": round(float(price), 4),
        "fair": round(fair, 4),
        "floor_5": round(floor_5, 4),
        "ceiling_95": round(ceiling_95, 4),
    }


async def get_chart_data(
    db: AsyncSession,
    symbol: str,
) -> dict[str, Any] | None:
    """
    Return chart payload for symbol: historical price plus fitted fair value and 5th/95th percentile bands.
    Returns None if model or history unavailable. Payload: symbol, model_type, fit_start_date, fit_end_date, data.
    """
    symbol_upper = (symbol or "").strip().upper()
    if not symbol_upper:
        return None
    model_result = await get_or_compute_model(db, symbol_upper, force_refresh=False)
    if model_result is None:
        return None
    row = await get_price_model(db, symbol_upper)
    if row is None:
        return None
    btc_row: PriceModel | None = None
    ibit_ratio: float | None = None

    if symbol_upper == "IBIT":
        # IBIT: use BTC-USD model with converted prices (BTC history * ratio → IBIT terms)
        btc_row = await get_price_model(db, "BTC-USD")
        if btc_row is None or row.btc_to_ibit_ratio is None:
            return None
        ibit_ratio = float(row.btc_to_ibit_ratio)
        hist = get_history("BTC-USD", period="max")
        if hist is None or len(hist) < 30:
            hist = get_history("BTC-USD", period="5y")
    else:
        period = "max" if symbol_upper == "BTC-USD" else "5y"
        hist = get_history(symbol, period=period)

    if hist is None or len(hist) < 30:
        return None
    hist = hist.sort_index()

    data: list[dict[str, Any]] = []
    for ts in hist.index:
        d = ts.date() if hasattr(ts, "date") else date(ts.year, ts.month, ts.day)
        btc_close = float(hist.loc[ts, "Close"])
        if symbol_upper == "IBIT" and btc_row is not None and ibit_ratio is not None:
            price = btc_close * ibit_ratio  # converted to IBIT terms
            fair_btc, floor_btc, ceiling_btc = fair_value_at_date("BTC-USD", d, btc_row)
            fair = fair_btc * ibit_ratio
            floor_5 = floor_btc * ibit_ratio
            ceiling_95 = ceiling_btc * ibit_ratio
        else:
            price = btc_close
            fair, floor_5, ceiling_95 = fair_value_at_date(symbol_upper, d, row)
        data.append(_chart_point(d, price, fair, floor_5, ceiling_95))

    fit_start = model_result.get("fit_start_date")
    fit_end = model_result.get("fit_end_date")
    if symbol_upper == "IBIT" and btc_row is not None:
        fit_end = btc_row.fit_end_date.isoformat() if btc_row.fit_end_date else fit_end
    return {
        "symbol": symbol_upper,
        "model_type": model_result.get("model_type", "stock"),
        "fit_start_date": fit_start,
        "fit_end_date": fit_end,
        "data": data,
    }
