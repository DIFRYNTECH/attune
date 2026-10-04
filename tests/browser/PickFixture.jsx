import { useState } from "react";
import ActivityBoard from "../../src/components/ActivityBoard.jsx";
import Today from "../../src/screens/Today.jsx";
import { useAttuneStore } from "../../src/store/useAttuneStore.js";
import "../../src/index.css";
import "../../src/attune.css";
import "../../src/app-theme.css";

// A separate localhost origin exercises the real store without a signed-in account.
export default function PickFixture() {
  const { state, actions } = useAttuneStore();
  const [view, setView] = useState("pick");
  return <div className="wrap">
    <header style={{ padding: "16px 8px" }}><h1 style={{ fontSize: 24, margin: 0 }}>Attune</h1><small>Local verification</small></header>
    <div className="grid"><main>
      <div style={{ display: "flex", gap: 8, padding: 8, flexWrap: "wrap" }}>
        <label>Check-in <select aria-label="Test check-in" value={state.checkin.energy === "verylow" ? "rest" : "steady"} onChange={event => {
          const rest = event.target.value === "rest";
          actions.setCheckin({ energy: rest ? "verylow" : "okay", body: rest ? "tender" : "manageable", mood: rest ? "low" : "okay", moodWords: rest ? ["Worn out"] : ["Okay"] });
        }}><option value="steady">Steady</option><option value="rest">Rest</option></select></label>
      </div>
      {view === "pick" ? <section className="pickScreen"><h2 className="activityPickerTitle">Pick an activity</h2><ActivityBoard state={state} actions={actions} /></section> : <Today state={state} actions={actions} />}
      <output aria-label="Observed activities">{(state.events?.[state.today] || []).filter(event => event.type === "activityViewed").length} observed</output>
    </main></div>
    <nav style={{ display: "flex", gap: 12, padding: 16 }} aria-label="Test navigation">
      <button type="button" className="btn" onClick={() => setView("pick")}>Pick</button><button type="button" className="btn" onClick={() => setView("day")}>My Day</button>
    </nav>
  </div>;
}
