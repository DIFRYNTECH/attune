export default function BottomNav({ screen, setScreen }) {
  const items = [
    ["checkin", "Check-in"],
    ["wheel", "Pick"],
    ["today", "My Day"],
    ["week", "Weekly"],
    ["profile", "Profile"],
  ];

  return (
    <nav className="bottomNav" aria-label="Primary">
      {items.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={"bottomNavBtn" + (screen === key ? " active" : "")}
          data-screen={key}
          onClick={() => setScreen(key)}
          aria-current={screen === key ? "page" : undefined}
        >
          <span className="bottomNavLabel">{label}</span>
        </button>
      ))}
    </nav>
  );
}
