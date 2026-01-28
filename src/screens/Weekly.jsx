import { todayKey } from "../lib/storage";
import { computeWeekArchetype, prettyLevel, weekArchetypeCopy } from "../lib/attuneEngine";

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

export default function Weekly({ state }) {
  const weekRecords = buildWeekRecords(state);
  const archetype = computeWeekArchetype(weekRecords);
  const copy = weekArchetypeCopy(archetype);

  const { score, label, daysPresent, tasksDone } = computeMomentum(weekRecords);

  const levelCounts = weekRecords.reduce(
    (acc, d) => {
      if (d.checkedIn && d.level && acc[d.level] !== undefined) acc[d.level]++;
      return acc;
    },
    { rest: 0, gentle: 0, light: 0, steady: 0, capable: 0, brave: 0 },
  );

  return (
    <div className="card">
      <h2>📅 Weekly</h2>
      <div className="sub">A gentle look back — progress without pressure.</div>

      <div className="result" style={{ marginBottom: 12 }}>
        <div className="resultTitle">Momentum</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {label} <span style={{ color: "var(--muted)", fontWeight: 800, fontSize: 13 }}>/ {score}</span>
          </div>
          <div className="footerNote" style={{ marginTop: 0 }}>
            {daysPresent}/7 days present • {tasksDone} done
          </div>
        </div>

        <div className="meter" aria-label="Weekly momentum">
          <div className="meterFill" style={{ width: `${score}%` }} />
        </div>

        <div className="footerNote">
          Not a grade — just a signal to help you notice your rhythm.
        </div>
      </div>

      <div className="result" style={{ marginBottom: 12 }}>
        <div className="resultTitle">Week type</div>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>{archetype}</div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>{copy}</div>
      </div>

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

      <div className="hint">
        Tip: Momentum goes up most from showing up (even once), then from finishing 1–2 tiny tasks.
      </div>
    </div>
  );
}
