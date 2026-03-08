import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { priceModelsApi, type PriceModelChartPoint } from "../api";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";

function formatDate(str: string) {
  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return str;
  }
}

export default function PriceModels() {
  const { formatUsdForDisplay } = useDisplayCurrency();
  const [symbol, setSymbol] = useState<string>("");

  const { data: symbolsData, isLoading: loadingSymbols } = useQuery({
    queryKey: ["price-models", "symbols"],
    queryFn: () => priceModelsApi.symbols(),
  });
  const symbols = symbolsData?.symbols ?? [];

  const { data: chartData, isLoading: loadingChart, error: chartError } = useQuery({
    queryKey: ["price-model-chart", symbol],
    queryFn: () => priceModelsApi.chart(symbol),
    enabled: !!symbol,
  });

  if (loadingSymbols) return <div>Loading symbols…</div>;

  return (
    <div>
      <h1>Price models</h1>
      <p style={{ color: "#71717a", marginBottom: "1rem" }}>
        Historical price vs date with fitted regression model and 5th/95th percentile confidence bands. Select an asset to view.
      </p>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label htmlFor="price-model-symbol" style={{ marginRight: "0.5rem" }}>
          Asset:
        </label>
        <select
          id="price-model-symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ padding: "0.35rem 0.5rem", minWidth: 140 }}
        >
          <option value="">Select ticker…</option>
          {symbols.map((s) => (
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

      {!symbol && (
        <div className="card" style={{ color: "#71717a" }}>
          Select an asset ticker to view the price history and fitted model.
        </div>
      )}

      {symbol && loadingChart && <div className="card">Loading chart…</div>}

      {symbol && chartError && (
        <div className="card" style={{ color: "#f87171" }}>
          {(chartError as Error).message}
        </div>
      )}

      {symbol && chartData && chartData.data.length > 0 && (
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
              {/* Base area 0→floor_5 so the band stacks correctly from floor_5 to ceiling_95; not hidden so stack is applied */}
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

      {symbol && chartData && chartData.data.length === 0 && (
        <div className="card" style={{ color: "#71717a" }}>
          No history data available for this symbol.
        </div>
      )}
    </div>
  );
}
