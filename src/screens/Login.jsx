import { useEffect, useMemo, useRef, useState } from "react";

export default function Login({ state, actions }) {
  const [username, setUsername] = useState(() => String(state?.auth?.username || ""));
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const usernameRef = useRef(null);

  useEffect(() => {
    // Focus the first field when entering the login screen.
    usernameRef.current?.focus?.();
  }, []);

  const canSubmit = useMemo(() => {
    // For now: any credentials are accepted, including empty.
    // Keep the UI hinting at expected input without blocking.
    return true;
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    actions?.sendMagicLink?.({ email: username, rememberMe });
  };

  return (
    <div className="loginShell" aria-label="Sign in">
      <div className="card loginCard">
        <div className="loginBrand" aria-hidden="true">
          <div className="brandMark" />
        </div>

        <h2 className="loginTitle">Welcome to Attune</h2>
        <div className="sub loginSub">
          A planning companion that adapts to you.
          Check in, set your pace, and shape a Day that feels possible, even on low energy days.
        </div>

        <div className="loginMiniTitle">BUILT FOR REAL LIFE DAYS</div>

        <form className="loginForm" onSubmit={onSubmit}>
          <label className="field">
            <div className="fieldLabel">Email</div>
            <input
              ref={usernameRef}
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              inputMode="email"
            />
          </label>

          <div className="loginRow">
            <label className="remember" htmlFor="rememberMe">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
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

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            Send link
          </button>

          <div className="loginAlt">
            <span className="loginAltText">Not a member?</span>
            <button type="button" className="loginLink" onClick={() => actions?.setAuthView?.("signup")}>
              Sign up
            </button>
          </div>

          <div className="loginFinePrint">No password needed.</div>
        </form>
      </div>
    </div>
  );
}
