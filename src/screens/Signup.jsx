import { useEffect, useMemo, useRef, useState } from "react";

import { getAuthRedirectUrl } from "../lib/supabase";
import { getPlatform, isNativePlatform } from "../lib/platform";

export default function Signup({ state, actions }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const nameRef = useRef(null);
  const authRedirectUrl = getAuthRedirectUrl();
  const platform = getPlatform();
  const nativePlatform = isNativePlatform();

  useEffect(() => {
    nameRef.current?.focus?.();
  }, []);

  const canSubmit = useMemo(() => {
    return true;
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    actions?.sendMagicLink?.({ name, email: username, rememberMe });
  };

  return (
    <div className="loginShell" aria-label="Sign up">
      <div className="card loginCard">
        <div className="loginBrand" aria-hidden="true">
          <div className="brandMark" />
        </div>

        <h2 className="loginTitle">Create your account</h2>
        <div className="sub loginSub">Built for real life.</div>

        <form className="loginForm" onSubmit={onSubmit}>
          <label className="field">
            <div className="fieldLabel">Name (optional)</div>
            <input
              ref={nameRef}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>

          <label className="field">
            <div className="fieldLabel">Email</div>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              inputMode="email"
            />
          </label>

          <div className="loginRow">
            <label className="remember" htmlFor="rememberMeSignup">
              <input
                id="rememberMeSignup"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              className="loginLink"
              onClick={() => actions?.setAuthView?.("signin")}
            >
              Already have an account? Sign in
            </button>
          </div>

          {state?.auth?.status === "sending" ? (
            <div className="loginHint" role="status">
              Sending link…
            </div>
          ) : state?.auth?.status === "sent" ? (
            <div className="loginHint" role="status">
              Check your email for a sign-in link.
            </div>
          ) : state?.auth?.status === "error" && state?.auth?.error ? (
            <div className="loginHint" role="alert">
              {state.auth.error}
            </div>
          ) : (
            <div className="loginHint" role="note">
              We’ll email you a magic link.
            </div>
          )}

          <div className="loginHint" role="note" style={{ fontSize: 11, opacity: 0.8 }}>
            Auth debug: platform={platform} native={String(nativePlatform)} redirect={authRedirectUrl || "none"}
          </div>

          <div className="loginHint" role="note" style={{ fontSize: 11, opacity: 0.8 }}>
            Last send redirect: {state?.auth?.debugLastSendRedirect || "none"}
          </div>

          <div className="loginHint" role="note" style={{ fontSize: 11, opacity: 0.8 }}>
            Last send URL: {state?.auth?.debugLastSendUrl || "none"}
          </div>

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            Send link
          </button>

          <div className="loginFinePrint">No password needed.</div>
        </form>
      </div>
    </div>
  );
}
