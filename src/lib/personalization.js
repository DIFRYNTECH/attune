const DEFAULT_HEADER_TAGLINE = "Meet yourself where you are, then take one small step toward better.";

export function getFirstName(name) {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return "";

  const firstToken = raw.split(/\s+/)[0] || "";
  const match = firstToken.match(/^[\p{L}][\p{L}'-]{0,23}$/u);
  if (!match) return "";

  return match[0];
}

function getGreetingPrefix(now = new Date()) {
  const hour = now instanceof Date ? now.getHours() : new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 18) return "Afternoon";
  if (hour >= 18 && hour < 24) return "Evening";
  return "Hello";
}

export function getHeaderTagline(name, now = new Date()) {
  const firstName = getFirstName(name);
  if (!firstName) return DEFAULT_HEADER_TAGLINE;
  return `${getGreetingPrefix(now)}, ${firstName}. One small step is enough today.`;
}

export function getCheckInHeading(name) {
  const firstName = getFirstName(name);
  return firstName ? `🌤 How are you today, ${firstName}?` : "🌤 How are you today?";
}

export function getTodayEmptyStateCopy(name) {
  const firstName = getFirstName(name);
  if (!firstName) {
    return {
      beforeCta: "No tasks yet. Tap ",
      afterCta: " to add a few.",
    };
  }

  return {
    beforeCta: `No tasks yet, ${firstName}. Tap `,
    afterCta: " to add one small thing.",
  };
}