const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;

export function validateEmail(value) {
  const email = String(value || "").trim();

  if (!email) return "Enter your email.";
  if (email.length > 120) return "Keep your email under 120 characters.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";

  return "";
}

export function validateDisplayName(value) {
  const name = String(value || "").trim();

  if (!name) return "Enter your name.";
  if (name.length > 40) return "Keep your name under 40 characters.";

  const lettersOnly = name.replace(/[ .'-]/g, "");
  if (lettersOnly.length < 2) return "Use at least 2 letters.";
  if (!NAME_RE.test(name)) return "Use letters, spaces, apostrophes, periods, or hyphens only.";

  return "";
}