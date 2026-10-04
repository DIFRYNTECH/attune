import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { PRIVACY_PATH } from "../content/privacy";
import { validateDisplayName, validateEmail } from "../lib/authValidation";

export default function Signup({ state, actions }) {
  const OTP_LENGTH = 8;
  const [name, setName] = useState("");
  const [username, setUsername] = useState(() => String(state?.auth?.username || ""));
  const [otpCode, setOtpCode] = useState(() => String(state?.auth?.otpCode || ""));
  const [rememberMe, setRememberMe] = useState(() => state?.auth?.rememberMe !== false);
  const [touched, setTouched] = useState({ name: false, email: false });
  const nameRef = useRef(null);
  const codeRef = useRef(null);
  const authStep = state?.auth?.step === "verify" ? "verify" : "request";
  const sentTo = String(state?.auth?.sentTo || state?.auth?.username || "");
  const authStatus = String(state?.auth?.status || "idle");
  const nameError = authStep === "request" ? validateDisplayName(name) : "";
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

    nameRef.current?.focus?.();
  }, [authStep]);

  const canSubmit = useMemo(() => {
    if(isBusy) return false;
    if(authStep === "verify") return normalizedOtpCode.length === OTP_LENGTH;
    return !nameError && !emailError;
  }, [authStep, emailError, isBusy, nameError, normalizedOtpCode.length]);

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

    return isSending ? "Creating account..." : "Create account";
  }, [authStep, isSending, isVerifying, normalizedOtpCode.length]);

  const onSubmit = (e) => {
    e.preventDefault();
    if(!canSubmit) return;

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

          <h1 className="loginTitle">Join Attune</h1>
          <div className="loginLead">
            Make a little room for yourself, whatever today brings.
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
                  onBlur={() => setTouched(current => ({ ...current, name: true }))}
                  placeholder="Enter your name"
                  autoComplete="name"
                  aria-label="Name"
                  autoCapitalize="words"
                  maxLength={40}
                  required
                  aria-invalid={touched.name && nameError ? "true" : undefined}
                  aria-describedby={touched.name && nameError ? "signup-name-error" : undefined}
                />
                {touched.name && nameError ? <div id="signup-name-error" className="fieldError">{nameError}</div> : null}
              </label>

              <label className="field">
                <div className="fieldLabel">Email</div>
                <input
                  type="email"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setTouched(current => ({ ...current, email: true }))}
                  placeholder="you@example.com"
                  autoComplete="username"
                  inputMode="email"
                  aria-label="Email"
                  maxLength={120}
                  spellCheck={false}
                  aria-invalid={touched.email && emailError ? "true" : undefined}
                  aria-describedby={touched.email && emailError ? "signup-email-error" : undefined}
                />
                {touched.email && emailError ? <div id="signup-email-error" className="fieldError">{emailError}</div> : null}
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
                  aria-label="Email code"
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
                  onClick={() => actions?.requestEmailOtp?.({ name, email: sentTo || username, rememberMe })}
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
            {submitLabel}<ArrowRight size={18} aria-hidden="true" />
          </button>

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
