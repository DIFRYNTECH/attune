import React from "react";
import { isNativePlatform } from "../lib/platform";

function featureTitle(feature) {
  switch (feature) {
    case "darkMode":
      return "Dark mode";
    case "momentumExact":
      return "Exact Momentum score";
    case "multiWeekHistory":
      return "Past weeks & comparisons";
    case "patternCallouts":
      return "Pattern callouts";
    case "noteMemory":
      return "Note memory";
    default:
      return "Attune Plus";
  }
}

function featureBlurb(feature) {
  switch (feature) {
    case "darkMode":
      return "A calmer, darker look, available with Attune Plus.";
    case "momentumExact":
      return "See your exact Momentum score for the week (not a range).";
    case "multiWeekHistory":
      return "See 4-12 weeks of history at a glance, with gentle comparisons.";
    case "patternCallouts":
      return "Get a few gentle pattern callouts when there’s enough data.";
    case "noteMemory":
      return "Your optional check-in note is saved and summarized over time (on this device).";
    default:
      return "A few calm upgrades that stay local to this device.";
  }
}

function getUpgradeCta(state) {
  if (state?.billing?.syncing) return "Working...";
  if (!state?.auth?.signedIn) return "Sign in to upgrade";
  if (!isNativePlatform() && state?.billing?.configuredPaddle) return "Upgrade on the web";
  if (state?.billing?.configuredGooglePlay) return "Upgrade on Google Play";
  return "Refresh billing";
}

export default function PaywallSheet({ state, actions }) {
  const isPlus = !!state?.entitlements?.isPlus;
  const paywall = state?.paywall;
  const open = !!paywall && !isPlus;

  if (!open) return null;

  const feature = typeof paywall?.feature === "string" ? paywall.feature : "plus";
  const billingSyncing = state?.billing?.syncing === true;
  const billingConfigured = isNativePlatform()
    ? state?.billing?.configuredGooglePlay === true
    : state?.billing?.configuredPaddle === true;
  const signedIn = state?.auth?.signedIn === true;

  const onClose = () => actions?.closePaywall?.();
  const onUpgrade = () => actions?.startBillingUpgrade?.();
  const onRestore = () => actions?.restoreBillingPurchases?.();
  const onPrimaryAction = () => {
    if (billingSyncing) return;
    if (!signedIn || billingConfigured) {
      onUpgrade();
      return;
    }
    actions?.refreshBilling?.().catch(() => {});
  };

  return (
    <div
      className="modalOverlay modalOverlayCentered"
      role="dialog"
      aria-modal="true"
      aria-label="Attune Plus"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalCard"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(80vh, 680px)",
          overflow: "auto",
        }}
      >
        <div className="modalTitle">Attune Plus</div>

        <div className="modalBody" style={{ marginTop: 8 }}>
          {feature !== "plus" ? (
            <div style={{ fontWeight: 900, color: "var(--ink)", marginBottom: 6 }}>{featureTitle(feature)}</div>
          ) : null}
          <div>{featureBlurb(feature)}</div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Dark mode</b>: a calmer, darker look.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Exports</b>: download your local data.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Note memory</b>: your optional note becomes memory you can keep on-device and sync when signed in.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Smarter picking</b>: avoids repeats you skip and leans toward what you complete.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Weekly insights</b>: your exact score, past weeks, and gentle patterns.
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            Yearly price: <b style={{ color: "var(--ink)" }}>$-/year</b> (placeholder)
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
            {signedIn
              ? billingConfigured
                ? isNativePlatform()
                  ? "Purchases are verified against your account after Google Play checkout."
                  : "Web checkout uses Paddle and attaches the subscription to your signed-in Attune account."
                : "Refresh billing to check purchase availability for this account."
              : "Sign in first so your purchase can be linked to your Attune account."}
          </div>
        </div>

        <div className="modalActions" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn" onClick={onPrimaryAction} style={{ fontWeight: 900 }} disabled={billingSyncing}>
            {getUpgradeCta(state)}
          </button>
          {isNativePlatform() ? (
            <button type="button" className="btn ghost" onClick={onRestore} disabled={billingSyncing}>
              Restore purchase
            </button>
          ) : null}
          <button type="button" className="btn ghost" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
