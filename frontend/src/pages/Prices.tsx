import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pricesApi, type PriceItem } from "../api";

function formatPrice(v: number | null | undefined) {
  if (v == null || typeof v !== "number") return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatParams(p: Record<string, number> | null | undefined) {
  if (!p || Object.keys(p).length === 0) return "—";
  return Object.entries(p)
    .map(([k, v]) => `${k}=${typeof v === "number" && (k.includes("ratio") || k.includes("std")) ? v.toFixed(4) : v}`)
    .join(", ");
}

export default function Prices() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["prices"], queryFn: () => pricesApi.list() });
  const recalc = useMutation({
    mutationFn: (symbols: string[]) => pricesApi.recalculate(symbols),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prices"] }),
  });

  if (isLoading) return <div>Loading prices…</div>;
  if (error) return <div className="card" style={{ color: "#f87171" }}>{(error as Error).message}</div>;

  const prices = data?.prices ?? {};
  const entries = Object.entries(prices) as [string, PriceItem][];
  const symbols = entries.map(([sym]) => sym);

  return (
    <div>
      <h1>Live prices</h1>
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
      <div className="card">
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
                    <td>${formatPrice(p.price)}</td>
                    <td>{p.fair_value != null ? `$${formatPrice(p.fair_value)}` : "—"}</td>
                    <td>{p.floor_5 != null ? `$${formatPrice(p.floor_5)}` : "—"}</td>
                    <td>{p.ceiling_95 != null ? `$${formatPrice(p.ceiling_95)}` : "—"}</td>
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
    </div>
  );
}
