import { useEffect, useMemo, useRef, useState } from "react";
import { validateDisplayName, validateEmail } from "../lib/authValidation";

export default function Signup({ state, actions }) {
  const OTP_LENGTH = 8;
  const [name, setName] = useState("");
  const [username, setUsername] = useState(() => String(state?.auth?.username || ""));
  const [otpCode, setOtpCode] = useState(() => String(state?.auth?.otpCode || ""));
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const nameRef = useRef(null);
  const codeRef = useRef(null);
  const authStep = state?.auth?.step === "verify" ? "verify" : "request";
  const sentTo = String(state?.auth?.sentTo || state?.auth?.username || "");
  const authStatus = String(state?.auth?.status || "idle");
  const nameError = authStep === "request" ? validateDisplayName(name) : "";
  const emailError = authStep === "request" ? validateEmail(username) : "";

  useEffect(() => {
    if(authStep === "verify"){
      codeRef.current?.focus?.();
      return;
    }

    nameRef.current?.focus?.();
  }, [authStep]);

  const canSubmit = useMemo(() => {
    if(authStep === "verify") return otpCode.trim().length === OTP_LENGTH;
    return !nameError && !emailError;
  }, [authStep, emailError, nameError, otpCode]);

  const showVerifySubmit = authStep !== "verify" || otpCode.trim().length > 0 || authStatus === "verifying";

  const authFeedback = useMemo(() => {
    if(authStatus === "sending"){
      return {
        role: "status",
        text: authStep === "verify"
          ? `Sending a new ${OTP_LENGTH}-digit code…`
          : "Sending code…",
      };
    }

    if(authStatus === "verifying"){
      return { role: "status", text: "Verifying code…" };
    }

    if(authStatus === "error" && state?.auth?.error){
      return { role: "alert", text: state.auth.error };
    }

    return null;
  }, [OTP_LENGTH, authStatus, authStep, state?.auth?.error]);

  const onSubmit = (e) => {
    e.preventDefault();
    if(authStep === "verify"){
      actions?.verifyEmailOtp?.({ email: sentTo || username, code: otpCode });
      return;
    }

    if(nameError || emailError) return;

    actions?.requestEmailOtp?.({ name, email: username, rememberMe });
  };

  return (
    <div className="loginShell" aria-label="Sign up">
      <div className="card loginCard">
        <div className="loginHeader">
          <div className="loginBrand" aria-hidden="true">
            <div className="brandMark" />
          </div>

          <h1 className="loginTitle">Start with a gentler plan</h1>
          <div className="loginLead">
            Attune helps you shape days that still work when energy is low.
          </div>
          <div className="sub loginSub">
            Create your account to save your pace, notes, and weekly progress across devices.
          </div>
        </div>

        <form className="loginForm" onSubmit={onSubmit}>
          {authStep === "request" ? (
            <>
              <label className="field">
                <div className="fieldLabel">Name</div>
                <input
                  ref={nameRef}
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={40}
                  required
                  aria-invalid={nameError ? "true" : undefined}
                />
                {nameError ? <div className="fieldError">{nameError}</div> : null}
              </label>

              <label className="field">
                <div className="fieldLabel">Email</div>
                <input
                  type="email"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="username"
                  inputMode="email"
                  maxLength={120}
                  spellCheck={false}
                  aria-invalid={emailError ? "true" : undefined}
                />
                {emailError ? <div className="fieldError">{emailError}</div> : null}
              </label>

              <div className="loginRow">
                <label className="remember" htmlFor="rememberMeSignup">
                  <input
                    id="rememberMeSignup"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="rememberIndicator" aria-hidden="true">
                    <span className="rememberTick"></span>
                  </span>
                  <span className="rememberTextWrap">
                    <span className="rememberTitle">Remember me</span>
                    <span className="rememberMeta">Keep this device ready so you can come back easily.</span>
                  </span>
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <div className="fieldLabel">Email code</div>
                <div className="fieldMeta">We sent an {OTP_LENGTH}-digit code to {sentTo || username}.</div>
                <input
                  ref={codeRef}
                  className="input"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, "").slice(0, OTP_LENGTH))}
                  placeholder="8-digit code"
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

          {authFeedback ? (
            <div className="loginHint" role={authFeedback.role}>
              {authFeedback.text}
            </div>
          ) : null}

          {showVerifySubmit ? (
            <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
              {authStep === "verify"
                ? (canSubmit ? "Verify and continue" : "Enter full code to continue")
                : "Create account"}
            </button>
          ) : null}

          <div className="loginFooterRail">
            <div className="loginDivider" aria-hidden="true">
              <span>Already have an account?</span>
            </div>

            <div className="loginAlt loginAltStacked">
              <button
                type="button"
                className="btn ghost loginSecondaryCta"
                onClick={() => actions?.setAuthView?.("signin")}
              >
                Sign in instead
              </button>
            </div>
          </div>

          <div className="loginFinePrint">No password needed. We’ll email a secure one-time code.</div>
        </form>
      </div>
    </div>
  );
}
