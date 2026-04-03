import { useState } from "react";
import InfoTip from "../components/InfoTip";
import { isNativePlatform } from "../lib/platform";

function formatBillingStatus(status) {
  switch (status) {
    case "active":
      return "Active";
    case "grace":
      return "In grace period";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "expired":
      return "Expired";
    default:
      return "Free";
  }
}

function formatBillingDate(value) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

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

function ProfileIdentitySection({ profileName, profileEmail, actions }) {
  const [draftName, setDraftName] = useState(profileName);
  const [draftEmail, setDraftEmail] = useState(profileEmail);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");

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
              if(e.key === "Enter") e.currentTarget.blur();
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
              if(e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={commitEmail}
            maxLength={120}
            aria-label="Email"
          />
          {emailError ? <div id="profileEmailError" className="fieldError">{emailError}</div> : null}
        </div>
      </div>
    </SettingsSection>
  );
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
  const canUseMemory = !!state?.entitlements?.noteMemory;
  const isPlus = !!state?.entitlements?.isPlus;
  const noteCount = Array.isArray(state?.noteMemory?.notes) ? state.noteMemory.notes.length : 0;
  const billing = state?.billing || {};
  const billingStatus = formatBillingStatus(billing?.status);
  const billingRenewsOn = formatBillingDate(billing?.currentPeriodEnd);
  const billingSyncing = billing?.syncing === true;
  const signedIn = state?.auth?.signedIn === true;
  const isNative = isNativePlatform();
  const billingConfigured = isNative ? billing?.configuredGooglePlay === true : billing?.configuredPaddle === true;
  const canUpgrade = signedIn && billingConfigured;
  const canOpenPortal = !isNative && signedIn && billing?.customerPortalAvailable === true;

  const doExport = () => {
    if(!isPlus){
      actions?.openPaywall?.("plus", "profile");
      return;
    }
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    const { toast: _toast, ...exportPayload } = state || {};
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
    const exportNoteMemoryPayload = {
      kind: "attune-note-memory",
      exportedAt: new Date().toISOString(),
      noteMemory: state?.noteMemory || { notes: [] },
    };
    downloadJson(`attune-note-memory-${stamp}.json`, exportNoteMemoryPayload);
    actions?.setToast?.("Exported your note history.", true);
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
                Day-to-day planning stays local to this device. Plus includes dark mode, exports, note memory, smarter picking, and deeper Weekly
                insights. If you sign in, Attune can also sync weekly summaries, note history, and billing state tied to your account.
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {isNative
                  ? "Google Play purchases are verified on the server and attached to your signed-in Attune account."
                  : "Web subscriptions run through Paddle and are attached to your signed-in Attune account."}
              </div>
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
              <b>Note memory</b> from your check-in note (on-device first, with account sync when signed in).
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
              Billing: <span>{billingStatus}</span>
            </div>
            <div>
              {billingRenewsOn
                ? `${isPlus ? "Renews" : "Access ends"} ${billingRenewsOn}.`
                : billingConfigured
                  ? isNative
                    ? "Google Play billing is configured for this account."
                    : "Web billing is configured for this account."
                  : isNative
                    ? "Google Play billing still needs server configuration."
                    : "Web billing still needs server configuration."}
            </div>
          </div>

          <div className="settingsActions" style={{ marginTop: 10 }}>
            {!isPlus ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => actions?.startBillingUpgrade?.()}
                aria-label="Upgrade to Attune Plus"
                disabled={billingSyncing}
                title={!signedIn ? "Sign in before upgrading" : !billingConfigured ? isNative ? "Google Play billing is not configured yet" : "Web billing is not configured yet" : ""}
              >
                {billingSyncing ? "Working..." : canUpgrade ? isNative ? "Upgrade on Google Play" : "Upgrade on the web" : !signedIn ? "Sign in to upgrade" : "Billing not ready"}
              </button>
            ) : null}
            {isNative ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => actions?.restoreBillingPurchases?.()}
                disabled={billingSyncing}
                aria-label="Restore Attune Plus purchase"
              >
                Restore purchase
              </button>
            ) : canOpenPortal ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => actions?.openBillingPortal?.()}
                disabled={billingSyncing}
                aria-label="Manage web billing"
              >
                Manage billing
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => actions?.refreshBilling?.()}
              disabled={billingSyncing}
              aria-label="Refresh billing status"
            >
              Refresh billing
            </button>
          </div>
        </SettingsSection>

        <ProfileIdentitySection
          key={`${profileName}\u0000${profileEmail}`}
          profileName={profileName}
          profileEmail={profileEmail}
          actions={actions}
        />

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
              Reset local Attune data
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Note memory"
          helper={
            canUseMemory
              ? "Attune Plus remembers your check-in notes over time. They stay on this device first and can sync to your account when you're signed in."
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
          </div>
        </SettingsSection>

        <SettingsSection
          title="Account"
          helper="Email OTP sign-in can sync weekly summaries, note history, and verified billing state tied to your account."
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
          className="modalOverlay modalOverlayCentered"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Clear device confirmation">
            <div className="modalTitle">Reset local Attune data?</div>
            <div className="modalBody">
              This resets the Attune data stored on this device, including history, preferences, and local note memory. If you sign in again,
              synced weekly summaries and note history can come back from your account. This does not delete your account.
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
                Reset local data
              </button>
            </div>
          </div>
        </div>
      )}

      {clearMemoryOpen && (
        <div
          className="modalOverlay modalOverlayCentered"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setClearMemoryOpen(false);
          }}
        >
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="Clear note memory confirmation">
            <div className="modalTitle">Clear note history?</div>
            <div className="modalBody">
              This removes your saved check-in notes from this device. If you are signed in, Attune will also try to clear the synced note history
              in your account. You can’t undo this.
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
          className="modalOverlay modalOverlayCentered"
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
