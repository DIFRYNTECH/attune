import { useEffect, useMemo, useRef, useState } from "react";

export default function Login({ state, actions }) {
  const [username, setUsername] = useState(() => String(state?.auth?.username || ""));
  const [otpCode, setOtpCode] = useState(() => String(state?.auth?.otpCode || ""));
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const usernameRef = useRef(null);
  const codeRef = useRef(null);
  const authStep = state?.auth?.step === "verify" ? "verify" : "request";
  const sentTo = String(state?.auth?.sentTo || state?.auth?.username || "");

  useEffect(() => {
    if(authStep === "verify"){
      codeRef.current?.focus?.();
      return;
    }

    usernameRef.current?.focus?.();
  }, [authStep]);

  useEffect(() => {
    setUsername(String(state?.auth?.username || ""));
  }, [state?.auth?.username]);

  useEffect(() => {
    setOtpCode(String(state?.auth?.otpCode || ""));
  }, [state?.auth?.otpCode]);

  const canSubmit = useMemo(() => {
    if(authStep === "verify") return otpCode.trim().length >= 6;
    return username.trim().length > 0;
  }, [authStep, otpCode, username]);

  const onSubmit = (e) => {
    e.preventDefault();
    if(authStep === "verify"){
      actions?.verifyEmailOtp?.({ email: sentTo || username, code: otpCode });
      return;
    }

    actions?.requestEmailOtp?.({ email: username, rememberMe });
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
          {authStep === "request" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="loginHint" role="status">
                Enter the 6-digit code we sent to {sentTo || username}.
              </div>

              <label className="field">
                <div className="fieldLabel">Email code</div>
                <input
                  ref={codeRef}
                  className="input"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </label>

              <div className="loginRow">
                <button
                  type="button"
                  className="loginLink"
                  onClick={() => actions?.requestEmailOtp?.({ email: sentTo || username, rememberMe })}
                >
                  Resend code
                </button>

                <button
                  type="button"
                  className="loginLink"
                  onClick={() => {
                    setOtpCode("");
                    actions?.resetEmailOtp?.();
                  }}
                >
                  Use a different email
                </button>
              </div>
            </>
          )}

          {state?.auth?.status === "sending" ? (
            <div className="loginHint" role="status">
              Sending code…
            </div>
          ) : state?.auth?.status === "sent" ? (
            <div className="loginHint" role="status">
              Check your email for a 6-digit code.
            </div>
          ) : state?.auth?.status === "verifying" ? (
            <div className="loginHint" role="status">
              Verifying code…
            </div>
          ) : state?.auth?.status === "error" && state?.auth?.error ? (
            <div className="loginHint" role="alert">
              {state.auth.error}
            </div>
          ) : (
            <div className="loginHint" role="note">
              {authStep === "verify" ? "Enter the code from your email to finish signing in." : "We’ll email you a one-time code."}
            </div>
          )}

          <div className="loginHint" role="note" style={{ fontSize: 11, opacity: 0.8 }}>
            Last OTP request URL: {state?.auth?.debugLastSendUrl || "none"}
          </div>

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            {authStep === "verify" ? "Verify code" : "Send code"}
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
