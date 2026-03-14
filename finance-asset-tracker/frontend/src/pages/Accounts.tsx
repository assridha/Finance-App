import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi, assetsApi, symbolsApi, type Account, type AccountType, type Asset } from "../api";
import { CURRENCY_OPTIONS } from "../constants/currencies";
import { TrashIcon, PencilIcon, CheckIcon, CloseIcon } from "../components/Icons";
import { useDefaultDebtInterestRate } from "../contexts/DefaultDebtInterestRateContext";

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

  const { defaultDebtInterestRate } = useDefaultDebtInterestRate();
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
          <div className="card-row-responsive" style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>Accounts</h3>
            <button className="primary card-row-responsive__action" onClick={() => setShowAddAccount(true)}>Add account</button>
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
              <div className="card-row-responsive" style={{ marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>Assets in {selectedAccount.name}</h3>
                <div className="card-row-responsive__action" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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
                    <button type="button" className="btn-icon" onClick={() => setDeleteConfirmAccountId(null)} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
                  </div>
                </div>
              )}
              <div className={`card-row-responsive ${selectedAccount.type !== "property" || assets.length < 1 ? "card-row-responsive--start" : ""}`} style={{ marginBottom: "1rem" }}>
                {selectedAccount.type === "property" && assets.length >= 1 ? (
                  <span style={{ color: "#71717a", fontSize: "0.875rem" }}>This account has one property. Add another account for another property.</span>
                ) : (
                  <button className="primary card-row-responsive__action" onClick={() => setShowAddAsset(true)}>Add asset</button>
                )}
              </div>
              {showAddAsset && selectedAccount && (
                <AddAssetForm
                  accountType={selectedAccount.type}
                  onSave={(data) => { createAsset.mutate({ accountId: selectedAccount.id, data }); setShowAddAsset(false); }}
                  onCancel={() => setShowAddAsset(false)}
                />
              )}
              <div className="table-wrapper">
                <table className="assets-table">
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
                        defaultDebtInterestRate={defaultDebtInterestRate}
                        onUpdate={(data) => updateAsset.mutate({ id: a.id, data })}
                        onDelete={() => deleteAsset.mutate(a.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
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
  onSave: (data: { name: string; type: AccountType; currency: string; color?: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cash");
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
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" className="primary btn-icon" onClick={() => onSave({ name, type, currency: "USD", color })} title="Save" aria-label="Save"><CheckIcon size={18} /></button>
        <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
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
  const [color, setColor] = useState<string | null>(account.color ?? null);

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <label>Account name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
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
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button type="button" className="primary btn-icon" onClick={() => onSave({ name, color })} title="Save" aria-label="Save"><CheckIcon size={18} /></button>
        <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
      </div>
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
  const [propertyCurrency, setPropertyCurrency] = useState("USD");
  const [appreciation_cagr, setAppreciationCagr] = useState("");
  const [mortgage_annual_rate, setMortgageRate] = useState("");
  const [mortgage_term_months, setMortgageTerm] = useState("");
  const [debt_interest_rate, setDebtInterestRate] = useState("");
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [brokerageAddMode, setBrokerageAddMode] = useState<"position" | "cash">("position");

  if (accountType === "cash") {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Balance</label>
        <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
        <label>Currency</label>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" className="primary btn-icon" onClick={() => onSave({ balance: parseFloat(balance) || 0, currency })} title="Save" aria-label="Save"><CheckIcon size={18} /></button>
          <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
        </div>
      </div>
    );
  }
  if (accountType === "brokerage") {
    const handleBrokeragePositionSave = async () => {
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
        <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem" }}>
          <button
            type="button"
            className={brokerageAddMode === "position" ? "primary" : ""}
            onClick={() => setBrokerageAddMode("position")}
          >
            Add position
          </button>
          <button
            type="button"
            className={brokerageAddMode === "cash" ? "primary" : ""}
            onClick={() => setBrokerageAddMode("cash")}
          >
            Add cash balance
          </button>
        </div>
        {brokerageAddMode === "position" ? (
          <>
            <label>Symbol</label>
            <input value={symbol} onChange={(e) => { setSymbol(e.target.value); setSymbolError(null); }} placeholder="AAPL" />
            {symbolError && <div style={{ color: "#f87171", fontSize: "0.875rem", marginTop: 4 }}>{symbolError}</div>}
            <label>Shares</label>
            <input type="number" value={shares} onChange={(e) => setShares(e.target.value)} />
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" className="primary btn-icon" onClick={handleBrokeragePositionSave} disabled={validating} title={validating ? "Checking…" : "Save"} aria-label={validating ? "Checking…" : "Save"}><CheckIcon size={18} /></button>
              <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
            </div>
          </>
        ) : (
          <>
            <label>Balance (negative = margin debt)</label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" />
            <label>Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <label>Debt interest rate (annual, e.g. 0.08 for 8%)</label>
            <input type="number" step="0.01" min="0" value={debt_interest_rate} onChange={(e) => setDebtInterestRate(e.target.value)} placeholder="optional" />
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="primary btn-icon"
                onClick={() => {
                  const payload: Partial<Asset> = { balance: parseFloat(balance) || 0, currency };
                  const rateVal = debt_interest_rate.trim() ? parseFloat(debt_interest_rate) : undefined;
                  if (rateVal != null && Number.isFinite(rateVal) && rateVal >= 0) payload.debt_interest_rate = rateVal;
                  onSave(payload);
                }}
                title="Save"
                aria-label="Save"
              >
                <CheckIcon size={18} />
              </button>
              <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
            </div>
          </>
        )}
      </div>
    );
  }
  if (accountType === "bitcoin") {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>BTC amount</label>
        <input type="number" value={btc_amount} onChange={(e) => setBtcAmount(e.target.value)} step="any" />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" className="primary btn-icon" onClick={() => onSave({ btc_amount: parseFloat(btc_amount) || 0 })} title="Save" aria-label="Save"><CheckIcon size={18} /></button>
          <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <label>Currency (for value and mortgage)</label>
      <select value={propertyCurrency} onChange={(e) => setPropertyCurrency(e.target.value)}>
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
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
          type="button"
          className="primary btn-icon"
          title="Save"
          aria-label="Save"
          onClick={() =>
            onSave({
              property_value: parseFloat(property_value) || 0,
              mortgage_balance: parseFloat(mortgage_balance) || 0,
              currency: propertyCurrency,
              appreciation_cagr: appreciation_cagr ? parseFloat(appreciation_cagr) : undefined,
              mortgage_annual_rate: mortgage_annual_rate ? parseFloat(mortgage_annual_rate) : undefined,
              mortgage_term_remaining_months: mortgage_term_months ? parseInt(mortgage_term_months, 10) : undefined,
              payment_frequency: "monthly",
            })
          }
        >
          <CheckIcon size={18} />
        </button>
        <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
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
  const [propertyCurrency, setPropertyCurrency] = useState(asset.currency ?? "USD");
  const [appreciation_cagr, setAppreciationCagr] = useState(asset.appreciation_cagr != null ? String(asset.appreciation_cagr) : "");
  const [mortgage_annual_rate, setMortgageRate] = useState(asset.mortgage_annual_rate != null ? String(asset.mortgage_annual_rate) : "");
  const [mortgage_term_months, setMortgageTerm] = useState(asset.mortgage_term_remaining_months != null ? String(asset.mortgage_term_remaining_months) : "");

  return (
    <div className="card" style={{ marginBottom: 0, padding: "0.75rem" }}>
      <label>Currency (for value and mortgage)</label>
      <select value={propertyCurrency} onChange={(e) => setPropertyCurrency(e.target.value)}>
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
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
          type="button"
          className="primary btn-icon"
          title="Save"
          aria-label="Save"
          onClick={() => {
            onSave({
              property_value: parseFloat(property_value) || 0,
              mortgage_balance: parseFloat(mortgage_balance) || 0,
              currency: propertyCurrency,
              appreciation_cagr: appreciation_cagr ? parseFloat(appreciation_cagr) : undefined,
              mortgage_annual_rate: mortgage_annual_rate ? parseFloat(mortgage_annual_rate) : undefined,
              mortgage_term_remaining_months: mortgage_term_months ? parseInt(mortgage_term_months, 10) : undefined,
              payment_frequency: asset.payment_frequency ?? "monthly",
            });
          }}
        >
          <CheckIcon size={18} />
        </button>
        <button type="button" className="btn-icon" onClick={onCancel} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  accountType,
  defaultDebtInterestRate,
  onUpdate,
  onDelete,
}: {
  asset: Asset;
  accountType: AccountType;
  defaultDebtInterestRate: number;
  onUpdate: (data: Partial<Asset>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const isBrokerageCash = accountType === "brokerage" && asset.balance != null && !asset.symbol;
  const marginDebtRate = asset.debt_interest_rate ?? defaultDebtInterestRate;
  const marginDebtLabel =
    Number(asset.balance) < 0
      ? asset.debt_interest_rate != null
        ? `Margin debt @ ${(Number(asset.debt_interest_rate) * 100).toFixed(0)}%`
        : `Margin debt @ ${(marginDebtRate * 100).toFixed(0)}% (default)`
      : "Cash";
  const display =
    accountType === "cash"
      ? `${asset.balance} ${asset.currency ?? "USD"}`
      : accountType === "brokerage"
      ? isBrokerageCash
        ? null
        : `${asset.shares} ${asset.symbol}`
      : accountType === "bitcoin"
      ? `${asset.btc_amount} BTC`
      : null;
  const brokerageCashDisplay =
    isBrokerageCash ? (
      <div className="asset-value-cell">
        <div>{asset.balance} {asset.currency ?? "USD"}</div>
        <div className="asset-value-cell__secondary">{marginDebtLabel}</div>
      </div>
    ) : null;
  const propertyCurrencyLabel = (asset.currency ?? "USD").trim() || "USD";
  const propertyDisplay =
    accountType === "property" ? (
      <div style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
        <div>Value: {asset.property_value?.toLocaleString() ?? "—"} {propertyCurrencyLabel}, Mortgage: {asset.mortgage_balance?.toLocaleString() ?? "—"} {propertyCurrencyLabel}</div>
        <div>Interest rate: {asset.mortgage_annual_rate != null ? `${(Number(asset.mortgage_annual_rate) * 100).toFixed(2)}%` : "—"}, Term: {asset.mortgage_term_remaining_months ?? "—"} mo</div>
        <div>Appreciation CAGR: {asset.appreciation_cagr != null ? `${(Number(asset.appreciation_cagr) * 100).toFixed(2)}%` : "—"}, Payment: {asset.payment_frequency ?? "—"}</div>
      </div>
    ) : null;

  const [editCurrency, setEditCurrency] = useState(asset.currency ?? "USD");
  const [editDebtRate, setEditDebtRate] = useState(
    asset.debt_interest_rate != null ? String(asset.debt_interest_rate) : ""
  );
  const commitEdit = () => {
    if (accountType === "cash") onUpdate({ balance: parseFloat(val) || 0, currency: editCurrency });
    else if (accountType === "brokerage" && isBrokerageCash) {
      const payload: Partial<Asset> = { balance: parseFloat(val) || 0, currency: editCurrency };
      payload.debt_interest_rate =
        editDebtRate === "" ? null : (Number.isFinite(parseFloat(editDebtRate)) && parseFloat(editDebtRate) >= 0 ? parseFloat(editDebtRate) : asset.debt_interest_rate ?? null);
      onUpdate(payload);
    } else if (accountType === "brokerage") onUpdate({ shares: parseFloat(val) || 0 });
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
    const showCashEdit = accountType === "cash" || isBrokerageCash;
    return (
      <tr>
        <td colSpan={2}>
          <div className="asset-edit-row">
            <input
              type="number"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              autoFocus={!showCashEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
              }}
            />
            {showCashEdit && (
              <select
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            )}
            {isBrokerageCash && (
              <>
                <label className="asset-edit-row__label">Debt rate (annual):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editDebtRate}
                  onChange={(e) => setEditDebtRate(e.target.value)}
                  placeholder="optional"
                  style={{ width: 80 }}
                />
              </>
            )}
            <button type="button" className="primary btn-icon" onClick={commitEdit} title="Save" aria-label="Save"><CheckIcon size={18} /></button>
            <button type="button" className="btn-icon" onClick={() => setEditing(false)} title="Cancel" aria-label="Cancel"><CloseIcon size={18} /></button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{accountType === "property" ? propertyDisplay : brokerageCashDisplay ?? display}</td>
      <td>
        <div className="asset-row-actions">
          <button
            type="button"
            className="btn-icon"
            title="Edit"
            aria-label="Edit"
            onClick={() => {
              if (accountType === "property") setEditing(true);
              else {
                setVal(String(asset.shares ?? asset.balance ?? asset.btc_amount ?? asset.property_value ?? ""));
                setEditCurrency(asset.currency ?? "USD");
                setEditDebtRate(asset.debt_interest_rate != null ? String(asset.debt_interest_rate) : "");
                setEditing(true);
              }
            }}
          >
            <PencilIcon size={18} />
          </button>
          <button type="button" onClick={onDelete} title="Delete" className="btn-icon" style={{ color: "#f87171" }} aria-label="Delete">
            <TrashIcon size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}
