import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { forecastApi, portfolioApi, type ForecastBreakdownItem } from "../api";

const ACCOUNT_COLORS = ["#a78bfa", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#84cc16"];
const CASHFLOW_BUCKET_COLOR = "#14b8a6"; // teal – distinct from account green (IBKR etc.)

const DETAIL_LABELS: Record<string, string> = {
  balance: "Balance",
  fair_price: "Fair price",
  floor_5: "Floor (5%)",
  ceiling_95: "Ceiling (95%)",
  current_price: "Current price",
  floor: "Floor",
  var_t0: "VaR (t₀)",
  vol: "Vol",
  var_proj: "VaR proj",
  price_proj: "Price proj",
  shares: "Shares",
  btc_amount: "BTC amount",
  property_value_start: "Property value (start)",
  appreciation_cagr: "Appreciation CAGR",
  property_value_at_year: "Property value (year)",
  mortgage_balance_start: "Mortgage (start)",
  mortgage_balance_at_year: "Mortgage (year)",
  margin_debt_start: "Margin debt (start)",
  margin_interest_rate: "Margin rate",
  margin_debt_at_year: "Margin debt (year)",
};

export default function Forecast() {
  const [horizonYears, setHorizonYears] = useState(10);
  const [marginRate, setMarginRate] = useState(0.08);
  const [cashflowCagr, setCashflowCagr] = useState(0.05);

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio", "current"],
    queryFn: portfolioApi.current,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["forecast", horizonYears, marginRate, cashflowCagr],
    queryFn: () =>
      forecastApi.run({
        horizon_years: horizonYears,
        margin_interest_rate: marginRate,
        cashflow_bucket_cagr: cashflowCagr,
      }),
    enabled: false,
  });

  const series = data?.series ?? [];
  const breakdown = data?.breakdown ?? [];

  const forecastSeriesNames = useMemo(() => {
    if (series.length === 0) return [];
    const accounts =
      series[0]?.by_account?.length
        ? (series[0].by_account as { account_name: string }[]).map((a) => a.account_name)
        : Object.keys(series[0]?.account_values ?? {});
    return ["Cashflow bucket", ...accounts];
  }, [series]);

  /** Stack order for the chart: accounts on top, Cashflow bucket at base (drawn last = bottom in Recharts). */
  const forecastStackOrder = useMemo(
    () => [...forecastSeriesNames.filter((n) => n !== "Cashflow bucket"), "Cashflow bucket"],
    [forecastSeriesNames]
  );

  const [includedForecastSeries, setIncludedForecastSeries] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (forecastSeriesNames.length > 0) {
      setIncludedForecastSeries((prev) => {
        const next = new Set(prev);
        forecastSeriesNames.forEach((n) => next.add(n));
        return next;
      });
    }
  }, [forecastSeriesNames.join(",")]);

  const toggleForecastSeries = (name: string) => {
    setIncludedForecastSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };


  const accountNames = useMemo(
    () => (portfolio?.by_account ?? []).map((a) => a.account_name),
    [portfolio?.by_account]
  );

  const [includedAccounts, setIncludedAccounts] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (accountNames.length > 0) {
      setIncludedAccounts((prev) => {
        const next = new Set(prev);
        accountNames.forEach((n) => next.add(n));
        return next;
      });
    }
  }, [accountNames.join(",")]);

  const toggleAccount = (name: string) => {
    setIncludedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const presentDayBarData = useMemo(() => {
    const byAccount = portfolio?.by_account ?? [];
    if (byAccount.length === 0) return [];
    const marketRow: Record<string, string | number> = { name: "Market value" };
    const fairRow: Record<string, string | number> = { name: "Fair value" };
    byAccount.forEach((a) => {
      const market = a.market_value ?? a.value;
      marketRow[a.account_name] = includedAccounts.has(a.account_name) ? market : 0;
      fairRow[a.account_name] = includedAccounts.has(a.account_name) ? a.value : 0;
    });
    return [marketRow, fairRow];
  }, [portfolio?.by_account, includedAccounts]);

  const detailKeys = useMemo(() => {
    const set = new Set<string>();
    for (const row of breakdown) {
      Object.keys(row.details || {}).forEach((k) => set.add(k));
    }
    return Array.from(set).sort();
  }, [breakdown]);

  return (
    <div>
      <h1>Forecast</h1>
      <p style={{ color: "#71717a", marginBottom: "1rem" }}>
        Projected portfolio value using regression-based fair value for stocks and Bitcoin (and IBIT via Bitcoin model), property appreciation and mortgage payoff, margin debt interest, and cashflow bucket growth.
      </p>
      <div className="card" style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
        <div>
          <label>Horizon (years)</label>
          <input
            type="number"
            min={1}
            max={30}
            value={horizonYears}
            onChange={(e) => setHorizonYears(parseInt(e.target.value, 10) || 10)}
            style={{ width: 80 }}
          />
        </div>
        <div>
          <label>Margin interest rate (annual)</label>
          <input
            type="number"
            step="0.01"
            value={marginRate}
            onChange={(e) => setMarginRate(parseFloat(e.target.value) || 0)}
            style={{ width: 80 }}
          />
        </div>
        <div>
          <label>Cashflow bucket CAGR</label>
          <input
            type="number"
            step="0.01"
            value={cashflowCagr}
            onChange={(e) => setCashflowCagr(parseFloat(e.target.value) || 0)}
            style={{ width: 80 }}
          />
        </div>
        <button className="primary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Running…" : "Run forecast"}
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.125rem" }}>Present-day net asset value (by account)</h2>
        {accountNames.length === 0 ? (
          <p style={{ color: "#71717a" }}>No accounts with assets. Add accounts and assets to see breakdown.</p>
        ) : (
          <>
            <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              Click a legend label to include or exclude that account from the totals.
            </p>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={presentDayBarData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" stroke="#71717a" />
                  <YAxis stroke="#71717a" tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                  <Tooltip
                    formatter={(v: number | undefined, name?: string) =>
                      name != null && !includedAccounts.has(name) ? null : [
                        `$${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                        name ?? "",
                      ]
                    }
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a" }}
                    labelFormatter={(label) => label}
                  />
                  <Legend
                    content={() => (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginTop: "0.5rem" }}>
                        {accountNames.map((name, i) => {
                          const included = includedAccounts.has(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => toggleAccount(name)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.8125rem",
                                border: "1px solid #52525b",
                                borderRadius: 4,
                                background: included ? ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] : "transparent",
                                color: included ? "#0f0f12" : "#71717a",
                                cursor: "pointer",
                                opacity: included ? 1 : 0.55,
                              }}
                              title={included ? "Click to exclude from chart" : "Click to include in chart"}
                            >
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 2,
                                  background: included ? "currentColor" : "transparent",
                                  border: `1px solid ${ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}`,
                                }}
                              />
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                  {accountNames.map((name) => {
                    const included = includedAccounts.has(name);
                    return (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="nav"
                        fill={ACCOUNT_COLORS[accountNames.indexOf(name) % ACCOUNT_COLORS.length]}
                        name={name}
                        hide={!included}
                        opacity={included ? 1 : 0}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {accountNames.length > 0 && !accountNames.some((n) => includedAccounts.has(n)) && (
              <p style={{ color: "#a1a1aa", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                All accounts excluded. Click a label above to include accounts in the chart.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div>Loading…</div>
        ) : series.length === 0 ? (
          <p style={{ color: "#71717a" }}>Run forecast to see projection.</p>
        ) : (
          <>
            <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              Cumulative fair value over time: cashflow bucket (base) plus per-account portfolio value stacked on top. Click a legend label to include or exclude it.
            </p>
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series.map((s) => {
                    const point: Record<string, unknown> = { ...s, ...(s.account_values ?? {}) };
                    forecastSeriesNames.forEach((name) => {
                      if (!includedForecastSeries.has(name)) {
                        if (name === "Cashflow bucket") point.cashflow_bucket = 0;
                        else point[name] = 0;
                      }
                    });
                    return point;
                  })}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#71717a" />
                  <YAxis stroke="#71717a" tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                  <Tooltip
                    content={({ payload, label, active }) => {
                      if (!active || !payload?.length) return null;
                      const ordered = forecastSeriesNames
                        .map((name) => payload.find((p: { name?: string }) => p.name === name))
                        .filter((p): p is NonNullable<typeof p> => p != null && includedForecastSeries.has(p.name as string));
                      const colorFor = (name: string) =>
                        name === "Cashflow bucket" ? CASHFLOW_BUCKET_COLOR : ACCOUNT_COLORS[(forecastSeriesNames.indexOf(name) - 1) % ACCOUNT_COLORS.length];
                      return (
                        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: "0.5rem 0.75rem", fontSize: "0.8125rem" }}>
                          <div style={{ marginBottom: "0.35rem", color: "#a1a1aa" }}>{label}</div>
                          {ordered.map((p: { name?: string; value?: number }) => (
                            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 2,
                                  background: colorFor(p.name ?? ""),
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ color: "#e4e4e7" }}>
                                {p.value != null ? `$${Number(p.value).toLocaleString()}` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a" }}
                    labelFormatter={(label) => label}
                  />
                  <Legend
                    content={() => (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginTop: "0.5rem" }}>
                        {forecastSeriesNames.map((name, idx) => {
                          const included = includedForecastSeries.has(name);
                          const color = name === "Cashflow bucket" ? CASHFLOW_BUCKET_COLOR : ACCOUNT_COLORS[(idx - 1) % ACCOUNT_COLORS.length];
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => toggleForecastSeries(name)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.8125rem",
                                border: "1px solid #52525b",
                                borderRadius: 4,
                                background: included ? color : "transparent",
                                color: included ? "#0f0f12" : "#71717a",
                                cursor: "pointer",
                                opacity: included ? 1 : 0.55,
                              }}
                              title={included ? "Click to exclude from chart" : "Click to include in chart"}
                            >
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 2,
                                  background: included ? "currentColor" : "transparent",
                                  border: `1px solid ${color}`,
                                }}
                              />
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                  {forecastStackOrder.map((name) => {
                    const included = includedForecastSeries.has(name);
                    if (name === "Cashflow bucket") {
                      return (
                        <Area
                          key={name}
                          type="monotone"
                          dataKey="cashflow_bucket"
                          stackId="fv"
                          fill={CASHFLOW_BUCKET_COLOR}
                          stroke={CASHFLOW_BUCKET_COLOR}
                          name="Cashflow bucket"
                          opacity={included ? 1 : 0}
                          hide={!included}
                        />
                      );
                    }
                    const colorIndex = forecastSeriesNames.indexOf(name) - 1;
                    return (
                      <Area
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stackId="fv"
                        fill={ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length]}
                        stroke={ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length]}
                        name={name}
                        opacity={included ? 1 : 0}
                        hide={!included}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {includedForecastSeries.size === 0 && (
              <p style={{ color: "#a1a1aa", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                All series excluded. Click a legend label above to include them in the chart.
              </p>
            )}
          </>
        )}
      </div>

      {breakdown.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.125rem" }}>Calculations by asset and year</h2>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Asset</th>
                  <th>Type</th>
                  {detailKeys.map((k) => (
                    <th key={k}>{DETAIL_LABELS[k] ?? k}</th>
                  ))}
                  <th style={{ textAlign: "right" }}>Value ($)</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row: ForecastBreakdownItem, i: number) => (
                  <tr key={`${row.year}-${row.label}-${i}`}>
                    <td>{row.year}</td>
                    <td>{row.label}</td>
                    <td>{row.type}</td>
                    {detailKeys.map((k) => {
                      const v = row.details?.[k];
                      return (
                        <td key={k}>
                          {v != null ? (k.includes("rate") || k.includes("cagr") || k.includes("vol") ? `${(v * 100).toFixed(2)}%` : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "right", fontWeight: 500 }}>{row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
