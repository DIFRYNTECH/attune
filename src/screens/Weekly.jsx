import { useEffect, useRef, useState } from "react";

import { todayKey } from "../lib/storage";
import { computeWeekArchetype, explainWeekArchetype, prettyLevel, weekArchetypeCopy } from "../lib/attuneEngine";
import { computeMomentum, momentumLabelToMeterPercent } from "../lib/momentum";
import { findSimilarWeeks, upsertWeeklySummary } from "../lib/weeklyHistory";
import { generatePatternCallouts } from "../lib/patternCallouts";
import InfoTip from "../components/InfoTip";

function startOfWeekMonday(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - daysSinceMonday);
  return dt;
}

function buildWeekKeysMondayToSunday(baseDate = new Date()) {
  const start = startOfWeekMonday(baseDate);
  const keys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return todayKey(d);
  });
  return { keys, startKey: keys[0], endKey: keys[keys.length - 1] };
}

function dateFromKey(key) {
  if (typeof key !== "string") return null;
  const m = key.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d);
}

function formatDateLong(key) {
  const dt = dateFromKey(key);
  if (!dt) return "";
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildWeekRecords(state) {
  const history = state.history || [];
  const today = todayKey();
  const { keys } = buildWeekKeysMondayToSunday(new Date());

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
  const [showWeekRangeInfo, setShowWeekRangeInfo] = useState(false);
  const momentumCloseBtnRef = useRef(null);
  const weekTypeCloseBtnRef = useRef(null);
  const weekRangeCloseBtnRef = useRef(null);
  const noteRef = useRef(null);

  const weekRecords = buildWeekRecords(state);
  const archetype = computeWeekArchetype(weekRecords);
  const copy = weekArchetypeCopy(archetype);
  const why = explainWeekArchetype(weekRecords);

  const { score, label, daysPresent, tasksDone } = computeMomentum(weekRecords);
  const canExactMomentum = !!state?.entitlements?.momentumExact;
  const meterPercent = canExactMomentum ? score : momentumLabelToMeterPercent(label);

  const isPlus = !!state?.entitlements?.isPlus;

  const canMultiWeek = !!state?.entitlements?.multiWeekHistory;
  const [weeksToShow, setWeeksToShow] = useState(4);

  const canPatternCallouts = !!state?.entitlements?.patternCallouts;
  const patternCallouts = canPatternCallouts
    ? generatePatternCallouts({ weeklySummaries: state.weeklySummaries, eventsByDay: state.events, nowMs: Date.now(), max: 3 })
    : [];

  const weekRange = buildWeekKeysMondayToSunday(new Date());
  const weekId = `${weekRange.startKey}_${weekRange.endKey}`;
  const note = state.weeklyNotes?.[weekId] || "";
  const NOTE_CHAR_LIMIT = 500;
  const noteChars = countChars(note);

  useEffect(() => {
    if (!showMomentumInfo && !showWeekTypeInfo && !showWeekRangeInfo) return;

    if (showWeekRangeInfo) weekRangeCloseBtnRef.current?.focus?.();
    else if (showWeekTypeInfo) weekTypeCloseBtnRef.current?.focus?.();
    else momentumCloseBtnRef.current?.focus?.();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setShowMomentumInfo(false);
        setShowWeekTypeInfo(false);
        setShowWeekRangeInfo(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMomentumInfo, showWeekTypeInfo, showWeekRangeInfo]);

  const levelCounts = weekRecords.reduce(
    (acc, d) => {
      if (d.checkedIn && d.level && acc[d.level] !== undefined) acc[d.level]++;
      return acc;
    },
    { rest: 0, gentle: 0, light: 0, steady: 0, capable: 0, brave: 0 },
  );

  const currentWeekSummary = {
    weekStart: weekRange.startKey,
    presence: daysPresent,
    completions: tasksDone,
    avgPace: (() => {
      const checked = weekRecords.filter((d) => d.checkedIn && typeof d.level === "string");
      if (!checked.length) return null;
      const order = ["rest", "gentle", "light", "steady", "capable", "brave"];
      const indices = checked.map((d) => order.indexOf(d.level)).filter((i) => i >= 0);
      if (!indices.length) return null;
      const avg = indices.reduce((a, b) => a + b, 0) / indices.length;
      const rounded = Math.max(0, Math.min(order.length - 1, Math.round(avg)));
      return order[rounded];
    })(),
    avgPaceIndex: (() => {
      const checked = weekRecords.filter((d) => d.checkedIn && typeof d.level === "string");
      if (!checked.length) return null;
      const order = ["rest", "gentle", "light", "steady", "capable", "brave"];
      const indices = checked.map((d) => order.indexOf(d.level)).filter((i) => i >= 0);
      if (!indices.length) return null;
      const avg = indices.reduce((a, b) => a + b, 0) / indices.length;
      const rounded = Math.max(0, Math.min(order.length - 1, Math.round(avg)));
      return rounded;
    })(),
    weekType: archetype,
    momentum: score,
  };

  // Keep stored snapshots fresh (Plus only). This is safe: upsert is no-op when unchanged.
  useEffect(() => {
    if (!canMultiWeek) return;
    actions?.upsertCurrentWeekSummary?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMultiWeek, weekId, daysPresent, tasksDone, score, archetype]);

  const mergedSummaries = (() => {
    const stored = Array.isArray(state.weeklySummaries) ? state.weeklySummaries : [];
    // Include current week summary even if not yet stored.
    return upsertWeeklySummary(stored, currentWeekSummary, 52);
  })();

  const summariesDesc = [...mergedSummaries].sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  const shownSummaries = canMultiWeek ? summariesDesc.slice(0, Math.max(4, Math.min(12, weeksToShow))) : [];
  const priorSummaries = summariesDesc.filter((s) => s.weekStart !== weekRange.startKey);
  const similar = canMultiWeek ? findSimilarWeeks(currentWeekSummary, priorSummaries, { max: 2 }) : [];

  return (
    <div className="card weeklyCard">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => setShowWeekRangeInfo(true)}
          aria-label="Which dates are included in this week?"
          title="Which dates are included in this week?"
          className="infoBtn"
          style={{ fontSize: 16, color: "var(--ink)", flex: "0 0 auto" }}
        >
          📅
        </button>
        <h2 style={{ margin: 0 }}>Weekly</h2>
      </div>

      <div className="sub">A gentle look back, without pressure.</div>

      {showWeekRangeInfo && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Week date range"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWeekRangeInfo(false);
          }}
        >
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">This week</div>
            <div className="modalBody">
              This week runs Monday to Sunday.
              <div style={{ marginTop: 8, fontWeight: 800, color: "var(--ink)" }}>
                {formatDateLong(weekRange.startKey)} to {formatDateLong(weekRange.endKey)}
              </div>
            </div>

            <div className="modalActions">
              <button
                ref={weekRangeCloseBtnRef}
                type="button"
                className="btn"
                onClick={() => setShowWeekRangeInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="result">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="resultTitle">Momentum</div>
          <button
            type="button"
            onClick={() => setShowMomentumInfo(true)}
            aria-label="What does Momentum mean?"
            title="What does Momentum mean?"
            className="infoBtn"
          >
            i
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "var(--ink)" }}>{label}</div>
          {canExactMomentum ? (
            <div className="footerNote" style={{ marginTop: 0 }}>
              Signal {score}/100
            </div>
          ) : (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => actions?.openPaywall?.("momentumExact", "weekly")}
              aria-label="Unlock exact Momentum signal with Attune Plus"
              title="Plus feature"
              style={{ marginTop: 0 }}
            >
              🔒 Try Plus
            </button>
          )}
        </div>

        <div className="miniPills" aria-label="Momentum details">
          <span className="miniPill">📅 {daysPresent}/7 days present</span>
          <span className="miniPill">
            ✅ {tasksDone} {tasksDone === 1 ? "activity completed" : "activities completed"}
          </span>
        </div>

        <div className="meter" aria-label="Weekly momentum">
          <div className="meterFill" style={{ width: `${meterPercent}%` }} />
        </div>

        <div className="footerNote">
          This isn’t a grade, it’s a gentle signal: showing up matters most, plus a small boost for finishing activities.
          {!canExactMomentum ? "" : ""}
        </div>
      </div>

      {!isPlus && (
        <div className="result" aria-label="Attune Plus (teaser)">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div className="resultTitle">Attune Plus</div>
            <InfoTip label="What does Plus unlock?">
              Unlock gentle patterns and a multi-week view. These stay local to this device.
            </InfoTip>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 10px",
                border: "1px solid rgba(231,233,242,.95)",
                background: "rgba(255,255,255,.85)",
                borderRadius: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "var(--ink)" }}>Patterns</div>
                <InfoTip label="About Patterns">
                  Gentle callouts based on your history, only when there’s enough data.
                </InfoTip>
              </div>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => actions?.openPaywall?.("patternCallouts", "weekly")}
                aria-label="Try Attune Plus to unlock pattern callouts"
              >
                🔒 Try Plus
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 10px",
                border: "1px solid rgba(231,233,242,.95)",
                background: "rgba(255,255,255,.85)",
                borderRadius: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "var(--ink)" }}>Past weeks</div>
                <InfoTip label="About Past weeks">See 4–12 weeks at a glance, with gentle comparisons.</InfoTip>
              </div>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => actions?.openPaywall?.("multiWeekHistory", "weekly")}
                aria-label="Try Attune Plus to unlock past weeks"
              >
                🔒 Try Plus
              </button>
            </div>
          </div>
        </div>
      )}

      {canPatternCallouts && patternCallouts.length > 0 && (
        <div className="result" aria-label="Patterns">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div className="resultTitle">Patterns</div>
            <InfoTip label="About Patterns">A few gentle observations from your recent history.</InfoTip>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {patternCallouts.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: "10px 10px",
                  border: "1px solid rgba(231,233,242,.95)",
                  background: "rgba(255,255,255,.85)",
                  borderRadius: 14,
                  fontSize: 13,
                  color: "var(--ink)",
                  lineHeight: 1.35,
                }}
              >
                {c.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {canMultiWeek && (
        <div className="result">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <div className="resultTitle" style={{ margin: 0 }}>
                Past weeks
              </div>
              <InfoTip label="About Past weeks">
                See 4–12 weeks at a glance, with gentle comparisons. This list is saved locally on this device.
              </InfoTip>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
              Show
              <select
                value={weeksToShow}
                onChange={(e) => setWeeksToShow(Number(e.target.value) || 4)}
                style={{ borderRadius: 10, border: "1px solid var(--line)", padding: "6px 8px", background: "white" }}
                aria-label="How many weeks to show"
              >
                {[4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              weeks
            </label>
          </div>

          {similar.length > 0 ? (
            <div className="footerNote" style={{ marginTop: 8 }}>
              {similar.slice(0, 2).map((s, idx) => (
                <div key={s.weekStart} style={{ marginTop: idx === 0 ? 0 : 6 }}>
                  This looks similar to the week of <b style={{ color: "var(--ink)" }}>{formatDateLong(s.weekStart)}</b>.
                </div>
              ))}
            </div>
          ) : (
            <div className="footerNote" style={{ marginTop: 8 }}>
              Add a little more history and we’ll start making gentle comparisons.
            </div>
          )}

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {shownSummaries.map((w) => (
              <div
                key={w.weekStart}
                style={{
                  padding: "10px 10px",
                  border: "1px solid rgba(231,233,242,.95)",
                  background: "rgba(255,255,255,.85)",
                  borderRadius: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, color: "var(--ink)" }}>{formatDateLong(w.weekStart)}</div>
                  <div className="footerNote" style={{ marginTop: 0 }}>
                    Signal {w.momentum}/100
                  </div>
                </div>
                <div className="miniPills" style={{ marginTop: 8 }}>
                  <span className="miniPill">📅 {w.presence}/7 present</span>
                  <span className="miniPill">✅ {w.completions} completed</span>
                  <span className="miniPill">🏷️ {w.weekType}</span>
                  {w.avgPace ? <span className="miniPill">🏁 avg pace: {prettyLevel(w.avgPace)}</span> : null}
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

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

      <div className="result">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="resultTitle">Week type</div>
          <button
            type="button"
            onClick={() => setShowWeekTypeInfo(true)}
            aria-label="What does Week type mean?"
            title="What does Week type mean?"
            className="infoBtn"
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

      <div className="result">
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
