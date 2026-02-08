import { useMemo, useState } from "react";

function downloadJson(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Profile({ state, actions }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const profileName = state.profile?.name || "";
  const profileEmail = state.profile?.email || "";
  const useNoteForAi = state.profile?.useNoteForAi !== false;

  const exportPayload = useMemo(() => {
    // Keep export calm + explicit: local-only data snapshot.
    const { toast: _toast, ...rest } = state || {};
    return rest;
  }, [state]);

  const doExport = () => {
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    downloadJson(`attune-${stamp}.json`, exportPayload);
    actions?.setToast?.("Exported a copy of your data.", true);
  };

  return (
    <div className="card">
      <h2>👤 Profile</h2>
      <div className="sub">On this device for now. Sign-in can come later.</div>

      <div className="result" style={{ marginBottom: 12 }}>
        <div className="resultTitle">About you</div>
        <label htmlFor="profileName">Name (optional)</label>
        <input
          id="profileName"
          type="text"
          value={profileName}
          placeholder="What should we call you?"
          onChange={(e) => actions?.setProfile?.({ name: e.target.value })}
          maxLength={40}
          aria-label="Name"
        />

        <label htmlFor="profileEmail" style={{ marginTop: 10 }}>
          Email (optional)
        </label>
        <input
          id="profileEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={profileEmail}
          placeholder="you@example.com"
          onChange={(e) => actions?.setProfile?.({ email: e.target.value })}
          maxLength={120}
          aria-label="Email"
        />
        <div className="footerNote" style={{ marginTop: 8 }}>
          This is only saved on this device.
        </div>
      </div>

      <div className="result" style={{ marginBottom: 12 }}>
        <div className="resultTitle">Preferences</div>
        <div className="miniPills" aria-label="Preferences">
          <span className="miniPill">📅 Week starts on Monday</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <label
            htmlFor="useNoteForAi"
            style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}
          >
            <input
              id="useNoteForAi"
              type="checkbox"
              checked={useNoteForAi}
              onChange={(e) => actions?.setProfile?.({ useNoteForAi: !!e.target.checked })}
            />
            <span>Use my optional check-in note to personalize AI suggestions</span>
          </label>
          <div className="footerNote" style={{ marginTop: 6 }}>
            If turned off, Attune will still use mood, energy, body, and pace, but won’t send your note.
          </div>
        </div>

        <div className="footerNote" style={{ marginTop: 8 }}>
          More preferences can live here later (notifications, theme, etc.).
        </div>
      </div>

      <div className="result" style={{ marginBottom: 0 }}>
        <div className="resultTitle">Data</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" className="btn" onClick={doExport}>
            Export data
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setConfirmOpen(true)}
            style={{
              borderColor: "rgba(239,68,68,.30)",
              background: "rgba(239,68,68,.10)",
              color: "#7f1d1d",
              fontWeight: 800,
            }}
          >
            Sign out
          </button>
        </div>

        <div className="footerNote" style={{ marginTop: 10 }}>
          Since there’s no account yet, “Sign out” clears this device’s data.
        </div>
      </div>

      {confirmOpen && (
        <div
          className="modalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Sign out confirmation">
            <div className="modalTitle">Sign out?</div>
            <div className="modalBody">
              This will clear your Attune data on this device. You can’t undo this.
            </div>
            <div className="modalActions">
              <button type="button" className="btn small ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setConfirmOpen(false);
                  actions?.clearDeviceData?.();
                }}
                style={{
                  borderColor: "rgba(239,68,68,.30)",
                  background: "rgba(239,68,68,.12)",
                  color: "#7f1d1d",
                  fontWeight: 900,
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
