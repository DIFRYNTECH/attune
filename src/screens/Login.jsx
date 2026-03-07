import { useEffect, useMemo, useRef, useState } from "react";

export default function Login({ state, actions }) {
  const [username, setUsername] = useState(() => String(state?.auth?.username || ""));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const [forgotOpen, setForgotOpen] = useState(false);
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
    actions?.login?.({ username, rememberMe });
  };

  const EyeIcon = ({ off = false }) => (
    <svg
      className="eyeIcon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {!off ? (
        <>
          <path
            d="M2.5 12.1c2.4-4.6 6.1-7 9.5-7s7.1 2.4 9.5 7c-2.4 4.6-6.1 7-9.5 7s-7.1-2.4-9.5-7Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path
            d="M3 5l18 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M5.2 7.4C3.9 8.6 2.9 10.2 2.5 12.1c2.4 4.6 6.1 7 9.5 7 1.6 0 3.2-.5 4.7-1.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9.8 9.7a4 4 0 0 0 5.5 5.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 5.1c3.4 0 7.1 2.4 9.5 7-.6 1.2-1.3 2.3-2.2 3.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );

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
            <div className="fieldLabel">Username</div>
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

          <label className="field">
            <div className="fieldLabel">Password</div>
            <div className="inputRow">
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="iconBtn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon off={!showPassword} />
              </button>
            </div>
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

            <button
              type="button"
              className="loginLink"
              onClick={() => setForgotOpen((v) => !v)}
              aria-expanded={forgotOpen}
            >
              Forgot password?
            </button>
          </div>

          {forgotOpen ? (
            <div className="loginHint" role="note">
              Password reset is not available in this build yet. Use any password for now.
            </div>
          ) : null}

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            Sign in
          </button>

          <div className="loginAlt">
            <span className="loginAltText">Not a member?</span>
            <button type="button" className="loginLink" onClick={() => actions?.setAuthView?.("signup")}>
              Sign up
            </button>
          </div>

          <div className="loginFinePrint">
            Early build. Any username and password works for now.
          </div>
        </form>
      </div>
    </div>
  );
}
