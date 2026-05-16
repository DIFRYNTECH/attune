const SUPPORT_EMAIL = "support@useattune.co";

export default function PrivacyPolicy() {
  return (
    <main className="privacyPage">
      <section className="privacyPanel">
        <a className="privacyBackLink" href="/landing">Attune</a>
        <h1>Privacy Policy</h1>
        <p className="privacyUpdated">Last updated: 11 May 2026</p>

        <p>
          Attune helps you check in with how you feel, choose small realistic steps, and notice
          weekly patterns. This policy explains what information Attune uses and how it is handled.
        </p>

        <h2>Information Attune collects</h2>
        <p>
          When you use Attune, the app may store your email address, display name, check-in choices,
          optional notes, selected tasks, completed tasks, weekly summaries, app settings, billing
          entitlement status, and basic technical information needed to keep the app working.
        </p>

        <h2>How information is used</h2>
        <p>
          Attune uses this information to sign you in, sync your app state, generate or show small-step
          suggestions, provide Plus features, support billing, export your data, improve reliability,
          and help you understand your weekly rhythm.
        </p>

        <h2>AI features</h2>
        <p>
          Plus features may use AI to generate boards or daily notes. Your optional check-in note is
          only included in AI requests when you allow note context in Profile. Attune limits, filters,
          and validates AI requests and responses, but AI output is not medical advice.
        </p>

        <h2>Third-party services</h2>
        <p>
          Attune uses trusted service providers for authentication, database storage, hosting, rate
          limiting, AI processing, billing, and app distribution. These may include Supabase, Vercel,
          Upstash, OpenAI, Google Play, and payment providers used for Plus subscriptions.
        </p>

        <h2>What Attune does not do</h2>
        <p>
          Attune does not sell your personal information, does not run advertising inside the app, and
          does not use your data to diagnose, treat, or replace professional care.
        </p>

        <h2>Your choices</h2>
        <p>
          You can turn optional note context for AI on or off in Profile. You can export your data from
          Profile where available. You can also contact support to request help with access, deletion,
          or privacy questions.
        </p>

        <h2>Security</h2>
        <p>
          Attune uses authentication, server-side checks, rate limits, row-level database protections,
          and secure transport where available. No system is perfect, but Attune is designed to keep
          personal wellbeing data private and scoped to the signed-in user.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy, support, or data requests, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
