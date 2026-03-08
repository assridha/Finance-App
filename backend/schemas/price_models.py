from pydantic import BaseModel


class PriceModelChartPoint(BaseModel):
    date: str  # YYYY-MM-DD
    price: float
    fair: float
    floor_5: float
    ceiling_95: float


class PriceModelChartResponse(BaseModel):
    symbol: str
    model_type: str  # stock | bitcoin | ibit
    fit_start_date: str | None
    fit_end_date: str | None
    data: list[PriceModelChartPoint]


class PriceModelSymbolsResponse(BaseModel):
    symbols: list[str]
