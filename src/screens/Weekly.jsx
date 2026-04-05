import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { todayKey } from "../lib/storage";
import { computeWeekArchetype, prettyLevel } from "../lib/attuneEngine";
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

function formatUpdatedAt(updatedAtMs) {
  const ms = Number(updatedAtMs);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const dt = new Date(ms);
  const now = new Date();
  const isSameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  if (isSameDay) return "Updated today";
  return `Updated ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
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
    range: "0-9",
    desc: "A quieter week. Rest counts, and you can start small anytime.",
  },
  {
    label: "Starting",
    range: "10-29",
    desc: "Some momentum. A few check-ins or one small finish can shift this.",
  },
  {
    label: "Building",
    range: "30-54",
    desc: "You’re building a rhythm. Consistency is forming.",
  },
  {
    label: "Steady",
    range: "55-79",
    desc: "A steady pattern. You’re showing up in a repeatable way.",
  },
  {
    label: "Strong",
    range: "80-100",
    desc: "A strong signal of consistency. Keep it kind - no need to maintain this every week.",
  },
];

function countChars(text) {
  return typeof text === "string" ? text.length : 0;
}

function limitChars(text, maxChars) {
  const input = typeof text === "string" ? text : "";
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

function getDominantLevel(levelCounts) {
  const entries = Object.entries(levelCounts || {}).filter(([, count]) => Number(count) > 0);
  if (!entries.length) return "";
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return typeof entries[0]?.[0] === "string" ? entries[0][0] : "";
}

function buildWeeklyHeroSummary(label, daysPresent, tasksDone) {
  if (daysPresent <= 0) return "A quieter week so far. You can always come back gently.";
  if (tasksDone <= 0) return "Showing up is carrying this week. One small finish can still shift the feel of it.";

  switch (label) {
    case "Quiet":
      return "A softer week. Rest still counts, and there is room to begin again.";
    case "Starting":
      return "Something has started to move. A few returns are already shaping the week.";
    case "Building":
      return "A rhythm is forming. Small repeats are starting to hold together.";
    case "Steady":
      return "This week feels more repeatable. You are showing up in a way that can last.";
    case "Strong":
      return "This week held together with real consistency. Let that count without asking for more.";
    default:
      return "A low-pressure look at what this week has been asking of you.";
  }
}

function buildWeeklyPaceLine(avgPace, dominantLevel, dominantLevelCount) {
  const weeklyLevel = typeof avgPace === "string" && avgPace ? avgPace : dominantLevel;
  const toPlainLevel = (level) => {
    const formatted = prettyLevel(level);
    const firstSpace = typeof formatted === "string" ? formatted.indexOf(" ") : -1;
    return firstSpace > -1 ? formatted.slice(firstSpace + 1) : formatted;
  };

  if (weeklyLevel) {
    const levelName = toPlainLevel(weeklyLevel);
    if (dominantLevelCount > 1) return `${levelName} shaped most of the week across ${dominantLevelCount} check-ins.`;
    if (dominantLevelCount === 1) return `${levelName} shaped the week so far.`;
    return `${levelName} shaped most of the week.`;
  }
  return "Your weekly pace will start to take shape after a few check-ins.";
}

export default function Weekly({ state, actions }) {
  const [showMomentumInfo, setShowMomentumInfo] = useState(false);
  const [showWeekDetails, setShowWeekDetails] = useState(false);
  const [weekDetailsStart, setWeekDetailsStart] = useState(null);
  const [showWeekActivities, setShowWeekActivities] = useState(false);
  const [weekActivitiesStart, setWeekActivitiesStart] = useState(null);
  const momentumCloseBtnRef = useRef(null);
  const weekDetailsCloseBtnRef = useRef(null);
  const weekActivitiesCloseBtnRef = useRef(null);
  const noteRef = useRef(null);

  const weekRecords = buildWeekRecords(state);
  const archetype = computeWeekArchetype(weekRecords);

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

  const [showAllPatterns, setShowAllPatterns] = useState(false);

  const canPatternCallouts = !!state?.entitlements?.patternCallouts;
  const patternCallouts = canPatternCallouts
    ? generatePatternCallouts({ weeklySummaries: state.weeklySummaries, eventsByDay: state.events, nowMs: Date.now(), max: 3 })
    : [];

  const weekRange = buildWeekKeysMondayToSunday(new Date());
  const weekId = `${weekRange.startKey}_${weekRange.endKey}`;
  const NOTE_CHAR_LIMIT = 500;

  const savedWeekSummary = (Array.isArray(state.weeklySummaries) ? state.weeklySummaries : []).find(
    (w) => w?.weekStart === weekRange.startKey,
  );
  const savedNote = typeof savedWeekSummary?.weekNote === "string" ? savedWeekSummary.weekNote : "";
  const savedNoteUpdatedAt = Number(savedWeekSummary?.weekNoteUpdatedAt) || 0;

  const [draftNote, setDraftNote] = useState(savedNote);
  useEffect(() => {
    setDraftNote(savedNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekRange.startKey]);

  const isDirty = draftNote !== savedNote;
  const noteChars = countChars(draftNote);

  useEffect(() => {
    if (!showMomentumInfo && !showWeekDetails && !showWeekActivities) return;

    if (showWeekActivities) weekActivitiesCloseBtnRef.current?.focus?.();
    else if (showWeekDetails) weekDetailsCloseBtnRef.current?.focus?.();
    else momentumCloseBtnRef.current?.focus?.();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setShowMomentumInfo(false);
        setShowWeekDetails(false);
        setShowWeekActivities(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMomentumInfo, showWeekDetails, showWeekActivities]);

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

  const activePastNote = typeof activePastSummary?.weekNote === "string" ? activePastSummary.weekNote : "";
  const activePastIsCurrentWeek = !!activePastSummary?.weekStart && activePastSummary.weekStart === weekRange.startKey;
  const dominantLevel = getDominantLevel(levelCounts);
  const dominantLevelCount = dominantLevel ? Number(levelCounts?.[dominantLevel]) || 0 : 0;
  const heroSummary = buildWeeklyHeroSummary(label, daysPresent, tasksDone);
  const weeklyPaceLine = buildWeeklyPaceLine(currentWeekSummary.avgPace, dominantLevel, dominantLevelCount);
  const daysPresentText = daysPresent === 1 ? "day checked in" : "days checked in";
  const completedTasksText = tasksDone === 1 ? "task finished" : "tasks finished";
  const renderModal = (node) => (typeof document === "undefined" ? null : createPortal(node, document.body));
  const primaryPattern = canPatternCallouts && patternCallouts.length > 0 ? patternCallouts[0] : null;
  const remainingPatterns = primaryPattern ? patternCallouts.slice(1) : [];

  useEffect(() => {
    if (!canMultiWeek) return;
    if (!stripSummaries.length) return;
    const wanted = selectedPastWeekStart;
    const exists = wanted && stripSummaries.some((w) => w.weekStart === wanted);
    if (!exists) setSelectedPastWeekStart(stripSummaries[0].weekStart);
  }, [canMultiWeek, stripSummaries, selectedPastWeekStart]);

  return (
    <div className="card weeklyCard">
      <div className="weeklyHeader">
        <InfoTip label="Week range">
          This week runs Monday to Sunday.
          <div style={{ marginTop: 8, fontWeight: 800, color: "var(--ink)" }}>
            {formatDateLong(weekRange.startKey)} to {formatDateLong(weekRange.endKey)}
          </div>
        </InfoTip>
        <div className="weeklyHeaderCopy">
          <h2 className="weeklyHeading">Weekly</h2>
          <div className="weeklyRangeTiny">
            This week: {formatDateShort(weekRange.startKey)} to {formatDateShort(weekRange.endKey)}
          </div>
        </div>
      </div>

      <div className="sub weeklyIntro">
        A calmer digest of how the week is landing.
      </div>

      <div className="result weeklyDigestHero" aria-label="Weekly digest">
        <div className="weeklyDigestHeroTop">
          <div className="weeklyDigestHeroCopy">
            <div className="weeklyDigestHeroHead">
              <div className="weeklyDigestEyebrow">This week&apos;s shape</div>
              <button
                type="button"
                onClick={() => setShowMomentumInfo(true)}
                aria-label="What does Momentum mean?"
                title="What does Momentum mean?"
                className="infoBtn weeklyDigestInfoBtn"
              >
                i
              </button>
            </div>
            <div className="weeklyDigestTitleRow">
              <div className="weeklyDigestTitle">{label}</div>
              {canExactMomentum ? (
                <div className="weeklyDigestScore">Momentum {score}/100</div>
              ) : (
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => actions?.openPaywall?.("momentumExact", "weekly")}
                  aria-label="Unlock exact Momentum score with Attune Plus"
                  title="Plus feature"
                >
                  🔒 Exact score
                </button>
              )}
            </div>
            <div className="weeklyDigestLead">{heroSummary}</div>
          </div>
        </div>

        <div className="meter weeklyDigestMeter" aria-label="Weekly momentum">
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

        <div className="weeklyDigestMeta">
          Showing up matters most. Finishing activities adds a small lift.
          {!canExactMomentum && meterRangeText ? (
            <span>
              {" "}<b style={{ color: "var(--ink)" }}>Estimated range:</b> {meterRangeText}/100.
            </span>
          ) : null}
        </div>

        <div className="weeklyDigestStats" aria-label="Momentum details">
          <button
            type="button"
            className="weeklyDigestStat"
            onClick={() => {
              setWeekDetailsStart(weekRange.startKey);
              setShowWeekDetails(true);
            }}
            aria-label="Show which days you were present this week"
          >
            <span className="weeklyDigestStatHeader">
              <span className="weeklyDigestStatLabel">Presence</span>
              <span className="weeklyDigestStatCue" aria-hidden="true" />
            </span>
            <span className="weeklyDigestStatMain">
              <span className="weeklyDigestStatValue">
                {daysPresent}
                <span className="weeklyDigestStatUnit">/7</span>
              </span>
            </span>
            <span className="weeklyDigestStatText">{daysPresentText}</span>
          </button>
          <button
            type="button"
            className="weeklyDigestStat"
            onClick={() => {
              setWeekActivitiesStart(weekRange.startKey);
              setShowWeekActivities(true);
            }}
            aria-label="Show how many activities you completed each day this week"
          >
            <span className="weeklyDigestStatHeader">
              <span className="weeklyDigestStatLabel">Completions</span>
              <span className="weeklyDigestStatCue" aria-hidden="true" />
            </span>
            <span className="weeklyDigestStatMain">
              <span className="weeklyDigestStatValue">{tasksDone}</span>
            </span>
            <span className="weeklyDigestStatText">{completedTasksText}</span>
          </button>
        </div>

        <div className="weeklyDigestFooter">
          <div className="weeklyDigestPaceLine">{weeklyPaceLine}</div>
        </div>
      </div>

      {!isPlus && (
        <div className="result weeklyUpgradeCard" aria-label="Attune Plus (teaser)">
          <div className="weeklyUpgradeCopy">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <div className="resultTitle" style={{ margin: 0 }}>
                Attune Plus keeps this week in context
              </div>
              <InfoTip label="What does Plus unlock?">
                Unlock patterns and a multi-week view. Weekly insights live on this device first, and signed-in accounts can also sync weekly summaries.
              </InfoTip>
            </div>
            <div className="footerNote" style={{ marginTop: 6 }}>
              See gentle pattern callouts and a longer weekly archive without turning this screen into a dashboard.
            </div>
          </div>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => actions?.openPaywall?.("plus", "weekly")}
            aria-label="Try Attune Plus"
          >
            🔒 Try Plus
          </button>
        </div>
      )}

      {canPatternCallouts && primaryPattern && (
        <div className="result weeklyPatternSection" aria-label="Patterns">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div className="resultTitle">Pattern spotlight</div>
            <InfoTip label="About Patterns">A few observations from your recent history.</InfoTip>
          </div>

          <div className="weekInsight weekInsightPrimary" style={{ marginTop: 10 }}>
            <div className="weekInsightTag">{patternCategoryLabel(primaryPattern.category)}</div>
            <div>{primaryPattern.text}</div>
          </div>

          {showAllPatterns && remainingPatterns.length > 0 ? (
            <div className="weeklyPatternExtraList">
              {remainingPatterns.map((c) => (
                <div key={c.id} className="weekInsight weekInsightSecondary">
                  <div className="weekInsightTag">{patternCategoryLabel(c.category)}</div>
                  <div>{c.text}</div>
                </div>
              ))}
            </div>
          ) : null}

          {remainingPatterns.length > 0 ? (
            <div className="weekInsightActions">
              <button type="button" className="linkBtn" onClick={() => setShowAllPatterns((v) => !v)}>
                {showAllPatterns ? "Show fewer patterns" : `Show ${remainingPatterns.length} more pattern${remainingPatterns.length === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {canMultiWeek && (
        <div className="result weeklyArchiveCard">
          <div className="pastWeeksSticky">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <div className="resultTitle" style={{ margin: 0 }}>
                  Archive
                </div>
                <InfoTip label="About Past weeks">
                  See 4-12 weeks at a glance, with low-pressure comparisons. It lives on this device first, and signed-in accounts can also sync
                  weekly summaries.
                </InfoTip>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                Show
                <select
                  value={weeksToShow}
                  onChange={(e) => setWeeksToShow(Number(e.target.value) || 4)}
                  style={{ borderRadius: 10, border: "1px solid var(--line)", padding: "6px 8px", background: "var(--card)" }}
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

            <div className="footerNote weeklyArchiveHint" style={{ marginTop: 8 }}>
              {similar.length > 0 ? (
                <>
                  Closest to
                  {" "}
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
                    {idx === Math.min(1, similar.length - 1) ? "." : " and "}
                  </span>
                ))}
                </>
              ) : (
                "More history turns this into a gentler long-view."
              )}
            </div>

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

          {activePastSummary ? (
            <div className="weekSummaryCard weekSummaryCardQuiet" style={{ marginTop: 10 }} aria-label="Selected week details">
              <div className="weekSummaryHeader">
                <div className="weekSummaryTitle">{formatDateLong(activePastSummary.weekStart)}</div>
                <div className="footerNote" style={{ marginTop: 0 }}>
                  Momentum {activePastSummary.momentum}/100
                </div>
              </div>

              <div className="weekSummaryMeta">
                <span>{activePastSummary.presence}/7 present</span>
                <span>{activePastSummary.completions} completed</span>
                {activePastSummary.avgPace ? <span>Avg pace: {prettyLevel(activePastSummary.avgPace)}</span> : null}
              </div>

              <div className="miniPills" style={{ marginTop: 10 }}>
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

              {!activePastIsCurrentWeek && activePastNote.trim().length > 0 ? (
                <div className="weeklyNotePreview" aria-label="Saved note for this week" style={{ marginTop: 10 }}>
                  <div className="weeklyNotePreviewLabel">Note</div>
                  <div className="weeklyNotePreviewBody">{activePastNote}</div>
                </div>
              ) : null}
            </div>
          ) : null}

        </div>
      )}

      {showWeekDetails && renderModal(
        <div
          className="modalOverlay weekDetailsOverlay weekSheetOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Week details"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWeekDetails(false);
          }}
        >
          <div className="modalCard weekDetailsModal weekSheetModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Week details</div>
            <div className="modalBody">
              {weekDetailsStart && weekDetailsEnd
                ? `${formatDateLong(weekDetailsStart)} to ${formatDateLong(weekDetailsEnd)}`
                : ""}
            </div>

            <div className="weekDetailsList">
              {weekDetailsRecords.map((d) => (
                <div
                  key={d.date}
                  className={"weekDetailsRow" + (d.checkedIn ? " present" : "")}
                >
                  <div className="weekDetailsDow">
                    {formatWeekdayShort(d.date)}
                  </div>
                  <div className="weekDetailsMain">
                    <div className="weekDetailsDate">{formatDateShort(d.date)}</div>
                    <div className="weekDetailsMeta">
                      {d.checkedIn ? "Present" : "Not present"} · {Number(d.tasksDone) || 0} completed
                    </div>
                  </div>
                  <div
                    className={"weekDetailsIcon" + (d.checkedIn ? " present" : " absent")}
                    aria-label={d.checkedIn ? "Present" : "Not present"}
                  >
                    {d.checkedIn ? "✓" : "○"}
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

      {showWeekActivities && renderModal(
        <div
          className="modalOverlay weekSheetOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Week activities"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWeekActivities(false);
          }}
        >
          <div className="modalCard weekActivitiesModal weekSheetModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Completed activities</div>
            <div className="modalBody">
              {weekActivitiesStart && weekActivitiesEnd
                ? `${formatDateLong(weekActivitiesStart)} to ${formatDateLong(weekActivitiesEnd)}`
                : ""}
            </div>

            <div className="weekActivitiesList">
              {weekActivitiesByDay.every((d) => d.completed.length === 0) ? (
                <div className="weekActivitiesEmpty">
                  No completed activities recorded for this week.
                  <div className="weekActivitiesEmptyTip">
                    Tip: activity names are saved as you complete them, and recent history is kept for about 90 days.
                  </div>
                </div>
              ) : (
                weekActivitiesByDay.map((d) => (
                  <div
                    key={d.dayKey}
                    className={"weekActivitiesDayCard" + (d.completed.length ? " has" : " empty")}
                  >
                    <div className="weekActivitiesDayHeader">
                      <div className="weekActivitiesDow">
                        {formatWeekdayShort(d.dayKey)}
                      </div>
                      <div className="weekActivitiesDate">{formatDateShort(d.dayKey)}</div>
                    </div>

                    {d.completed.length ? (
                      <div className="weekActivitiesItems">
                        {d.completed.map((a) => (
                          <div key={a.id} className="weekActivitiesItem">
                            ✓ {a.text}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="weekActivitiesNone">No completions</div>
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

      {showMomentumInfo && renderModal(
        <div
          className="modalOverlay weekSheetOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Momentum explanation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowMomentumInfo(false);
          }}
        >
          <div className="modalCard weekSheetModal weekMomentumModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">About Momentum</div>
            <div className="modalBody">
              Momentum is a helpful score based on your last 7 days: showing up matters most, with a small boost for finishing
              activities.
            </div>

            <div className="weekMomentumLevels" style={{ marginTop: 10, display: "grid", gap: 8 }}>
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

      <div className="result weeklyNoteResult" aria-label="Weekly note">
        <div className="weeklyNoteHeader">
          <div>
            <div className="resultTitle">Week note</div>
            <div className="footerNote" style={{ marginTop: 6 }}>
              Optional context for what is shaping this week.
            </div>
          </div>
          <div className="weeklyNoteActions">
            <div className="footerNote" style={{ marginTop: 0, textAlign: "right" }} aria-label="Weekly note status">
              {isDirty
                ? "Unsaved"
                : formatUpdatedAt(savedNoteUpdatedAt) || (savedNote.trim().length ? "Saved" : "")}
              {noteChars > 420 ? (
                <span>
                  {!isDirty && (formatUpdatedAt(savedNoteUpdatedAt) || savedNote.trim().length) ? " · " : ""}
                  {noteChars}/{NOTE_CHAR_LIMIT}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => actions?.saveWeeklyNote?.(weekRange.startKey, draftNote)}
              disabled={!isDirty}
              aria-label="Save this week’s note"
            >
              Save
            </button>
          </div>
        </div>
        <div className="weeklyNoteBody">
          <textarea
            className="weeklyNoteInput"
            value={draftNote}
            maxLength={NOTE_CHAR_LIMIT}
            rows={4}
            placeholder="What is shaping this week? (energy, deadlines, travel, stress, wins, recovery...)"
            onChange={(e) => setDraftNote(limitChars(e.target.value, NOTE_CHAR_LIMIT))}
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
