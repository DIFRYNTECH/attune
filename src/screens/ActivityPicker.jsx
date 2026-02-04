import { useEffect } from "react";

import ActivityBoard from "../components/ActivityBoard.jsx";

export default function ActivityPicker({ state, actions }) {
  useEffect(() => {
    actions.ensureAiBoard?.(state.checkin, state.level, state.today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aiStatus = state.ai?.status;
  const statusLine =
    aiStatus === "loading"
      ? "Personalizing 15 options…"
      : aiStatus === "error"
        ? "Using built-in suggestions for now."
        : aiStatus === "ready"
          ? "Personalized from your check-in."
          : "";

  return (
    <>
      <div className="card">
        <h2>Pick an activity</h2>
        <div className="sub">
          A small, doable option, based on how you feel today.
          {statusLine ? ` ${statusLine}` : ""}
        </div>
        <ActivityBoard state={state} actions={actions} />
      </div>
    </>
  );
}
