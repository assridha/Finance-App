import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { pricesApi, priceModelsApi, type PriceItem, type PriceModelChartPoint } from "../api";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";

function formatParams(p: Record<string, number> | null | undefined) {
  if (!p || Object.keys(p).length === 0) return "—";
  return Object.entries(p)
    .map(([k, v]) => `${k}=${typeof v === "number" && (k.includes("ratio") || k.includes("std")) ? v.toFixed(4) : v}`)
    .join(", ");
}

function formatDate(str: string) {
  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return str;
  }
}

export default function Prices() {
  const qc = useQueryClient();
  const { formatUsdForDisplay } = useDisplayCurrency();
  const [chartSymbol, setChartSymbol] = useState<string>("");

  const { data, isLoading, error } = useQuery({ queryKey: ["prices"], queryFn: () => pricesApi.list() });
  const recalc = useMutation({
    mutationFn: (symbols: string[]) => pricesApi.recalculate(symbols),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prices"] }),
  });

  const { data: symbolsData, isLoading: loadingChartSymbols } = useQuery({
    queryKey: ["price-models", "symbols"],
    queryFn: () => priceModelsApi.symbols(),
  });
  const chartSymbols = symbolsData?.symbols ?? [];

  const { data: chartData, isLoading: loadingChart, error: chartError } = useQuery({
    queryKey: ["price-model-chart", chartSymbol],
    queryFn: () => priceModelsApi.chart(chartSymbol),
    enabled: !!chartSymbol,
  });

  if (isLoading) return <div>Loading prices…</div>;
  if (error) return <div className="card" style={{ color: "#f87171" }}>{(error as Error).message}</div>;

  const prices = data?.prices ?? {};
  const entries = Object.entries(prices) as [string, PriceItem][];
  const symbols = entries.map(([sym]) => sym);

  return (
    <div>
      <h1>Prices</h1>
      <p style={{ color: "#71717a", marginBottom: "1rem" }}>
        Market price and 24h change. Fair value and bands come from stored regression models: stocks use log-price vs time (5y history) with 5th/95th percentile bands; Bitcoin uses log-price vs log-age since genesis (max history); IBIT uses the Bitcoin model and a same-timestamp ratio (same trading-day close for both). Quantile is the approximate percentile of current price between floor and ceiling. Models are refreshed when older than 1 year or when you recalculate.
      </p>
      <div className="card" style={{ marginBottom: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <button
          className="primary"
          onClick={() => recalc.mutate(symbols)}
          disabled={symbols.length === 0 || recalc.isPending}
        >
          {recalc.isPending ? "Recalculating…" : "Recalculate all models"}
        </button>
      </div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        {entries.length === 0 ? (
          <p style={{ color: "#71717a" }}>Add brokerage or Bitcoin assets to see prices.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Market price</th>
                  <th>Fair value</th>
                  <th>Floor (5%)</th>
                  <th>Ceiling (95%)</th>
                  <th>Quantile</th>
                  <th>24h change</th>
                  <th>Model updated</th>
                  <th>Fitted params</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([sym, p]) => (
                  <tr key={sym}>
                    <td>{sym}</td>
                    <td>{formatUsdForDisplay(p.price, { maximumFractionDigits: 4 })}</td>
                    <td>{p.fair_value != null ? formatUsdForDisplay(p.fair_value, { maximumFractionDigits: 4 }) : "—"}</td>
                    <td>{p.floor_5 != null ? formatUsdForDisplay(p.floor_5, { maximumFractionDigits: 4 }) : "—"}</td>
                    <td>{p.ceiling_95 != null ? formatUsdForDisplay(p.ceiling_95, { maximumFractionDigits: 4 }) : "—"}</td>
                    <td>
                      {p.quantile != null ? (
                        <span title="Approx. percentile of current price between floor and ceiling">
                          ~{p.quantile.toFixed(0)}th %ile
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {p.change24h != null ? (
                        <span style={{ color: p.change24h >= 0 ? "#22c55e" : "#f87171" }}>
                          {p.change24h >= 0 ? "+" : ""}{p.change24h}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{p.model_updated_at ?? "—"}</td>
                    <td style={{ fontSize: "0.875rem" }} title={p.ratio_as_of_date ? `Ratio as of ${p.ratio_as_of_date}` : undefined}>
                      {formatParams(p.model_params)}
                      {p.ratio_as_of_date ? ` (ratio ${p.ratio_as_of_date})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 style={{ marginBottom: "0.5rem" }}>Historical model by asset</h2>
      <p style={{ color: "#71717a", marginBottom: "1rem" }}>
        Historical price vs date with fitted regression model and 5th/95th percentile confidence bands. Select an asset to view.
      </p>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label htmlFor="price-model-symbol" style={{ marginRight: "0.5rem" }}>
          Asset:
        </label>
        <select
          id="price-model-symbol"
          value={chartSymbol}
          onChange={(e) => setChartSymbol(e.target.value)}
          style={{ padding: "0.35rem 0.5rem", minWidth: 140 }}
          disabled={loadingChartSymbols}
        >
          <option value="">Select ticker…</option>
          {chartSymbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {chartData && (
          <span style={{ marginLeft: "1rem", color: "#71717a", fontSize: "0.875rem" }}>
            Model: {chartData.model_type} · Fit through {chartData.fit_end_date ?? "—"}
          </span>
        )}
      </div>

      {!chartSymbol && (
        <div className="card" style={{ color: "#71717a" }}>
          Select an asset ticker to view the price history and fitted model.
        </div>
      )}

      {chartSymbol && loadingChart && <div className="card">Loading chart…</div>}

      {chartSymbol && chartError && (
        <div className="card" style={{ color: "#f87171" }}>
          {(chartError as Error).message}
        </div>
      )}

      {chartSymbol && chartData && chartData.data.length > 0 && (
        <div className="card">
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart
              data={chartData.data.map((p) => ({ ...p, ciBand: p.ceiling_95 - p.floor_5 }))}
              margin={{ top: 8, right: 8, left: 56, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#a1a1aa"
                fontSize={12}
              />
              <YAxis
                stroke="#a1a1aa"
                fontSize={12}
                tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v))}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as PriceModelChartPoint;
                  return (
                    <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}>
                      <div style={{ marginBottom: "0.25rem", color: "#a1a1aa" }}>{formatDate(p.date)}</div>
                      <div>Price: {formatUsdForDisplay(p.price, { maximumFractionDigits: 4 })}</div>
                      <div>Fair value: {formatUsdForDisplay(p.fair, { maximumFractionDigits: 4 })}</div>
                      <div>5th %ile: {formatUsdForDisplay(p.floor_5, { maximumFractionDigits: 4 })}</div>
                      <div>95th %ile: {formatUsdForDisplay(p.ceiling_95, { maximumFractionDigits: 4 })}</div>
                    </div>
                  );
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="floor_5"
                stackId="ci"
                fill="#18181b"
                stroke="none"
                isAnimationActive={false}
                legendType="none"
                name=""
              />
              <Area
                type="monotone"
                dataKey="ciBand"
                stackId="ci"
                fill="#3b82f6"
                fillOpacity={0.2}
                stroke="none"
                name="5th–95th %ile"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="floor_5"
                stroke="#3b82f6"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="5th %ile"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ceiling_95"
                stroke="#3b82f6"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="95th %ile"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="fair"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="Fair value"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="Price"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartSymbol && chartData && chartData.data.length === 0 && (
        <div className="card" style={{ color: "#71717a" }}>
          No history data available for this symbol.
        </div>
      )}
    </div>
  );
}
