import React from "react";
import { isNativePlatform } from "../lib/platform";

function featureTitle(feature) {
  switch (feature) {
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
    case "momentumExact":
      return "See your exact Momentum score for the week (not a range).";
    case "multiWeekHistory":
      return "See 4-12 weeks of history at a glance, with gentle comparisons.";
    case "patternCallouts":
      return "Get a few gentle pattern callouts when there’s enough data.";
    case "noteMemory":
      return "Keep your optional check-in notes as context for future suggestions.";
    default:
      return "A few calm upgrades for a more personal Attune rhythm.";
  }
}

const plusFeatures = [
  ["AI boards", "Personalized small-step boards shaped by your check-in."],
  ["Note memory", "Your optional notes can become useful context over time."],
  ["Weekly insights", "Exact Momentum, past weeks, and gentle pattern callouts."],
  ["Data exports", "Download a readable copy or backup when you need it."],
];

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
      <div className="modalCard paywallCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="paywallKicker">Attune Plus</div>
        <div className="paywallTitle">A fuller rhythm, when you want it.</div>

        <div className="modalBody paywallBody">
          {feature !== "plus" ? (
            <div className="paywallFeatureCallout">
              <span>{featureTitle(feature)}</span>
              <p>{featureBlurb(feature)}</p>
            </div>
          ) : null}

          <div className="paywallFeatureList">
            {plusFeatures.map(([title, body]) => (
              <div className="paywallFeatureItem" key={title}>
                <b>{title}</b>
                <span>{body}</span>
              </div>
            ))}
          </div>

          <div className="paywallFinePrint">
            <span>Pricing is shown in checkout before you confirm.</span>
            {signedIn
              ? billingConfigured
                ? isNativePlatform()
                  ? "Purchases are verified against your account after Google Play checkout."
                  : "Web checkout uses Paddle and attaches the subscription to your signed-in Attune account."
                : "Refresh billing to check purchase availability for this account."
              : "Sign in first so your purchase can be linked to your Attune account."}
          </div>
        </div>

        <div className="modalActions paywallActions">
          <button type="button" className="btn paywallPrimary" onClick={onPrimaryAction} disabled={billingSyncing}>
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
