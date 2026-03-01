import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { portfolioApi } from "../api";

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: current, isLoading: loadingCurrent, error: errorCurrent } = useQuery({
    queryKey: ["portfolio", "current"],
    queryFn: portfolioApi.current,
  });
  const { data: history, error: errorHistory } = useQuery({
    queryKey: ["portfolio", "history"],
    queryFn: () => portfolioApi.history(),
  });
  const snapshot = useMutation({
    mutationFn: portfolioApi.snapshot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });

  if (loadingCurrent) return <div>Loading…</div>;
  if (errorCurrent) return <div className="card" style={{ color: "#f87171" }}>Failed to load portfolio: {(errorCurrent as Error).message}</div>;

  const chartData = history?.history ?? [];
  return (
    <div>
      <h1>Dashboard</h1>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#71717a", fontSize: "0.875rem" }}>Total portfolio value (fair)</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 600 }}>
            ${current?.total_value?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? "0.00"}
          </div>
          {current?.total_market_value != null &&
            Math.abs((current.total_market_value ?? 0) - (current.total_value ?? 0)) > 0.01 && (
              <div style={{ color: "#71717a", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                Market: ${current.total_market_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            )}
        </div>
        <button className="primary" onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
          {snapshot.isPending ? "Saving…" : "Save snapshot"}
        </button>
      </div>
      {current?.by_account?.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>By account</h3>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {current.by_account.map((a) => (
              <li key={a.account_id}>
                {a.account_name}: ${a.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Portfolio value over time</h3>
        {chartData.length === 0 ? (
          <p style={{ color: "#71717a" }}>No history yet. Click &quot;Save snapshot&quot; to record today&apos;s value.</p>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" />
                <YAxis stroke="#71717a" tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number | undefined) => [v != null ? `$${v.toLocaleString()}` : "—", "Value"]} />
                <Line type="monotone" dataKey="total_value" stroke="#a78bfa" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
