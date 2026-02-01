import BottomNav from "../components/BottomNav.jsx";
import ActivityPicker from "../screens/ActivityPicker.jsx";
import CheckIn from "../screens/CheckIn.jsx";
import Today from "../screens/Today.jsx";
import Weekly from "../screens/Weekly.jsx";
import { useAttuneStore } from "../store/useAttuneStore";

function TopNav({ screen, go }) {
  return (
    <div className="top">
      <div className="brand">
        <div className="brandMark" aria-hidden="true"></div>
        <div>
          <h1>
            Attune{" "}
            <span className="versionTag">v0</span>
          </h1>
          <div className="tag">
            Meet yourself where you are — then take one small step toward better.
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

  return (
    <div className="wrap">
      <TopNav screen={screen} go={actions.go} />

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

      {state.toast && (
        <div
          className={"toast show"}
          role="status"
          aria-live="polite"
          onClick={actions.clearToast}
          style={{
            background: state.toast.good
              ? "rgba(110,231,183,.18)"
              : "rgba(245,158,11,.14)",
            borderColor: state.toast.good
              ? "rgba(110,231,183,.35)"
              : "rgba(245,158,11,.30)",
            color: state.toast.good ? "#14532d" : "#7c4a00",
          }}
        >
          {state.toast.text}
        </div>
      )}

      <BottomNav screen={screen} setScreen={actions.go} />
    </div>
  );
}
