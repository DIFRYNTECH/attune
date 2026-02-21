function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Weekly momentum is a gentle signal (not a score).
 * - Presence (check-in days) is the majority of the weight.
 * - Completions add a small capped boost.
 * - Low completion is never punished (no negative terms).
 */
export function computeMomentum(weekRecords) {
  const records = Array.isArray(weekRecords) ? weekRecords : [];
  const weekDays = records.length || 7;

  const daysPresent = records.filter((d) => !!d?.checkedIn).length;
  const tasksDone = records.reduce((sum, d) => sum + (Number(d?.tasksDone) || 0), 0);

  // Presence is the main driver.
  const PRESENCE_WEIGHT = 85;
  const presenceRatio = weekDays > 0 ? daysPresent / weekDays : 0;
  const presenceScore = presenceRatio * PRESENCE_WEIGHT;

  // Completions are a small, capped boost.
  // Up to 15 points, reached at ~5 completions.
  const completionBoost = clamp(Math.floor(tasksDone) * 3, 0, 15);

  const score = clamp(Math.round(presenceScore + completionBoost), 0, 100);

  let label = "Quiet";
  if (score >= 80) label = "Strong";
  else if (score >= 55) label = "Steady";
  else if (score >= 30) label = "Building";
  else if (score >= 10) label = "Starting";

  return { score, label, daysPresent, tasksDone };
}

export function momentumLabelToMeterPercent(label) {
  // For Free mode, avoid implying an exact number.
  // Keep a stable visual hint per label.
  switch (label) {
    case "Strong":
      return 90;
    case "Steady":
      return 70;
    case "Building":
      return 45;
    case "Starting":
      return 20;
    case "Quiet":
    default:
      return 6;
  }
}
