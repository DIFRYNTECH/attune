import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { useAppInit } from "../hooks/useAppInit";
import BottomNav from "../components/BottomNav.jsx";
import CheckIn from "../screens/CheckIn.jsx";
import Landing from "../screens/Landing.jsx";
import Login from "../screens/Login.jsx";
import PrivacyPolicy from "../screens/PrivacyPolicy.jsx";
import { useAttuneStore } from "../store/useAttuneStore";

const ActivityPicker = lazy(() => import("../screens/ActivityPicker.jsx"));
const Signup = lazy(() => import("../screens/Signup.jsx"));
const Profile = lazy(() => import("../screens/Profile.jsx"));
const Today = lazy(() => import("../screens/Today.jsx"));
const Weekly = lazy(() => import("../screens/Weekly.jsx"));
const PaywallSheet = lazy(() => import("../components/PaywallSheet.jsx"));

function TopNav({ screen, go, entitlements, hideNav = false }) {
  return (
    <div className="top">
      <div className="brand">
        <div className="brandMark" aria-hidden="true"></div>
        <div className="brandText">
          <div className="brandTitleRow">
            <h1>Attune</h1>
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

function isLandingPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/landing";
}

function isPrivacyPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/privacy";
}

function AttuneApp() {
  const { state, actions } = useAttuneStore();
  const signedIn = !!state?.auth?.signedIn;
  const screen = state.screen;
  const activeToast = signedIn && state.toast && state.toast.screen === screen ? state.toast : null;
  const showToast = !!activeToast;
  const [renderedToast, setRenderedToast] = useState(null);
  const [toastPhase, setToastPhase] = useState("hidden");
  const contentRef = useRef(null);
  const wrapClassName = "wrap" + (renderedToast ? " toastOn" : "");

  // App-level init: theme, Capacitor deep links, status bar, splash.
  useAppInit({ theme: state?.profile?.theme });

  useEffect(() => {
    if (!showToast) return;

    const timeoutId = window.setTimeout(() => {
      actions.clearToast?.();
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [showToast, activeToast?.text, activeToast?.good, activeToast?.screen, actions]);

  useEffect(() => {
    if (!signedIn) return;

    contentRef.current?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  }, [screen, signedIn]);

  useEffect(() => {
    if (activeToast) {
      setRenderedToast(activeToast);
      setToastPhase("entering");

      const rafId = window.requestAnimationFrame(() => {
        setToastPhase("entered");
      });

      return () => window.cancelAnimationFrame(rafId);
    }

    if (!renderedToast) return undefined;

    setToastPhase("exiting");
    const timeoutId = window.setTimeout(() => {
      setRenderedToast(null);
      setToastPhase("hidden");
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [activeToast, renderedToast]);

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

      <div className="grid" ref={contentRef}>
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

      {renderedToast && (
        <div
          className={"toast show " + (renderedToast.good ? "good" : "warn") + " toast-" + toastPhase}
          role="status"
          aria-live="polite"
          onClick={actions.clearToast}
        >
          {renderedToast.text}
        </div>
      )}

      <BottomNav screen={screen} setScreen={actions.go} />

      <Suspense fallback={null}>
        <PaywallSheet state={state} actions={actions} />
      </Suspense>
    </div>
  );
}

export default function App() {
  if (isPrivacyPath()) return <PrivacyPolicy />;
  if (isLandingPath()) return <Landing />;
  return <AttuneApp />;
}
