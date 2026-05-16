import { useEffect, useMemo, useRef, useState } from "react";
import { PRIVACY_PATH } from "../content/privacy";
import { validateEmail } from "../lib/authValidation";

export default function Login({ state, actions }) {
  const OTP_LENGTH = 8;
  const [username, setUsername] = useState(() => String(state?.auth?.username || ""));
  const [otpCode, setOtpCode] = useState(() => String(state?.auth?.otpCode || ""));
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const usernameRef = useRef(null);
  const codeRef = useRef(null);
  const authStep = state?.auth?.step === "verify" ? "verify" : "request";
  const sentTo = String(state?.auth?.sentTo || state?.auth?.username || "");
  const authStatus = String(state?.auth?.status || "idle");
  const emailError = authStep === "request" ? validateEmail(username) : "";
  const normalizedOtpCode = otpCode.trim();
  const isSending = authStatus === "sending";
  const isVerifying = authStatus === "verifying";
  const isBusy = isSending || isVerifying;

  useEffect(() => {
    if(authStep === "verify"){
      codeRef.current?.focus?.();
      return;
    }

    usernameRef.current?.focus?.();
  }, [authStep]);

  const canSubmit = useMemo(() => {
    if(isBusy) return false;
    if(authStep === "verify") return normalizedOtpCode.length === OTP_LENGTH;
    return !emailError;
  }, [authStep, emailError, isBusy, normalizedOtpCode.length]);

  const authError = authStatus === "error" && state?.auth?.error ? String(state.auth.error) : "";

  const busyFeedback = useMemo(() => {
    if(isSending){
      return authStep === "verify"
        ? `Sending a new ${OTP_LENGTH}-digit code...`
        : "Sending code...";
    }

    if(isVerifying) return "Verifying code...";

    return "";
  }, [OTP_LENGTH, authStep, isSending, isVerifying]);

  const submitLabel = useMemo(() => {
    if(authStep === "verify"){
      if(isVerifying) return "Verifying code...";
      return normalizedOtpCode.length === OTP_LENGTH
        ? "Verify and continue"
        : "Enter full code to continue";
    }

    return isSending ? "Sending code..." : "Continue with email";
  }, [authStep, isSending, isVerifying, normalizedOtpCode.length]);

  const onSubmit = (e) => {
    e.preventDefault();
    if(!canSubmit) return;

    if(authStep === "verify"){
      actions?.verifyEmailOtp?.({ email: sentTo || username, code: otpCode });
      return;
    }

    if(emailError) return;

    actions?.requestEmailOtp?.({ email: username, rememberMe });
  };

  return (
    <div className="loginShell" aria-label="Sign in">
      <div className="card loginCard">
        <div className="loginHeader">
          <div className="loginBrand" aria-hidden="true">
            <div className="brandMark" />
          </div>

          <h1 className="loginTitle">Welcome back to Attune</h1>
          <div className="loginLead">
            Plan around your real energy, not your ideal day.
          </div>
          <div className="sub loginSub">
            Sign in with email to pick up your pace, notes, and weekly rhythm.
          </div>
        </div>

        <form className="loginForm" onSubmit={onSubmit}>
          {authStep === "request" ? (
            <>
              <label className="field">
                <div className="fieldLabel">Email</div>
                <input
                  ref={usernameRef}
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
                <label className="remember" htmlFor="rememberMe">
                  <input
                    id="rememberMe"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="rememberIndicator" aria-hidden="true">
                    <span className="rememberTick"></span>
                  </span>
                  <span className="rememberTextWrap">
                    <span className="rememberTitle">Remember me</span>
                    <span className="rememberMeta">Save your email on this device for next time.</span>
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
                  disabled={isBusy}
                  onClick={() => actions?.requestEmailOtp?.({ email: sentTo || username, rememberMe })}
                >
                  Resend code
                </button>

                <button
                  type="button"
                  className="loginLink"
                  disabled={isBusy}
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

          {busyFeedback ? (
            <div className="srOnly" role="status">
              {busyFeedback}
            </div>
          ) : null}

          {authError ? (
            <div className="loginHint" role="alert">
              {authError}
            </div>
          ) : null}

          <button type="submit" className="btn primary loginSubmit" disabled={!canSubmit}>
            {submitLabel}
          </button>

          <div className="loginFooterRail">
            <div className="loginDivider" aria-hidden="true">
              <span>New here?</span>
            </div>

            <div className="loginAlt loginAltStacked">
              <button type="button" className="btn ghost loginSecondaryCta" onClick={() => actions?.setAuthView?.("signup")}>
                Create account
              </button>
            </div>
          </div>

          <div className="loginFinePrint">No password needed. We’ll email a secure one-time code.</div>
          <div className="loginLegalNotice">
            <span>
              By continuing, you agree to Attune&apos;s{" "}
              <a className="loginLegalLink" href={PRIVACY_PATH}>
                Privacy Policy
              </a>
              . Your check-ins stay private to your account.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
