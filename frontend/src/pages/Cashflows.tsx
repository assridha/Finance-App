import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cashflowsApi, portfolioApi, type Cashflow, type CashflowType, type CashflowFrequency } from "../api";

export default function Cashflows() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data: cashflows = [], error: errorCf } = useQuery({ queryKey: ["cashflows"], queryFn: cashflowsApi.list });
  const { data: mortgageData } = useQuery({
    queryKey: ["portfolio", "estimated-mortgage-payments"],
    queryFn: () => portfolioApi.estimatedMortgagePayments(),
  });
  const mortgagePayments = mortgageData?.payments ?? [];

  const create = useMutation({
    mutationFn: cashflowsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cashflows"] }); setShowForm(false); },
  });
  const remove = useMutation({
    mutationFn: cashflowsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashflows"] }),
  });

  return (
    <div>
      <h1>Cashflows</h1>
      {errorCf && <div className="card" style={{ color: "#f87171", marginBottom: "1rem" }}>{(errorCf as Error).message}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p style={{ color: "#71717a", margin: 0 }}>Income and expenses with start/end dates. Used in forecast.</p>
        <button className="primary" onClick={() => setShowForm(true)}>Add cashflow</button>
      </div>
      {showForm && (
        <CashflowForm
          onSave={(data) => create.mutate(data)}
          onCancel={() => setShowForm(false)}
        />
      )}
      {mortgagePayments.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Estimated monthly mortgage payments (from Accounts)</h3>
          <p style={{ color: "#71717a", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Properties with an active mortgage. These are included as negative cashflows in the forecast.
          </p>
          <table>
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
                  <td>${p.mortgage_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td>${p.monthly_payment.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Amount</th>
              <th>Frequency</th>
              <th>Start</th>
              <th>End</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cashflows.map((cf) => (
              <tr key={cf.id}>
                <td>{cf.type}</td>
                <td>{cf.name ?? "—"}</td>
                <td>{cf.type === "income" ? "+" : "−"} ${cf.amount.toLocaleString()} {cf.currency}</td>
                <td>{cf.frequency}</td>
                <td>{cf.start_date}</td>
                <td>{cf.end_date}</td>
                <td>
                  <button onClick={() => remove.mutate(cf.id)} style={{ color: "#f87171" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cashflows.length === 0 && <p style={{ color: "#71717a" }}>No cashflows yet.</p>}
      </div>
    </div>
  );
}

function CashflowForm({
  onSave,
  onCancel,
}: {
  onSave: (data: Partial<Cashflow>) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<CashflowType>("income");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [frequency, setFrequency] = useState<CashflowFrequency>("monthly");
  const [start_date, setStartDate] = useState("");
  const [end_date, setEndDate] = useState("");
  const [name, setName] = useState("");
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
      <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
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
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
