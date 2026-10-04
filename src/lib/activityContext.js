import { activityCapacity, activityConstraints, ACTIVITY_POLICY_VERSION } from "./activityPolicy.js";

export function activityContext(checkin = {}, level) {
  const pick = (value, choices) => choices.includes(value) ? value : "unknown";
  return {
    energy: pick(checkin.energy, ["verylow", "low", "okay", "high"]),
    body: pick(checkin.body, ["tender", "achey", "manageable"]),
    pace: pick(level || checkin.pace, ["rest", "gentle", "light", "steady", "capable", "brave"]),
    capacity: activityCapacity(checkin, level),
    activityConstraints: activityConstraints(checkin.activityConstraints),
    catalogueVersion: ACTIVITY_POLICY_VERSION,
  };
}

export function contextSimilarity(past, current) {
  if (!past) return 0.35;
  if (past.capacity !== current.capacity) return 0.25;
  return past.energy === current.energy && past.body === current.body ? 1 : 0.6;
}
