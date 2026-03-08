import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { accountsApi, portfolioApi, type AccountType } from "../api";

const ACCOUNT_TYPE_EMOJI: Record<AccountType, string> = {
  cash: "💵",
  brokerage: "📈",
  bitcoin: "₿",
  property: "🏠",
};

const ACCOUNT_COLOR_FALLBACKS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: accountsApi.list });
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

  const byAccount = current?.by_account ?? [];
  const accountNames = byAccount.map((a) => a.account_name);
  const historyList = history?.history ?? [];
  const historyOnlyNames = Array.from(
    new Set(
      historyList.flatMap((h) => (h.by_account ?? []).map((a) => a.account_name)).filter((n) => !accountNames.includes(n))
    )
  );
  const allChartAccountNames = [...accountNames, ...historyOnlyNames];
  const chartAccounts: { account_id: number; account_name: string; color?: string | null }[] = [
    ...byAccount.map((a, i) => ({
      account_id: a.account_id,
      account_name: a.account_name,
      color: a.color ?? ACCOUNT_COLOR_FALLBACKS[i % ACCOUNT_COLOR_FALLBACKS.length],
    })),
    ...historyOnlyNames.map((name) => ({ account_id: -1, account_name: name, color: "#71717a" as const })),
  ];
  const [includedAccounts, setIncludedAccounts] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (allChartAccountNames.length > 0) {
      setIncludedAccounts((prev) => {
        const next = new Set(prev);
        allChartAccountNames.forEach((n) => next.add(n));
        return next;
      });
    }
  }, [allChartAccountNames.join(",")]);

  const toggleAccount = (name: string) => {
    setIncludedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loadingCurrent) return <div>Loading…</div>;
  if (errorCurrent) return <div className="card" style={{ color: "#f87171" }}>Failed to load portfolio: {(errorCurrent as Error).message}</div>;

  const hasBreakdown = historyList.some((h) => h.by_account && h.by_account.length > 0);
  const chartData =
    hasBreakdown && allChartAccountNames.length > 0
      ? historyList.map((h) => {
          const row: Record<string, string | number> = { date: h.date, total_value: h.total_value };
          const byName = new Map((h.by_account ?? []).map((a) => [a.account_name, a.value]));
          allChartAccountNames.forEach((name) => {
            row[name] = includedAccounts.has(name) ? (byName.get(name) ?? 0) : 0;
          });
          return row;
        })
      : historyList.map((h) => ({ date: h.date, total_value: h.total_value }));

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
            {current.by_account.map((a, i) => {
              const account = accounts.find((ac) => ac.id === a.account_id);
              const emoji = account ? ACCOUNT_TYPE_EMOJI[account.type] : "💼";
              const color = a.color ?? ACCOUNT_COLOR_FALLBACKS[i % ACCOUNT_COLOR_FALLBACKS.length];
              return (
                <li key={a.account_id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span
                    title="Account color"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: color,
                      border: "none",
                    }}
                  />
                  <span style={{ opacity: 0.9 }}>{emoji}</span>
                  <span>
                    {a.account_name}: ${a.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Portfolio value over time</h3>
        {chartData.length === 0 ? (
          <p style={{ color: "#71717a" }}>No history yet. Click &quot;Save snapshot&quot; to record today&apos;s value.</p>
        ) : (
          <>
            {hasBreakdown && allChartAccountNames.length > 0 && (
              <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                Click a legend label to include or exclude that account from the chart.
              </p>
            )}
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 56, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#71717a" />
                  <YAxis stroke="#71717a" width={52} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                  <Tooltip
                    formatter={(v: number | undefined, name?: string) =>
                      name != null && typeof name === "string" && !includedAccounts.has(name) ? null : [
                        v != null ? `$${Number(v).toLocaleString()}` : "—",
                        name ?? "Value",
                      ]
                    }
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a" }}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  {hasBreakdown && chartAccounts.length > 0 ? (
                    <>
                      {chartAccounts.map((acc) => {
                        const included = includedAccounts.has(acc.account_name);
                        const color = acc.color ?? "#71717a";
                        return (
                          <Area
                            key={acc.account_id === -1 ? acc.account_name : acc.account_id}
                            type="monotone"
                            dataKey={acc.account_name}
                            stackId="1"
                            stroke={color}
                            fill={color}
                            fillOpacity={0.7}
                            strokeWidth={1}
                            isAnimationActive={true}
                            name={acc.account_name}
                            hide={!included}
                            opacity={included ? 1 : 0}
                          />
                        );
                      })}
                      <Legend
                        content={() => (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginTop: "0.5rem" }}>
                            {chartAccounts.map((acc) => {
                              const included = includedAccounts.has(acc.account_name);
                              const color = acc.color ?? "#71717a";
                              return (
                                <button
                                  key={acc.account_id === -1 ? acc.account_name : acc.account_id}
                                  type="button"
                                  onClick={() => toggleAccount(acc.account_name)}
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
                                  {acc.account_name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      />
                    </>
                  ) : (
                    <Area
                      type="monotone"
                      dataKey="total_value"
                      stroke="#a78bfa"
                      fill="#a78bfa"
                      fillOpacity={0.4}
                      strokeWidth={2}
                      name="Total"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {hasBreakdown && allChartAccountNames.length > 0 && !allChartAccountNames.some((n) => includedAccounts.has(n)) && (
              <p style={{ color: "#a1a1aa", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                All accounts excluded. Click a label above to include accounts in the chart.
              </p>
            )}
          </>
        )}
      </div>
      {historyList.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Snapshot history</h3>
          <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            Value of each account per snapshot date.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #27272a" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "#71717a", fontWeight: 600 }}>Date</th>
                  {chartAccounts.map((acc) => (
                    <th key={acc.account_id === -1 ? acc.account_name : acc.account_id} style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "#71717a", fontWeight: 600 }}>
                      {acc.account_name}
                    </th>
                  ))}
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", color: "#71717a", fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {[...historyList].reverse().map((h) => {
                  const byName = new Map((h.by_account ?? []).map((a) => [a.account_name, a.value]));
                  return (
                    <tr key={h.date} style={{ borderBottom: "1px solid #27272a" }}>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{h.date}</td>
                      {chartAccounts.map((acc) => {
                        const val = byName.get(acc.account_name);
                        return (
                          <td key={acc.account_id === -1 ? acc.account_name : acc.account_id} style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                            {val != null ? `$${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "right", padding: "0.5rem 0.75rem", fontWeight: 500 }}>
                        ${Number(h.total_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
