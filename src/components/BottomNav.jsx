import { navigationItems } from "./navigation.js";

export default function BottomNav({ screen, setScreen }) {
  return (
    <nav className="bottomNav" aria-label="Primary">
      {navigationItems.map(({ key, label, Icon: icon }) => {
        const Icon = icon;
        return (
        <button
          key={key}
          type="button"
          className={"bottomNavBtn" + (screen === key ? " active" : "")}
          data-screen={key}
          onClick={() => setScreen(key)}
          aria-current={screen === key ? "page" : undefined}
        >
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="bottomNavLabel">{label}</span>
        </button>
        );
      })}
    </nav>
  );
}
