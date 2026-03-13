import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { backupApi } from "../api";
import axios from "axios";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import { useDefaultDebtInterestRate } from "../contexts/DefaultDebtInterestRateContext";
import { CURRENCY_OPTIONS } from "../constants/currencies";

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteAllMessage, setDeleteAllMessage] = useState("");
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  const { defaultDebtInterestRate, setDefaultDebtInterestRate } = useDefaultDebtInterestRate();

  const importMutation = useMutation({
    mutationFn: ({ file, confirm }: { file: File; confirm: boolean }) => backupApi.import(file, confirm),
    onSuccess: () => {
      setRestoreMessage("Restore started. Reload the page to use the restored data.");
      setConfirmRestore(false);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: Error) => {
      setRestoreMessage(axios.isAxiosError(err) ? (err.response?.data?.detail || err.message) : err.message);
    },
  });

  const handleRestore = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setRestoreMessage("Select a .db file first.");
      return;
    }
    importMutation.mutate({ file, confirm: confirmRestore });
  };

  const deleteAllMutation = useMutation({
    mutationFn: (confirm: boolean) => backupApi.deleteAllData(confirm),
    onSuccess: () => {
      setDeleteAllMessage("All data deleted. Reload the page.");
      setConfirmDeleteAll(false);
    },
    onError: (err: Error) => {
      setDeleteAllMessage(axios.isAxiosError(err) ? (err.response?.data?.detail || err.message) : err.message);
    },
  });

  const handleDeleteAll = () => {
    deleteAllMutation.mutate(confirmDeleteAll);
  };

  const backupExportPath = backupApi.exportUrl();
  const backupDownloadHref =
    typeof window !== "undefined" ? window.location.origin + backupExportPath : backupExportPath;

  // #region agent log
  useEffect(() => {
    if (typeof fetch === "undefined" || typeof window === "undefined") return;
    fetch("http://127.0.0.1:7333/ingest/f830f5db-31e8-4404-bdca-2c0de31dee04", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f5e582" },
      body: JSON.stringify({
        sessionId: "f5e582",
        location: "Settings.tsx:backup link",
        message: "backup link href",
        data: { backupExportPath, backupDownloadHref, origin: window.location.origin },
        timestamp: Date.now(),
        hypothesisId: "H3-H5",
      }),
    }).catch(() => {});
  }, [backupExportPath, backupDownloadHref]);
  // #endregion

  return (
    <div>
      <h1>Settings</h1>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Display currency</h3>
        <p style={{ color: "#71717a" }}>All account values, prices, and totals are shown in this currency. Inputs (e.g. cash amount) keep their own currency.</p>
        <label>
          Currency:{" "}
          <select
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value)}
            style={{ marginLeft: "0.5rem", padding: "0.35rem 0.5rem" }}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Default debt interest rate</h3>
        <p style={{ color: "#71717a" }}>Used for margin and cash debt when an asset does not specify its own rate (e.g. 0.08 = 8% annual).</p>
        <label>
          Annual rate:{" "}
          <input
            type="number"
            step="0.01"
            min="0"
            value={defaultDebtInterestRate}
            onChange={(e) => setDefaultDebtInterestRate(parseFloat(e.target.value) || 0)}
            style={{ marginLeft: "0.5rem", padding: "0.35rem 0.5rem", width: 80 }}
          />
        </label>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Data backup</h3>
        <p style={{ color: "#71717a" }}>Download a copy of your database to recover from server disruptions.</p>
        <a href={backupDownloadHref} download style={{ display: "inline-block", marginBottom: "1rem" }}>
          <button type="button" className="primary">Download backup</button>
        </a>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Restore from backup</h3>
        <p style={{ color: "#71717a" }}>Upload a previously exported .db file. This will replace current data. Restart the app after restore.</p>
        <input ref={fileRef} type="file" accept=".db" style={{ marginBottom: "0.5rem" }} />
        <br />
        <label>
          <input type="checkbox" checked={confirmRestore} onChange={(e) => setConfirmRestore(e.target.checked)} />
          I confirm I want to overwrite current data
        </label>
        <br />
        <button
          className="primary"
          onClick={handleRestore}
          disabled={importMutation.isPending || !confirmRestore}
          style={{ marginTop: "0.5rem" }}
        >
          {importMutation.isPending ? "Restoring…" : "Restore"}
        </button>
        {restoreMessage && <p style={{ marginTop: "1rem", color: restoreMessage.startsWith("Restore") ? "#22c55e" : "#f87171" }}>{restoreMessage}</p>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Delete all account data</h3>
        <p style={{ color: "#71717a" }}>Permanently delete all accounts, assets, cashflows, and portfolio history. This cannot be undone.</p>
        <label>
          <input type="checkbox" checked={confirmDeleteAll} onChange={(e) => setConfirmDeleteAll(e.target.checked)} />
          I confirm I want to delete all accounts, assets, cashflows, and portfolio history
        </label>
        <br />
        <button
          type="button"
          onClick={handleDeleteAll}
          disabled={deleteAllMutation.isPending || !confirmDeleteAll}
          style={{ marginTop: "0.5rem", backgroundColor: "#dc2626", color: "white" }}
        >
          {deleteAllMutation.isPending ? "Deleting…" : "Delete all data"}
        </button>
        {deleteAllMessage && (
          <p style={{ marginTop: "1rem", color: deleteAllMessage.startsWith("All data") ? "#22c55e" : "#f87171" }}>
            {deleteAllMessage}
          </p>
        )}
      </div>
    </div>
  );
}
