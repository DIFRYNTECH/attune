const DOMAIN_LABELS = {
  body: "body resets",
  environment: "space resets",
  practical: "practical next steps",
  connection: "connection options",
  comfort: "comfort cues",
  regulation: "settling steps",
  reflection: "reflection steps",
  meaning: "meaningful next steps",
  progress: "progress steps",
};

const LOW_PACES = new Set(["rest", "gentle", "light"]);
const HIGH_PACES = new Set(["capable", "brave"]);

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function flattenEvents(eventsByDay) {
  const source = safeObject(eventsByDay);
  const out = [];
  for (const [day, list] of Object.entries(source)) {
    if (!Array.isArray(list)) continue;
    for (const event of list) {
      if (!event || typeof event !== "object" || Array.isArray(event)) continue;
      out.push({ ...event, day });
    }
  }
  return out.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function topEntry(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}

function recentBehaviorEvents(events) {
  const latestTs = Math.max(...events.map((event) => Number(event.ts) || 0), 0);
  if (!latestTs) return events;
  const cutoff = latestTs - 21 * 24 * 60 * 60 * 1000;
  return events.filter((event) => (Number(event.ts) || 0) >= cutoff);
}

function boardHasDomain(board, domain) {
  return (Array.isArray(board) ? board : []).some((option) => option?.domain === domain);
}

function isHigherEffort(event) {
  const pace = typeof event?.pace === "string" ? event.pace : event?.level;
  return (
    event?.mode === "stretch" ||
    HIGH_PACES.has(pace) ||
    Number(event?.effort) >= 4 ||
    Number(event?.friction) >= 4
  );
}

function hasEnoughHistory(behaviorEvents) {
  if (behaviorEvents.length < 4) return false;
  const activeDays = new Set(behaviorEvents.map((event) => event.day).filter(Boolean));
  return activeDays.size >= 2;
}

export function buildLearningBoardInsight({ canSmartPick, board, events } = {}) {
  if (!canSmartPick) return null;

  const allBehaviorEvents = flattenEvents(events).filter((event) =>
    ["activityPicked", "activityCompleted", "activityRemoved"].includes(event.type)
  );

  if (!hasEnoughHistory(allBehaviorEvents)) return null;

  const completedDomains = new Map();
  const pickedPaces = new Map();
  const behaviorEvents = recentBehaviorEvents(allBehaviorEvents);
  let higherEffortRemoved = 0;

  for (const event of behaviorEvents) {
    if (event.type === "activityCompleted") {
      increment(completedDomains, event.domain);
    }

    if (event.type === "activityPicked") {
      increment(pickedPaces, event.pace || event.level);
    }

    if (event.type === "activityRemoved" && isHigherEffort(event)) {
      higherEffortRemoved += 1;
    }
  }

  const completedDomain = topEntry(completedDomains);
  if (completedDomain && completedDomain[1] >= 2 && boardHasDomain(board, completedDomain[0])) {
    const label = DOMAIN_LABELS[completedDomain[0]] || "similar steps";
    return {
      title: "Why this board",
      body: `You've been finishing ${label} lately, so Attune kept a few of those options close today.`,
    };
  }

  if (higherEffortRemoved >= 2) {
    return {
      title: "Why this board",
      body: "You've set aside higher-effort steps recently, so Attune kept today's stretch options more bounded.",
    };
  }

  const pickedTotal = [...pickedPaces.values()].reduce((sum, count) => sum + count, 0);
  if (pickedTotal >= 4) {
    const lowPicked = [...pickedPaces.entries()]
      .filter(([pace]) => LOW_PACES.has(pace))
      .reduce((sum, [, count]) => sum + count, 0);
    const highPicked = [...pickedPaces.entries()]
      .filter(([pace]) => HIGH_PACES.has(pace))
      .reduce((sum, [, count]) => sum + count, 0);

    if (lowPicked / pickedTotal >= 0.6) {
      return {
        title: "Why this board",
        body: "You've been choosing lower-friction steps lately, so Attune kept the board small and easy to enter.",
      };
    }

    if (highPicked / pickedTotal >= 0.35) {
      return {
        title: "Why this board",
        body: "You've been choosing more active steps lately, so Attune left room for stretch without making the whole board heavy.",
      };
    }
  }

  return null;
}
