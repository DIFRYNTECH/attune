import { useEffect } from "react";

import BottomNav from "../components/BottomNav.jsx";
import ActivityPicker from "../screens/ActivityPicker.jsx";
import CheckIn from "../screens/CheckIn.jsx";
import Profile from "../screens/Profile.jsx";
import Today from "../screens/Today.jsx";
import Weekly from "../screens/Weekly.jsx";
import PaywallSheet from "../components/PaywallSheet.jsx";
import { useAttuneStore } from "../store/useAttuneStore";

function renderToastText(text) {
  if (typeof text !== "string" || !text) return text;

  const match = text.match(/\b\d+\/10\b/);
  if (!match || match.index == null) return text;

  const start = match.index;
  const token = match[0];
  const end = start + token.length;

  return (
    <>
      {text.slice(0, start)}
      <strong className="toastCount">{token}</strong>
      {text.slice(end)}
    </>
  );
}

function TopNav({ screen, go, entitlements }) {
  return (
    <div className="top">
      <div className="brand">
        <div className="brandMark" aria-hidden="true"></div>
        <div>
          <h1>
            Attune{" "}
            <span className="versionTag">v0</span>
            {entitlements?.isPlus ? <span className="planTag">Plus</span> : null}
          </h1>
          <div className="tag">
            Meet yourself where you are, then take one small step toward better.
          </div>
        </div>
      </div>

      <div className="nav">
        <button
          type="button"
          className={"btn small" + (screen === "checkin" ? " primary" : "")}
          onClick={() => go("checkin")}
          aria-current={screen === "checkin" ? "page" : undefined}
        >
          Check-in
        </button>
        <button
          type="button"
          className={"btn small" + (screen === "wheel" ? " primary" : "")}
          onClick={() => go("wheel")}
          aria-current={screen === "wheel" ? "page" : undefined}
        >
          Activity Picker
        </button>
        <button
          type="button"
          className={"btn small" + (screen === "today" ? " primary" : "")}
          onClick={() => go("today")}
          aria-current={screen === "today" ? "page" : undefined}
        >
          My Day
        </button>
        <button
          type="button"
          className={"btn small" + (screen === "week" ? " primary" : "")}
          onClick={() => go("week")}
          aria-current={screen === "week" ? "page" : undefined}
        >
          Weekly
        </button>
        <button
          type="button"
          className={"btn small" + (screen === "profile" ? " primary" : "")}
          onClick={() => go("profile")}
          aria-current={screen === "profile" ? "page" : undefined}
        >
          Profile
        </button>
      </div>
    </div>
  );
}

function ScreenShell({ title, subtitle }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="sub">{subtitle}</div>
      <div className="hint">
        This is a placeholder screen. Next step: we paste your real UI for this
        screen and wire it to state.
      </div>
    </div>
  );
}

export default function App() {
  const { state, actions } = useAttuneStore();
  const screen = state.screen;
  const showToast = !!(state.toast && state.toast.screen === screen);
  const wrapClassName = "wrap" + (showToast ? " toastOn" : "");

  useEffect(() => {
    const theme = state?.profile?.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  }, [state?.profile?.theme]);

  return (
    <div className={wrapClassName}>
      <TopNav screen={screen} go={actions.go} entitlements={state.entitlements} />

      <div className="grid">
        {/* LEFT */}
        <main>
          {screen === "checkin" && (
            <CheckIn state={state} actions={actions} />
          )}

          {screen === "wheel" && (
            <ActivityPicker state={state} actions={actions} />
          )}

          {screen === "today" && (
            <Today state={state} actions={actions} />
          )}

          {screen === "week" && (
            <Weekly state={state} actions={actions} />
          )}

          {screen === "profile" && (
            <Profile state={state} actions={actions} />
          )}
        </main>

        {/* RIGHT */}
        <aside className="side">
          <div className="card quickStatusCard" style={{ marginTop: 14 }}>
            <h2>📌 Quick status</h2>
            <div className="sub">Just enough context.</div>
            <div style={{ display: "grid", gap: 8, fontSize: 13, color: "var(--muted)" }}>
              <div>
                <b style={{ color: "var(--ink)" }}>Screen:</b> {screen}
              </div>
              <div>
                <b style={{ color: "var(--ink)" }}>Options ready:</b> {state.options.length}
              </div>
              <div>
                <b style={{ color: "var(--ink)" }}>Tasks in My Day:</b> {state.myDay.length}
              </div>
              <div>
                <b style={{ color: "var(--ink)" }}>Checked off today:</b>{" "}
                {state.myDay.filter((t) => t.done).length}
              </div>
            </div>

            <div className="footerNote" style={{ marginTop: 10 }}>
              Attune counts “showing up” as success too.
            </div>
          </div>
        </aside>
      </div>

      {showToast && (
        <div
          className={"toast show " + (state.toast.good ? "good" : "warn")}
          role="status"
          aria-live="polite"
          onClick={actions.clearToast}
        >
          {renderToastText(state.toast.text)}
        </div>
      )}

      <BottomNav screen={screen} setScreen={actions.go} />

      <PaywallSheet state={state} actions={actions} />
    </div>
  );
}
