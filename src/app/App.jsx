import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { useAppInit } from "../hooks/useAppInit";
import BottomNav from "../components/BottomNav.jsx";
import { navigationItems } from "../components/navigation.js";
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
    <header className="top">
      <div className="brand">
        <div className="brandMark" aria-hidden="true"></div>
        <div className="brandText">
          <div className="brandTitleRow">
            <h1>Attune</h1>
            {entitlements?.isPlus ? <span className="planTag">Plus</span> : null}
          </div>
          <div className="tag">
            A little more in tune.
          </div>
        </div>
      </div>

      {!hideNav ? (
        <nav className="nav" aria-label="Primary">
          {navigationItems.map(({ key, label, Icon: icon }) => {
            const Icon = icon;
            return (
            <button key={key} type="button" className={"navButton" + (screen === key ? " active" : "")}
              onClick={() => go(key)} aria-current={screen === key ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}

function ScreenFallback({ label = "Loading..." }) {
  return (
    <div className="screenLoading" aria-busy="true" role="status">
      <LoaderCircle size={20} aria-hidden="true" />
      <span>{label}</span>
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
  return <AppExperience state={state} actions={actions} />;
}

export function AppExperience({ state, actions }) {
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
        <main id="main-content">
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
