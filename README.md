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

On startup, the backend automatically adds the `accounts.color` column if it is missing (migration from pre-color schema). To start completely fresh during testing, delete the DB file (e.g. `rm backend/data/finance.db` or `rm ./data/finance.db`) and restart the backend so the schema is recreated.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Uses Vite proxy to `/api` → backend. Open http://localhost:5173

### Run both

From repo root, run backend in one terminal and frontend in another (or use a single command that starts both).

## Run on Umbrel

The app is built with base path `/finance-app` so it works when Umbrel serves it at `https://<umbrel>/finance-app/`. Data is stored in `${APP_DATA_DIR}/data` (SQLite). Backup via Settings in the UI.

### Option A: Install on your Umbrel server manually

1. Push this repo to GitHub (or have the app directory available to your Umbrel node).
2. On Umbrel: if your version supports **Install custom app**, add the repo URL and install. Otherwise, copy the app folder (with `Dockerfile`, `docker-compose.yml`, `umbrel-app.yml`, `backend/`, `frontend/`) into your Umbrel app store directory (e.g. `~/umbrel/app-stores/<store-id>/finance-app`).
3. For local `docker compose` without Umbrel, set the data dir: `APP_DATA_DIR=. docker compose up --build`. Umbrel sets `APP_DATA_DIR` automatically when running the app.
4. Build and run: `docker build -t finance-app .` and start via Umbrel (or `docker compose up` with `APP_DATA_DIR` set).

### Option B: Community app store

