import {
  DATA_SUBJECT_RIGHTS,
  MINIMUM_TESTER_AGE,
  PRIVACY_PROCESSORS,
  SUPPORT_EMAIL,
} from "../content/privacy";

export default function PrivacyPolicy() {
  return (
    <main className="privacyPage">
      <section className="privacyPanel">
        <a className="privacyBackLink" href="/landing">Attune</a>
        <h1>Privacy Policy</h1>
        <p className="privacyUpdated">Last updated: 16 May 2026</p>

        <p>
          Attune helps you check in with how you feel, choose small realistic steps, and notice
          weekly patterns. This policy explains what information Attune uses, why it is used, and
          how you can contact us about your data.
        </p>

        <h2>Who is responsible for your information</h2>
        <p>
          Attune is responsible for the personal information processed through the app. For privacy,
          support, access, correction, deletion, or objection requests, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>

        <h2>Age limit</h2>
        <p>
          Attune is intended for adults. Please do not use Attune or join Attune testing if you are
          under {MINIMUM_TESTER_AGE}. If we learn that we have collected personal information from
          someone under {MINIMUM_TESTER_AGE}, we will take reasonable steps to delete it.
        </p>

        <h2>Information Attune collects</h2>
        <p>
          When you use Attune, the app may store your email address, display name, check-in choices,
          optional notes, selected tasks, completed tasks, weekly summaries, app settings, billing
          entitlement status, support messages, and basic technical information needed to keep the
          app secure and working.
        </p>

        <h2>Why Attune uses information</h2>
        <p>
          Attune uses this information to sign you in, sync your app state, show your history,
          generate or show small-step suggestions, provide Plus features, support billing, export
          your data, improve reliability, prevent abuse, and help you understand your weekly rhythm.
        </p>

        <h2>Legal basis and consent</h2>
        <p>
          Attune processes information to provide the app you ask to use, protect the service,
          support billing where relevant, and comply with legal obligations. Where Attune asks for
          optional information, such as a check-in note, you choose whether to provide it. You can
          also turn optional note context for AI on or off in Profile.
        </p>

        <h2>AI features</h2>
        <p>
          Plus features may use AI to generate boards or daily notes. Your optional check-in note is
          only included in AI requests when you allow note context in Profile. Attune limits, filters,
          and validates AI requests and responses, but AI output is not medical advice and is not a
          diagnosis, treatment, or replacement for professional care.
        </p>

        <h2>Third-party operators and processors</h2>
        <p>
          Attune uses trusted service providers for authentication, database storage, hosting, rate
          limiting, AI processing, billing, and app distribution. These may include{" "}
          {PRIVACY_PROCESSORS.join(", ")}.
        </p>

        <h2>Cross-border processing</h2>
        <p>
          Some providers may process or store information outside South Africa. Attune uses these
          providers to operate the app and chooses established services that provide security and
          privacy controls appropriate for the information being processed.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Attune keeps information while your account is active or while it is needed to provide the
          app, handle support, meet legal obligations, or protect the service. You can reset local
          device data in Profile. To request account-level deletion or help with your data, contact
          support. We will verify the request and complete it where legally appropriate.
        </p>

        <h2>Your choices and rights</h2>
        <p>You can contact support to request:</p>
        <ul>
          {DATA_SUBJECT_RIGHTS.map((right) => (
            <li key={right}>{right}</li>
          ))}
        </ul>

        <h2>Security</h2>
        <p>
          Attune uses authentication, server-side checks, rate limits, row-level database protections,
          input validation, and secure transport where available. No system is perfect, but Attune is
          designed to keep personal wellbeing data private and scoped to the signed-in user.
        </p>

        <h2>Security incidents</h2>
        <p>
          If Attune becomes aware of a security incident involving personal information, we will take
          reasonable steps to investigate, contain the issue, and notify affected users and the
          Information Regulator where required by law.
        </p>

        <h2>What Attune does not do</h2>
        <p>
          Attune does not sell your personal information, does not run advertising inside the app,
          and does not use your data to diagnose, treat, or replace professional care.
        </p>
      </section>
    </main>
  );
}
