import { useCallback, useEffect, useRef } from "react";
import { LEVELS } from "../data/levels";

const MOOD_WORDS = [
  { label: "Tired", emoji: "😴" },
  { label: "Anxious", emoji: "😰" },
  { label: "Flat", emoji: "😐" },
  { label: "Tender", emoji: "🫧" },
  { label: "Irritable", emoji: "😣" },
  { label: "Okay", emoji: "🙂" },
  { label: "Steady", emoji: "🌿" },
  { label: "Hopeful", emoji: "🌤️" },
  { label: "Worn out", emoji: "🪫" },
  { label: "Restless", emoji: "⚡" },
];

function moodCategoryFromWords(words) {
  if (!words?.length) return null;

  const scoreMap = {
    "Worn out": -2,
    Tired: -1,
    Flat: -1,
    Tender: -1,
    Anxious: -1,
    Irritable: -1,
    Restless: -1,
    Okay: 0,
    Steady: 1,
    Hopeful: 2,
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
  const isPlus = !!state?.entitlements?.isPlus;
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

  const selectedMoodWords =
    checkin.moodWords?.length
      ? checkin.moodWords
      : checkin.mood === "okay"
        ? ["Okay"]
        : [];

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
                aria-label={w.label}
                title={w.label}
                aria-pressed={selectedMoodWords.includes(w.label)}
                onClick={() => toggleMoodWord(w.label)}
              >
                <span aria-hidden="true">{w.emoji}</span>
              </button>
            ))}
          </div>
          <div className="footerNote" style={{ marginTop: 8 }}>
            <b style={{ color: "var(--ink)" }}>Selected:</b>{" "}
            {selectedMoodWords.length
              ? selectedMoodWords
                  .map((label) => {
                    const found = MOOD_WORDS.find((x) => x.label === label);
                    return found ? `${found.emoji} ${label}` : label;
                  })
                  .join(" · ")
              : "-"}
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
              {l.emoji} {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="hint" style={{ marginTop: 12 }}>
        Used to personalize your options and keep suggestions relevant. If AI is enabled, your optional note may be used to help build today’s board. You can change this anytime.
      </div>

      <div
        className="settingRow"
        style={{ marginTop: 10 }}
        onClick={() => actions.setPlan?.(isPlus ? "free" : "plus")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if(e.key === "Enter" || e.key === " "){
            e.preventDefault();
            actions.setPlan?.(isPlus ? "free" : "plus");
          }
        }}
        aria-label="Attune Plus (on this device)"
      >
        <div className="settingRowText">
          <div className="settingRowTitle">Attune Plus (on this device)</div>
          <div className="settingRowDesc">Saved locally on this phone.</div>
        </div>
        <input
          type="checkbox"
          className="switchInput"
          checked={isPlus}
          onChange={(e) => actions.setPlan?.(e.target.checked ? "plus" : "free")}
          onClick={(e) => e.stopPropagation()}
          aria-label="Attune Plus (on this device)"
        />
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
