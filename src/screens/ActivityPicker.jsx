import { useEffect } from "react";

import ActivityBoard from "../components/ActivityBoard.jsx";

export default function ActivityPicker({ state, actions }) {
  const isPlus = !!state?.entitlements?.isPlus;
  const aiBoardRequestKey = JSON.stringify({
    today: state?.today || "",
    level: state?.level || "",
    useNoteForAi: state?.profile?.useNoteForAi !== false,
    mood: state?.checkin?.mood || "",
    moodWords: Array.isArray(state?.checkin?.moodWords) ? state.checkin.moodWords.slice(0, 2) : [],
    energy: state?.checkin?.energy || "",
    body: state?.checkin?.body || "",
    note: state?.profile?.useNoteForAi !== false ? (state?.checkin?.note || "").slice(0, 200) : "",
  });

  useEffect(() => {
    if(!isPlus) return;
    actions.ensureAiBoard?.(state.checkin, state.level, state.today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlus, aiBoardRequestKey]);

  const aiStatus = state.ai?.status;
  const hasAiBoard = state.optionsSource === "ai";
  const boardLoading = isPlus && !hasAiBoard && aiStatus !== "error";
  const statusLine =
    !isPlus
      ? ""
      : boardLoading
      ? "Building your AI board from your check-in…"
      : aiStatus === "error"
        ? (state.ai?.error || "Using built-in suggestions for now.")
        : hasAiBoard
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
        <ActivityBoard state={state} actions={actions} loading={boardLoading} />
      </div>
    </>
  );
}
