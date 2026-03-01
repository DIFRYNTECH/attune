import { useEffect, useMemo, useRef, useState } from "react";
import { loadState, saveState, todayKey } from "../lib/storage";
import { dailyMessageFromCheckin, suggestActivities, suggestLevelFromCheckin } from "../lib/attuneEngine";
import { ENCOURAGE_DONE, ENCOURAGE_EMPTY } from "../data/messages";
import { getEntitlements } from "../lib/entitlements";
import { recordEventOnState, trimEventDays } from "../lib/events";
import { addNoteToMemory, applyThemesToRememberedNote, clearNoteMemory as clearNoteMemoryObj } from "../lib/noteMemory";
import { buildWeekRecordsFromHistory, computeWeekSummaryFromWeekRecords, upsertWeeklySummary, weekStartMondayKey } from "../lib/weeklyHistory";

const SCHEMA_VERSION = 7;

// Bump this when the AI prompt/validation changes and you want fresh boards.
const AI_BOARD_VERSION = 2;

// Bump this when the AI daily note prompt changes.
const AI_DAILY_NOTE_VERSION = 2;

const EVENT_DAYS_TO_KEEP = 90;
const NOTE_MEMORY_MAX = 30;

const DEFAULT_CHECKIN = {
  mood: "okay",
  moodWords: ["Okay"],
  energy: "okay",
  body: "manageable",
  note: "",
};

