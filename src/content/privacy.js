export const SUPPORT_EMAIL = "support@useattune.co";
export const PRIVACY_PATH = "/privacy";
export const MINIMUM_TESTER_AGE = 18;

export const SUPPORT_MAILTO =
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Attune support request")}`;

export const PRIVACY_PROCESSORS = [
  "Supabase",
  "Vercel",
  "Upstash",
  "OpenAI",
  "Google Play",
  "payment providers used for Plus subscriptions",
];

export const DATA_SUBJECT_RIGHTS = [
  "access to personal information Attune holds about you",
  "correction of inaccurate personal information",
  "deletion of personal information where legally appropriate",
  "objection to certain processing where POPIA allows it",
];

export const PRIVACY_CONSENT_COPY =
  "By continuing, you agree to Attune's Privacy Policy. Your check-ins stay private to your account.";

export const PRIVACY_SHORT_NOTICE =
  "Attune stores your account details, check-ins, optional notes, tasks, and app settings so it can provide the app. Optional notes are only sent for AI personalization when you allow note context in Profile.";
