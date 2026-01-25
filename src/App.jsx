import React, { useEffect } from "react";
import "./index.css";

import { useAttuneStore } from "./lib/useAttuneStore";
import { prettyLevel } from "./lib/attuneEngine";

function TopNav({ go, resetToday }) {
  return (
    <div className="nav">
      <button className="btn small" onClick={() => go("checkin")}>Check-in</button>
      <button className="btn small" onClick={() => go("wheel")}>Wheel</button>
      <button className="btn small" onClick={() => go("today")}>My Day</button>
      <button className="btn small" onClick={() => go("week")}>Weekly</button>
      <button className="btn small ghost" onClick={resetToday}>Reset Day</button>
    </div>
  );
}

function CompanionPanel({ state, actions }) {
  const done = state.myDay?.filter(t => t.done).length || 0;

  return (
    <>
      <div className="card">
        <h2>💬 Today’s message</h2>
        <div className="sub">Close-friend tone. Calm, grounded, never pushy.</div>

        <p id="dailyMessage" style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>
          {state.dailyMessage?.a || "—"}
        </p>
        <p id="dailySub" style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>
          {state.dailyMessage?.b || ""}
        </p>

        <div className="hint" style={{ marginTop: 12 }}>
          <b>Attune never:</b> shames, pressures, sounds clinical, overwhelms, or talks down.
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn small" onClick={actions.newMessage}>New message</button>
          <button className="btn small" onClick={() => actions.go("wheel")}>Spin now</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>📌 Quick status</h2>
        <div className="sub">Just enough context.</div>

        <div style={{ display: "grid", gap: 8, fontSize: 13, color: "var(--muted)" }}>
          <div><b style={{ color: "var(--ink)" }}>Level:</b> {prettyLevel(state.level)}</div>
          <div><b style={{ color: "var(--ink)" }}>Options ready:</b> {state.options?.length || 0}</div>
          <div><b style={{ color: "var(--ink)" }}>Tasks in My Day:</b> {state.myDay?.length || 0}</div>
          <div><b style={{ color: "var(--ink)" }}>Checked off today:</b> {done}</div>
        </div>

        <div className="footerNote" style={{ marginTop: 10 }}>
          Attune counts “showing up” as success too.
        </div>
      </div>
    </>
  );
}

function Toast({ toast, onClear }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClear, 3200);
    return () => clearTimeout(t);
  }, [toast, onClear]);

  if (!toast) return null;

  const style = {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 14,
    fontSize: 13,
    background: toast.good ? "rgba(110,231,183,.18)" : "rgba(79,109,245,.10)",
    border: `1px solid ${toast.good ? "rgba(110,231,183,.35)" : "rgba(79,109,245,.22)"}`,
    color: toast.good ? "#14532d" : "#1f2a55",
  };

  return <div style={style}>{toast.text}</div>;
}

function LevelPills({ level, setLevel }) {
  const levels = [
    { key: "rest", emoji: "🫧", name: "Rest", hint: "Today is about being, not doing. Comfort counts." },
    { key: "gentle", emoji: "🌿", name: "Gentle", hint: "Small, supportive actions. Nothing intense." },
    { key: "steady", emoji: "🌤️", name: "Steady", hint: "Light momentum. A calm rhythm, no strain." },
    { key: "capable", emoji: "🌊", name: "Capable", hint: "You can do a bit more today, safely." },
    { key: "brave", emoji: "🔥", name: "Brave", hint: "A small challenge — never punishing, never unsafe." },
  ];

  const hint = levels.find(l => l.key === level)?.hint || "";

  return (
    <>
      <div className="pillrow">
        {levels.map(l => (
          <div
            key={l.key}
            className={"pill" + (l.key === level ? " active" : "")}
            onClick={() => setLevel(l.key)}
            role="button"
            tabIndex={0}
          >
            {l.emoji} {l.name}
          </div>
        ))}
      </div>
      <div className="hint">{hint}</div>
    </>
  );
}

function CheckInScreen({ state, actions }) {
  return (
    <div className="card">
      <h2>🌤 How are you today? <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>(skip anything)</span></h2>
      <div className="sub">Attune is here as a gentle companion — no pressure, no scoring.</div>

      <div className="row">
        <div>
          <label>Mood</label>
          <select value={state.checkin.mood} onChange={(e) => actions.setCheckin({ mood: e.target.value })}>
            <option value="low">Low</option>
            <option value="okay">Okay</option>
            <option value="good">Good</option>
          </select>
        </div>

        <div>
          <label>Energy</label>
          <select value={state.checkin.energy} onChange={(e) => actions.setCheckin({ energy: e.target.value })}>
            <option value="verylow">Very low</option>
            <option value="low">Low</option>
            <option value="okay">Okay</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Body today</label>
        <select value={state.checkin.body} onChange={(e) => actions.setCheckin({ body: e.target.value })}>
          <option value="tender">Tender</option>
          <option value="achey">Achey</option>
          <option value="manageable">Manageable</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>🧭 Choose your pace</h2>
        <div className="sub" style={{ marginBottom: 10 }}>
          Attune can suggest a level, and you can always change it.
        </div>

        <LevelPills level={state.level} setLevel={actions.setLevel} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn primary" onClick={actions.generateOptions}>Create my gentle options</button>
        <button className="btn" onClick={actions.suggestLevel}>Suggest a level for me</button>
      </div>

      <div className="footerNote">
        Note: This prototype uses local task lists. Later we’ll swap task generation to ChatGPT via a secure backend.
      </div>
    </div>
  );
}

