import { useCallback, useEffect, useRef } from "react";
import { LEVELS } from "../data/levels";
import EmojiIcon from "../components/EmojiIcon";

const MOOD_WORDS = [
  { label: "Worn out", emoji: "🪫", icon: "low-battery", tone: "tough" },
  { label: "Tired", emoji: "😴", icon: "sleeping-face", tone: "tough" },
  { label: "Overwhelmed", emoji: "😵‍💫", icon: "face-with-spiral-eyes", tone: "tough" },
  { label: "Irritable", emoji: "😣", icon: "persevering-face", tone: "tough" },
  { label: "Restless", emoji: "⚡", icon: "high-voltage", tone: "tough" },
  { label: "Tender", emoji: "🫧", icon: "bubbles", tone: "okay" },
  { label: "Okay", emoji: "🙂", icon: "slightly-smiling-face", tone: "okay" },
  { label: "Settled", emoji: "😌", icon: "relieved-face", tone: "good" },
  { label: "Hopeful", emoji: "🌤️", icon: "sun-behind-cloud", tone: "good" },
  { label: "Motivated", emoji: "✨", icon: "sparkles", tone: "good" },
];

const MOOD_WORD_ALIASES = {
  // Back-compat (older saved check-ins)
  Steady: "Settled",
  Anxious: "Overwhelmed",
  Flat: "Tired",
};

function normalizeMoodWord(word) {
  return MOOD_WORD_ALIASES[word] || word;
}

function moodMeta(word) {
  const label = normalizeMoodWord(word);
  const found = MOOD_WORDS.find((x) => x.label === label);
  if (found) return found;
  return { label, tone: "okay" };
}

function moodCategoryFromWords(words) {
  if (!words?.length) return null;

  const scoreMap = {
    "Worn out": -2,
    Tired: -1,
    Overwhelmed: -1,
    // Back-compat (older saved check-ins)
    Flat: -1,
    Tender: -1,
    Anxious: -1,
    Irritable: -1,
    Restless: -1,
    Okay: 0,
    Settled: 1,
    // Back-compat (older saved check-ins)
    Steady: 1,
    Hopeful: 2,
    Motivated: 2,
  };

  const scores = words
    .map((w) => scoreMap[w])
    .filter((n) => typeof n === "number");
  if (!scores.length) return null;

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg <= -0.5) return "low";
  if (avg >= 0.5) return "good";
  return "okay";
}

export default function CheckIn({ state, actions }) {
  const { checkin, level, checkedInToday } = state;
  const note = (checkin.note || "").slice(0, 200);
  const noteRef = useRef(null);

  const autosizeNote = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autosizeNote();
  }, [note, autosizeNote]);

  const selectedMoodWordsRaw =
    checkin.moodWords?.length
      ? checkin.moodWords
      : checkin.mood === "okay"
        ? ["Okay"]
        : [];

  const selectedMoodWords = selectedMoodWordsRaw.map(normalizeMoodWord);

  const toggleMoodWord = (word) => {
    const already = selectedMoodWords.includes(word);

    let next;
    if (already) {
      next = selectedMoodWords.filter((w) => w !== word);
    } else {
      // keep it gentle: max 2 words
      next =
        selectedMoodWords.length >= 2
          ? [selectedMoodWords[0], word]
          : [...selectedMoodWords, word];
    }

    const mood = moodCategoryFromWords(next) || checkin.mood || "okay";
    actions.setCheckin({ moodWords: next, mood });
  };

  return (
    <div className="card checkinCard" style={{ display: 'flex', flexDirection: 'column', flex: '1' }}>
      <h2>🌤 How are you today?</h2>
      <div className="sub">Changeable anytime.</div>

      <div className="row">
        <div>
          <label>Mood (pick up to 2)</label>
          <div className="moodGrid" role="group" aria-label="Mood">
            {MOOD_WORDS.map((w) => (
              <button
                key={w.label}
                type="button"
                className={
                  "moodBtn" + (selectedMoodWords.includes(w.label) ? " active" : "")
                }
                title={w.label}
                data-tone={w.tone}
                aria-pressed={selectedMoodWords.includes(w.label)}
                onClick={() => toggleMoodWord(w.label)}
              >
                <span className="moodCheck" aria-hidden="true">
                  ✓
                </span>
                <span className="moodEmoji" aria-hidden="true">
                  <EmojiIcon
                    id={w.icon}
                    size="var(--moodEmojiSize)"
                    fallback={w.emoji}
                  />
                </span>
                <span className="moodLabel">{w.label}</span>
              </button>
            ))}
          </div>
          <div className="moodSelectedRow" aria-live="polite">
            <span className="moodSelectedKey">Selected</span>
            {selectedMoodWords.length ? (
              selectedMoodWords.map((label) => {
                const meta = moodMeta(label);

                return (
                  <span key={label} className="moodBadge" data-tone={meta.tone}>
                    <span className="moodBadgeEmoji" aria-hidden="true">
                      <EmojiIcon
                        id={meta.icon}
                        size="14px"
                        fallback={meta.emoji}
                      />
                    </span>
                    <span>{meta.label}</span>
                  </span>
                );
              })
            ) : (
              <span className="moodSelectedEmpty">—</span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="energy">Energy</label>
          <select
            id="energy"
            value={checkin.energy}
            onChange={(e) => actions.setCheckin({ energy: e.target.value })}
          >
            <option value="okay">Okay</option>
            <option value="low">Low / drained</option>
            <option value="verylow">Very low / depleted</option>
            <option value="high">High / wired</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label htmlFor="body">Body</label>
        <select
          id="body"
          value={checkin.body}
          onChange={(e) => actions.setCheckin({ body: e.target.value })}
        >
          <option value="manageable">Manageable</option>
          <option value="achey">Sore / achey</option>
          <option value="tender">Tender</option>
        </select>
      </div>

      <details
        className="noteDetails"
        style={{ marginTop: 12 }}
      >
        <summary className="noteSummary">Optional note (200 characters)</summary>
        <div style={{ marginTop: 8 }}>
          <textarea
            className="noteInput"
            ref={noteRef}
            value={note}
            maxLength={200}
            rows={3}
            placeholder="Anything else to know (e.g., slept great, excited, busy day, bad sleep, headache)…"
            onChange={(e) => actions.setCheckin({ note: e.target.value.slice(0, 200) })}
            onInput={autosizeNote}
            aria-label="Optional note"
          />
          <div className="charCount">{note.length}/200</div>
        </div>
      </details>

      <div style={{ marginTop: 14 }}>
        <label>Pace for today</label>
        <div className="pillrow" role="group" aria-label="Pace">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={"pill" + (level === l.key ? " active" : "")}
              onClick={() => actions.setLevel(l.key)}
            >
              <span className="pillIcon" aria-hidden="true">
                <EmojiIcon
                  id={l.icon}
                  size="var(--pillEmojiSize)"
                  fallback={l.emoji}
                  className="pillEmoji"
                />
              </span>
              <span className="pillLabel">{l.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hint" style={{ marginTop: 12 }}>
        Used to personalize your options and keep suggestions relevant. If AI is enabled, your optional note may be used to help build today’s board. You can change this anytime.
      </div>

      <div className="checkinBottom">
        <div className="footerNote" style={{ marginTop: 12 }}>
          Use the tabs below when you’re ready.
          {checkedInToday ? " Saved for today." : ""}
        </div>
      </div>
    </div>
  );
}
