function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function isoFromTimestamp(value) {
  const ts = Number(value);
  if(!Number.isFinite(ts) || ts <= 0) return "";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getExportPlan(state, billing) {
  if(safeString(billing.planId) === "plus") return "plus";
  if(safeString(state.plan) === "plus") return "plus";
  return "free";
}

function getExportEmail(auth, profile) {
  return safeString(auth.username) || safeString(profile.email);
}

function buildDailyHistory(history) {
  return safeArray(history).map((entry) => {
    const item = safeObject(entry);
    return {
      date: safeString(item.date),
      checkedIn: item.checkedIn === true,
      level: safeString(item.level),
      tasksAdded: Number(item.tasksAdded) || 0,
      tasksDone: Number(item.tasksDone) || 0,
    };
  }).filter((entry) => entry.date);
}

function buildWeeklySummaries(weeklySummaries) {
  return safeArray(weeklySummaries).map((entry) => {
    const item = safeObject(entry);
    return {
      weekStart: safeString(item.weekStart),
      presence: Number(item.presence) || 0,
      completions: Number(item.completions) || 0,
      avgPace: safeString(item.avgPace),
      weekType: safeString(item.weekType),
      momentum: Number(item.momentum) || 0,
      weekNote: safeString(item.weekNote),
    };
  }).filter((entry) => entry.weekStart);
}

function buildCheckIns(eventsByDay, state) {
  const entries = [];
  const source = safeObject(eventsByDay);
  const dates = Object.keys(source).filter(Boolean).sort();

  for(const date of dates){
    const events = safeArray(source[date]);
    let latest = null;
    for(const rawEvent of events){
      const event = safeObject(rawEvent);
      if(event.type !== "checkinSaved") continue;
      if(!latest || (Number(event.ts) || 0) >= (Number(latest.ts) || 0)) latest = event;
    }
    if(!latest) continue;
    entries.push({
      date,
      savedAt: isoFromTimestamp(latest.ts),
      mood: safeString(latest.mood),
      energy: safeString(latest.energy),
      body: safeString(latest.body),
      pace: safeString(latest.pace),
      note: safeString(latest.note),
    });
  }

  const today = safeString(state.today);
  const hasTodayEntry = today ? entries.some((entry) => entry.date === today) : false;
  const currentCheckin = safeObject(state.checkin);
  if(state.checkedInToday === true && today && !hasTodayEntry){
    entries.push({
      date: today,
      savedAt: "",
      mood: safeString(currentCheckin.mood),
      energy: safeString(currentCheckin.energy),
      body: safeString(currentCheckin.body),
      pace: safeString(state.level),
      note: safeString(currentCheckin.note),
    });
  }

  return entries;
}

function buildActivityHistory(eventsByDay) {
  const activityDays = [];
  const source = safeObject(eventsByDay);
  const dates = Object.keys(source).filter(Boolean).sort();

  for(const date of dates){
    const events = safeArray(source[date]);
    const picked = [];
    const completed = [];

    for(const rawEvent of events){
      const event = safeObject(rawEvent);
      if(event.type === "activityPicked"){
        picked.push({
          text: safeString(event.text),
          pace: safeString(event.pace),
          source: safeString(event.source),
          at: isoFromTimestamp(event.ts),
        });
      }
      if(event.type === "activityCompleted"){
        completed.push({
          text: safeString(event.text),
          pace: safeString(event.pace),
          at: isoFromTimestamp(event.ts),
        });
      }
    }

    if(!picked.length && !completed.length) continue;
    activityDays.push({ date, picked, completed });
  }

  return activityDays;
}

function buildNoteMemory(noteMemory) {
  const notes = safeArray(safeObject(noteMemory).notes).map((entry) => {
    const item = safeObject(entry);
    return {
      date: safeString(item.date),
      text: safeString(item.text),
      themes: safeArray(item.themes).filter((theme) => typeof theme === "string" && theme),
      savedAt: isoFromTimestamp(item.ts),
    };
  }).filter((entry) => entry.date || entry.text);

  return {
    count: notes.length,
    notes,
  };
}

export function buildBackupExport(state) {
  const source = safeObject(state);
  const { toast: _toast, ...exportPayload } = source;
  return exportPayload;
}

export function buildUserDataExport(state) {
  const source = safeObject(state);
  const auth = safeObject(source.auth);
  const profile = safeObject(source.profile);
  const billing = safeObject(source.billing);
  const plan = getExportPlan(source, billing);

  return {
    kind: "attune-user-data",
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    app: {
      name: "Attune",
      schemaVersion: Number(source.schemaVersion) || 0,
    },
    account: {
      signedIn: auth.signedIn === true,
      email: getExportEmail(auth, profile),
    },
    profile: {
      name: safeString(profile.name),
    },
    preferences: {
      theme: safeString(profile.theme) || "light",
      useCheckInNoteForAi: profile.useNoteForAi !== false,
    },
    subscription: {
      plan,
      status: safeString(billing.status) || (plan === "plus" ? "active" : "free"),
      currentPeriodStart: safeString(billing.currentPeriodStart),
      currentPeriodEnd: safeString(billing.currentPeriodEnd),
    },
    history: {
      daily: buildDailyHistory(source.history),
      weeklySummaries: buildWeeklySummaries(source.weeklySummaries),
      checkIns: buildCheckIns(source.events, source),
      activities: buildActivityHistory(source.events),
    },
    noteMemory: buildNoteMemory(source.noteMemory),
  };
}