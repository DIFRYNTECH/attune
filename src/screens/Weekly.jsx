import { useEffect, useRef, useState } from "react";

import { todayKey } from "../lib/storage";
import { computeWeekArchetype, explainWeekArchetype, prettyLevel, weekArchetypeCopy } from "../lib/attuneEngine";
import { computeMomentum, momentumLabelToMeterPercent } from "../lib/momentum";
import { buildWeekKeysMondayToSundayFromStart, buildWeekRecordsFromState, findSimilarWeeks, upsertWeeklySummary } from "../lib/weeklyHistory";
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

function formatDateShort(key) {
  const dt = dateFromKey(key);
  if (!dt) return "";
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatWeekdayShort(key) {
  const dt = dateFromKey(key);
  if (!dt) return "";
  return dt.toLocaleDateString("en-GB", { weekday: "short" });
}

function momentumLabelToRange(label) {
  const hit = MOMENTUM_LEVELS.find((l) => l.label === label);
  const r = typeof hit?.range === "string" ? hit.range : "";
  const m = r.match(/(\d+)\D+(\d+)/);
  if (!m) return { min: 0, max: 100 };
  const min = Math.max(0, Math.min(100, Number(m[1]) || 0));
  const max = Math.max(0, Math.min(100, Number(m[2]) || 0));
  if (max <= min) return { min: 0, max: 100 };
  return { min, max };
}

function patternCategoryLabel(category) {
  const c = typeof category === "string" ? category : "";
  switch (c) {
    case "pacing":
      return "Pace pattern";
    case "schedule":
      return "Schedule";
    case "followthrough":
      return "Follow-through";
    case "rhythm":
      return "Rhythm";
    case "consistency":
      return "Consistency";
    case "trend":
      return "Trend";
    default:
      return "Insight";
  }
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
    desc: "A strong signal of consistency. Keep it kind - no need to maintain this every week.",
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
  const [showWeekTypeWhy, setShowWeekTypeWhy] = useState(false);
  const [showWeekDetails, setShowWeekDetails] = useState(false);
  const [weekDetailsStart, setWeekDetailsStart] = useState(null);
  const [showWeekActivities, setShowWeekActivities] = useState(false);
  const [weekActivitiesStart, setWeekActivitiesStart] = useState(null);
  const momentumCloseBtnRef = useRef(null);
  const weekTypeCloseBtnRef = useRef(null);
  const weekDetailsCloseBtnRef = useRef(null);
  const weekActivitiesCloseBtnRef = useRef(null);
  const noteRef = useRef(null);

  const weekRecords = buildWeekRecords(state);
  const archetype = computeWeekArchetype(weekRecords);
  const copy = weekArchetypeCopy(archetype);
  const why = explainWeekArchetype(weekRecords);

  const { score, label, daysPresent, tasksDone } = computeMomentum(weekRecords);
  const canExactMomentum = !!state?.entitlements?.momentumExact;
  const meterPercent = canExactMomentum ? score : momentumLabelToMeterPercent(label);
  const meterRange = !canExactMomentum ? momentumLabelToRange(label) : null;
  const meterRangeText = !canExactMomentum
    ? MOMENTUM_LEVELS.find((l) => l.label === label)?.range || ""
    : "";

  const isPlus = !!state?.entitlements?.isPlus;

  const canMultiWeek = !!state?.entitlements?.multiWeekHistory;
  const [weeksToShow, setWeeksToShow] = useState(4);
  const [selectedPastWeekStart, setSelectedPastWeekStart] = useState(null);

  const [isMobile, setIsMobile] = useState(false);
  const [showAllPatterns, setShowAllPatterns] = useState(false);

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
    if (!showMomentumInfo && !showWeekTypeInfo && !showWeekDetails && !showWeekActivities) return;

    if (showWeekActivities) weekActivitiesCloseBtnRef.current?.focus?.();
    else if (showWeekDetails) weekDetailsCloseBtnRef.current?.focus?.();
    else if (showWeekTypeInfo) weekTypeCloseBtnRef.current?.focus?.();
    else momentumCloseBtnRef.current?.focus?.();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setShowMomentumInfo(false);
        setShowWeekTypeInfo(false);
        setShowWeekDetails(false);
        setShowWeekActivities(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMomentumInfo, showWeekTypeInfo, showWeekDetails, showWeekActivities]);

  const weekDetailsRecords = (() => {
    if (!showWeekDetails) return [];
    if (typeof weekDetailsStart !== "string" || !weekDetailsStart) return [];
    return buildWeekRecordsFromState(state, weekDetailsStart);
  })();

  const weekDetailsKeys = (() => {
    if (!showWeekDetails) return [];
    if (typeof weekDetailsStart !== "string" || !weekDetailsStart) return [];
    return buildWeekKeysMondayToSundayFromStart(weekDetailsStart);
  })();

  const weekDetailsEnd = weekDetailsKeys.length ? weekDetailsKeys[weekDetailsKeys.length - 1] : null;

  const weekActivitiesKeys = (() => {
    if (!showWeekActivities) return [];
    if (typeof weekActivitiesStart !== "string" || !weekActivitiesStart) return [];
    return buildWeekKeysMondayToSundayFromStart(weekActivitiesStart);
  })();

  const weekActivitiesEnd = weekActivitiesKeys.length ? weekActivitiesKeys[weekActivitiesKeys.length - 1] : null;

  const weekActivitiesByDay = (() => {
    if (!showWeekActivities) return [];
    if (!weekActivitiesKeys.length) return [];

    const eventsByDay = state?.events && typeof state.events === "object" && !Array.isArray(state.events) ? state.events : {};
    return weekActivitiesKeys.map((dayKey) => {
      const list = Array.isArray(eventsByDay[dayKey]) ? eventsByDay[dayKey] : [];
      const completed = list
        .filter((e) => e && typeof e === "object" && e.type === "activityCompleted")
        .map((e) => ({
          id: typeof e.id === "string" ? e.id : `${dayKey}_${String(e.ts || "")}`,
          text: typeof e.text === "string" ? e.text : "",
          pace: typeof e.pace === "string" ? e.pace : "",
        }))
        .filter((x) => x.text.trim().length > 0);
      return { dayKey, completed };
    });
  })();

  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia("(max-width: 520px)") : null;
    if (!mq) return;
    setIsMobile(mq.matches);

    function onChange(e) {
      setIsMobile(e.matches);
    }

    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);

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
  const similar = canMultiWeek
    ? [...findSimilarWeeks(currentWeekSummary, priorSummaries, { max: 2 })].sort((a, b) =>
        String(b.weekStart).localeCompare(String(a.weekStart)),
      )
    : [];

  const stripSummaries = (() => {
    if (!shownSummaries.length) return [];
    const current = shownSummaries.find((w) => w.weekStart === weekRange.startKey) || currentWeekSummary;
    const rest = shownSummaries.filter((w) => w.weekStart !== weekRange.startKey);
    return [current, ...rest];
  })();

  function ensurePastWeekVisible(weekStart) {
    if (!weekStart) return;
    const exists = stripSummaries.some((w) => w.weekStart === weekStart);
    if (!exists) setWeeksToShow(12);
    setSelectedPastWeekStart(weekStart);
  }

  const activePastWeekStart = (() => {
    if (!stripSummaries.length) return null;
    const wanted = selectedPastWeekStart;
    const exists = wanted && stripSummaries.some((w) => w.weekStart === wanted);
    return exists ? wanted : stripSummaries[0].weekStart;
  })();

  const activePastSummary = activePastWeekStart
    ? stripSummaries.find((w) => w.weekStart === activePastWeekStart) || null
    : null;

  useEffect(() => {
    if (!canMultiWeek) return;
    if (!stripSummaries.length) return;
    const wanted = selectedPastWeekStart;
    const exists = wanted && stripSummaries.some((w) => w.weekStart === wanted);
    if (!exists) setSelectedPastWeekStart(stripSummaries[0].weekStart);
  }, [canMultiWeek, stripSummaries, selectedPastWeekStart]);

  return (
    <div className="card weeklyCard">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <InfoTip label="Week range">
          This week runs Monday to Sunday.
          <div style={{ marginTop: 8, fontWeight: 800, color: "var(--ink)" }}>
            {formatDateLong(weekRange.startKey)} to {formatDateLong(weekRange.endKey)}
          </div>
        </InfoTip>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>Weekly</h2>
          <div className="weeklyRangeTiny">
            This week: {formatDateShort(weekRange.startKey)} to {formatDateShort(weekRange.endKey)}
          </div>
        </div>
      </div>

      <div className="sub" style={{ marginTop: 2 }}>
        A low-pressure look back.
      </div>

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
              Score {score}/100
            </div>
          ) : (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => actions?.openPaywall?.("momentumExact", "weekly")}
              aria-label="Unlock exact Momentum score with Attune Plus"
              title="Plus feature"
              style={{ marginTop: 0 }}
            >
              🔒 Try Plus
            </button>
          )}
        </div>

        <div className="miniPills" aria-label="Momentum details">
          <button
            type="button"
            className="miniPill miniPillBtn"
            onClick={() => {
              setWeekDetailsStart(weekRange.startKey);
              setShowWeekDetails(true);
            }}
            aria-label="Show which days you were present this week"
          >
            📅 {daysPresent}/7 days present
          </button>
          <button
            type="button"
            className="miniPill miniPillBtn"
            onClick={() => {
              setWeekActivitiesStart(weekRange.startKey);
              setShowWeekActivities(true);
            }}
            aria-label="Show how many activities you completed each day this week"
          >
            ✅ {tasksDone} {tasksDone === 1 ? "activity completed" : "activities completed"}
          </button>
        </div>

        <div className="meter" aria-label="Weekly momentum">
          {canExactMomentum ? (
            <div className="meterFill" style={{ width: `${meterPercent}%` }} />
          ) : (
            <div
              className="meterBand"
              style={{
                left: `${meterRange?.min ?? 0}%`,
                width: `${Math.max(1, (meterRange?.max ?? 100) - (meterRange?.min ?? 0))}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="footerNote">
          Not a grade. This score is based on showing up, with a small boost for finishing activities.
          {!canExactMomentum && meterRangeText ? (
            <div style={{ marginTop: 6 }}>
              <b style={{ color: "var(--ink)" }}>Estimated range:</b> {meterRangeText}/100. Unlock Plus for the exact score.
            </div>
          ) : null}
        </div>
      </div>

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
        <div style={{ marginTop: 0, marginBottom: 8 }}>
          <button
            type="button"
            className="linkBtn"
            onClick={() => setShowWeekTypeWhy((v) => !v)}
            aria-expanded={showWeekTypeWhy}
            aria-controls="weekTypeWhy"
          >
            {showWeekTypeWhy ? "Hide why" : "Why?"}
          </button>
          {showWeekTypeWhy ? (
            <div id="weekTypeWhy" className="footerNote" style={{ marginTop: 6 }}>
              {why}
            </div>
          ) : null}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>{copy}</div>
      </div>

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

      {!isPlus && (
        <div className="result" aria-label="Attune Plus (teaser)">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div className="resultTitle">Attune Plus</div>
            <InfoTip label="What does Plus unlock?">
              Unlock patterns and a multi-week view. Everything stays local to this device.
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
                  Low-pressure callouts based on your history, only when there’s enough data.
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
                <InfoTip label="About Past weeks">See 4–12 weeks at a glance, with low-pressure comparisons.</InfoTip>
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
            <InfoTip label="About Patterns">A few observations from your recent history.</InfoTip>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {(showAllPatterns || !isMobile ? patternCallouts : patternCallouts.slice(0, 2)).map((c) => (
              <div key={c.id} className="weekInsight">
                <div className="weekInsightTag">{patternCategoryLabel(c.category)}</div>
                <div>{c.text}</div>
              </div>
            ))}
          </div>
          {isMobile && patternCallouts.length > 2 ? (
            <div className="weekInsightActions">
              <button type="button" className="linkBtn" onClick={() => setShowAllPatterns((v) => !v)}>
                {showAllPatterns ? "Show less" : `Show ${patternCallouts.length - 2} more`}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {canMultiWeek && (
        <div className="result">
          <div className="pastWeeksSticky">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <div className="resultTitle" style={{ margin: 0 }}>
                  Past weeks
                </div>
                <InfoTip label="About Past weeks">
                  See 4–12 weeks at a glance, with low-pressure comparisons. This list is saved locally on this device.
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
                <b style={{ color: "var(--ink)" }}>Similar:</b>{" "}
                {similar.slice(0, 2).map((s, idx) => (
                  <span key={s.weekStart}>
                    <button
                      type="button"
                      className="linkBtn"
                      style={{ fontSize: 12, fontWeight: 900 }}
                      onClick={() => ensurePastWeekVisible(s.weekStart)}
                    >
                      {formatDateLong(s.weekStart)}
                    </button>
                    {idx === Math.min(1, similar.length - 1) ? "" : ", "}
                  </span>
                ))}
              </div>
            ) : (
              <div className="footerNote" style={{ marginTop: 8 }}>
                Add a little more history and we’ll start making low-pressure comparisons.
              </div>
            )}

            {stripSummaries.length > 0 ? (
              <div className="weekStrip" role="list" aria-label="Past weeks (scroll left and right)">
                {stripSummaries.map((w) => {
                  const isActive = w.weekStart === activePastWeekStart;
                  const isCurrent = w.weekStart === weekRange.startKey;
                  const meter = Math.max(0, Math.min(100, Number(w.momentum) || 0));
                  return (
                    <button
                      key={w.weekStart}
                      type="button"
                      className={`weekStripItem${isActive ? " active" : ""}${isCurrent ? " current" : ""}`}
                      onClick={() => setSelectedPastWeekStart(w.weekStart)}
                      aria-pressed={isActive}
                      aria-label={`Week of ${formatDateLong(w.weekStart)}. Momentum ${w.momentum} out of 100.`}
                    >
                      <div className="weekStripTop">
                        <div className="weekStripLabel">
                          {isCurrent ? "This week" : formatDateShort(w.weekStart)}
                          {isCurrent ? <div className="weekStripSub">{formatDateShort(w.weekStart)}</div> : null}
                        </div>
                        <div className="weekStripScore">{w.momentum}</div>
                      </div>
                      <div className="weekStripBar" aria-hidden="true">
                        <div className="weekStripBarFill" style={{ width: `${meter}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="footerNote" style={{ marginTop: 8 }}>
            Tap a week for details.
          </div>

          {activePastSummary ? (
            <div className="weekSummaryCard" style={{ marginTop: 10 }} aria-label="Selected week details">
              <div className="weekSummaryHeader">
                <div className="weekSummaryTitle">{formatDateLong(activePastSummary.weekStart)}</div>
                <div className="footerNote" style={{ marginTop: 0 }}>
                  Momentum {activePastSummary.momentum}/100
                </div>
              </div>

              <div className="weekSummaryMeta">
                <span>Type: {activePastSummary.weekType}</span>
                {activePastSummary.avgPace ? <span>Avg pace: {prettyLevel(activePastSummary.avgPace)}</span> : null}
              </div>

              <div className="miniPills" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="miniPill miniPillBtn"
                  onClick={() => {
                    setWeekDetailsStart(activePastSummary.weekStart);
                    setShowWeekDetails(true);
                  }}
                  aria-label="Show which days you were present during this selected week"
                >
                  📅 {activePastSummary.presence}/7 present
                </button>
                <button
                  type="button"
                  className="miniPill miniPillBtn"
                  onClick={() => {
                    setWeekActivitiesStart(activePastSummary.weekStart);
                    setShowWeekActivities(true);
                  }}
                  aria-label="Show how many activities you completed each day during this selected week"
                >
                  ✅ {activePastSummary.completions} completed
                </button>
              </div>
            </div>
          ) : null}

        </div>
      )}

      {showWeekDetails && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Week details"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWeekDetails(false);
          }}
        >
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Week details</div>
            <div className="modalBody">
              {weekDetailsStart && weekDetailsEnd
                ? `${formatDateLong(weekDetailsStart)} to ${formatDateLong(weekDetailsEnd)}`
                : ""}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {weekDetailsRecords.map((d) => (
                <div
                  key={d.date}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "72px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    border: "1px solid rgba(231,233,242,.90)",
                    borderRadius: 14,
                    background: "rgba(255,255,255,.85)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(43,47,58,.62)" }}>
                    {formatWeekdayShort(d.date)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "var(--ink)" }}>{formatDateShort(d.date)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {d.checkedIn ? "Present" : "Not present"} · {Number(d.tasksDone) || 0} completed
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(43,47,58,.62)" }}>
                    {d.checkedIn ? "✓" : "–"}
                  </div>
                </div>
              ))}
            </div>

            <div className="modalActions">
              <button
                ref={weekDetailsCloseBtnRef}
                type="button"
                className="btn"
                onClick={() => setShowWeekDetails(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showWeekActivities && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Week activities"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWeekActivities(false);
          }}
        >
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Completed activities</div>
            <div className="modalBody">
              {weekActivitiesStart && weekActivitiesEnd
                ? `${formatDateLong(weekActivitiesStart)} to ${formatDateLong(weekActivitiesEnd)}`
                : ""}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {weekActivitiesByDay.every((d) => d.completed.length === 0) ? (
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.35 }}>
                  No completed activities recorded for this week.
                  <div style={{ marginTop: 6 }}>
                    Tip: activity names are saved as you complete them, and recent history is kept for about 90 days.
                  </div>
                </div>
              ) : (
                weekActivitiesByDay.map((d) => (
                  <div
                    key={d.dayKey}
                    style={{
                      border: "1px solid rgba(231,233,242,.90)",
                      borderRadius: 14,
                      background: "rgba(255,255,255,.85)",
                      padding: "10px 10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(43,47,58,.62)" }}>
                        {formatWeekdayShort(d.dayKey)}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(43,47,58,.62)" }}>{formatDateShort(d.dayKey)}</div>
                    </div>

                    {d.completed.length ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {d.completed.map((a) => (
                          <div key={a.id} style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>
                            ✓ {a.text}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>No completions</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="modalActions">
              <button
                ref={weekActivitiesCloseBtnRef}
                type="button"
                className="btn"
                onClick={() => setShowWeekActivities(false)}
              >
                Close
              </button>
            </div>
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
              Momentum is a helpful score based on your last 7 days: showing up matters most, with a small boost for finishing
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
              Week type is a quick summary of your last 7 days, based on check-ins and the pace you chose. The “Why this week
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
