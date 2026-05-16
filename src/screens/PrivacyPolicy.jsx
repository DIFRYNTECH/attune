import {
  DATA_SUBJECT_RIGHTS,
  MINIMUM_TESTER_AGE,
  PRIVACY_PROCESSORS,
  SUPPORT_EMAIL,
} from "../content/privacy";

function PrivacySection({ title, children }) {
  return (
    <section className="privacySection">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="privacyPage">
      <div className="privacyShell">
        <header className="privacyTop">
          <a className="privacyBrand" href="/" aria-label="Back to Attune">
            <span className="brandMark" aria-hidden="true" />
            <span>
              <span className="privacyBrandTitle">Attune</span>
              <span className="privacyBrandTag">Meet yourself where you are.</span>
            </span>
          </a>
        </header>

        <article className="privacyPanel">
          <div className="privacyHero">
            <p className="privacyEyebrow">Privacy and data</p>
            <h1>Privacy Policy</h1>
            <p className="privacyUpdated">Last updated: 16 May 2026</p>
            <p>
              Attune uses your information to help you check in, choose realistic steps, and notice
              weekly patterns. This page explains what is stored, why it is used, and how to contact
              us about your data.
            </p>
          </div>

          <div className="privacySections">
            <PrivacySection title="Who is responsible">
              <p>
                Attune is responsible for the personal information processed through the app. For
                privacy, support, access, correction, deletion, or objection requests, email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </p>
            </PrivacySection>

            <PrivacySection title="Age limit">
              <p>
                Attune is intended for adults. Please do not use Attune or join Attune testing if
                you are under {MINIMUM_TESTER_AGE}. If we learn that we have collected personal
                information from someone under {MINIMUM_TESTER_AGE}, we will take reasonable steps
                to delete it.
              </p>
            </PrivacySection>

            <PrivacySection title="Information Attune collects">
              <p>
                Attune may store your email address, display name, check-in choices, optional notes,
                selected tasks, completed tasks, weekly summaries, app settings, billing entitlement
                status, support messages, and basic technical information needed to keep the app
                secure and working.
              </p>
            </PrivacySection>

            <PrivacySection title="How information is used">
              <p>
                Attune uses this information to sign you in, sync your app state, show your history,
                generate or show small-step suggestions, provide Plus features, support billing,
                export your data, improve reliability, prevent abuse, and help you understand your
                weekly rhythm.
              </p>
            </PrivacySection>

            <PrivacySection title="AI features">
              <p>
                Plus features may use AI to generate boards or daily notes. Your optional check-in
                note is only included in AI requests when you allow note context in Profile. Attune
                limits, filters, and validates AI requests and responses, but AI output is not
                medical advice and is not a diagnosis, treatment, or replacement for professional
                care.
              </p>
            </PrivacySection>

            <PrivacySection title="Operators and cross-border processing">
              <p>
                Attune uses trusted providers for authentication, database storage, hosting, rate
                limiting, AI processing, billing, and app distribution. These may include{" "}
                {PRIVACY_PROCESSORS.join(", ")}. Some processing may happen outside South Africa.
              </p>
            </PrivacySection>

            <PrivacySection title="Retention and deletion">
              <p>
                Attune keeps information while your account is active or while it is needed to
                provide the app, handle support, meet legal obligations, or protect the service. You
                can reset local device data in Profile. For account-level deletion, contact support
                and we will verify the request.
              </p>
            </PrivacySection>

            <PrivacySection title="Your choices and rights">
              <p>You can contact support to request:</p>
              <ul>
                {DATA_SUBJECT_RIGHTS.map((right) => (
                  <li key={right}>{right}</li>
                ))}
              </ul>
            </PrivacySection>

            <PrivacySection title="Security and incidents">
              <p>
                Attune uses authentication, server-side checks, rate limits, row-level database
                protections, input validation, and secure transport where available. If Attune
                becomes aware of a security incident involving personal information, we will take
                reasonable steps to investigate, contain the issue, and notify affected users and the
                Information Regulator where required by law.
              </p>
            </PrivacySection>

            <PrivacySection title="What Attune does not do">
              <p>
                Attune does not sell your personal information, does not run advertising inside the
                app, and does not use your data to diagnose, treat, or replace professional care.
              </p>
            </PrivacySection>
          </div>
        </article>
      </div>
    </main>
  );
}
