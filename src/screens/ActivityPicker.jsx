import ActivityBoard from "../components/ActivityBoard.jsx";

export default function ActivityPicker() {
  return (
    <div className="card">
      <h2>Pick an activity</h2>
      <div className="sub">A small, doable option — based on today.</div>
      <ActivityBoard />
    </div>
  );
}
