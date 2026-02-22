import React from "react";

function featureTitle(feature) {
  switch (feature) {
    case "darkMode":
      return "Dark mode";
    case "momentumExact":
      return "Exact Momentum signal";
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
      return "See your exact weekly signal number (e.g. 82/100).";
    case "multiWeekHistory":
      return "See 4-12 weeks of history with comparisons and highlights.";
    case "patternCallouts":
      return "Get 1-3 soft pattern callouts when there’s enough data.";
    case "noteMemory":
      return "Your optional check-in note is saved and summarized over time (on this device).";
    default:
      return "A few calm upgrades that stay local to this device.";
  }
}

export default function PaywallSheet({ state, actions }) {
  const isPlus = !!state?.entitlements?.isPlus;
  const paywall = state?.paywall;
  const open = !!paywall && !isPlus;

  if (!open) return null;

  const feature = typeof paywall?.feature === "string" ? paywall.feature : "plus";

  const onClose = () => actions?.closePaywall?.();
  const onTryPlus = () => {
    actions?.setPlan?.("plus");
    actions?.closePaywall?.();
    actions?.setToast?.("Attune Plus enabled on this device.", true);
  };

  return (
    <div
      className="modalOverlay"
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
              <b style={{ color: "var(--ink)" }}>Note memory</b>: your optional note becomes local memory.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Smarter picking</b>: avoids repeats you skip and leans toward what you complete.
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
              <b style={{ color: "var(--ink)" }}>Premium Weekly</b>: exact signal, past weeks, comparisons, and pattern callouts.
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            Yearly price: <b style={{ color: "var(--ink)" }}>$-/year</b> (placeholder)
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
            Restore purchases: coming later.
          </div>
        </div>

        <div className="modalActions" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn" onClick={onTryPlus} style={{ fontWeight: 900 }}>
            Try Plus on this device
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
