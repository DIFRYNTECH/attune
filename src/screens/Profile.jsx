import { useMemo, useState } from "react";
import { summarizeRecentThemes } from "../lib/noteMemory";

function SettingToggleRow({ title, description, checked, onChange, disabled = false, id }) {
  return (
    <label className={"settingRow" + (disabled ? " disabled" : "")}
      aria-disabled={disabled ? "true" : "false"}
    >
      <div className="settingRowText">
        <div className="settingRowTitle">{title}</div>
        <div className="settingRowDesc">{description}</div>
      </div>
      <input
        id={id}
        className="switchInput"
        type="checkbox"
        role="switch"
        aria-checked={!!checked}
        checked={!!checked}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}

function SettingsSection({ title, helper, children }) {
  return (
    <section className="settingsSection">
      <div className="settingsSectionHead">
        <div className="settingsSectionTitle">{title}</div>
        {helper ? <div className="settingsSectionHelper">{helper}</div> : null}
      </div>
      <div className="settingsSectionBody">{children}</div>
    </section>
  );
}

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
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);

  const profileName = state.profile?.name || "";
  const profileEmail = state.profile?.email || "";
  const useNoteForAi = state.profile?.useNoteForAi !== false;
  const canUseMemory = !!state?.entitlements?.noteMemory;
  const noteCount = Array.isArray(state?.noteMemory?.notes) ? state.noteMemory.notes.length : 0;
  const recentThemes = summarizeRecentThemes(state?.noteMemory, 10);
  const recentNotes = (Array.isArray(state?.noteMemory?.notes) ? state.noteMemory.notes : [])
    .slice(-10)
    .reverse();

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
    <div className="card settingsCard">
      <div className="settingsHeader">
        <h2 className="settingsTitle">Profile</h2>
        <div className="settingsSubtitle">Local settings for this device.</div>
      </div>

      <div className="settingsMain">
        <SettingsSection title="About you" helper="Optional. Saved locally on this device.">
          <div className="settingsFields">
            <div>
              <div className="fieldLabelRow">
                <label htmlFor="profileName">Name</label>
                <span className="fieldPill" aria-hidden="true">Optional</span>
              </div>
              <input
                id="profileName"
                className="inputCompact"
                type="text"
                value={profileName}
                placeholder="What should we call you?"
                onChange={(e) => actions?.setProfile?.({ name: e.target.value })}
                maxLength={40}
                aria-label="Name"
              />
            </div>

            <div>
              <div className="fieldLabelRow">
                <label htmlFor="profileEmail">Email</label>
                <span className="fieldPill" aria-hidden="true">Optional</span>
              </div>
              <input
                id="profileEmail"
                className="inputCompact"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={profileEmail}
                placeholder="you@example.com"
                onChange={(e) => actions?.setProfile?.({ email: e.target.value })}
                maxLength={120}
                aria-label="Email"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Preferences" helper="These apply only on this device.">
          <SettingToggleRow
            id="weekStartsMonday"
            title="Week starts on Monday"
            description="Weekly view runs Monday → Sunday."
            checked={true}
            disabled={true}
            onChange={() => {}}
          />

          <SettingToggleRow
            id="useNoteForAi"
            title="Use my optional check-in note for AI"
            description="If off, Attune won’t send your note — just mood, energy, body, and pace."
            checked={useNoteForAi}
            onChange={(e) => actions?.setProfile?.({ useNoteForAi: !!e.target.checked })}
          />
        </SettingsSection>

        <SettingsSection
          title="Data"
          helper="Export a copy, or clear everything stored locally on this device."
        >
          <div className="settingsActions">
            <button type="button" className="btn" onClick={doExport}>
              Export data
            </button>
            <button
              type="button"
              className="btn ghost dangerGhost"
              onClick={() => setConfirmOpen(true)}
            >
              Clear this device
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Note memory"
          helper={canUseMemory
            ? "Attune Plus remembers your check-in notes over time (locally on this device)."
            : "Plus feature. Free plan doesn’t keep historical note memory."}
        >
          <div className="settingsActions">
            <button
              type="button"
              className="btn ghost dangerGhost"
              disabled={!canUseMemory || noteCount === 0}
              onClick={() => setClearMemoryOpen(true)}
              title={!canUseMemory ? "Enable Plus to use note memory" : noteCount === 0 ? "No note memory yet" : ""}
            >
              Clear note history
            </button>
            <div style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
              {canUseMemory ? `${noteCount} saved` : "0 saved"}
            </div>
          </div>

          {canUseMemory && noteCount > 0 && recentThemes.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              <strong style={{ color: "var(--text)" }}>Lately:</strong> {recentThemes.join(" · ")}
            </div>
          )}

          {canUseMemory && noteCount > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Recent notes
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recentNotes.map((n, idx) => (
                  <li
                    key={`${n?.date ?? "unknown"}-${idx}`}
                    style={{
                      marginBottom: 6,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    <span style={{ opacity: 0.8 }}>{n?.date ?? ""}</span>
                    {": "}
                    <span style={{ whiteSpace: "normal" }}>{String(n?.text ?? "").trim() || "(empty)"}</span>
                    {Array.isArray(n?.themes) && n.themes.length > 0 ? ` — ${n.themes.join(", ")}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SettingsSection>
      </div>

      {confirmOpen && (
        <div
          className="modalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Clear device confirmation">
            <div className="modalTitle">Clear this device?</div>
            <div className="modalBody">
              This removes your Attune data stored locally on this device (including history and preferences). You can’t undo this.
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
                style={{ borderColor: "rgba(239,68,68,.25)", color: "#7f1d1d", fontWeight: 900 }}
              >
                Clear device
              </button>
            </div>
          </div>
        </div>
      )}

      {clearMemoryOpen && (
        <div
          className="modalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setClearMemoryOpen(false);
          }}
        >
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Clear note memory confirmation">
            <div className="modalTitle">Clear note history?</div>
            <div className="modalBody">
              This removes your saved check-in notes (Plus memory) stored locally on this device. You can’t undo this.
            </div>
            <div className="modalActions">
              <button type="button" className="btn small ghost" onClick={() => setClearMemoryOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setClearMemoryOpen(false);
                  actions?.clearNoteMemory?.();
                }}
                style={{ borderColor: "rgba(239,68,68,.25)", color: "#7f1d1d", fontWeight: 900 }}
              >
                Clear notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
