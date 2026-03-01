import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi, assetsApi, type Account, type AccountType, type Asset } from "../api";

export default function Accounts() {
  const qc = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);

  const { data: accounts = [], error: errorAccounts } = useQuery({ queryKey: ["accounts"], queryFn: accountsApi.list });
  const { data: assets = [], error: errorAssets } = useQuery({
    queryKey: ["assets", selectedAccountId],
    queryFn: () => (selectedAccountId ? assetsApi.list(selectedAccountId) : []),
    enabled: !!selectedAccountId,
  });

  const createAccount = useMutation({
    mutationFn: accountsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setShowAddAccount(false); },
  });
  const updateAccount = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Account> }) => accountsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const createAsset = useMutation({
    mutationFn: ({ accountId, data }: { accountId: number; data: Partial<Asset> }) => assetsApi.create(accountId, data),
    onSuccess: () => selectedAccountId && qc.invalidateQueries({ queryKey: ["assets", selectedAccountId] }),
  });
  const updateAsset = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Asset> }) => assetsApi.update(id, data),
    onSuccess: () => selectedAccountId && qc.invalidateQueries({ queryKey: ["assets", selectedAccountId] }),
  });
  const deleteAsset = useMutation({
    mutationFn: assetsApi.delete,
    onSuccess: () => selectedAccountId && qc.invalidateQueries({ queryKey: ["assets", selectedAccountId] }),
  });

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div>
      <h1>Accounts</h1>
      {errorAccounts && <div className="card" style={{ color: "#f87171", marginBottom: "1rem" }}>{(errorAccounts as Error).message}</div>}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 280px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>Accounts</h3>
            <button className="primary" onClick={() => setShowAddAccount(true)}>Add account</button>
          </div>
          {showAddAccount && (
            <AddAccountForm
              onSave={(data) => createAccount.mutate(data)}
              onCancel={() => setShowAddAccount(false)}
            />
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {accounts.map((a) => (
              <li
                key={a.id}
                style={{
                  padding: "0.75rem",
                  borderRadius: 6,
                  background: selectedAccountId === a.id ? "#27272a" : "transparent",
                  cursor: "pointer",
                  marginBottom: 4,
                }}
                onClick={() => setSelectedAccountId(a.id)}
              >
                {a.name} <span style={{ color: "#71717a" }}>({a.type})</span>
                {a.is_margin && a.margin_debt != null && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}> Debt: ${a.margin_debt.toLocaleString()}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="card" style={{ flex: "1 1 400px" }}>
          {!selectedAccount ? (
            <p style={{ color: "#71717a" }}>Select an account</p>
          ) : errorAssets ? (
            <div style={{ color: "#f87171" }}>{(errorAssets as Error).message}</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>Assets in {selectedAccount.name}</h3>
                <button className="primary" onClick={() => setShowAddAsset(true)}>Add asset</button>
              </div>
              {selectedAccount.type === "brokerage" && selectedAccount.is_margin && (
                <MarginDebtForm
                  value={selectedAccount.margin_debt ?? 0}
                  onSave={(v) => updateAccount.mutate({ id: selectedAccount.id, data: { margin_debt: v } })}
                />
              )}
              {showAddAsset && selectedAccount && (
                <AddAssetForm
                  accountType={selectedAccount.type}
                  onSave={(data) => { createAsset.mutate({ accountId: selectedAccount.id, data }); setShowAddAsset(false); }}
                  onCancel={() => setShowAddAsset(false)}
                />
              )}
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Value / Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <AssetRow
                      key={a.id}
                      asset={a}
                      accountType={selectedAccount.type}
                      onUpdate={(data) => updateAsset.mutate({ id: a.id, data })}
                      onDelete={() => deleteAsset.mutate(a.id)}
                    />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddAccountForm({
  onSave,
  onCancel,
}: {
  onSave: (data: { name: string; type: AccountType; currency: string; is_margin: boolean; margin_debt?: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cash");
  const [currency, setCurrency] = useState("USD");
  const [is_margin, setIsMargin] = useState(false);
  const [margin_debt, setMarginDebt] = useState("");
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Type</label>
      <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        <option value="cash">Cash</option>
        <option value="brokerage">Brokerage</option>
        <option value="bitcoin">Bitcoin</option>
        <option value="property">Property</option>
      </select>
      <label>Currency</label>
      <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
      {type === "brokerage" && (
        <>
          <label><input type="checkbox" checked={is_margin} onChange={(e) => setIsMargin(e.target.checked)} /> Margin account</label>
          {is_margin && (
            <>
              <label>Margin debt</label>
              <input type="number" value={margin_debt} onChange={(e) => setMarginDebt(e.target.value)} placeholder="0" />
            </>
          )}
        </>
      )}
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button className="primary" onClick={() => onSave({ name, type, currency, is_margin, margin_debt: is_margin && margin_debt ? parseFloat(margin_debt) : undefined })}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function MarginDebtForm({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <label style={{ margin: 0 }}>Margin debt</label>
      <input type="number" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 120 }} />
      <button onClick={() => onSave(parseFloat(v) || 0)}>Update</button>
    </div>
  );
}

function AddAssetForm({
  accountType,
  onSave,
  onCancel,
}: {
  accountType: AccountType;
  onSave: (data: Partial<Asset>) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [btc_amount, setBtcAmount] = useState("");
  const [property_value, setPropertyValue] = useState("");
  const [mortgage_balance, setMortgageBalance] = useState("");
  const [appreciation_cagr, setAppreciationCagr] = useState("");
  const [mortgage_annual_rate, setMortgageRate] = useState("");
  const [mortgage_term_months, setMortgageTerm] = useState("");

  if (accountType === "cash") {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Balance</label>
        <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
        <label>Currency</label>
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button className="primary" onClick={() => onSave({ balance: parseFloat(balance) || 0, currency })}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }
  if (accountType === "brokerage") {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Symbol</label>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" />
        <label>Shares</label>
        <input type="number" value={shares} onChange={(e) => setShares(e.target.value)} />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button className="primary" onClick={() => onSave({ symbol, shares: parseFloat(shares) || 0 })}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }
  if (accountType === "bitcoin") {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>BTC amount</label>
        <input type="number" value={btc_amount} onChange={(e) => setBtcAmount(e.target.value)} step="any" />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button className="primary" onClick={() => onSave({ btc_amount: parseFloat(btc_amount) || 0 })}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <label>Property value</label>
      <input type="number" value={property_value} onChange={(e) => setPropertyValue(e.target.value)} />
      <label>Mortgage balance</label>
      <input type="number" value={mortgage_balance} onChange={(e) => setMortgageBalance(e.target.value)} />
      <label>Appreciation CAGR (e.g. 0.03)</label>
      <input type="number" value={appreciation_cagr} onChange={(e) => setAppreciationCagr(e.target.value)} step="any" placeholder="0.03" />
      <label>Mortgage annual rate</label>
      <input type="number" value={mortgage_annual_rate} onChange={(e) => setMortgageRate(e.target.value)} step="any" placeholder="0.05" />
      <label>Mortgage term remaining (months)</label>
      <input type="number" value={mortgage_term_months} onChange={(e) => setMortgageTerm(e.target.value)} placeholder="300" />
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button
          className="primary"
          onClick={() =>
            onSave({
              property_value: parseFloat(property_value) || 0,
              mortgage_balance: parseFloat(mortgage_balance) || 0,
              appreciation_cagr: appreciation_cagr ? parseFloat(appreciation_cagr) : undefined,
              mortgage_annual_rate: mortgage_annual_rate ? parseFloat(mortgage_annual_rate) : undefined,
              mortgage_term_remaining_months: mortgage_term_months ? parseInt(mortgage_term_months, 10) : undefined,
              payment_frequency: "monthly",
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

function AssetRow({
  asset,
  accountType,
  onUpdate,
  onDelete,
}: {
  asset: Asset;
  accountType: AccountType;
  onUpdate: (data: Partial<Asset>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const display =
    accountType === "cash"
      ? `${asset.balance} ${asset.currency}`
      : accountType === "brokerage"
      ? `${asset.symbol} × ${asset.shares}`
      : accountType === "bitcoin"
      ? `${asset.btc_amount} BTC`
      : `Value ${asset.property_value}, Mortgage ${asset.mortgage_balance}`;

  if (editing) {
    return (
      <tr>
        <td colSpan={3}>
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (accountType === "cash") onUpdate({ balance: parseFloat(val) || 0 });
                else if (accountType === "brokerage") onUpdate({ shares: parseFloat(val) || 0 });
                else if (accountType === "bitcoin") onUpdate({ btc_amount: parseFloat(val) || 0 });
                else onUpdate({ property_value: parseFloat(val) || 0 });
                setEditing(false);
              }
            }}
          />
          <button onClick={() => setEditing(false)}>Cancel</button>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{accountType}</td>
      <td>{display}</td>
      <td>
        <button onClick={() => { setVal(String(asset.shares ?? asset.balance ?? asset.btc_amount ?? asset.property_value ?? "")); setEditing(true); }}>Edit</button>
        <button onClick={onDelete} style={{ marginLeft: 4, color: "#f87171" }}>Delete</button>
      </td>
    </tr>
  );
}
