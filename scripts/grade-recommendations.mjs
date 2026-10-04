import { readFileSync, writeFileSync } from "node:fs";

const live = process.argv.includes("--live");
const dir = new URL(live ? "../test-results/recommendation-live60/" : "../test-results/recommendation-simulation/", import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const simulation = read("summary.json");
const probes = JSON.parse(readFileSync(new URL("../test-results/recommendation-simulation/boundary-probes.json", import.meta.url), "utf8"));
const gates = Object.entries(simulation.failures).map(([name, failures]) => ({ name, pass: failures === 0, failures, scope: "simulated domain behavior" }));
gates.push(
  { name: "ordinary-freshness", pass: simulation.runs.every(run => run.nonFamiliarSevenDayRepeatPct <= simulation.thresholds.nonFamiliarSevenDayRepeatPct) },
  { name: "featured-diversity", pass: simulation.runs.every(run => run.topThreeWithTwoDomainsPct >= simulation.thresholds.topThreeWithTwoDomainsPct) },
  { name: "near-duplicate-copy", pass: simulation.runs.every(run => run.duplicatePairs === 0), scope: "Additional content gate: no high-overlap copy pairs in a board; not a complete semantic similarity audit." },
  { name: "featured-fatigue", pass: simulation.runs.every(run => run.maximumFeaturedDaysPct <= simulation.thresholds.maximumFeaturedDaysPct), failures: simulation.runs.filter(run => run.maximumFeaturedDaysPct > simulation.thresholds.maximumFeaturedDaysPct).length, scope: "proposed product gate, not an industry standard" },
  { name: "seated-semantic-constraint", pass: !probes.seatedFilter.actuallyPlacedOnBoard },
  { name: "calendar-retention", pass: !probes.oldHistory.retainedDespite90DayLimit },
  { name: "calendar-recency", pass: !probes.oldHistory.sentAsRecent },
  { name: "durable-preference-sync-stress", pass: JSON.stringify(probes.highVolumeSync.hiddenBefore) === JSON.stringify(probes.highVolumeSync.hiddenAfter) },
  { name: "expired-paid-entitlement", pass: !probes.billing.expiredActiveStillGrantsPlus },
);
const changingInterests = [];
for (const route of simulation.routes) for (const seed of simulation.seeds) {
  const run = read(`changing-interests-${route}-${seed}.json`);
  const late = run.days.filter(day => day.day > 40).flatMap(day => day.board.slice(0, 3));
  changingInterests.push({ route, seed, newDomainTopThreePct: run.summary.preferredDomainLastTwentyPct,
    oldDomainTopThreePct: Math.round(late.filter(task => ["creativity", "play"].includes(task.domain)).length / late.length * 10000) / 100,
    successfulNewDomainSelectionsAfterChange: run.days.filter(day => day.day > 30 && day.chosen?.done && day.preferredDomains.includes(day.chosen.domain)).length,
  });
}
gates.push({ name: "changed-interest-adaptation", pass: changingInterests.every(run => run.newDomainTopThreePct >= 50 && run.newDomainTopThreePct > run.oldDomainTopThreePct),
  scope: "Additional A-grade target: after sustained new feedback, new interests occupy at least half of featured slots and exceed old interests." });
const result = { acceptancePassed: gates.every(gate => gate.pass), passedGates: gates.filter(gate => gate.pass).length, totalGates: gates.length, gates, changingInterests,
  limits: "These gates do not establish real-user value, live model quality, live sync, Android reliability, billing-provider integration, or regulatory compliance." };
writeFileSync(new URL("acceptance.json", dir), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.acceptancePassed ? 0 : 1;
