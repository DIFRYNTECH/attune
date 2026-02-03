import { useEffect, useRef, useState } from "react";

import { todayKey } from "../lib/storage";
import { computeWeekArchetype, explainWeekArchetype, prettyLevel, weekArchetypeCopy } from "../lib/attuneEngine";

function dateKeyDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return todayKey(d);
}

function buildWeekRecords(state) {
  const history = state.history || [];
  const today = todayKey();

  // Oldest → newest
  const keys = Array.from({ length: 7 }, (_, i) => dateKeyDaysAgo(6 - i));

  return keys.map((date) => {
    const fromHistory = history.find((r) => r.date === date);
    const base = {
      date,
      checkedIn: false,
      level: null,
      tasksAdded: 0,
      tasksDone: 0,
    };

    const merged = fromHistory ? { ...base, ...fromHistory } : base;

    // Prefer live state for today.
    if (date === today) {
      return {
        ...merged,
        checkedIn: !!state.checkedInToday,
        level: state.level,
        tasksAdded: state.myDay?.length || 0,
        tasksDone: state.myDay?.filter((t) => t.done).length || 0,
      };
    }

    return merged;
  });
}

function computeMomentum(weekRecords) {
  const daysPresent = weekRecords.filter((d) => d.checkedIn).length;
  const tasksDone = weekRecords.reduce((sum, d) => sum + (d.tasksDone || 0), 0);

  // Gentle: showing up matters most; tasks add extra motivation.
  const presenceScore = daysPresent * 12; // max 84
  const taskScore = Math.min(tasksDone * 6, 36); // cap so it can't feel punitive
  const score = Math.min(100, presenceScore + taskScore);

  let label = "Quiet";
  if (score >= 80) label = "Strong";
  else if (score >= 55) label = "Steady";
  else if (score >= 30) label = "Building";
  else if (score >= 10) label = "Starting";

  return { score, label, daysPresent, tasksDone };
}

const MOMENTUM_LEVELS = [
  {
    label: "Quiet",
    range: "0–9",
    desc: "A quieter week. Rest counts, and you can start small anytime.",
  },
  {
    label: "Starting",
    range: "10–29",
    desc: "Some momentum. A few check-ins or one small finish can shift this.",
  },
  {
    label: "Building",
    range: "30–54",
    desc: "You’re building a rhythm. Consistency is forming.",
  },
  {
    label: "Steady",
    range: "55–79",
    desc: "A steady pattern. You’re showing up in a repeatable way.",
  },
  {
    label: "Strong",
    range: "80–100",
    desc: "A strong signal of consistency. Keep it kind—no need to maintain this every week.",
  },
];

const WEEK_TYPES = ["Recovering Week", "Resting Week", "Gentle Week", "Steady Week", "Capable Week", "Brave Week"];

function countChars(text) {
  return typeof text === "string" ? text.length : 0;
}

