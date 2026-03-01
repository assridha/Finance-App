import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi, assetsApi, symbolsApi, type Account, type AccountType, type Asset } from "../api";

const ACCOUNT_TYPE_LABELS: Record<AccountType, { emoji: string; label: string }> = {
  cash: { emoji: "💵", label: "cash" },
  brokerage: { emoji: "📈", label: "brokerage" },
  bitcoin: { emoji: "₿", label: "bitcoin" },
  property: { emoji: "🏠", label: "property" },
};

// Primary colors (distinct hues) + darker variants for range and contrast
const ACCOUNT_COLOR_PALETTE = [
  "#ef4444", "#b91c1c", // red, red dark
  "#f97316", "#c2410c", // orange, orange dark
  "#eab308", "#a16207", // amber, amber dark
  "#22c55e", "#15803d", // green, green dark
  "#14b8a6", "#0d9488", // teal, teal dark
  "#3b82f6", "#1d4ed8", // blue, blue dark
  "#8b5cf6", "#6d28d9", // violet, violet dark
  "#ec4899", "#be185d", // pink, pink dark
];

export default function Accounts() {
  const qc = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [deleteConfirmAccountId, setDeleteConfirmAccountId] = useState<number | null>(null);

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
    onSuccess: () => {
      if (selectedAccountId) qc.invalidateQueries({ queryKey: ["assets", selectedAccountId] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
  const updateAsset = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Asset> }) => assetsApi.update(id, data),
    onSuccess: () => {
      if (selectedAccountId) qc.invalidateQueries({ queryKey: ["assets", selectedAccountId] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
  const deleteAsset = useMutation({
    mutationFn: assetsApi.delete,
    onSuccess: () => {
      if (selectedAccountId) qc.invalidateQueries({ queryKey: ["assets", selectedAccountId] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
  const deleteAccount = useMutation({
    mutationFn: accountsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
      if (selectedAccountId === deleteConfirmAccountId) setSelectedAccountId(null);
      setDeleteConfirmAccountId(null);
    },
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
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => setSelectedAccountId(a.id)}>
                  <span
                    title="Account color"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: a.color ?? "#52525b",
                      border: a.color ? "none" : "1px solid #71717a",
                    }}
                  />
                  <span>
                    {a.name}{" "}
                    <span style={{ color: "#71717a", fontSize: "0.875rem" }}>
                      {ACCOUNT_TYPE_LABELS[a.type].emoji} {ACCOUNT_TYPE_LABELS[a.type].label}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card" style={{ flex: "1 1 400px" }}>
          {!selectedAccount ? (
            <p style={{ color: "#71717a" }}>Select an account</p>
          ) : editingAccountId === selectedAccount.id ? (
            <EditAccountForm
              account={selectedAccount}
              onSave={(data) => { updateAccount.mutate({ id: selectedAccount.id, data }); setEditingAccountId(null); }}
              onCancel={() => setEditingAccountId(null)}
            />
          ) : errorAssets ? (
            <div style={{ color: "#f87171" }}>{(errorAssets as Error).message}</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Assets in {selectedAccount.name}</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditingAccountId(selectedAccount.id)}>Edit account</button>
                  <button
                    style={{ color: "#f87171" }}
                    onClick={() => setDeleteConfirmAccountId(selectedAccount.id)}
                  >
                    Delete account
                  </button>
                </div>
              </div>
              {deleteConfirmAccountId === selectedAccount.id && (
                <div className="card" style={{ marginBottom: "1rem", background: "#27272a", padding: "1rem" }}>
                  <p style={{ margin: "0 0 0.75rem 0" }}>
                    Delete account &quot;{selectedAccount.name}&quot;? This will remove all its assets.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="primary"
                      style={{ background: "#dc2626" }}
                      onClick={() => deleteAccount.mutate(selectedAccount.id)}
                      disabled={deleteAccount.isPending}
                    >
                      {deleteAccount.isPending ? "Deleting…" : "Delete"}
                    </button>
                    <button onClick={() => setDeleteConfirmAccountId(null)}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <span />
                {selectedAccount.type === "property" && assets.length >= 1 ? (
                  <span style={{ color: "#71717a", fontSize: "0.875rem" }}>This account has one property. Add another account for another property.</span>
                ) : (
                  <button className="primary" onClick={() => setShowAddAsset(true)}>Add asset</button>
                )}
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
  onSave: (data: { name: string; type: AccountType; currency: string; is_margin: boolean; margin_debt?: number; color?: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cash");
  const [currency, setCurrency] = useState("USD");
  const [is_margin, setIsMargin] = useState(false);
  const [margin_debt, setMarginDebt] = useState("");
  const [color, setColor] = useState<string | null>(null);
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
      <label>Color</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {ACCOUNT_COLOR_PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            style={{
              width: 24,
              height: 24,
              minWidth: 24,
              minHeight: 24,
              padding: 0,
              flexShrink: 0,
              boxSizing: "border-box",
              borderRadius: "50%",
              background: hex,
              border: color === hex ? "2px solid white" : "1px solid #71717a",
              cursor: "pointer",
            }}
            onClick={() => setColor(hex)}
          />
        ))}
        <button
          type="button"
          style={{
            width: 24,
            height: 24,
            minWidth: 24,
            minHeight: 24,
            padding: 0,
            flexShrink: 0,
            boxSizing: "border-box",
            borderRadius: "50%",
            background: "transparent",
            border: "1px solid #71717a",
            cursor: "pointer",
            fontSize: 10,
          }}
          title="No color"
          onClick={() => setColor(null)}
        >
          —
        </button>
      </div>
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
        <button className="primary" onClick={() => onSave({ name, type, currency, is_margin, margin_debt: is_margin && margin_debt ? parseFloat(margin_debt) : undefined, color })}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EditAccountForm({
  account,
  onSave,
  onCancel,
}: {
  account: Account;
  onSave: (data: Partial<Account>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [currency, setCurrency] = useState(account.currency);
  const [is_margin, setIsMargin] = useState(account.is_margin);
  const [margin_debt, setMarginDebt] = useState(String(account.margin_debt ?? ""));
  const [color, setColor] = useState<string | null>(account.color ?? null);

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <label>Account name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Currency</label>
      <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
      <label>Color</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {ACCOUNT_COLOR_PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            style={{
              width: 24,
              height: 24,
              minWidth: 24,
              minHeight: 24,
              padding: 0,
              flexShrink: 0,
              boxSizing: "border-box",
              borderRadius: "50%",
              background: hex,
              border: color === hex ? "2px solid white" : "1px solid #71717a",
              cursor: "pointer",
            }}
            onClick={() => setColor(hex)}
          />
        ))}
        <button
          type="button"
          style={{
            width: 24,
            height: 24,
            minWidth: 24,
            minHeight: 24,
            padding: 0,
            flexShrink: 0,
            boxSizing: "border-box",
            borderRadius: "50%",
            background: "transparent",
            border: "1px solid #71717a",
            cursor: "pointer",
            fontSize: 10,
          }}
          title="No color"
          onClick={() => setColor(null)}
        >
          —
        </button>
      </div>
      {account.type === "brokerage" && (
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
        <button
          className="primary"
          onClick={() =>
            onSave({
              name,
              currency,
              color,
              ...(account.type === "brokerage"
                ? { is_margin, margin_debt: is_margin && margin_debt ? parseFloat(margin_debt) : undefined }
                : {}),
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
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

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
    const handleBrokerageSave = async () => {
      const sym = symbol.trim().toUpperCase();
      if (!sym) {
        setSymbolError("Symbol is required");
        return;
      }
      setSymbolError(null);
      setValidating(true);
      try {
        const res = await symbolsApi.validate(sym);
        if (!res.valid) {
          setSymbolError(res.message ?? "Symbol not found on Yahoo Finance");
          return;
        }
        onSave({ symbol: sym, shares: parseFloat(shares) || 0 });
      } finally {
        setValidating(false);
      }
    };
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Symbol</label>
        <input value={symbol} onChange={(e) => { setSymbol(e.target.value); setSymbolError(null); }} placeholder="AAPL" />
        {symbolError && <div style={{ color: "#f87171", fontSize: "0.875rem", marginTop: 4 }}>{symbolError}</div>}
        <label>Shares</label>
        <input type="number" value={shares} onChange={(e) => setShares(e.target.value)} />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button className="primary" onClick={handleBrokerageSave} disabled={validating}>{validating ? "Checking…" : "Save"}</button>
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

function EditPropertyForm({
  asset,
  onSave,
  onCancel,
}: {
  asset: Asset;
  onSave: (data: Partial<Asset>) => void;
  onCancel: () => void;
}) {
  const [property_value, setPropertyValue] = useState(String(asset.property_value ?? ""));
  const [mortgage_balance, setMortgageBalance] = useState(String(asset.mortgage_balance ?? ""));
  const [appreciation_cagr, setAppreciationCagr] = useState(asset.appreciation_cagr != null ? String(asset.appreciation_cagr) : "");
  const [mortgage_annual_rate, setMortgageRate] = useState(asset.mortgage_annual_rate != null ? String(asset.mortgage_annual_rate) : "");
  const [mortgage_term_months, setMortgageTerm] = useState(asset.mortgage_term_remaining_months != null ? String(asset.mortgage_term_remaining_months) : "");

  return (
    <div className="card" style={{ marginBottom: 0, padding: "0.75rem" }}>
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
          onClick={() => {
            onSave({
              property_value: parseFloat(property_value) || 0,
              mortgage_balance: parseFloat(mortgage_balance) || 0,
              appreciation_cagr: appreciation_cagr ? parseFloat(appreciation_cagr) : undefined,
              mortgage_annual_rate: mortgage_annual_rate ? parseFloat(mortgage_annual_rate) : undefined,
              mortgage_term_remaining_months: mortgage_term_months ? parseInt(mortgage_term_months, 10) : undefined,
              payment_frequency: asset.payment_frequency ?? "monthly",
            });
          }}
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
      : null;
  const propertyDisplay =
    accountType === "property" ? (
      <div style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
        <div>Value: {asset.property_value?.toLocaleString() ?? "—"}, Mortgage: {asset.mortgage_balance?.toLocaleString() ?? "—"}</div>
        <div>Interest rate: {asset.mortgage_annual_rate != null ? `${(Number(asset.mortgage_annual_rate) * 100).toFixed(2)}%` : "—"}, Term: {asset.mortgage_term_remaining_months ?? "—"} mo</div>
        <div>Appreciation CAGR: {asset.appreciation_cagr != null ? `${(Number(asset.appreciation_cagr) * 100).toFixed(2)}%` : "—"}, Payment: {asset.payment_frequency ?? "—"}</div>
      </div>
    ) : null;

  const commitEdit = () => {
    if (accountType === "cash") onUpdate({ balance: parseFloat(val) || 0 });
    else if (accountType === "brokerage") onUpdate({ shares: parseFloat(val) || 0 });
    else if (accountType === "bitcoin") onUpdate({ btc_amount: parseFloat(val) || 0 });
    else onUpdate({ property_value: parseFloat(val) || 0 });
    setEditing(false);
  };

  if (editing && accountType === "property") {
    return (
      <tr>
        <td colSpan={2} style={{ verticalAlign: "top", padding: 0 }}>
          <EditPropertyForm
            asset={asset}
            onSave={(data) => { onUpdate(data); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={2}>
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
            }}
          />
          <button className="primary" onClick={commitEdit}>Save</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{accountType === "property" ? propertyDisplay : display}</td>
      <td>
        <button
          onClick={() => {
            if (accountType === "property") setEditing(true);
            else { setVal(String(asset.shares ?? asset.balance ?? asset.btc_amount ?? asset.property_value ?? "")); setEditing(true); }
          }}
        >
          Edit
        </button>
        <button onClick={onDelete} style={{ marginLeft: 4, color: "#f87171" }}>Delete</button>
      </td>
    </tr>
  );
}
