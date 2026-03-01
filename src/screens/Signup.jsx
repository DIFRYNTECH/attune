import { useEffect, useMemo, useRef, useState } from "react";

export default function Signup({ state, actions }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus?.();
  }, []);

  const canSubmit = useMemo(() => {
    return true;
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    actions?.signup?.({ name, username, rememberMe });
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

          <label className="field">
            <div className="fieldLabel">Password</div>
            <div className="inputRow">
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            Sign up
          </button>

          <div className="loginFinePrint">
            Early build. Sign up is a placeholder and will sign you in.
          </div>
        </form>
      </div>
    </div>
  );
}
