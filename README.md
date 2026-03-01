# Personal Finance Asset Tracker

Track personal assets (cash, brokerage, Bitcoin, property), cashflows, and forecast portfolio growth with a floor + VaR model. Deployable on Umbrel.

## Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2 (async), SQLite, yfinance, pandas, numpy
- **Frontend:** React (Vite), TypeScript, React Query, Recharts
- **Deploy:** Docker (single container), Umbrel-ready

## Dev setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --app-dir .
```

Database is created at `./data/finance.db` (or `DATA_DIR` env). API: http://127.0.0.1:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Uses Vite proxy to `/api` → backend. Open http://localhost:5173

### Run both

From repo root, run backend in one terminal and frontend in another (or use a single command that starts both).

## Umbrel

- Copy the app directory to your Umbrel app store (or use the Umbrel app repo format).
- Build: `docker build -t finance-app .`
- Data is stored in `${APP_DATA_DIR}/data` (SQLite). Backup via Settings in the UI.

## API

- **Health:** `GET /api/health`
- **Accounts:** `GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/:id`
- **Assets:** `GET /api/assets/account/:id`, `POST /api/assets/account/:id`, `GET/PATCH/DELETE /api/assets/:id`, `GET /api/assets/:id/history`
- **Cashflows:** `GET/POST /api/cashflows`, `GET/PATCH/DELETE /api/cashflows/:id`
- **Portfolio:** `GET /api/portfolio/current`, `GET /api/portfolio/history`, `POST /api/portfolio/snapshot`, `GET /api/portfolio/estimated-mortgage-payments`
- **Prices:** `GET /api/prices` (optional query: `recalculate=SYM1,SYM2`), `POST /api/prices/recalculate`
- **Forecast:** `POST /api/forecast`
- **Backup:** `GET /api/backup/export`, `POST /api/backup/import` (requires `confirm=true` for restore)

## Features

- **Accounts:** cash, brokerage (with optional margin + debt), Bitcoin, property (value + mortgage, appreciation CAGR, annuity mortgage in forecast)
- **Assets** per account with full quantity history (audit trail)
- **Cashflows:** income/expense with start/end and frequency; mortgage payments as negative cashflows in forecast
- **Live prices** (yfinance) for stocks and BTC-USD; 24h change
- **Price models:** regression-based fair value and 5th/95th percentile bands per symbol; current-price quantile within bands. Models: stocks (log price vs time), Bitcoin (log price vs log days since genesis), IBIT (BTC model + BTC/IBIT ratio). Optional force-refresh via `recalculate` query or `POST /api/prices/recalculate`.
- **Portfolio:** current value (fair value and optional market total), value over time (snapshots), historical chart, estimated monthly mortgage payments per property with active mortgage
- **Forecast:** floor + VaR for stocks/Bitcoin, property appreciation and mortgage payoff, margin debt interest, cashflow bucket with CAGR
- **Backup/restore:** download .db, upload to restore (requires confirm)

## How the forecast model works

The forecast projects your portfolio value year-by-year over a configurable horizon (default 10 years). You can set `horizon_years`, `margin_interest_rate`, and `cashflow_bucket_cagr` when calling `POST /api/forecast`.

### Time steps

- The engine steps **once per year** from today to today + `horizon_years`.
- For each year it computes total portfolio value and a per-asset breakdown (series + breakdown in the response).

### Asset treatment

| Type | How it’s projected |
|------|--------------------|
| **Cash** | Balance is **constant** (no growth). |
| **Brokerage (stocks)** | Quantity × **fair price at that date**. Fair price (and 5th/95th percentile bands) come from the stored regression model (log price vs time). If no model exists, current market price is used and floor/ceiling equal that price. |
| **Bitcoin** | BTC amount × **fair price at that date**. Fair price and bands come from the Bitcoin model (log price vs log days since genesis). |
| **IBIT** | Uses the Bitcoin model’s fair/floor/ceiling at the date, then multiplies by the stored **BTC/IBIT ratio** to get IBIT fair and bands. |
| **Property** | **Value:** current property value compounded at the asset’s **appreciation CAGR** to that year. **Mortgage:** balance is amortized month-by-month (annuity formula); the forecast uses the balance at the start of that year. **Net** = property value at year − mortgage balance at year. If no mortgage or missing terms, net = property value only. |
| **Margin debt** | Treated as negative value on the brokerage account. Starting margin debt **compounds** at `margin_interest_rate` each year (no new borrowing or paydown in the model). |

### Cashflow bucket

- **Net cashflow** for each year = income cashflows − expense cashflows − **annual mortgage payments** (so mortgage is not double-counted if you also add it as an expense).
- Cashflows are converted to annual amounts using their frequency (weekly × 52, monthly × 12, yearly × 1), and only cashflows active in that year (between start_date and end_date) are included.
- After adding the year’s net cashflow, the **cashflow bucket** is grown by `(1 + cashflow_bucket_cagr)` (default 5% CAGR).
- **Total portfolio value** at each year = sum of all account values (including negative margin) + cashflow bucket.

### Output

- **series:** One row per year with `date`, `total_value`, `cashflow_bucket`, and `by_account` (and account names as keys for chart stacking).
- **breakdown:** Per-asset, per-year rows with `type` (cash, brokerage, bitcoin, property, margin), `value`, and `details` (e.g. fair_price, floor_5, ceiling_95, shares, mortgage balances). Use this for “floor + VaR” style inspection (e.g. 5th percentile value at each horizon).
