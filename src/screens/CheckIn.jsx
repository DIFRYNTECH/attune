import { useCallback, useEffect, useRef, useState } from "react";
import { LEVELS } from "../data/levels";
import EmojiIcon from "../components/EmojiIcon";
import InfoTip from "../components/InfoTip";
import { getCheckInHeading } from "../lib/personalization";

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

const ENERGY_OPTIONS = [
  { value: "verylow", label: "Very low", hint: "Depleted", tone: "low" },
  { value: "low", label: "Low", hint: "Drained", tone: "low" },
  { value: "okay", label: "Okay", hint: "Steady", tone: "okay" },
  { value: "high", label: "Wired", hint: "Buzzing", tone: "high" },
];

const BODY_OPTIONS = [
  { value: "tender", label: "Tender", hint: "Sensitive", tone: "soft" },
  { value: "achey", label: "Sore", hint: "Achey", tone: "low" },
  { value: "manageable", label: "Manageable", hint: "Holding okay", tone: "okay" },
];

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
  const DEFAULT_ENERGY = "okay";
  const DEFAULT_BODY = "manageable";
  const DEFAULT_LEVEL = "gentle";
  const note = (checkin.note || "").slice(0, 200);
  const noteRef = useRef(null);
  const checkInHeading = getCheckInHeading(state?.profile?.name);
  const compactHeading = checkInHeading.length > 32;
  const [isNoteExpanded, setIsNoteExpanded] = useState(() => Boolean((checkin.note || "").trim()));
  const trimmedNote = note.trim();
  const showNoteCount = note.length >= 150;
  const notePreview = trimmedNote
    ? (trimmedNote.length > 72 ? `${trimmedNote.slice(0, 72).trimEnd()}...` : trimmedNote)
    : "";

  const autosizeNote = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if(!isNoteExpanded) return;
    autosizeNote();
  }, [note, autosizeNote, isNoteExpanded]);

  const toggleNote = () => {
    const nextExpanded = !isNoteExpanded;
    setIsNoteExpanded(nextExpanded);
    if(!nextExpanded) return;

    requestAnimationFrame(() => {
      autosizeNote();
      noteRef.current?.focus?.();
    });
  };

  const selectedMoodWordsRaw =
    checkin.moodWords?.length
      ? checkin.moodWords
      : checkin.mood === "okay"
        ? ["Okay"]
        : [];

  const selectedMoodWords = selectedMoodWordsRaw.map(normalizeMoodWord);
  const hasInitialProgress = useRef(
    checkedInToday ||
    trimmedNote.length > 0 ||
    checkin.energy !== DEFAULT_ENERGY ||
    checkin.body !== DEFAULT_BODY ||
    level !== DEFAULT_LEVEL ||
    !(selectedMoodWords.length === 1 && selectedMoodWords[0] === "Okay" && checkin.mood === "okay")
  );
  const [stepState, setStepState] = useState(() => ({
    mood: hasInitialProgress.current,
    energy: hasInitialProgress.current,
    body: hasInitialProgress.current,
    pace: hasInitialProgress.current,
  }));

  const visibleMoodWords = hasInitialProgress.current || stepState.mood ? selectedMoodWords : [];
  const showEnergyStep = hasInitialProgress.current || stepState.mood;
  const showBodyStep = hasInitialProgress.current || stepState.energy;
  const showPaceStep = hasInitialProgress.current || stepState.body;
  const showNoteStep = hasInitialProgress.current || stepState.pace;
  const visibleEnergyValue = hasInitialProgress.current || stepState.energy ? checkin.energy : "";
  const visibleBodyValue = hasInitialProgress.current || stepState.body ? checkin.body : "";
  const visibleLevel = hasInitialProgress.current || stepState.pace ? level : "";

  const toggleMoodWord = (word) => {
    const already = visibleMoodWords.includes(word);

    let next;
    if (already) {
      next = visibleMoodWords.filter((w) => w !== word);
    } else {
      // keep it gentle: max 2 words
      next =
        visibleMoodWords.length >= 2
          ? [visibleMoodWords[0], word]
          : [...visibleMoodWords, word];
    }

    const mood = moodCategoryFromWords(next) || checkin.mood || "okay";
    setStepState((current) => (current.mood ? current : { ...current, mood: true }));
    actions.setCheckin({ moodWords: next, mood });
  };

  return (
    <div className="card checkinCard">
      <div className="checkinIntro">
        <h2 className={"checkinHeading" + (compactHeading ? " compact" : "")}>{checkInHeading}</h2>
      </div>

      <div className="checkinFlow">
        <div className="checkinStep checkinStepMood" data-step="mood">
          <label>Mood (pick up to 2)</label>
          <div className="moodGrid" role="group" aria-label="Mood">
            {MOOD_WORDS.map((w) => (
              <button
                key={w.label}
                type="button"
                className={
                  "moodBtn" + (visibleMoodWords.includes(w.label) ? " active" : "")
                }
                title={w.label}
                data-tone={w.tone}
                aria-pressed={visibleMoodWords.includes(w.label)}
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
        </div>

        {showEnergyStep ? (
          <div className="checkinStep" data-step="energy">
            <label>Energy</label>
            <div className="choicePillGrid" data-columns="4" role="group" aria-label="Energy">
              {ENERGY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={"choicePill" + (visibleEnergyValue === option.value ? " active" : "")}
                  data-tone={option.tone}
                  aria-pressed={visibleEnergyValue === option.value}
                  onClick={() => {
                    setStepState((current) => (current.energy ? current : { ...current, energy: true }));
                    actions.setCheckin({ energy: option.value });
                  }}
                >
                  <span className="choicePillText">
                    <span className="choicePillLabel">{option.label}</span>
                    <span className="choicePillHint">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showBodyStep ? (
          <div className="checkinStep" data-step="body">
            <label>Body</label>
            <div className="choicePillGrid" data-columns="3" role="group" aria-label="Body">
              {BODY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={"choicePill" + (visibleBodyValue === option.value ? " active" : "")}
                  data-tone={option.tone}
                  aria-pressed={visibleBodyValue === option.value}
                  onClick={() => {
                    setStepState((current) => (current.body ? current : { ...current, body: true }));
                    actions.setCheckin({ body: option.value });
                  }}
                >
                  <span className="choicePillText">
                    <span className="choicePillLabel">{option.label}</span>
                    <span className="choicePillHint">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showPaceStep ? (
          <div className="checkinStep" data-step="pace">
            <label>Pace for today</label>
            <div className="pillrow" role="group" aria-label="Pace">
              {LEVELS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={"pill" + (visibleLevel === l.key ? " active" : "")}
                  onClick={() => {
                    setStepState((current) => (current.pace ? current : { ...current, pace: true }));
                    actions.setLevel(l.key);
                  }}
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
        ) : null}

        {showNoteStep ? (
          <div className="checkinStep" data-step="note">
            <div className="checkinNoteBlock checkinNoteBlockCollapsible">
              <div className="checkinNoteHead checkinNoteHeadCollapsible">
                <div className="checkinNoteLead">
                  <div className="checkinNoteTitleRow">
                    <InfoTip label="How this note is used">
                      If AI is enabled in Profile for your optional note, Attune can use it to personalize your options and make today&apos;s board more relevant.
                    </InfoTip>
                    <span className="checkinNoteTitle">Optional note</span>
                  </div>
                  {!isNoteExpanded && trimmedNote ? <span className="checkinNoteSummary">{notePreview}</span> : null}
                </div>

                <button
                  type="button"
                  className="checkinNoteToggleBtn"
                  aria-label={isNoteExpanded ? "Collapse optional note" : "Expand optional note"}
                  aria-expanded={isNoteExpanded}
                  aria-controls="checkinNotePanel"
                  onClick={toggleNote}
                >
                  <span className="checkinNoteMeta">
                    {showNoteCount ? <span className="charCount">{note.length}/200</span> : null}
                    <span className={"checkinNoteChevron" + (isNoteExpanded ? " open" : "")} aria-hidden="true"></span>
                  </span>
                </button>
              </div>

              {isNoteExpanded ? (
                <div id="checkinNotePanel" className="checkinNotePanel">
                  <textarea
                    id="checkinNote"
                    className="noteInput"
                    ref={noteRef}
                    value={note}
                    maxLength={200}
                    rows={3}
                    placeholder="Anything else you would like Attune to know about today?"
                    onChange={(e) => actions.setCheckin({ note: e.target.value.slice(0, 200) })}
                    onInput={autosizeNote}
                    aria-label="Optional note"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="checkinBottom">
        {checkedInToday ? <div className="footerNote" style={{ marginTop: 12 }}>Saved for today.</div> : null}
      </div>
    </div>
  );
}
