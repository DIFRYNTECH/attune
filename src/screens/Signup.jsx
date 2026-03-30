import { useEffect, useMemo, useRef, useState } from "react";

export default function Signup({ state, actions }) {
  const OTP_LENGTH = 8;
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [otpCode, setOtpCode] = useState(() => String(state?.auth?.otpCode || ""));
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const nameRef = useRef(null);
  const codeRef = useRef(null);
  const authStep = state?.auth?.step === "verify" ? "verify" : "request";
  const sentTo = String(state?.auth?.sentTo || state?.auth?.username || "");

  useEffect(() => {
    if(authStep === "verify"){
      codeRef.current?.focus?.();
      return;
    }

    nameRef.current?.focus?.();
  }, [authStep]);

  useEffect(() => {
    setUsername(String(state?.auth?.username || ""));
  }, [state?.auth?.username]);

  useEffect(() => {
    setOtpCode(String(state?.auth?.otpCode || ""));
  }, [state?.auth?.otpCode]);

  const canSubmit = useMemo(() => {
    if(authStep === "verify") return otpCode.trim().length === OTP_LENGTH;
    return username.trim().length > 0;
  }, [authStep, otpCode, username]);

  const onSubmit = (e) => {
    e.preventDefault();
    if(authStep === "verify"){
      actions?.verifyEmailOtp?.({ email: sentTo || username, code: otpCode });
      return;
    }

    actions?.requestEmailOtp?.({ name, email: username, rememberMe });
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
          {authStep === "request" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="loginHint" role="status">
                Enter the {OTP_LENGTH}-digit code we sent to {sentTo || username}.
              </div>

              <label className="field">
                <div className="fieldLabel">Email code</div>
                <input
                  ref={codeRef}
                  className="input"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, "").slice(0, OTP_LENGTH))}
                  placeholder="12345678"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </label>

              <div className="loginRow">
                <button
                  type="button"
                  className="loginLink"
                  onClick={() => actions?.requestEmailOtp?.({ name, email: sentTo || username, rememberMe })}
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
              Check your email for an {OTP_LENGTH}-digit code.
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
              {authStep === "verify" ? "Enter the code from your email to finish creating your account." : "We’ll email you a one-time code."}
            </div>
          )}

          <div className="loginHint" role="note" style={{ fontSize: 11, opacity: 0.8 }}>
            Last OTP request URL: {state?.auth?.debugLastSendUrl || "none"}
          </div>

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            {authStep === "verify" ? "Verify code" : "Send code"}
          </button>

          <div className="loginFinePrint">No password needed.</div>
        </form>
      </div>
    </div>
  );
}
