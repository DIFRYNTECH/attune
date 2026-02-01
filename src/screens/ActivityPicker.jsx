import ActivityBoard from "../components/ActivityBoard.jsx";

export default function ActivityPicker({ state, actions }) {
  return (
    <>
      <div className="card">
        <h2>Pick an activity</h2>
        <div className="sub">A small, doable option, based on how you feel today.</div>
        <ActivityBoard state={state} actions={actions} />
      </div>
    </>
  );
}