function WheelScreen({ state, actions }) {
  const wheelRot = state.wheelRot || 0;

  return (
    <div className="card">
      <h2>🎡 Spin for a gentle option</h2>
      <div className="sub">A little playfulness, without pressure. Spin as many times as you like.</div>

      <div className="wheelWrap">
        <div className="wheelStage">
          <div style={{ position: "relative", width: 280 }}>
            <div className="pointer" aria-hidden="true"></div>

            {/* wheel */}
            <div
              className="wheel"
              style={{ "--rot": `${wheelRot}deg` }}
            >
              <div className="hub"><span>ATTUNE</span></div>
            </div>
          </div>
        </div>

        <div>
          <div className="result">
            <p className="resultTitle">Your spin landed on</p>
            <p className="resultTask">
              {state.currentSpin?.text || (state.options?.length ? "Spin when you’re ready." : "Create options first (or just spin).")}
            </p>
            <p className="resultMeta">
              {state.currentSpin?.level ? `Level: ${prettyLevel(state.currentSpin.level)}` : ""}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              className="btn primary"
              onClick={() => {
                // keep a fun rotation in state without DOM access
                actions.spinPick();
              }}
            >
              Spin
            </button>
            <button className="btn" onClick={actions.addCurrent}>Add to My Day</button>
            <button className="btn ghost" onClick={() => actions.go("today")}>Go to My Day →</button>
          </div>

          <div className="hint" style={{ marginTop: 12 }}>
            Tip: You’re allowed to choose <b>Rest</b>. You’re also allowed to try <b>Brave</b>. Either way, you’re doing this kindly.
          </div>
        </div>
      </div>

      {/* toast under wheel */}
      <Toast toast={state.toast} onClear={actions.clearToast} />
    </div>
  );
}

function TodayScreen({ state, actions }) {
  const done = state.myDay?.filter(t => t.done).length || 0;

  return (
    <div className="card">
      <h2>🧭 My Day</h2>
      <div className="sub">Pick 2–5 tasks if you can. If not, it’s still okay.</div>

      <ul className="list">
        {(!state.myDay || state.myDay.length === 0) ? (
          <div className="hint">
            No tasks picked yet. That’s okay. You can spin the wheel, or simply rest today.
          </div>
        ) : (
          state.myDay.map(task => (
            <li key={task.id} className={"item" + (task.done ? " done" : "")}>
              <div className="left">
                <input
                  type="checkbox"
                  checked={!!task.done}
                  onChange={(e) => actions.toggleDone(task.id, e.target.checked)}
                />
                <div>
                  <div className="txt">{task.text}</div>
                  <div className="small">Tap to mark done (or leave it — no penalty).</div>
                </div>
              </div>

              <button className="btn small ghost" onClick={() => actions.removeTask(task.id)}>Remove</button>
            </li>
          ))
        )}
      </ul>

      <Toast toast={state.toast} onClear={actions.clearToast} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn primary" onClick={() => actions.go("wheel")}>Add more via the wheel</button>
        <button className="btn" onClick={actions.endDay}>End day gently</button>
      </div>

      <div className="footerNote" style={{ marginTop: 10 }}>
        {state.myDay?.length
          ? `Today: ${done}/${state.myDay.length} checked off. No pressure — your pace is allowed.`
          : "Today: no tasks selected. Rest counts too."
        }
      </div>
    </div>
  );
}

function WeeklyScreen() {
  // we’ll wire this next (needs week calculation + render)
  return (
    <div className="card">
      <h2>This Week in Attune</h2>
      <div className="sub">A quiet look back. No judgment. No scoring.</div>

      <div className="hint">
        Weekly reflection screen is next. (We’ll plug in your archetype logic + history here.)
      </div>
    </div>
  );
}

export default function App(){
  const { state, actions } = useAttuneStore();

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <div className="logo" aria-hidden="true"></div>
          <div>
            <h1>Attune <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>v0</span></h1>
            <div className="tag">Meet yourself where you are — then take one small step toward better.</div>
          </div>
        </div>

        <TopNav go={actions.go} resetToday={actions.resetToday} />
      </div>

      <div className="grid">
        {/* LEFT */}
        <div>
          {state.screen === "checkin" && <CheckInScreen state={state} actions={actions} />}
          {state.screen === "wheel" && <WheelScreen state={state} actions={actions} />}
          {state.screen === "today" && <TodayScreen state={state} actions={actions} />}
          {state.screen === "week" && <WeeklyScreen />}
        </div>

        {/* RIGHT */}
        <div>
          <CompanionPanel state={state} actions={actions} />
        </div>
      </div>
    </div>
  );
}
