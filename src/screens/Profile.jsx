import { useState } from "react";
import { createPortal } from "react-dom";
import InfoTip from "../components/InfoTip";
import { buildBackupExport, buildUserDataExport } from "../lib/exportData";
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
  const [nameError, setNameError] = useState("");

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

  return (
    <SettingsSection title="About you" helper="Name is saved locally on this device. Email mirrors your signed-in account." helperLabel="About you info">
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
          </div>
          <input
            id="profileEmail"
            className="inputCompact"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={profileEmail}
            placeholder="you@example.com"
            readOnly
            aria-readonly="true"
            title="This email comes from your signed-in account."
            maxLength={120}
            aria-label="Email"
          />
        </div>
      </div>
    </SettingsSection>
  );
}

function ConfirmDialog({ open, label, title, body, confirmText, onCancel, onConfirm }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modalOverlay modalOverlayCentered confirmModalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="modalCard confirmModalCard" role="dialog" aria-modal="true" aria-label={label}>
        <div className="modalTitle">{title}</div>
        <div className="modalBody">{body}</div>
        <div className="modalActions">
          <button type="button" className="btn small ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn small"
            onClick={onConfirm}
            style={{ borderColor: "rgba(239,68,68,.25)", color: "#7f1d1d", fontWeight: 900 }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Profile({ state, actions }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

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
  const showBillingStatusPill = !isPlus || billingStatus !== "Active";
  const showUpgradeButton = !isPlus && canUpgrade;
  const billingSummary = billingRenewsOn
    ? `${isPlus ? "Renews" : "Access ends"} ${billingRenewsOn}.`
    : signedIn
      ? isNative
        ? "Purchases are linked to your signed-in Attune account."
        : "Subscriptions are linked to your signed-in Attune account."
      : "Sign in to link billing to your Attune account.";

  const doExportUserData = () => {
    if(!isPlus){
      actions?.openPaywall?.("plus", "profile");
      return;
    }
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    downloadJson(`attune-data-${stamp}.json`, buildUserDataExport(state));
    actions?.setToast?.("Exported a readable copy of your data.", true);
  };

  const doExportBackup = () => {
    if(!isPlus){
      actions?.openPaywall?.("plus", "profile");
      return;
    }
    const d = new Date();
    const stamp = d.toISOString().slice(0, 10);
    downloadJson(`attune-backup-${stamp}.json`, buildBackupExport(state));
    actions?.setToast?.("Exported a full backup.", true);
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
      exportType: "attune-note-memory",
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
        <div className="settingsSubtitle">Settings for this device, plus your account and billing.</div>
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
                Plus makes Attune more personal over time without turning it into another heavy planning app.
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
                It adds adaptive boards, note memory, exports, dark mode, and deeper Weekly insights.
              </div>
            </div>
          }
          helperLabel="About Plus"
        >
          <div className="settingsPlusPanel">
            <button
              type="button"
              className="settingsFeatureSummaryBtn"
              aria-expanded={plusOpen ? "true" : "false"}
              aria-controls="attunePlusDetails"
              onClick={() => setPlusOpen((open) => !open)}
            >
              <span className="settingsFeatureSummaryCopy">
                <span className="settingsFeatureSummaryTitle">
                  {isPlus ? "Plus is active on this account." : "Unlock the fuller Attune experience."}
                </span>
                <span className="settingsFeatureSummaryText">
                  {isPlus
                    ? "Adaptive boards, note memory, exports, dark mode, and Weekly insight."
                    : "Smarter boards, note memory, exports, dark mode, and deeper Weekly insight."}
                </span>
              </span>
              <span className="settingsFeatureSummaryMeta">
                <span>{billingSummary}</span>
                <span className={"checkinNoteChevron" + (plusOpen ? " open" : "")} aria-hidden="true" />
              </span>
            </button>

            {plusOpen ? (
              <div id="attunePlusDetails" className="settingsFeatureDetails">
                <div className="settingsFeatureBody">
                  <ul className="settingsBullets" aria-label="Attune Plus features">
                    <li>
                      <b>Adaptive boards</b> tuned by your check-ins, picks, completions, and skips.
                    </li>
                    <li>
                      <b>Note memory</b> to use your check-in notes for more personal suggestions.
                    </li>
                    <li>
                      <b>Weekly insights</b> that turn check-ins into patterns you can understand.
                    </li>
                    <li>
                      <b>Data exports</b> when you want a readable copy or backup.
                    </li>
                    <li>
                      <b>Dark mode</b> for a calmer, evening-friendly interface.
                    </li>
                  </ul>
                </div>

                <div className="settingsFeatureRail">
                  <div className="settingsFeatureStatusCard">
                    <div className="settingsFeatureStatusTop">
                      <div className="settingsFeatureStatusLabel">Billing</div>
                      {showBillingStatusPill ? <div className="settingsFeatureStatusPill">{billingStatus}</div> : null}
                    </div>
                    <div className="settingsFeatureStatusNote">
                      {signedIn
                        ? isNative
                          ? "Your purchase is linked to this signed-in Attune account."
                          : "Your subscription is linked to this signed-in Attune account."
                        : "Sign in to link billing to your Attune account."}
                    </div>
                  </div>

                  <div className="settingsActions settingsFeatureActions">
                    {showUpgradeButton ? (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => actions?.startBillingUpgrade?.()}
                        aria-label="Upgrade to Attune Plus"
                        disabled={billingSyncing}
                        title=""
                      >
                        {billingSyncing ? "Working..." : isNative ? "Upgrade on Google Play" : "Upgrade on the web"}
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
                </div>
              </div>
            ) : null}
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
          helper="Attune Plus includes a readable data export and a full backup export. You can also clear everything stored on this device at any time."
          helperLabel="Data info"
        >
          <div className="settingsSplitRow settingsSplitRowTerse">
            <div className="settingsSplitCopy">
              <div className="settingsInlineSummary">Download a readable copy of your data, or a raw backup for restore and support.</div>
            </div>
            <div className="settingsActions settingsSplitActions">
              <button
                type="button"
                className="btn ghost"
                aria-disabled={!isPlus ? "true" : "false"}
                title={!isPlus ? "Included with Attune Plus" : ""}
                style={!isPlus ? { opacity: 0.75 } : undefined}
                onClick={() => {
                  if(!isPlus) actions?.openPaywall?.("plus", "profile");
                  else doExportUserData();
                }}
              >
                Export my data
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-disabled={!isPlus ? "true" : "false"}
                title={!isPlus ? "Included with Attune Plus" : "Best for restore or support"}
                style={!isPlus ? { opacity: 0.75 } : undefined}
                onClick={() => {
                  if(!isPlus) actions?.openPaywall?.("plus", "profile");
                  else doExportBackup();
                }}
              >
                Export backup
              </button>
              <button
                type="button"
                className="btn ghost dangerGhost"
                onClick={() => setConfirmOpen(true)}
              >
                Reset local Attune data
              </button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Note memory"
          helper={
            canUseMemory
              ? "Attune Plus can remember your check-in notes over time. Notes stay on this device first and can also sync to your account when you're signed in."
              : "Note memory is available with Attune Plus."
          }
          helperLabel="Note memory info"
        >
          <div className="settingsSplitRow settingsSplitRowTerse">
            <div className="settingsSplitCopy">
              <div className="settingsInlineSummary">
                {canUseMemory
                  ? noteCount > 0
                    ? `${noteCount} note${noteCount === 1 ? "" : "s"} saved across recent check-ins.`
                    : "No saved note history yet."
                  : "Note history becomes available with Attune Plus."}
              </div>
            </div>
            <div className="settingsActions settingsSplitActions">
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
          </div>
        </SettingsSection>

        <SettingsSection
          title="Account"
          helper="Signing in lets Attune sync weekly summaries, note history, and billing status with your account."
          helperLabel="Account info"
        >
          <div className="settingsSplitRow">
            <div className="settingsSplitCopy">
              <div className="settingsInlineSummary">
                Signed in{signedInUser ? (
                  <>
                    {" as "}
                    <b>{signedInUser}</b>
                  </>
                ) : null}
                {" on this device."}
              </div>
            </div>

            <div className="settingsActions settingsSplitActions">
              <button
                type="button"
                className="btn ghost dangerGhost"
                onClick={() => setSignOutOpen(true)}
              >
                Sign out
              </button>
            </div>
          </div>
        </SettingsSection>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        label="Clear device confirmation"
        title="Reset local Attune data?"
        body="This resets the Attune data stored on this device, including history, preferences, and local note memory. If you sign in again, synced weekly summaries and note history can come back from your account. This does not delete your account."
        confirmText="Reset local data"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          actions?.clearDeviceData?.();
        }}
      />

      <ConfirmDialog
        open={clearMemoryOpen}
        label="Clear note memory confirmation"
        title="Clear note history?"
        body="This removes your saved check-in notes from this device. If you are signed in, Attune will also try to clear the synced note history in your account. You can’t undo this."
        confirmText="Clear notes"
        onCancel={() => setClearMemoryOpen(false)}
        onConfirm={() => {
          setClearMemoryOpen(false);
          actions?.clearNoteMemory?.();
        }}
      />

      <ConfirmDialog
        open={signOutOpen}
        label="Sign out confirmation"
        title="Sign out of Attune?"
        body="This signs you out on this device. Your local data will remain here unless you clear it."
        confirmText="Sign out"
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          actions?.logout?.();
        }}
      />
    </div>
  );
}
