import { useEffect, useMemo, useState } from "react";
import { summarizeRecentThemes } from "../lib/noteMemory";
import InfoTip from "../components/InfoTip";

function SettingToggleRow({ title, description, checked, onChange, disabled = false, locked = false, onLockedClick, id }) {
  const isDisabled = !!disabled || !!locked;
  const handleClick = (e) => {
    if(locked && !disabled){
      e.preventDefault();
      onLockedClick?.(e);
    }
  };
  return (
    <label className={"settingRow" + (isDisabled ? " disabled" : "")}
      aria-disabled={isDisabled ? "true" : "false"}
      onClick={handleClick}
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
        disabled={!!disabled || !!locked}
        onChange={locked ? undefined : onChange}
      />
    </label>
  );
}

function SettingsSection({ title, helper, helperLabel, children }) {
  return (
    <section className="settingsSection">
      <div className="settingsSectionHead">
        <div className="settingsSectionTitle">{title}</div>
        {helper ? (
          <InfoTip label={helperLabel || (typeof title === "string" ? `${title} info` : "Section info")}>
            {helper}
          </InfoTip>
        ) : null}
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
  const [signOutOpen, setSignOutOpen] = useState(false);

  const profileName = state.profile?.name || "";
  const profileEmail = state.profile?.email || "";
  const signedInUser = String(state?.auth?.username || "").trim();
  const useNoteForAi = state.profile?.useNoteForAi !== false;
  const theme = state.profile?.theme === "dark" ? "dark" : "light";

  const [draftName, setDraftName] = useState(profileName);
  const [draftEmail, setDraftEmail] = useState(profileEmail);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    setDraftName(profileName);
    setDraftEmail(profileEmail);
    setNameError("");
    setEmailError("");
  }, [profileName, profileEmail]);
  const canUseMemory = !!state?.entitlements?.noteMemory;
  const isPlus = !!state?.entitlements?.isPlus;
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

  const exportNoteMemoryPayload = useMemo(() => {
    return {
      kind: "attune-note-memory",
      exportedAt: new Date().toISOString(),
      noteMemory: state?.noteMemory || { notes: [] },
    };
  }, [state?.noteMemory]);

  const doExport = () => {
    if(!isPlus){
      actions?.openPaywall?.("plus", "profile");
      return;
    }
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    downloadJson(`attune-${stamp}.json`, exportPayload);
    actions?.setToast?.("Exported a copy of your data.", true);
  };

  const doExportNoteMemory = () => {
    if(!isPlus || !canUseMemory){
      actions?.openPaywall?.("noteMemory", "profile");
      return;
    }
    if(noteCount === 0) return;
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    downloadJson(`attune-note-memory-${stamp}.json`, exportNoteMemoryPayload);
    actions?.setToast?.("Exported your note history.", true);
  };

  const commitName = () => {
    const next = String(draftName || "").trim();
    if(!next){
      setNameError("Name is required.");
      setDraftName(profileName);
      return;
    }
    if(next.length < 2){
      setNameError("Name must be at least 2 characters.");
      return;
    }
    if(next.length > 40){
      setNameError("Name must be 40 characters or fewer.");
      return;
    }
    setNameError("");
    if(next !== profileName) actions?.setProfile?.({ name: next });
  };

  const commitEmail = () => {
    const next = String(draftEmail || "").trim().toLowerCase();
    if(!next){
      setEmailError("Email is required.");
      setDraftEmail(profileEmail);
      return;
    }
    if(next.length > 120){
      setEmailError("Email is too long.");
      return;
    }

    // Practical validation (not RFC-perfect): blocks empty domain labels like `a@.com.com`.
    const at = next.indexOf("@");
    const lastAt = next.lastIndexOf("@");
    if(at <= 0 || at !== lastAt || at === next.length - 1){
      setEmailError("Enter a valid email.");
      return;
    }

    const local = next.slice(0, at);
    const domain = next.slice(at + 1);

    if(local.startsWith(".") || local.endsWith(".") || local.includes("..")){
      setEmailError("Enter a valid email.");
      return;
    }

    if(domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")){
      setEmailError("Enter a valid email.");
      return;
    }

    const labels = domain.split(".");
    if(labels.length < 2){
      setEmailError("Enter a valid email.");
      return;
    }

    // Product guard: block suspicious duplicated endings like `example.com.com`.
    if(labels.length >= 2 && labels[labels.length - 1] === labels[labels.length - 2]){
      setEmailError("Enter a valid email domain.");
      return;
    }

    const labelOk = (s) => {
      if(!s) return false;
      if(s.length > 63) return false;
      if(s.startsWith("-") || s.endsWith("-")) return false;
      return /^[a-z0-9-]+$/.test(s);
    };

    if(!labels.every(labelOk)){
      setEmailError("Enter a valid email.");
      return;
    }

    const tld = labels[labels.length - 1];
    if(!/^[a-z]{2,63}$/.test(tld)){
      setEmailError("Enter a valid email.");
      return;
    }

    setEmailError("");
    if(next !== profileEmail) actions?.setProfile?.({ email: next });
  };

  return (
    <div className="card settingsCard">
      <div className="settingsHeader">
        <h2 className="settingsTitle">Profile</h2>
        <div className="settingsSubtitle">Local settings for this device.</div>
      </div>

      <div className="settingsMain">
        <SettingsSection
          title={
            <div className="settingsSectionTitleRow">
              <span>Attune Plus</span>
              <span className={"badge" + (isPlus ? " plus" : "")}>{isPlus ? "Enabled" : "Optional"}</span>
            </div>
          }
          helper={
            <div style={{ display: "grid", gap: 10, maxWidth: 320 }}>
              <div>
                Plus helps Attune understand your rhythms and offer better suggestions, without turning your day into a checklist.
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
                Everything stays local to this device. Plus includes dark mode, exports, note memory, smarter picking, and deeper Weekly insights
                (exact score, patterns, and past weeks).
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Billing and restore purchases are coming later.</div>
            </div>
          }
          helperLabel="About Plus"
        >
          <ul className="settingsBullets" aria-label="Attune Plus features">
            <li>
              <b>Dark mode</b> for a calmer, darker look.
            </li>
            <li>
              <b>Exports</b> to download your local data.
            </li>
            <li>
              <b>Note memory</b> from your check-in note (saved locally).
            </li>
            <li>
              <b>Smarter picking</b> that adapts to what you complete/skip.
            </li>
            <li>
              <b>Weekly insights</b> that help you notice your rhythms over time.
            </li>
          </ul>

          <div className="settingsMeta">
            <div>
              Billing: <span>coming soon</span>
            </div>
            <div>
              Purchases are saved locally on this device.
            </div>
          </div>

          <div className="settingsActions" style={{ marginTop: 10 }}>
            {!isPlus ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => actions?.openPaywall?.("plus", "profile")}
                aria-label="Try Attune Plus on this device"
              >
                Try Plus
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost"
                onClick={() => actions?.setPlan?.("free")}
                aria-label="Turn off Attune Plus on this device"
              >
                Turn off Plus
              </button>
            )}
            <button type="button" className="btn ghost" disabled={true} aria-disabled="true" title="Coming soon">
              Restore (coming soon)
            </button>
          </div>
        </SettingsSection>

        <SettingsSection title="About you" helper="Required. Saved locally on this device." helperLabel="About you info">
          <div className="settingsFields">
            <div>
              <div className="fieldLabelRow">
                <label htmlFor="profileName">Name</label>
                <span className="fieldPill" aria-hidden="true">Required</span>
              </div>
              <input
                id="profileName"
                className={"inputCompact" + (nameError ? " inputError" : "")}
                type="text"
                value={draftName}
                placeholder="Your name"
                required
                minLength={2}
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby={nameError ? "profileNameError" : undefined}
                title="Name must be 2-40 characters"
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if(nameError) setNameError("");
                }}
                onKeyDown={(e) => {
                  if(e.key === "Enter"){
                    e.currentTarget.blur();
                  }
                }}
                onBlur={commitName}
                maxLength={40}
                aria-label="Name"
              />
              {nameError ? <div id="profileNameError" className="fieldError">{nameError}</div> : null}
            </div>

            <div>
              <div className="fieldLabelRow">
                <label htmlFor="profileEmail">Email</label>
                <span className="fieldPill" aria-hidden="true">Required</span>
              </div>
              <input
                id="profileEmail"
                className={"inputCompact" + (emailError ? " inputError" : "")}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={draftEmail}
                placeholder="you@example.com"
                required
                title="Enter a valid email (e.g. name@example.com)"
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "profileEmailError" : undefined}
                onChange={(e) => {
                  setDraftEmail(e.target.value);
                  if(emailError) setEmailError("");
                }}
                onKeyDown={(e) => {
                  if(e.key === "Enter"){
                    e.currentTarget.blur();
                  }
                }}
                onBlur={commitEmail}
                maxLength={120}
                aria-label="Email"
              />
              {emailError ? <div id="profileEmailError" className="fieldError">{emailError}</div> : null}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Preferences" helper="These apply only on this device." helperLabel="Preferences info">
          <SettingToggleRow
            id="darkMode"
            title="Dark mode"
            description={isPlus ? "A darker look that’s easier on the eyes." : "Included with Attune Plus."}
            checked={theme === "dark"}
            locked={!isPlus}
            onLockedClick={() => actions?.openPaywall?.("darkMode", "profile")}
            onChange={(e) => {
              actions?.setProfile?.({ theme: e.target.checked ? "dark" : "light" });
            }}
          />

          <SettingToggleRow
            id="useNoteForAi"
            title="Use my optional check-in note for AI"
            description="If off, Attune won’t send your note (only mood, energy, body, and pace)."
            checked={useNoteForAi}
            onChange={(e) => actions?.setProfile?.({ useNoteForAi: !!e.target.checked })}
          />
        </SettingsSection>

        <SettingsSection
          title="Data"
          helper="Export is included with Attune Plus. You can always clear everything stored on this device."
          helperLabel="Data info"
        >
          <div className="settingsActions">
            <button
              type="button"
              className="btn ghost"
              aria-disabled={!isPlus ? "true" : "false"}
              title={!isPlus ? "Included with Attune Plus" : ""}
              style={!isPlus ? { opacity: 0.75 } : undefined}
              onClick={() => {
                if(!isPlus) actions?.openPaywall?.("plus", "profile");
                else doExport();
              }}
            >
              Export data
            </button>
            <button
              type="button"
              className="btn ghost dangerGhost"
              onClick={() => setConfirmOpen(true)}
            >
              Clear Attune data from this device
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Note memory"
          helper={
            canUseMemory
              ? "Attune Plus remembers your check-in notes over time (stored locally on this device)."
              : "Free plan doesn’t keep historical note memory."
          }
          helperLabel="Note memory info"
        >
          <div className="settingsActions">
            <button
              type="button"
              className="btn ghost"
              disabled={isPlus && canUseMemory ? noteCount === 0 : false}
              aria-disabled={!isPlus || !canUseMemory ? "true" : "false"}
              onClick={() => {
                if(!isPlus || !canUseMemory) actions?.openPaywall?.("noteMemory", "profile");
                else doExportNoteMemory();
              }}
              title={!isPlus || !canUseMemory ? "Included with Attune Plus" : noteCount === 0 ? "No note history yet" : ""}
              style={!isPlus || !canUseMemory ? { opacity: 0.75 } : undefined}
            >
              Export note history
            </button>

            <button
              type="button"
              className="btn ghost dangerGhost"
              disabled={isPlus && canUseMemory ? noteCount === 0 : false}
              aria-disabled={!isPlus || !canUseMemory ? "true" : "false"}
              onClick={() => {
                if(!isPlus || !canUseMemory) actions?.openPaywall?.("noteMemory", "profile");
                else setClearMemoryOpen(true);
              }}
              title={!isPlus || !canUseMemory ? "Included with Attune Plus" : noteCount === 0 ? "No note history yet" : ""}
            >
              Clear note history
            </button>
            <div style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
              {canUseMemory ? `${noteCount} saved` : "0 saved"}
            </div>
          </div>

          {canUseMemory && noteCount > 0 && recentThemes.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              <strong style={{ color: "var(--ink)" }}>Lately:</strong> {recentThemes.join(" · ")}
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
                    {Array.isArray(n?.themes) && n.themes.length > 0 ? ` (${n.themes.join(", ")})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Account"
          helper="This is a placeholder sign-in for early builds. We’ll replace it with real sign-in + sync later."
          helperLabel="Account info"
        >
          <div className="settingsActions">
            <div style={{ fontSize: 12, color: "var(--muted)", flex: "1 1 auto", minWidth: 180 }}>
              Signed in{signedInUser ? (
                <>
                  {" as "}
                  <b style={{ color: "var(--ink)" }}>{signedInUser}</b>
                </>
              ) : null}
              {" on this device."}
            </div>

            <button
              type="button"
              className="btn ghost dangerGhost"
              onClick={() => setSignOutOpen(true)}
            >
              Sign out
            </button>
          </div>
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
            <div className="modalTitle">Clear Attune data from this device?</div>
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
                Clear Attune data
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

      {signOutOpen && (
        <div
          className="modalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSignOutOpen(false);
          }}
        >
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Sign out confirmation">
            <div className="modalTitle">Sign out of Attune?</div>
            <div className="modalBody">
              This signs you out on this device. Your local data will remain here unless you clear it.
            </div>
            <div className="modalActions">
              <button type="button" className="btn small ghost" onClick={() => setSignOutOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setSignOutOpen(false);
                  actions?.logout?.();
                }}
                style={{ borderColor: "rgba(239,68,68,.25)", color: "#7f1d1d", fontWeight: 900 }}
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
