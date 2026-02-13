const DEFAULT_MAX_NOTES = 30;

const THEME_KEYWORDS = {
  rest: [
    "tired",
    "sleep",
    "slept",
    "exhausted",
    "drained",
    "rest",
    "nap",
    "burnt",
    "burned",
    "recovery",
  ],
  overwhelm: [
    "overwhelmed",
    "overwhelm",
    "too much",
    "stress",
    "stressed",
    "anxious",
    "panic",
    "panicky",
    "spiral",
    "pressure",
  ],
  social: [
    "lonely",
    "alone",
    "friend",
    "friends",
    "family",
    "partner",
    "relationship",
    "people",
    "social",
    "talk",
    "conversation",
    "crowd",
  ],
  body: [
    "pain",
    "sore",
    "ache",
    "achey",
    "headache",
    "migraine",
    "nausea",
    "stomach",
    "injury",
    "ill",
    "sick",
    "tender",
  ],
  focus: [
    "focus",
    "motivated",
    "motivation",
    "confident",
    "confidence",
    "determined",
    "determination",
    "ready",
    "on a roll",
    "lets roll",
    "let's roll",
    "got this",
    "can do",
    "pull this off",
    "energized",
    "energised",
    "excited",
    "distracted",
    "procrast",
    "adhd",
    "work",
    "deadline",
    "study",
    "studying",
    "school",
    "project",
    "brain fog",
  ],
};

const THEMES = /** @type {const} */ (["rest", "overwhelm", "social", "body", "focus"]);

function normalizeText(input) {
  if (typeof input !== "string") return "";
  return input.toLowerCase().trim();
}

export function extractThemes(noteText) {
  const text = normalizeText(noteText);
  if (!text) return [];

  const found = new Set();

  for (const theme of THEMES) {
    const keys = THEME_KEYWORDS[theme] || [];
    for (const kw of keys) {
      if (!kw) continue;
      if (text.includes(kw)) {
        found.add(theme);
        break;
      }
    }
  }

  return Array.from(found);
}

export function addNoteToMemory(noteMemory, entry, maxNotes = DEFAULT_MAX_NOTES) {
  const base = noteMemory && typeof noteMemory === "object" && !Array.isArray(noteMemory) ? noteMemory : {};
  const prev = Array.isArray(base.notes) ? base.notes : [];

  const date = typeof entry?.date === "string" ? entry.date : "";
  const text = typeof entry?.text === "string" ? entry.text.trim().slice(0, 200) : "";
  if (!date || !text) return { ...base, notes: prev };

  const themes = extractThemes(text);

  const last = prev.length ? prev[prev.length - 1] : null;
  if (last && last.date === date && last.text === text) {
    return { ...base, notes: prev };
  }

  // Keep it simple: one remembered note per day (latest wins).
  const nextBase =
    last && last.date === date
      ? [...prev.slice(0, -1), { date, text, themes, ts: Date.now() }]
      : [...prev, { date, text, themes, ts: Date.now() }];

  const trimmed = nextBase.length > maxNotes ? nextBase.slice(nextBase.length - maxNotes) : nextBase;

  return { ...base, notes: trimmed };
}

export function clearNoteMemory(noteMemory) {
  const base = noteMemory && typeof noteMemory === "object" && !Array.isArray(noteMemory) ? noteMemory : {};
  return { ...base, notes: [] };
}

export function applyThemesToRememberedNote(noteMemory, entry) {
  const base = noteMemory && typeof noteMemory === "object" && !Array.isArray(noteMemory) ? noteMemory : {};
  const prev = Array.isArray(base.notes) ? base.notes : [];
  if (!prev.length) return { ...base, notes: prev };

  const date = typeof entry?.date === "string" ? entry.date : "";
  const themes = Array.isArray(entry?.themes)
    ? entry.themes
        .filter((t) => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!date || themes.length === 0) return { ...base, notes: prev };

  const idxFromEnd = [...prev].reverse().findIndex((n) => n?.date === date);
  if (idxFromEnd < 0) return { ...base, notes: prev };
  const idx = prev.length - 1 - idxFromEnd;

  const current = prev[idx] && typeof prev[idx] === "object" ? prev[idx] : null;
  if (!current) return { ...base, notes: prev };

  const next = [...prev];
  next[idx] = { ...current, themes };
  return { ...base, notes: next };
}

export function summarizeRecentThemes(noteMemory, lastN = 10) {
  const notes = Array.isArray(noteMemory?.notes) ? noteMemory.notes : [];
  if (!notes.length) return [];

  const windowNotes = notes.slice(-Math.max(1, lastN));
  const counts = new Map();

  for (const n of windowNotes) {
    const themes = Array.isArray(n?.themes) ? n.themes : [];
    for (const t of themes) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, 2);
}