1. Fork [getumbrel/umbrel-community-app-store](https://github.com/getumbrel/umbrel-community-app-store).
2. Add a subfolder `finance-app` with `umbrel-app.yml`, `docker-compose.yml`, and either a `Dockerfile` plus app source or a reference to this repo (see the community store template for how apps are listed).
3. Add the app to the store manifest so it appears in the store.
4. In Umbrel, add your fork as a **Community App Store**, then install **Personal Finance Asset Tracker** from it.

Update `umbrel-app.yml` with your `developer`, `repo`, and `support` URLs before publishing.

## API

- **Health:** `GET /api/health`
- **Accounts:** `GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/:id`
- **Assets:** `GET /api/assets/account/:id`, `POST /api/assets/account/:id`, `GET/PATCH/DELETE /api/assets/:id`, `GET /api/assets/:id/history`
- **Cashflows:** `GET/POST /api/cashflows`, `GET/PATCH/DELETE /api/cashflows/:id`
- **Portfolio:** `GET /api/portfolio/current` (by_account includes `value`, `market_value`, `value_floor_5`, `value_ceiling_95`, `color`), `GET /api/portfolio/history` (items include `total_value`, `total_market_value`, by_account with `market_value`, `color`), `POST /api/portfolio/snapshot`, `GET /api/portfolio/estimated-mortgage-payments`, `GET /api/portfolio/cash-debt-interest` (optional `margin_interest_rate` query = default rate for assets without a per-asset rate)
- **Prices:** `GET /api/prices` (optional query: `recalculate=SYM1,SYM2`), `POST /api/prices/recalculate`
- **Price models:** `GET /api/price-models/symbols`, `GET /api/price-models/chart?symbol=AAPL` (historical price + fitted model and 5th/95th bands for charting)
- **Forecast:** `POST /api/forecast` (optional `price_level`: `fair` | `optimistic` | `worst_case` for stocks/Bitcoin valuation)
- **Symbols:** `GET /api/symbols/validate?symbol=AAPL` (validate ticker against Yahoo Finance)
- **FX:** `GET /api/fx/rate?from=USD&to=EUR` (optional `date=YYYY-MM-DD` for historical rate; amount_from × rate = amount_to)
- **Backup:** `GET /api/backup/export`, `POST /api/backup/import` (requires `confirm=true` for restore)

## Features

- **Accounts:** cash, brokerage (with optional cash/margin as assets), Bitcoin, property (value + mortgage, appreciation CAGR, annuity mortgage in forecast)
- **Assets** per account with full quantity history (audit trail)
- **Cashflows:** income/expense with start/end and frequency; mortgage payments as negative cashflows in forecast
- **Live prices** (yfinance) for stocks and BTC-USD; 24h change
- **Price models:** regression-based fair value and 5th/95th percentile bands per symbol; current-price quantile within bands. Models: stocks (log price vs time), Bitcoin (log price vs log days since genesis), IBIT (BTC model + BTC/IBIT ratio). Optional force-refresh via `recalculate` query or `POST /api/prices/recalculate`.
- **Portfolio:** current value with fair, market, and optional floor/ceiling (5th/95th percentile) per account; value over time (snapshots store fair + market totals and per-account breakdown with market_value); historical chart; estimated monthly mortgage payments per property with active mortgage
- **Forecast:** floor + VaR for stocks/Bitcoin, property appreciation and mortgage payoff, brokerage cash/margin (negative balance compounds at per-asset or default debt rate), cashflow bucket with CAGR. All values in **USD** (unit of account); frontend can display in another currency via its own conversion.
- **Display currency:** Settings option to show all account values, prices, and totals in a chosen currency (e.g. EUR); backend remains USD; frontend uses FX rate and `Intl.NumberFormat` for proper currency symbols (e.g. €1,234.56).
- **Prices tab:** live prices table plus historical model chart (select asset to view price vs date with fitted regression and 5th/95th bands); uses `GET /api/price-models/symbols` and `GET /api/price-models/chart?symbol=X`.
- **Default debt interest rate:** in Settings; used for margin/cash debt in forecast when an asset does not specify its own rate.
- **Backup/restore:** download .db, upload to restore (requires confirm)

## How the forecast model works

The forecast projects your portfolio value year-by-year over a configurable horizon (default 10 years). You can set `horizon_years`, `margin_interest_rate` (default rate for margin/debt when an asset does not specify one), `cashflow_bucket_cagr`, and `price_level` (`fair` | `optimistic` | `worst_case`) when calling `POST /api/forecast`. For stocks and Bitcoin, `optimistic` uses the 95th percentile price and `worst_case` uses the 5th percentile; `fair` uses the regression fair value. The frontend uses the default debt interest rate from **Settings** when running a forecast.

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
| **Brokerage cash** | Add a **cash balance** asset on a brokerage account. **Negative balance** = margin debt: compounds each year at the asset’s **debt interest rate** if set, otherwise at the default rate (from Settings in the UI or the request’s `margin_interest_rate`). **Positive balance** = cash: constant (0% return). Multi-currency: balances are converted to **USD** for all calculations; API returns `unit_of_account: "USD"`. |

### Unit of account

- All backend calculations and all value/price fields in API responses use **USD**. Cash and cashflow amounts in other currencies are converted to USD via the FX service. Responses include `unit_of_account: "USD"`. The frontend can display values in another currency (e.g. EUR) by applying its own exchange rate to the USD values.

### Cashflow bucket

- **Net cashflow** for each year = income cashflows − expense cashflows − **annual mortgage payments** (each cashflow amount is converted to USD before summing). (so mortgage is not double-counted if you also add it as an expense).
- Cashflows are converted to annual amounts using their frequency (weekly × 52, monthly × 12, yearly × 1), and only cashflows active in that year (between start_date and end_date) are included.
- After adding the year’s net cashflow, the **cashflow bucket** is grown by `(1 + cashflow_bucket_cagr)` (default 5% CAGR).
- **Total portfolio value** at each year = sum of all account values (including negative brokerage cash for margin debt) + cashflow bucket. All value and price fields in API responses are in **USD**.

### Output

- **series:** One row per year with `date`, `total_value`, `cashflow_bucket`, and `by_account` (and account names as keys for chart stacking).
- **breakdown:** Per-asset, per-year rows with `type` (cash, brokerage, bitcoin, property, margin), `value`, and `details` (e.g. fair_price, floor_5, ceiling_95, shares, mortgage balances). Use this for “floor + VaR” style inspection (e.g. 5th percentile value at each horizon).

## Changelog: Version 1.1.1

- **Accounts**
  - Account **color tag**: choose from a primary + darker palette in Add/Edit account forms; color shown as a circle next to each account in the list and used in Dashboard/Forecast charts.
  - **Edit account**: name, currency, color. Brokerage margin is represented as a cash balance asset (negative = debt).
  - **Delete account** with confirmation.
  - Palette: circular swatches; primary colors (red, orange, amber, green, teal, blue, violet, pink) plus darker variants for better range.

- **Assets**
  - **Ticker validation** when adding brokerage assets (yfinance, cached).
  - Asset **edit** with Save; Type column removed from assets table (type comes from account).
  - **One property per account**: UI and API enforce a single property asset per property account.

- **Property**
  - Full **property edit form**: value, mortgage balance, rate, term, appreciation CAGR, payment.
  - Property overview shows full real-estate parameters (not just value and mortgage).

- **Portfolio & forecast**
  - **Cascade updates**: creating/updating/deleting assets or accounts invalidates portfolio and forecast queries so Dashboard and Forecast reflect changes immediately.
  - **Portfolio API** includes `color` in `by_account` so bar charts use account colors.
  - **Forecast chart**: stable layout (fixed chart area height, content fits viewport); y-axis given enough left margin/width so large values (e.g. $1,000,000) are not cropped.
  - **Dashboard** portfolio history chart: same y-axis margin fix.

- **Backend**
  - **DB migration**: adds `accounts.color` if missing (no manual migration needed for existing DBs).
  - **Symbols**: `GET /api/symbols/validate?symbol=X` for ticker validation with caching.

## Changelog: Version 1.2

- **Display currency**
  - **Settings** → Display currency: choose currency for all displayed values (USD, EUR, GBP, etc.). Backend stays in USD; frontend converts via `GET /api/fx/rate`.
  - **FX API**: `GET /api/fx/rate?from=&to=&date=` (optional date for historical rate). Used by DisplayCurrencyContext and for cashflow/portfolio display.
  - **Constants**: `frontend/src/constants/currencies.ts`; **Contexts**: `DisplayCurrencyContext`, `DefaultDebtInterestRateContext`.

- **Prices (merged with Price models)**
  - Single **Prices** tab: live prices table and, below it, historical model chart (select asset for price vs date with fitted regression and 5th/95th bands). APIs: `GET /api/price-models/symbols`, `GET /api/price-models/chart?symbol=X`.
  - Backend: `api/price_models.py`, `schemas/price_models.py`; extended `price_model_service` for chart data.

- **Settings**
  - **Default debt interest rate** in Settings: annual rate used for margin/debt in forecast when an asset has no per-asset rate. Stored in frontend (localStorage) and passed to forecast and cash-debt-interest APIs when needed.

## Changelog: Version 1.3

- **Portfolio**
  - **Current:** `by_account` includes `value_floor_5` and `value_ceiling_95` (5th/95th percentile when price models exist) in addition to fair and market value.
  - **History & snapshots:** `GET /api/portfolio/history` returns `total_market_value` and per-account `market_value` and `color` when stored. Snapshots now persist and return `total_market_value`; DB migration adds `portfolio_snapshots.total_market_value` if missing.
  - **Dashboard:** Shows market value as primary total and per-account when available; fair value shown as secondary when it differs. History chart and table use `total_market_value` / per-account `market_value` when present.

- **Forecast**
  - **Price level:** `POST /api/forecast` accepts `price_level`: `fair` (default), `optimistic` (95th percentile), or `worst_case` (5th percentile) for stocks and Bitcoin. Forecast page includes a selector for this.

- **Prices**
  - **Single tab:** Price Models nav item removed; all price and model chart functionality lives under the **Prices** tab.

- **Display currency & formatting**
  - Display currency amounts use `Intl.NumberFormat` with the selected currency for correct symbols (e.g. €1,234.56).
  - **Cashflows:** Non-USD amounts in the table use `formatAmountInCurrency` for proper currency formatting.
  - **Frontend utils:** `frontend/src/utils/currency.ts` — `formatAmountInCurrency(amount, currencyCode)` and `getCurrencySymbol(currencyCode)` for labels and per-currency display.
