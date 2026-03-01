import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { backupApi } from "../api";
import axios from "axios";

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");

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

  return (
    <div>
      <h1>Settings</h1>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Data backup</h3>
        <p style={{ color: "#71717a" }}>Download a copy of your database to recover from server disruptions.</p>
        <a href={backupApi.exportUrl()} download style={{ display: "inline-block", marginBottom: "1rem" }}>
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
    </div>
  );
}