function limitChars(text, maxChars) {
  const input = typeof text === "string" ? text : "";
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

export default function Weekly({ state, actions }) {
  const [showMomentumInfo, setShowMomentumInfo] = useState(false);
  const [showWeekTypeInfo, setShowWeekTypeInfo] = useState(false);
  const momentumCloseBtnRef = useRef(null);
  const weekTypeCloseBtnRef = useRef(null);
  const noteRef = useRef(null);

  const weekRecords = buildWeekRecords(state);
  const archetype = computeWeekArchetype(weekRecords);
  const copy = weekArchetypeCopy(archetype);
  const why = explainWeekArchetype(weekRecords);

  const { score, label, daysPresent, tasksDone } = computeMomentum(weekRecords);

  const weekId = `${weekRecords[0]?.date || ""}_${weekRecords[weekRecords.length - 1]?.date || ""}`;
  const note = state.weeklyNotes?.[weekId] || "";
  const NOTE_CHAR_LIMIT = 500;
  const noteChars = countChars(note);

  useEffect(() => {
    if (!showMomentumInfo && !showWeekTypeInfo) return;

    if (showWeekTypeInfo) weekTypeCloseBtnRef.current?.focus?.();
    else momentumCloseBtnRef.current?.focus?.();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setShowMomentumInfo(false);
        setShowWeekTypeInfo(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMomentumInfo, showWeekTypeInfo]);

  const levelCounts = weekRecords.reduce(
    (acc, d) => {
      if (d.checkedIn && d.level && acc[d.level] !== undefined) acc[d.level]++;
      return acc;
    },
    { rest: 0, gentle: 0, light: 0, steady: 0, capable: 0, brave: 0 },
  );

  return (
    <div className="card weeklyCard">
      <h2>📅 Weekly</h2>
      <div className="sub">A gentle look back, let's check your progress without pressure.</div>

      <div className="result" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="resultTitle">Momentum</div>
          <button
            type="button"
            onClick={() => setShowMomentumInfo(true)}
            aria-label="What does Momentum mean?"
            title="What does Momentum mean?"
            style={{
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,.7)",
              color: "var(--muted)",
              width: 26,
              height: 26,
              borderRadius: 999,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
          >
            i
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "var(--ink)" }}>{label}</div>
          <div className="footerNote" style={{ marginTop: 0 }}>
            Signal {score}/100
          </div>
        </div>

        <div className="miniPills" aria-label="Momentum details">
          <span className="miniPill">📅 {daysPresent}/7 days present</span>
          <span className="miniPill">
            ✅ {tasksDone} {tasksDone === 1 ? "activity completed" : "activities completed"}
          </span>
        </div>

        <div className="meter" aria-label="Weekly momentum">
          <div className="meterFill" style={{ width: `${score}%` }} />
        </div>

        <div className="footerNote">
          This isn’t a grade, it’s a consistency signal: showing up matters most, plus a small boost for finishing activities.
        </div>
      </div>

      {showMomentumInfo && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Momentum explanation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowMomentumInfo(false);
          }}
        >
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">About Momentum</div>
            <div className="modalBody">
              Momentum is a gentle signal based on your last 7 days: showing up matters most, with a small boost for finishing
              activities.
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {MOMENTUM_LEVELS.map((item) => (
                <div key={item.label} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
                  <b style={{ color: "var(--ink)" }}>{item.label}</b> <span>({item.range})</span>: {item.desc}
                </div>
              ))}
            </div>

            <div className="modalActions">
              <button
                ref={momentumCloseBtnRef}
                type="button"
                className="btn"
                onClick={() => setShowMomentumInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="result" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="resultTitle">Week type</div>
          <button
            type="button"
            onClick={() => setShowWeekTypeInfo(true)}
            aria-label="What does Week type mean?"
            title="What does Week type mean?"
            style={{
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,.7)",
              color: "var(--muted)",
              width: 26,
              height: 26,
              borderRadius: 999,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
          >
            i
          </button>
        </div>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>{archetype}</div>
        <div className="footerNote" style={{ marginTop: 0, marginBottom: 8 }}>
          Why this week type: {why}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>{copy}</div>
      </div>

      {showWeekTypeInfo && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Week type explanation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWeekTypeInfo(false);
          }}
        >
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">About week type</div>
            <div className="modalBody">
              Week type is a gentle summary of your last 7 days, based on check-ins and the pace you chose. The “Why this week
              type” line explains what tipped yours.
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {WEEK_TYPES.map((type) => (
                <div key={type} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
                  <b style={{ color: "var(--ink)" }}>{type}</b>: {weekArchetypeCopy(type)}
                </div>
              ))}
            </div>

            <div className="modalActions">
              <button
                ref={weekTypeCloseBtnRef}
                type="button"
                className="btn"
                onClick={() => setShowWeekTypeInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="result" style={{ marginBottom: 12 }}>
        <div className="resultTitle">Paces you chose</div>
        <div className="miniPills" aria-label="Pace counts">
          <span className="miniPill">🫧 Rest: {levelCounts.rest}</span>
          <span className="miniPill">🌿 Gentle: {levelCounts.gentle}</span>
          <span className="miniPill">✨ Light: {levelCounts.light}</span>
          <span className="miniPill">🌤️ Steady: {levelCounts.steady}</span>
          <span className="miniPill">🌊 Capable: {levelCounts.capable}</span>
          <span className="miniPill">🔥 Brave: {levelCounts.brave}</span>
        </div>
        <div className="footerNote" style={{ marginTop: 8 }}>
          Today’s pace: <b>{prettyLevel(state.level)}</b>
        </div>
      </div>

      <div className="result weeklyNoteResult" aria-label="Weekly note">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div className="resultTitle">Weekly note</div>
          {noteChars > 420 ? (
            <div className="footerNote" style={{ marginTop: 0 }} aria-label="Weekly note limit">
              {noteChars}/{NOTE_CHAR_LIMIT}
            </div>
          ) : null}
        </div>
        <div className="weeklyNoteBody">
          <div className="weeklyNoteHelp">
            A few words about how this week felt. Saved on this device.
          </div>
          <textarea
            className="weeklyNoteInput"
            value={note}
            maxLength={NOTE_CHAR_LIMIT}
            rows={4}
            placeholder="This week felt…"
            onChange={(e) => actions?.setWeeklyNote?.(weekId, limitChars(e.target.value, NOTE_CHAR_LIMIT))}
            onFocus={() => {
              window.requestAnimationFrame(() => {
                noteRef.current?.scrollIntoView?.({ block: "nearest" });
              });
            }}
            ref={noteRef}
            aria-label="Weekly note"
          />
        </div>
      </div>
    </div>
  );
}
