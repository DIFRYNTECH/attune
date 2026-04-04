import { Suspense, lazy, useEffect } from "react";

import { useAppInit } from "../hooks/useAppInit";
import BottomNav from "../components/BottomNav.jsx";
import CheckIn from "../screens/CheckIn.jsx";
import Login from "../screens/Login.jsx";
import { useAttuneStore } from "../store/useAttuneStore";

const ActivityPicker = lazy(() => import("../screens/ActivityPicker.jsx"));
const Signup = lazy(() => import("../screens/Signup.jsx"));
const Profile = lazy(() => import("../screens/Profile.jsx"));
const Today = lazy(() => import("../screens/Today.jsx"));
const Weekly = lazy(() => import("../screens/Weekly.jsx"));
const PaywallSheet = lazy(() => import("../components/PaywallSheet.jsx"));

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

function TopNav({ screen, go, entitlements, hideNav = false }) {
  return (
    <div className="top">
      <div className="brand">
        <div className="brandMark" aria-hidden="true"></div>
        <div className="brandText">
          <div className="brandTitleRow">
            <h1>Attune</h1>
            <span className="versionTag">v0</span>
            {entitlements?.isPlus ? <span className="planTag">Plus</span> : null}
          </div>
          <div className="tag">
            Meet yourself where you are, then take one small step toward better.
          </div>
        </div>
      </div>

      {!hideNav ? (
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
            Pick
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
      ) : null}
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

function ScreenFallback({ label = "Loading..." }) {
  return (
    <div className="card" aria-busy="true" aria-live="polite">
      <h2>{label}</h2>
      <div className="sub">Loading this part of Attune.</div>
    </div>
  );
}

export default function App() {
  const { state, actions } = useAttuneStore();
  const signedIn = !!state?.auth?.signedIn;
  const screen = state.screen;
  const showToast = signedIn && !!(state.toast && state.toast.screen === screen);
  const wrapClassName = "wrap" + (showToast ? " toastOn" : "");

  // App-level init: theme, Capacitor deep links, status bar, splash.
  useAppInit({ theme: state?.profile?.theme });

  useEffect(() => {
    if (!showToast) return;

    const timeoutId = window.setTimeout(() => {
      actions.clearToast?.();
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [showToast, state.toast?.text, state.toast?.good, state.toast?.screen, actions]);

  if(!signedIn){
    const authView = state?.auth?.view === "signup" ? "signup" : "signin";
    return (
      <div className="authPage">
        {authView === "signup" ? (
          <Suspense fallback={<ScreenFallback label="Opening sign up" />}>
            <Signup state={state} actions={actions} />
          </Suspense>
        ) : (
          <Login state={state} actions={actions} />
        )}
      </div>
    );
  }

  return (
    <div className={wrapClassName}>
      <TopNav screen={screen} go={actions.go} entitlements={state.entitlements} />

      <div className="grid">
        <main>
          {!signedIn && (
            <Login state={state} actions={actions} />
          )}

          {screen === "checkin" && (
            <CheckIn state={state} actions={actions} />
          )}

          {screen === "wheel" && (
            <Suspense fallback={<ScreenFallback label="Loading activity picker" />}>
              <ActivityPicker state={state} actions={actions} />
            </Suspense>
          )}

          {screen === "today" && (
            <Suspense fallback={<ScreenFallback label="Loading today" />}>
              <Today state={state} actions={actions} />
            </Suspense>
          )}

          {screen === "week" && (
            <Suspense fallback={<ScreenFallback label="Loading weekly" />}>
              <Weekly state={state} actions={actions} />
            </Suspense>
          )}

          {screen === "profile" && (
            <Suspense fallback={<ScreenFallback label="Loading profile" />}>
              <Profile state={state} actions={actions} />
            </Suspense>
          )}
        </main>
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

      <Suspense fallback={null}>
        <PaywallSheet state={state} actions={actions} />
      </Suspense>
    </div>
  );
}
