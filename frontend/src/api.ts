import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

export type AccountType = "cash" | "brokerage" | "bitcoin" | "property";
export type CashflowType = "income" | "expense";
export type CashflowFrequency = "weekly" | "monthly" | "yearly";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  currency: string;
  color: string | null;
}

export interface Asset {
  id: number;
  account_id: number;
  balance: number | null;
  currency: string | null;
  debt_interest_rate: number | null;
  symbol: string | null;
  shares: number | null;
  btc_amount: number | null;
  property_value: number | null;
  mortgage_balance: number | null;
  appreciation_cagr: number | null;
  mortgage_annual_rate: number | null;
  mortgage_term_remaining_months: number | null;
  payment_frequency: string | null;
}

export interface Cashflow {
  id: number;
  type: CashflowType;
  amount: number;
  currency: string;
  frequency: CashflowFrequency;
  start_date: string;
  end_date: string;
  name: string | null;
  category: string | null;
}

export const accountsApi = {
  list: () => api.get<Account[]>("/accounts").then((r) => r.data),
  create: (data: Partial<Account>) => api.post<Account>("/accounts", data).then((r) => r.data),
  get: (id: number) => api.get<Account>(`/accounts/${id}`).then((r) => r.data),
  update: (id: number, data: Partial<Account>) => api.patch<Account>(`/accounts/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/accounts/${id}`),
};

export const symbolsApi = {
  validate: (symbol: string) =>
    api.get<{ valid: boolean; message?: string }>(`/symbols/validate`, { params: { symbol: symbol.trim().toUpperCase() } }).then((r) => r.data),
};

export const assetsApi = {
  list: (accountId: number) => api.get<Asset[]>(`/assets/account/${accountId}`).then((r) => r.data),
  create: (accountId: number, data: Partial<Asset>) =>
    api.post<Asset>(`/assets/account/${accountId}`, data).then((r) => r.data),
  get: (id: number) => api.get<Asset>(`/assets/${id}`).then((r) => r.data),
  update: (id: number, data: Partial<Asset>) => api.patch<Asset>(`/assets/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/assets/${id}`),
  history: (id: number) => api.get(`/assets/${id}/history`).then((r) => r.data),
};

export const cashflowsApi = {
  list: () => api.get<Cashflow[]>("/cashflows").then((r) => r.data),
  create: (data: Partial<Cashflow>) => api.post<Cashflow>("/cashflows", data).then((r) => r.data),
  update: (id: number, data: Partial<Cashflow>) => api.patch<Cashflow>(`/cashflows/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/cashflows/${id}`),
};

export const portfolioApi = {
  current: () =>
    api
      .get<{
        total_value: number;
        total_market_value?: number | null;
        by_account: { account_id: number; account_name: string; value: number; market_value?: number | null; value_floor_5?: number | null; value_ceiling_95?: number | null; color?: string | null }[];
        assets: unknown[];
      }>("/portfolio/current")
      .then((r) => r.data),
  history: (from?: string, to?: string) =>
    api
      .get<{
        history: {
          date: string;
          total_value: number;
          total_market_value?: number | null;
          by_account?: { account_id: number; account_name: string; value: number; market_value?: number | null }[] | null;
        }[];
      }>("/portfolio/history", { params: { from_date: from, to_date: to } })
      .then((r) => r.data),
  snapshot: () => api.post<{ date: string; total_value: number }>("/portfolio/snapshot").then((r) => r.data),
  estimatedMortgagePayments: () =>
    api.get<{ payments: { account_name: string; asset_id: number; monthly_payment: number; mortgage_balance: number }[] }>("/portfolio/estimated-mortgage-payments").then((r) => r.data),
  cashDebtInterest: (marginInterestRate?: number) =>
    api
      .get<{
        unit_of_account: string;
        total_monthly_interest_usd: number;
        margin_interest_rate: number;
        by_account: { account_id: number; account_name: string; monthly_interest_usd: number; debt_balance_usd: number }[];
      }>("/portfolio/cash-debt-interest", { params: marginInterestRate != null ? { margin_interest_rate: marginInterestRate } : undefined })
      .then((r) => r.data),
};

export interface PriceItem {
  price: number;
  change24h: number | null;
  fair_value?: number | null;
  floor_5?: number | null;
  ceiling_95?: number | null;
  quantile?: number | null;
  model_updated_at?: string | null;
  model_type?: string | null;
  model_params?: Record<string, number> | null;
  ratio_as_of_date?: string | null;
}

export const pricesApi = {
  list: (recalculate?: string) =>
    api
      .get<{ prices: Record<string, PriceItem> }>("/prices", { params: recalculate ? { recalculate } : undefined })
      .then((r) => r.data),
  recalculate: (symbols: string[]) =>
    api.post<{ recalculated: string[] }>("/prices/recalculate", { symbols }).then((r) => r.data),
};

export interface ForecastBreakdownItem {
  year: number;
  date: string;
  label: string;
  type: string;
  value: number;
  details: Record<string, number>;
}

export interface ForecastSeriesAccountItem {
  account_id: number;
  account_name: string;
  value: number;
}

export interface ForecastSeriesItem {
  date: string;
  total_value: number;
  cashflow_bucket?: number;
  by_account: ForecastSeriesAccountItem[];
  account_values: Record<string, number>;
}

export const forecastApi = {
  run: (params: {
    horizon_years?: number;
    margin_interest_rate?: number;
    cashflow_bucket_cagr?: number;
    price_level?: "fair" | "optimistic" | "worst_case";
  }) =>
    api
      .post<{
        series: ForecastSeriesItem[];
        breakdown: ForecastBreakdownItem[];
      }>("/forecast", params)
      .then((r) => r.data),
};

export interface PriceModelChartPoint {
  date: string;
  price: number;
  fair: number;
  floor_5: number;
  ceiling_95: number;
}

export interface PriceModelChartResponse {
  symbol: string;
  model_type: string;
  fit_start_date: string | null;
  fit_end_date: string | null;
  data: PriceModelChartPoint[];
}

export const priceModelsApi = {
  symbols: () =>
    api.get<{ symbols: string[] }>("/price-models/symbols").then((r) => r.data),
  chart: (symbol: string) =>
    api.get<PriceModelChartResponse>("/price-models/chart", { params: { symbol } }).then((r) => r.data),
};

export const backupApi = {
  exportUrl: () => "/api/backup/export",
  import: (file: File, confirm: boolean) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/backup/import", form, { params: { confirm }, headers: { "Content-Type": "multipart/form-data" } });
  },
  deleteAllData: (confirm: boolean) => api.post("/backup/delete-all", null, { params: { confirm } }),
};

export const fxApi = {
  /** Get FX rate: amount_from * rate = amount_to. Optional date for historical rate (YYYY-MM-DD). */
  rate: (from: string, to: string, date?: string) =>
    api
      .get<{ rate: number }>("/fx/rate", { params: { from, to, ...(date ? { date } : {}) } })
      .then((r) => r.data),
};