function clampText(value, maxLen){
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function defaultState(){
  const checkin = { ...DEFAULT_CHECKIN };
  const level = "gentle";
  return {
    schemaVersion: SCHEMA_VERSION,
    screen: "checkin",
    auth: {
      signedIn: false,
      username: "",
      rememberMe: true,
      view: "signin", // 'signin' | 'signup'
    },
    today: todayKey(),
    checkedInToday: false,
    checkin,
    level,
    options: [],
    levelSource: "auto", // 'auto' | 'manual'
    optionsSource: "default", // 'default' | 'ai'
    boardAssigned: [],
    myDay: [],
    myDayCap: 5,
    history: [],
    weeklyNotes: {},
    weeklyNotesMeta: {},
    weeklySummaries: [],
    events: {},
    noteMemory: { notes: [] },
    profile: {
      name: "",
      email: "",
      useNoteForAi: true,
      theme: "light", // 'light' | 'dark'
      plan: "free", // 'free' | 'plus'
    },
    ai: {
      status: "idle", // idle | loading | ready | error
      today: "",
      sig: "",
      tasks: [],
      error: "",
    },
    aiDailyNote: {
      status: "idle", // idle | loading | ready | error
      today: "",
      sig: "",
      title: "",
      body: "",
      focus: "",
      themes: [],
      error: "",
    },
    dailyMessage: dailyMessageFromCheckin(checkin, level),
    toast: null, // {text, good, screen}
    paywall: null, // { feature, source } (ephemeral)
    currentSpin: null,
  };
}

function checkinSignature(checkin, level, useNoteForAi){
  const mood = typeof checkin?.mood === "string" ? checkin.mood : "";
  const moodWords = Array.isArray(checkin?.moodWords) ? checkin.moodWords.slice(0,2) : [];
  const energy = typeof checkin?.energy === "string" ? checkin.energy : "";
  const body = typeof checkin?.body === "string" ? checkin.body : "";
  const includeNote = useNoteForAi !== false;
  const note = includeNote && typeof checkin?.note === "string" ? checkin.note.slice(0,200) : "";
  const lvl = typeof level === "string" ? level : "";
  return JSON.stringify({ v: AI_BOARD_VERSION, mood, moodWords, energy, body, note, lvl });
}

function dailyNoteSignature(checkin, level, useNoteForAi, today){
  const t = typeof today === "string" ? today : todayKey();
  return `${AI_DAILY_NOTE_VERSION}|${t}|${checkinSignature(checkin, level, useNoteForAi)}`;
}

function normalizeLoadedState(loaded){
  if(!loaded) return null;

  const next = { ...loaded };

  // If you tweak defaults/shape over time, bump SCHEMA_VERSION and migrate here.
  if(next.schemaVersion !== SCHEMA_VERSION){
    next.schemaVersion = SCHEMA_VERSION;

    // Migrate earlier defaults (energy/body) to the newer, clearer defaults.
    next.checkin = {
      ...DEFAULT_CHECKIN,
      ...(next.checkin || {}),
    };

    if(typeof next.checkin.note !== "string") next.checkin.note = "";
    if(next.checkin.note.length > 200) next.checkin.note = next.checkin.note.slice(0, 200);

    // Only override the old default if it looks like it was never changed.
    // (Earlier versions defaulted to energy:"low" body:"achey".)
    if(next.checkin.energy === "low") next.checkin.energy = "okay";
    if(next.checkin.body === "achey") next.checkin.body = "manageable";

    // If moodWords is missing but mood exists, keep mood and seed a chip.
    if(!Array.isArray(next.checkin.moodWords) || next.checkin.moodWords.length === 0){
      next.checkin.moodWords = next.checkin.mood === "okay" ? ["Okay"] : [];
    }

    // New in v6: soft cap for My Day task picks.
    if(typeof next.myDayCap !== "number") next.myDayCap = 5;
    if(next.myDayCap !== 5 && next.myDayCap !== 10) next.myDayCap = 5;
    if(Array.isArray(next.myDay) && next.myDay.length > 5) next.myDayCap = 10;
  }

  if(!Array.isArray(next.boardAssigned)) next.boardAssigned = [];
  if(!next.weeklyNotes || typeof next.weeklyNotes !== "object" || Array.isArray(next.weeklyNotes)) next.weeklyNotes = {};

  // Auth (added later): keep it optional + safe.
  if(!next.auth || typeof next.auth !== "object" || Array.isArray(next.auth)){
    next.auth = { signedIn: false, username: "", rememberMe: true, view: "signin" };
  }
  if(typeof next.auth.signedIn !== "boolean") next.auth.signedIn = false;
  if(typeof next.auth.username !== "string") next.auth.username = "";
  if(next.auth.username.length > 40) next.auth.username = next.auth.username.slice(0, 40);
  if(typeof next.auth.rememberMe !== "boolean") next.auth.rememberMe = true;
  if(typeof next.auth.view !== "string") next.auth.view = "signin";
  if(next.auth.view !== "signin" && next.auth.view !== "signup") next.auth.view = "signin";

  if(!next.weeklyNotesMeta || typeof next.weeklyNotesMeta !== "object" || Array.isArray(next.weeklyNotesMeta)) next.weeklyNotesMeta = {};
  {
    const safeMeta = {};
    for(const k of Object.keys(next.weeklyNotesMeta)){
      const v = next.weeklyNotesMeta[k];
      if(!v || typeof v !== "object" || Array.isArray(v)) continue;
      const updatedAt = Number(v.updatedAt);
      if(Number.isFinite(updatedAt) && updatedAt > 0) safeMeta[k] = { updatedAt };
    }
    next.weeklyNotesMeta = safeMeta;
  }

  if(!Array.isArray(next.weeklySummaries)) next.weeklySummaries = [];
  next.weeklySummaries = next.weeklySummaries
    .filter(x => x && typeof x === "object" && !Array.isArray(x))
    .filter(x => typeof x.weekStart === "string" && x.weekStart)
    .map(x => ({
      weekStart: x.weekStart,
      presence: typeof x.presence === "number" ? x.presence : Number(x.presence) || 0,
      completions: typeof x.completions === "number" ? x.completions : Number(x.completions) || 0,
      avgPace: typeof x.avgPace === "string" ? x.avgPace : null,
      avgPaceIndex: typeof x.avgPaceIndex === "number" && Number.isFinite(x.avgPaceIndex) ? x.avgPaceIndex : null,
      weekType: typeof x.weekType === "string" ? x.weekType : "Gentle Week",
      momentum: typeof x.momentum === "number" ? x.momentum : Number(x.momentum) || 0,
    }))
    .sort((a,b) => String(a.weekStart).localeCompare(String(b.weekStart)))
    .slice(-52);

  if(typeof next.optionsSource !== "string") next.optionsSource = "default";
  if(next.optionsSource !== "default" && next.optionsSource !== "ai") next.optionsSource = "default";

  if(typeof next.levelSource !== "string") next.levelSource = "auto";
  if(next.levelSource !== "auto" && next.levelSource !== "manual") next.levelSource = "auto";

  if(!next.ai || typeof next.ai !== "object" || Array.isArray(next.ai)){
    next.ai = { status: "idle", today: "", sig: "", tasks: [], error: "" };
  }
  if(typeof next.ai.status !== "string") next.ai.status = "idle";
  if(!["idle","loading","ready","error"].includes(next.ai.status)) next.ai.status = "idle";
  if(typeof next.ai.today !== "string") next.ai.today = "";
  if(typeof next.ai.sig !== "string") next.ai.sig = "";
  if(!Array.isArray(next.ai.tasks)) next.ai.tasks = [];
  if(typeof next.ai.error !== "string") next.ai.error = "";

  if(!next.aiDailyNote || typeof next.aiDailyNote !== "object" || Array.isArray(next.aiDailyNote)){
    next.aiDailyNote = { status: "idle", today: "", sig: "", title: "", body: "", focus: "", themes: [], error: "" };
  }
  if(typeof next.aiDailyNote.status !== "string") next.aiDailyNote.status = "idle";
  if(!["idle","loading","ready","error"].includes(next.aiDailyNote.status)) next.aiDailyNote.status = "idle";
  if(typeof next.aiDailyNote.today !== "string") next.aiDailyNote.today = "";
  if(typeof next.aiDailyNote.sig !== "string") next.aiDailyNote.sig = "";
  if(typeof next.aiDailyNote.title !== "string") next.aiDailyNote.title = "";
  if(typeof next.aiDailyNote.body !== "string") next.aiDailyNote.body = "";
  if(typeof next.aiDailyNote.focus !== "string") next.aiDailyNote.focus = "";
  if(!Array.isArray(next.aiDailyNote.themes)) next.aiDailyNote.themes = [];
  next.aiDailyNote.themes = next.aiDailyNote.themes
    .filter(t => typeof t === "string")
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2);
  if(typeof next.aiDailyNote.error !== "string") next.aiDailyNote.error = "";

  if(!next.profile || typeof next.profile !== "object" || Array.isArray(next.profile)) next.profile = { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" };
  if(typeof next.profile.name !== "string") next.profile.name = "";
  if(typeof next.profile.email !== "string") next.profile.email = "";
  if(typeof next.profile.useNoteForAi !== "boolean") next.profile.useNoteForAi = true;
  if(typeof next.profile.theme !== "string") next.profile.theme = "light";
  if(next.profile.theme !== "light" && next.profile.theme !== "dark") next.profile.theme = "light";
  if(typeof next.profile.plan !== "string") next.profile.plan = "free";
  if(next.profile.plan !== "free" && next.profile.plan !== "plus") next.profile.plan = "free";
  // Dark mode is a Plus feature; fall back to light for free plan.
  if(next.profile.plan !== "plus") next.profile.theme = "light";

  if(!next.noteMemory || typeof next.noteMemory !== "object" || Array.isArray(next.noteMemory)) next.noteMemory = { notes: [] };
  if(!Array.isArray(next.noteMemory.notes)) next.noteMemory.notes = [];
  // Free plan should not keep historical note memory.
  if(next.profile.plan !== "plus") next.noteMemory = { notes: [] };
  // Trim just in case older builds kept more.
  if(next.noteMemory.notes.length > NOTE_MEMORY_MAX){
    next.noteMemory.notes = next.noteMemory.notes.slice(next.noteMemory.notes.length - NOTE_MEMORY_MAX);
  }

  if(!next.events || typeof next.events !== "object" || Array.isArray(next.events)) next.events = {};
  for(const k of Object.keys(next.events)){
    if(!Array.isArray(next.events[k])) next.events[k] = [];
  }
  next.events = trimEventDays(next.events, EVENT_DAYS_TO_KEEP);

  // Toasts are ephemeral; don't restore them across reloads.
  next.toast = null;
  // Paywall is ephemeral; don't restore it across reloads.
  next.paywall = null;

  // Treat the Check-in screen as a fresh form on app start.
  // This avoids confusing "defaults" that persist from an old selection.
  if(next.today === todayKey() && next.screen === "checkin"){
    next.checkedInToday = false;
    next.checkin = { ...DEFAULT_CHECKIN };
    next.level = "gentle";
    next.levelSource = "auto";
    next.options = [];
    next.myDayCap = 5;
    next.currentSpin = null;
  }

  // Keep daily message consistent with current selections.
  next.dailyMessage = dailyMessageFromCheckin(next.checkin, next.level);

  return next;
}

export function useAttuneStore(){
  const [state, setState] = useState(() => normalizeLoadedState(loadState()) || defaultState());
  const stateRef = useRef(state);
  const aiReqRef = useRef({ controller: null, requestId: 0 });
  const aiNoteReqRef = useRef({ controller: null, requestId: 0 });

  const plan = state?.profile?.plan === "plus" ? "plus" : "free";
  const entitlements = useMemo(() => getEntitlements(plan), [plan]);
  const exposedState = useMemo(() => ({ ...state, plan, entitlements }), [state, plan, entitlements]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // daily rollover
  useEffect(() => {
    const t = todayKey();
    if(state.today !== t){
      setState(prev => {
        const rolled = rollDayToHistory(prev);
        // Snapshot/update the week summary for the day we just rolled.
        const weekStart = weekStartMondayKey(prev.today);
        let weeklySummaries = rolled.weeklySummaries;
        if(weekStart){
          const weekRecords = buildWeekRecordsFromHistory(rolled.history, weekStart);
          const summary = computeWeekSummaryFromWeekRecords(weekRecords, weekStart);
          if(summary) weeklySummaries = upsertWeeklySummary(weeklySummaries, summary, 52);
        }
        const checkin = { ...DEFAULT_CHECKIN };
        const level = "gentle";
        const next = {
          ...rolled,
          today: t,
          checkedInToday: false,
          checkin,
          level,
          options: [],
          myDay: [],
          myDayCap: 5,
          weeklySummaries,
          boardAssigned: [],
          currentSpin: null,
          toast: null,
          dailyMessage: dailyMessageFromCheckin(checkin, level),
        };
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  const actions = useMemo(() => ({
    trackEvent: (type, payload) =>
      setState(s => recordEventOnState(s, type, payload, { maxDays: EVENT_DAYS_TO_KEEP })),

    setAuthView: (view) =>
      setState(s => {
        const v = view === "signup" ? "signup" : "signin";
        return {
          ...s,
          auth: { ...(s.auth || {}), view: v },
          toast: null,
        };
      }),

    // Stub auth for early Capacitor builds: any username/password succeeds.
    login: ({ username, rememberMe } = {}) =>
      setState(s => ({
        ...s,
        auth: {
          signedIn: true,
          username: clampText(username, 40),
          rememberMe: typeof rememberMe === "boolean" ? rememberMe : (s?.auth?.rememberMe !== false),
          view: "signin",
        },
        screen: "checkin",
        toast: null,
      })),

    signup: ({ name, username, rememberMe } = {}) =>
      setState(s => ({
        ...s,
        auth: {
          signedIn: true,
          username: clampText(username, 40),
          rememberMe: typeof rememberMe === "boolean" ? rememberMe : (s?.auth?.rememberMe !== false),
          view: "signin",
        },
        profile: {
          ...(s.profile || {}),
          name: clampText(name, 40),
        },
        screen: "checkin",
        toast: null,
      })),

    logout: () =>
      setState(s => ({
        ...s,
        auth: {
          signedIn: false,
          username: s?.auth?.rememberMe !== false ? (s?.auth?.username || "") : "",
          rememberMe: s?.auth?.rememberMe !== false,
          view: "signin",
        },
        toast: null,
        screen: "checkin",
      })),

    go: (screen) =>
      setState(s => {
        if(screen === "wheel"){
          const options = s.options?.length
            ? s.options
            : suggestActivities(s.checkin, s.level);

          const next = {
            ...s,
            screen: "wheel",
            options,
            toast: null,
            // Treat entering the Wheel from Check-in as completing today’s check-in.
            checkedInToday: s.screen === "checkin" ? true : s.checkedInToday,
          };

          if(s.screen === "checkin"){
            const note = typeof s.checkin?.note === "string" ? s.checkin.note.trim().slice(0, 200) : "";
            let withEvents = recordEventOnState(
              next,
              "checkinSaved",
              {
                mood: s.checkin?.mood,
                energy: s.checkin?.energy,
                body: s.checkin?.body,
                pace: s.level,
                ...(note ? { note } : {}),
              },
              { maxDays: EVENT_DAYS_TO_KEEP }
            );

            // Plus: store note memory historically.
            const isPlus = s?.profile?.plan === "plus";
            if(isPlus && note){
              withEvents = {
                ...withEvents,
                noteMemory: addNoteToMemory(withEvents.noteMemory, { date: withEvents.today, text: note }, NOTE_MEMORY_MAX),
              };
            }

            return withEvents;
          }

          return next;
        }

        return { ...s, screen, toast: null };
      }),

    setCheckin: (patch) =>
      setState(s => {
        const checkin = { ...s.checkin, ...patch };
        const source = s.levelSource === "manual" ? "manual" : "auto";
        const level = source === "manual" ? s.level : suggestLevelFromCheckin(checkin);
        const options = suggestActivities(checkin, level);
        return { ...s, checkin, level, levelSource: source, options, optionsSource: "default", dailyMessage: dailyMessageFromCheckin(checkin, level) };
      }),

    setLevel: (level) =>
      setState(s => {
        const options = suggestActivities(s.checkin, level);
        return {...s, level, levelSource: "manual", options, optionsSource: "default", dailyMessage: dailyMessageFromCheckin(s.checkin, level) }
      }),

    suggestLevel: () =>
      setState(s => {
        const suggested = suggestLevelFromCheckin(s.checkin);
        const options = suggestActivities(s.checkin, suggested);
        return {
          ...s,
          level: suggested,
          levelSource: "auto",
          options,
          optionsSource: "default",
          dailyMessage: dailyMessageFromCheckin(s.checkin, suggested)
        };
      }),

    completeCheckin: () =>
      setState(s => ({ ...s, checkedInToday: true })),

    refreshOptions: () =>
      setState(s => ({
        ...s,
        options: (s.ai?.status === "ready" && s.ai.today === s.today && s.ai.sig === checkinSignature(s.checkin, s.level, s.profile?.useNoteForAi) && Array.isArray(s.ai.tasks) && s.ai.tasks.length)
          ? s.ai.tasks.map(t => ({ text: t.text, level: s.level }))
          : suggestActivities(s.checkin, s.level),
        optionsSource: (s.ai?.status === "ready" && s.ai.today === s.today && s.ai.sig === checkinSignature(s.checkin, s.level, s.profile?.useNoteForAi) && Array.isArray(s.ai.tasks) && s.ai.tasks.length)
          ? "ai"
          : "default",
        boardAssigned: [],
        currentSpin: null,
      })),

    ensureAiBoard: async (checkin, level, today) => {
      const t = typeof today === "string" ? today : todayKey();
      const includeNote = stateRef.current?.profile?.useNoteForAi !== false;
      const sig = checkinSignature(checkin, level, includeNote);
      const current = stateRef.current;

      const alreadyReady =
        current?.ai?.status === "ready" &&
        current.ai.today === t &&
        current.ai.sig === sig &&
        Array.isArray(current.ai.tasks) &&
        current.ai.tasks.length === 15;

      if(alreadyReady) return;
      if(current?.ai?.status === "loading" && current.ai?.today === t && current.ai?.sig === sig) return;

      // Abort any in-flight request.
      if(aiReqRef.current.controller){
        try { aiReqRef.current.controller.abort(); } catch { /* noop */ }
      }
      const controller = new AbortController();
      aiReqRef.current.controller = controller;
      aiReqRef.current.requestId += 1;
      const requestId = aiReqRef.current.requestId;

      setState(s => ({
        ...s,
        ai: { ...s.ai, status: "loading", today: t, sig, error: "" },
      }));

      const timeoutMs = 35_000;
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const checkinForAi = includeNote ? checkin : { ...(checkin || {}), note: "" };
        const resp = await fetch("/api/generate-board", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ checkin: checkinForAi, level }),
        });

        if(!resp.ok){
          throw new Error(`http_${resp.status}`);
        }

        const data = await resp.json();
        const tasks = Array.isArray(data?.tasks) ? data.tasks : null;
        if(!tasks || tasks.length !== 15) throw new Error("invalid_tasks");

        const nextOptions = tasks
          .map((x) => (typeof x?.text === "string" ? x.text.trim() : ""))
          .filter(Boolean)
          .slice(0, 15)
          .map((text) => ({ text, level }));

        if(nextOptions.length !== 15) throw new Error("invalid_texts");

        // Ignore stale responses.
        if(requestId !== aiReqRef.current.requestId) return;

        setState(s => {
          const liveSig = checkinSignature(s.checkin, s.level, s.profile?.useNoteForAi);
          if(s.today !== t || liveSig !== sig) return s;

          return {
            ...s,
            options: nextOptions,
            optionsSource: "ai",
            boardAssigned: [],
            currentSpin: null,
            ai: { status: "ready", today: t, sig, tasks, error: "" },
          };
        });
      } catch (err) {
        if(requestId !== aiReqRef.current.requestId) return;

        const message =
          err && typeof err === "object" && (err.name === "AbortError" || String(err.message || "").includes("aborted"))
            ? "AI took too long. Using built-in suggestions."
            : "Using built-in suggestions.";

        setState(s => {
          const liveSig = checkinSignature(s.checkin, s.level, s.profile?.useNoteForAi);
          if(s.today !== t || liveSig !== sig) return s;

          // Keep current options (default suggestions) as fallback.
          return {
            ...s,
            optionsSource: "default",
            ai: { ...s.ai, status: "error", today: t, sig, tasks: [], error: message },
          };
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },

    ensureAiDailyNote: async (checkin, level, today, opts) => {
      const t = typeof today === "string" ? today : todayKey();
      const includeNote = stateRef.current?.profile?.useNoteForAi !== false;
      const sig = dailyNoteSignature(checkin, level, includeNote, t);
      const current = stateRef.current;
      const force = !!opts?.force;

      const alreadyReady =
        !force &&
        current?.aiDailyNote?.status === "ready" &&
        current.aiDailyNote.today === t &&
        current.aiDailyNote.sig === sig &&
        typeof current.aiDailyNote.title === "string" &&
        current.aiDailyNote.title.length > 0 &&
        typeof current.aiDailyNote.body === "string" &&
        current.aiDailyNote.body.length > 0;

      if(alreadyReady) return;
      if(!force && current?.aiDailyNote?.status === "loading" && current.aiDailyNote?.today === t && current.aiDailyNote?.sig === sig) return;

      if(aiNoteReqRef.current.controller){
        try { aiNoteReqRef.current.controller.abort(); } catch { /* noop */ }
      }
      const controller = new AbortController();
      aiNoteReqRef.current.controller = controller;
      aiNoteReqRef.current.requestId += 1;
      const requestId = aiNoteReqRef.current.requestId;

      setState(s => ({
        ...s,
        aiDailyNote: { ...s.aiDailyNote, status: "loading", today: t, sig, error: "" },
      }));

      const timeoutMs = 12_000;
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const checkinForAi = includeNote ? checkin : { ...(checkin || {}), note: "" };
        const resp = await fetch("/api/daily-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ checkin: checkinForAi, level, today: t }),
        });

        if(!resp.ok){
          throw new Error(`http_${resp.status}`);
        }

        const data = await resp.json();
        const note = data?.note && typeof data.note === "object" ? data.note : null;
        const title = typeof note?.title === "string" ? note.title.trim() : "";
        const body = typeof note?.body === "string" ? note.body.trim() : "";
        const focus = typeof note?.focus === "string" ? note.focus.trim() : "";
        const themes = Array.isArray(note?.themes)
          ? note.themes
              .filter((x) => typeof x === "string")
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 2)
          : [];

        if(!title || !body) throw new Error("invalid_note");

        if(requestId !== aiNoteReqRef.current.requestId) return;

        setState(s => {
          const liveSig = dailyNoteSignature(s.checkin, s.level, s.profile?.useNoteForAi, t);
          if(s.today !== t || liveSig !== sig) return s;

          // If Plus + note is stored, enrich remembered note themes using AI.
          const isPlus = s?.profile?.plan === "plus";
          const noteText = typeof s.checkin?.note === "string" ? s.checkin.note.trim().slice(0, 200) : "";
          const shouldApplyThemes = isPlus && s.profile?.useNoteForAi !== false && noteText && themes.length > 0;
          const nextNoteMemory = shouldApplyThemes
            ? applyThemesToRememberedNote(s.noteMemory, { date: t, themes })
            : s.noteMemory;

          return {
            ...s,
            noteMemory: nextNoteMemory,
            aiDailyNote: { status: "ready", today: t, sig, title, body, focus, themes, error: "" },
          };
        });
      } catch {
        if(requestId !== aiNoteReqRef.current.requestId) return;

        setState(s => {
          const liveSig = dailyNoteSignature(s.checkin, s.level, s.profile?.useNoteForAi, t);
          if(s.today !== t || liveSig !== sig) return s;

          // Silent fallback: keep local dailyMessage visible.
          return {
            ...s,
            aiDailyNote: { ...s.aiDailyNote, status: "error", today: t, sig, title: "", body: "", focus: "", themes: [], error: "" },
          };
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },

    spinPick: () =>
      setState(s => {
        const options = s.options?.length
          ? s.options
          : suggestActivities(s.checkin, s.level);
        const picked = options[Math.floor(Math.random() * options.length)];
        return { ...s, options, currentSpin: picked };
      }),

    addCurrent: () =>
      setState(s => {
        if(!s.currentSpin){
          return { ...s, toast: { text: "Spin first - or just take a breath. No rush.", good: false, screen: s.screen } };
        }

        if((s.myDay?.length || 0) >= 10){
          return { ...s, toast: { text: "That’s plenty for today. Let’s cap it at 10.", good: false, screen: s.screen } };
        }
        const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
        const nextCount = (s.myDay?.length || 0) + 1;
        const label = nextCount === 1 ? "activity" : "activities";
        const next = {
          ...s,
          myDay: [...s.myDay, { id, text: s.currentSpin.text, done:false }],
          currentSpin: null,
          toast: {
            text: `${nextCount} ${label} added to your day. Trying is enough. Click My Day to see what your day looks like.`,
            good: true,
            screen: s.screen,
          }
        };

        return recordEventOnState(
          next,
          "activityPicked",
          { text: s.currentSpin?.text, pace: s.currentSpin?.level || s.level, source: "spin" },
          { maxDays: EVENT_DAYS_TO_KEEP }
        );
      }),

    addOption: (opt) =>
      setState(s => {
        if(!opt?.text){
          return { ...s, toast: { text: "That one didn't load - try another tile.", good: false, screen: s.screen } };
        }

        if((s.myDay?.length || 0) >= 10){
          return { ...s, toast: { text: "That’s plenty for today. Let’s cap it at 10.", good: false, screen: s.screen } };
        }
        const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
        const nextCount = (s.myDay?.length || 0) + 1;
        const label = nextCount === 1 ? "activity" : "activities";
        const next = {
          ...s,
          myDay: [...s.myDay, { id, text: opt.text, done:false }],
          toast: {
            text: `${nextCount} ${label} added to your day. Trying is enough. Click My Day to see what your day looks like.`,
            good: true,
            screen: s.screen,
          }
        };

        return recordEventOnState(
          next,
          "activityPicked",
          { text: opt.text, pace: opt.level || s.level, source: "board" },
          { maxDays: EVENT_DAYS_TO_KEEP }
        );
      }),

    setMyDayCap: (cap) =>
      setState(s => {
        const nextCap = cap === 10 ? 10 : 5;
        return { ...s, myDayCap: nextCap };
      }),

    setToast: (text, good = false) =>
      setState(s => ({ ...s, toast: { text, good, screen: s.screen } })),

    openPaywall: (feature, source) =>
      setState(s => {
        if(s?.profile?.plan === "plus") return s;
        const f = typeof feature === "string" ? feature : "plus";
        const src = typeof source === "string" ? source : "";
        return { ...s, paywall: { feature: f, source: src } };
      }),

    closePaywall: () => setState(s => ({ ...s, paywall: null })),

    setBoardAssigned: (boardAssigned) =>
      setState(s => ({ ...s, boardAssigned: Array.isArray(boardAssigned) ? boardAssigned : [] })),

    setProfile: (patch) =>
      setState(s => {
        const nextPatch = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
        const profile = { ...(s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" }), ...nextPatch };
        if(typeof profile.name !== "string") profile.name = "";
        if(profile.name.length > 40) profile.name = profile.name.slice(0, 40);

        if(typeof profile.email !== "string") profile.email = "";
        profile.email = profile.email.trim();
        if(profile.email.length > 120) profile.email = profile.email.slice(0, 120);
        if(profile.email) profile.email = profile.email.toLowerCase();

        if(typeof profile.useNoteForAi !== "boolean") profile.useNoteForAi = true;

        if(typeof profile.theme !== "string") profile.theme = "light";
        if(profile.theme !== "light" && profile.theme !== "dark") profile.theme = "light";

        if(typeof profile.plan !== "string") profile.plan = "free";
        if(profile.plan !== "free" && profile.plan !== "plus") profile.plan = "free";

        // Dark mode is a Plus feature; keep free plan on light.
        if(profile.plan !== "plus") profile.theme = "light";

        return { ...s, profile };
      }),

    setPlan: (nextPlan) =>
      setState(s => {
        const plan = nextPlan === "plus" ? "plus" : "free";
        const profile = { ...(s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" }), plan };
        if(plan !== "plus") profile.theme = "light";
        // Free plan should not keep historical note memory.
        const noteMemory = plan === "plus" ? s.noteMemory : clearNoteMemoryObj(s.noteMemory);
        const paywall = plan === "plus" ? null : s.paywall;
        return { ...s, profile, noteMemory, paywall };
      }),

    clearNoteMemory: () =>
      setState(s => ({
        ...s,
        noteMemory: clearNoteMemoryObj(s.noteMemory),
        toast: { text: "Cleared note memory on this device.", good: true, screen: s.screen },
      })),

    clearDeviceData: () =>
      setState(() => ({
        ...defaultState(),
        toast: { text: "Signed out. This device is cleared.", good: false, screen: "checkin" },
      })),

    setWeeklyNote: (weekId, text) =>
      setState(s => {
        const id = typeof weekId === "string" ? weekId : "";
        if(!id) return s;

        const nextText = typeof text === "string" ? text : "";
        const weeklyNotes = { ...(s.weeklyNotes || {}) };
        const weeklyNotesMeta = { ...(s.weeklyNotesMeta || {}) };

        if(nextText.trim().length === 0){
          delete weeklyNotes[id];
          delete weeklyNotesMeta[id];
        }else{
          weeklyNotes[id] = nextText;
          weeklyNotesMeta[id] = { updatedAt: Date.now() };
        }

        return { ...s, weeklyNotes, weeklyNotesMeta };
      }),

    toggleDone: (id, done) =>
      setState(s => {
        const prevTask = (s.myDay || []).find(t => t.id === id);
        const wasDone = !!prevTask?.done;
        const myDay = s.myDay.map(t => t.id === id ? {...t, done} : t);
        const msg = done
          ? ENCOURAGE_DONE[Math.floor(Math.random()*ENCOURAGE_DONE.length)]
          : "No rush, you can come back to it later.";

        const next = { ...s, myDay, toast: { text: msg, good: !!done, screen: s.screen } };

        if(done && !wasDone){
          return recordEventOnState(
            next,
            "activityCompleted",
            { id, text: prevTask?.text, pace: s.level },
            { maxDays: EVENT_DAYS_TO_KEEP }
          );
        }

        return next;
      }),

    removeTask: (id) =>
      setState(s => {
        const prevTask = (s.myDay || []).find(t => t.id === id);
        const next = {
          ...s,
          myDay: s.myDay.filter(t => t.id !== id),
          toast: { text: "Removed. Keep it light.", good: false, screen: s.screen }
        };

        if(!prevTask) return next;
        return recordEventOnState(
          next,
          "activityRemoved",
          { id, text: prevTask?.text, done: !!prevTask?.done, pace: s.level },
          { maxDays: EVENT_DAYS_TO_KEEP }
        );
      }),

    newMessage: () =>
      setState(s => ({
        ...s,
        dailyMessage: dailyMessageFromCheckin(s.checkin, s.level)
      })),

    endDay: () =>
      setState(s => {
        const doneCount = s.myDay.filter(x=>x.done).length;

        let toast;
        if(s.myDay.length === 0){
          toast = { text: ENCOURAGE_EMPTY[Math.floor(Math.random()*ENCOURAGE_EMPTY.length)], good: false, screen: s.screen };
        }else if(doneCount === 0){
          toast = { text: "That’s okay. Choosing was still care. Tomorrow we go gently again.", good: false, screen: s.screen };
        }else{
          toast = { text: "You did what you could today. That matters.", good: true, screen: s.screen };
        }

        const rolled = rollDayToHistory(s);

        // Snapshot/update weekly summary for this week.
        const weekStart = weekStartMondayKey(rolled.today);
        let weeklySummaries = rolled.weeklySummaries;
        if(weekStart){
          const weekRecords = buildWeekRecordsFromHistory(rolled.history, weekStart);
          const summary = computeWeekSummaryFromWeekRecords(weekRecords, weekStart);
          if(summary) weeklySummaries = upsertWeeklySummary(weeklySummaries, summary, 52);
        }

        return {
          ...rolled,
          weeklySummaries,
          options: [],
          boardAssigned: [],
          myDay: [],
          currentSpin: null,
          toast
        };
      }),

    clearToast: () => setState(s => ({...s, toast: null})),

    upsertCurrentWeekSummary: () =>
      setState(s => {
        const weekStart = weekStartMondayKey(s.today);
        if(!weekStart) return s;

        // Prefer live state for today so the current week stays fresh.
        const weekRecords = buildWeekRecordsFromHistory(s.history, weekStart).map((d) => {
          if(d.date !== s.today) return d;
          return {
            ...d,
            checkedIn: !!s.checkedInToday,
            level: s.level,
            tasksAdded: s.myDay?.length || 0,
            tasksDone: s.myDay?.filter((t) => t.done).length || 0,
          };
        });

        const summary = computeWeekSummaryFromWeekRecords(weekRecords, weekStart);
        if(!summary) return s;

        const weeklySummaries = upsertWeeklySummary(s.weeklySummaries, summary, 52);
        if(weeklySummaries === s.weeklySummaries) return s;
        return { ...s, weeklySummaries };
      }),

    resetToday: () =>
      setState(s => ({
        ...s,
        options: [],
        optionsSource: "default",
        boardAssigned: [],
        myDay: [],
        currentSpin: null,
        myDayCap: 5,
        toast: { text: "Reset done. Fresh start, gently.", good: false, screen: s.screen }
      })),
  }), []);

  // Dev-only: make it easy to inspect state/actions in the console.
  useEffect(() => {
    if(import.meta.env.DEV && typeof window !== "undefined"){
      window.__ATTUNE__ = { state: exposedState, actions };
    }
  }, [exposedState, actions]);

  return { state: exposedState, actions };
}

function rollDayToHistory(s){
  const record = {
    date: s.today,
    checkedIn: !!s.checkedInToday,
    level: s.level,
    tasksAdded: s.myDay.length,
    tasksDone: s.myDay.filter(x=>x.done).length
  };
  const history = [...(s.history || [])];
  const idx = history.findIndex(r => r.date === record.date);
  if(idx >= 0) history[idx] = record;
  else history.push(record);

  history.sort((a,b)=>a.date.localeCompare(b.date));
  const trimmed = history.length > 21 ? history.slice(history.length-21) : history;

  return { ...s, history: trimmed };
}
