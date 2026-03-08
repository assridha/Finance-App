import { useMemo, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { cashflowsApi, fxApi, portfolioApi, type Cashflow, type CashflowType, type CashflowFrequency } from "../api";
import { CURRENCY_OPTIONS } from "../constants/currencies";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import { useDefaultDebtInterestRate } from "../contexts/DefaultDebtInterestRateContext";
import { formatAmountInCurrency } from "../utils/currency";

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export default function Cashflows() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCashflowId, setEditingCashflowId] = useState<number | null>(null);
  const { formatUsdForDisplay } = useDisplayCurrency();
  const { defaultDebtInterestRate } = useDefaultDebtInterestRate();
  const { data: cashflows = [], error: errorCf } = useQuery({ queryKey: ["cashflows"], queryFn: cashflowsApi.list });
  const { data: mortgageData } = useQuery({
    queryKey: ["portfolio", "estimated-mortgage-payments"],
    queryFn: () => portfolioApi.estimatedMortgagePayments(),
  });
  const mortgagePayments = mortgageData?.payments ?? [];
  const { data: cashDebtInterestData } = useQuery({
    queryKey: ["portfolio", "cash-debt-interest", defaultDebtInterestRate],
    queryFn: () => portfolioApi.cashDebtInterest(defaultDebtInterestRate),
  });
  const cashDebtInterest = cashDebtInterestData;

  const create = useMutation({
    mutationFn: cashflowsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cashflows"] }); setShowForm(false); },
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Cashflow> }) => cashflowsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflows"] });
      setEditingCashflowId(null);
    },
  });
  const remove = useMutation({
    mutationFn: cashflowsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashflows"] }),
  });

  const uniqueCurrencies = useMemo(
    () => [...new Set(cashflows.map((c) => (c.currency || "USD").toUpperCase()))],
    [cashflows]
  );
  const fxResults = useQueries({
    queries: uniqueCurrencies.map((currency) => ({
      queryKey: ["fx", currency, "USD"] as const,
      queryFn: () => fxApi.rate(currency, "USD"),
      enabled: currency !== "USD",
      staleTime: 60 * 60 * 1000,
    })),
  });
  const ratesToUsd = useMemo(() => {
    const map: Record<string, number> = { USD: 1 };
    uniqueCurrencies.forEach((currency, i) => {
      if (currency === "USD") return;
      const res = fxResults[i]?.data;
      map[currency] = res?.rate ?? 1;
    });
    return map;
  }, [uniqueCurrencies, fxResults]);

  const monthlyEquiv = (cf: Cashflow) =>
    cf.frequency === "yearly" ? cf.amount / 12 : cf.frequency === "weekly" ? (cf.amount * 52) / 12 : cf.amount;
  const monthlyEquivUsd = (cf: Cashflow) => monthlyEquiv(cf) * (ratesToUsd[(cf.currency || "USD").toUpperCase()] ?? 1);
  const netIncomeMo = cashflows.filter((c) => c.type === "income").reduce((s, c) => s + monthlyEquivUsd(c), 0);
  const netOtherExpensesMo = cashflows.filter((c) => c.type === "expense").reduce((s, c) => s + monthlyEquivUsd(c), 0);
  const mortgageExpenseMo = mortgagePayments.reduce((s, p) => s + p.monthly_payment, 0);
  const debtFinancingMo = cashDebtInterest?.total_monthly_interest_usd ?? 0;
  const totalCashflowMo = netIncomeMo - netOtherExpensesMo - mortgageExpenseMo - debtFinancingMo;
  const totalMonthlyEquivUsd = cashflows.reduce((sum, cf) => {
    const mult = cf.type === "income" ? 1 : -1;
    return sum + mult * monthlyEquivUsd(cf);
  }, 0);

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <h1>Cashflows</h1>
      {errorCf && <div className="card" style={{ color: "#f87171", marginBottom: "1rem" }}>{(errorCf as Error).message}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p style={{ color: "#71717a", margin: 0 }}>Income and expenses with start/end dates. Used in forecast.</p>
        <button className="primary" onClick={() => { setShowForm(true); setEditingCashflowId(null); }}>Add cashflow</button>
      </div>
      {showForm && !editingCashflowId && (
        <CashflowForm
          onSave={(data) => create.mutate(data)}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editingCashflowId != null && (() => {
        const initial = cashflows.find((c) => c.id === editingCashflowId);
        return initial ? (
          <CashflowForm
            key={editingCashflowId}
            initialCashflow={initial}
            onSave={(data) => update.mutate({ id: editingCashflowId, data })}
            onCancel={() => setEditingCashflowId(null)}
          />
        ) : null;
      })()}
      <div className="card" style={{ marginBottom: "1rem", maxWidth: "100%", overflow: "hidden" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Cashflow summary (monthly)</h3>
        <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "1rem" }}>
          All income and expense cashflows converted to monthly equivalent. Mortgage and debt financing are in USD.
        </p>
        <table style={{ width: "100%", maxWidth: 420 }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: "1rem", color: "#a1a1aa" }}>Net income</td>
              <td style={{ textAlign: "right", fontWeight: 500 }}>+ {formatUsdForDisplay(netIncomeMo)}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: "1rem", color: "#a1a1aa" }}>Net other expenses</td>
              <td style={{ textAlign: "right", fontWeight: 500 }}>− {formatUsdForDisplay(netOtherExpensesMo)}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: "1rem", color: "#a1a1aa" }}>Mortgage expense</td>
              <td style={{ textAlign: "right", fontWeight: 500 }}>− {formatUsdForDisplay(mortgageExpenseMo)}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: "1rem", color: "#a1a1aa" }}>Debt financing (interest)</td>
              <td style={{ textAlign: "right", fontWeight: 500 }}>− {formatUsdForDisplay(debtFinancingMo)}</td>
            </tr>
            <tr style={{ borderTop: "1px solid #3f3f46" }}>
              <td style={{ paddingTop: "0.75rem", paddingRight: "1rem", fontWeight: 600 }}>Total cashflow</td>
              <td style={{ paddingTop: "0.75rem", textAlign: "right", fontWeight: 600 }}>
                {totalCashflowMo >= 0 ? "+" : "−"} {formatUsdForDisplay(Math.abs(totalCashflowMo))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {cashDebtInterest && (
        <div className="card" style={{ marginBottom: "1rem", maxWidth: "100%", overflow: "hidden" }}>
          <h3 style={{ marginTop: 0 }}>Net monthly interest expense (from cash / margin debt)</h3>
          <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Interest on negative cash balances (cash accounts and brokerage margin debt). Uses per-asset rates where set, otherwise the default from Settings ({(cashDebtInterest.margin_interest_rate * 100).toFixed(0)}% here). Values in {cashDebtInterest.unit_of_account}.
          </p>
          <p style={{ marginBottom: "0.75rem", fontWeight: 600 }}>
            Total: {formatUsdForDisplay(cashDebtInterest.total_monthly_interest_usd)} / month
          </p>
          {cashDebtInterest.by_account.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 280 }}>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Debt balance</th>
                    <th>Monthly interest</th>
                  </tr>
                </thead>
                <tbody>
                  {cashDebtInterest.by_account.map((row) => (
                    <tr key={row.account_id}>
                      <td>{row.account_name}</td>
                      <td>{formatUsdForDisplay(row.debt_balance_usd)}</td>
                      <td>{formatUsdForDisplay(row.monthly_interest_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "#71717a", margin: 0 }}>No negative cash balances. No interest expense from cash or margin debt.</p>
          )}
        </div>
      )}
      {mortgagePayments.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", maxWidth: "100%", overflow: "hidden" }}>
          <h3 style={{ marginTop: 0 }}>Estimated monthly mortgage payments (from Accounts)</h3>
          <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Properties with an active mortgage. These are included as negative cashflows in the forecast.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 280 }}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Mortgage balance</th>
                  <th>Monthly payment (est.)</th>
                </tr>
              </thead>
              <tbody>
                {mortgagePayments.map((p) => (
                  <tr key={p.asset_id}>
                    <td>{p.account_name}</td>
                    <td>{formatUsdForDisplay(p.mortgage_balance)}</td>
                    <td>{formatUsdForDisplay(p.monthly_payment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card" style={{ maxWidth: "100%", overflow: "hidden" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Income and expenses</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 320 }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Start</th>
                <th>End</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {cashflows.map((cf) => (
                <tr key={cf.id}>
                  <td>{cf.type}</td>
                  <td>{cf.name ?? "—"}</td>
                  <td>
                    {cf.type === "income" ? "+" : "−"} {formatUsdForDisplay(monthlyEquivUsd(cf))}
                    {cf.currency !== "USD" && (
                      <span style={{ color: "#71717a", fontSize: "0.875rem", display: "block" }}>
                        {formatAmountInCurrency(cf.amount, cf.currency || "USD")} / {cf.frequency === "yearly" ? "yr" : cf.frequency === "weekly" ? "wk" : "mo"}
                      </span>
                    )}
                  </td>
                  <td>{cf.frequency}</td>
                  <td>{cf.start_date}</td>
                  <td>{cf.end_date}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => { setEditingCashflowId(cf.id); setShowForm(false); }}
                      title="Edit"
                      style={{ padding: "0.35rem", minWidth: 32, minHeight: 32, marginRight: 4 }}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove.mutate(cf.id)}
                      title="Delete"
                      style={{ color: "#f87171", padding: "0.35rem", minWidth: 32, minHeight: 32 }}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {cashflows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "1px solid #3f3f46", fontWeight: 600 }}>
                  <td>—</td>
                  <td>Total (monthly equiv.)</td>
                  <td>
                    {totalMonthlyEquivUsd >= 0 ? "+" : "−"} {formatUsdForDisplay(Math.abs(totalMonthlyEquivUsd))}
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {cashflows.length === 0 && <p style={{ color: "#71717a" }}>No cashflows yet.</p>}
      </div>
    </div>
  );
}

function CashflowForm({
  initialCashflow,
  onSave,
  onCancel,
}: {
  initialCashflow?: Cashflow | null;
  onSave: (data: Partial<Cashflow>) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<CashflowType>(initialCashflow?.type ?? "income");
  const [amount, setAmount] = useState(initialCashflow != null ? String(initialCashflow.amount) : "");
  const [currency, setCurrency] = useState(initialCashflow?.currency ?? "USD");
  const [frequency, setFrequency] = useState<CashflowFrequency>(initialCashflow?.frequency ?? "monthly");
  const [start_date, setStartDate] = useState(initialCashflow?.start_date ?? "");
  const [end_date, setEndDate] = useState(initialCashflow?.end_date ?? "");
  const [name, setName] = useState(initialCashflow?.name ?? "");
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <label>Type</label>
      <select value={type} onChange={(e) => setType(e.target.value as CashflowType)}>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
      <label>Amount (per period)</label>
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label>Currency</label>
      <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <label>Frequency</label>
      <select value={frequency} onChange={(e) => setFrequency(e.target.value as CashflowFrequency)}>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
      <label>Start date</label>
      <input type="date" value={start_date} onChange={(e) => setStartDate(e.target.value)} />
      <label>End date</label>
      <input type="date" value={end_date} onChange={(e) => setEndDate(e.target.value)} />
      <label>Name (optional)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button
          className="primary"
          onClick={() =>
            onSave({
              type,
              amount: parseFloat(amount) || 0,
              currency,
              frequency,
              start_date,
              end_date,
              name: name || undefined,
            })
          }
        >
          {initialCashflow ? "Update" : "Save"}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
