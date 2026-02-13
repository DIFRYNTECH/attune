import { useEffect, useMemo, useRef, useState } from "react";
import { loadState, saveState, todayKey } from "../lib/storage";
import { dailyMessageFromCheckin, suggestActivities, suggestLevelFromCheckin } from "../lib/attuneEngine";
import { ENCOURAGE_DONE, ENCOURAGE_EMPTY } from "../data/messages";

const SCHEMA_VERSION = 7;

// Bump this when the AI prompt/validation changes and you want fresh boards.
const AI_BOARD_VERSION = 2;

// Bump this when the AI daily note prompt changes.
const AI_DAILY_NOTE_VERSION = 1;

const DEFAULT_CHECKIN = {
  mood: "okay",
  moodWords: ["Okay"],
  energy: "okay",
  body: "manageable",
  note: "",
};

function defaultState(){
  const checkin = { ...DEFAULT_CHECKIN };
  const level = "gentle";
  return {
    schemaVersion: SCHEMA_VERSION,
    screen: "checkin",
    today: todayKey(),
    checkedInToday: false,
    checkin,
    level,
    options: [],
    optionsSource: "default", // 'default' | 'ai'
    boardAssigned: [],
    myDay: [],
    myDayCap: 5,
    history: [],
    weeklyNotes: {},
    profile: {
      name: "",
      email: "",
      useNoteForAi: true,
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
      error: "",
    },
    dailyMessage: dailyMessageFromCheckin(checkin, level),
    toast: null, // {text, good, screen}
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

  if(typeof next.optionsSource !== "string") next.optionsSource = "default";
  if(next.optionsSource !== "default" && next.optionsSource !== "ai") next.optionsSource = "default";

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
    next.aiDailyNote = { status: "idle", today: "", sig: "", title: "", body: "", focus: "", error: "" };
  }
  if(typeof next.aiDailyNote.status !== "string") next.aiDailyNote.status = "idle";
  if(!["idle","loading","ready","error"].includes(next.aiDailyNote.status)) next.aiDailyNote.status = "idle";
  if(typeof next.aiDailyNote.today !== "string") next.aiDailyNote.today = "";
  if(typeof next.aiDailyNote.sig !== "string") next.aiDailyNote.sig = "";
  if(typeof next.aiDailyNote.title !== "string") next.aiDailyNote.title = "";
  if(typeof next.aiDailyNote.body !== "string") next.aiDailyNote.body = "";
  if(typeof next.aiDailyNote.focus !== "string") next.aiDailyNote.focus = "";
  if(typeof next.aiDailyNote.error !== "string") next.aiDailyNote.error = "";

  if(!next.profile || typeof next.profile !== "object" || Array.isArray(next.profile)) next.profile = { name: "", email: "", useNoteForAi: true, plan: "free" };
  if(typeof next.profile.name !== "string") next.profile.name = "";
  if(typeof next.profile.email !== "string") next.profile.email = "";
  if(typeof next.profile.useNoteForAi !== "boolean") next.profile.useNoteForAi = true;
  if(typeof next.profile.plan !== "string") next.profile.plan = "free";
  if(next.profile.plan !== "free" && next.profile.plan !== "plus") next.profile.plan = "free";

  // Toasts are ephemeral; don't restore them across reloads.
  next.toast = null;

  // Treat the Check-in screen as a fresh form on app start.
  // This avoids confusing "defaults" that persist from an old selection.
  if(next.today === todayKey() && next.screen === "checkin"){
    next.checkedInToday = false;
    next.checkin = { ...DEFAULT_CHECKIN };
    next.level = "gentle";
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
  const exposedState = useMemo(() => ({ ...state, plan }), [state, plan]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // daily rollover
  useEffect(() => {
    const t = todayKey();
    if(state.today !== t){
      setState(prev => {
        const rolled = rollDayToHistory(prev);
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
    go: (screen) =>
      setState(s => {
        if(screen === "wheel"){
          const options = s.options?.length
            ? s.options
            : suggestActivities(s.checkin, s.level);

          return {
            ...s,
            screen: "wheel",
            options,
            toast: null,
            // Treat entering the Wheel from Check-in as completing today’s check-in.
            checkedInToday: s.screen === "checkin" ? true : s.checkedInToday,
          };
        }

        return { ...s, screen, toast: null };
      }),

    setCheckin: (patch) =>
      setState(s => {
        const checkin = { ...s.checkin, ...patch };
        const level = suggestLevelFromCheckin(checkin);
        const options = suggestActivities(checkin, level);
        return { ...s, checkin, level, options, optionsSource: "default", dailyMessage: dailyMessageFromCheckin(checkin, level) };
      }),

    setLevel: (level) =>
      setState(s => {
        const options = suggestActivities(s.checkin, level);
        return {...s, level, options, optionsSource: "default", dailyMessage: dailyMessageFromCheckin(s.checkin, level) }
      }),

    suggestLevel: () =>
      setState(s => {
        const suggested = suggestLevelFromCheckin(s.checkin);
        return {
          ...s,
          level: suggested,
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

        if(!title || !body) throw new Error("invalid_note");

        if(requestId !== aiNoteReqRef.current.requestId) return;

        setState(s => {
          const liveSig = dailyNoteSignature(s.checkin, s.level, s.profile?.useNoteForAi, t);
          if(s.today !== t || liveSig !== sig) return s;

          return {
            ...s,
            aiDailyNote: { status: "ready", today: t, sig, title, body, focus, error: "" },
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
            aiDailyNote: { ...s.aiDailyNote, status: "error", today: t, sig, title: "", body: "", focus: "", error: "" },
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
        return {
          ...s,
          myDay: [...s.myDay, { id, text: s.currentSpin.text, done:false }],
          currentSpin: null,
          toast: {
            text: `${nextCount} ${label} added to your day. Trying is enough. Click My Day to see what your day looks like.`,
            good: true,
            screen: s.screen,
          }
        };
      }),

    addOption: (opt) =>
      setState(s => {
        if(!opt?.text){
          return { ...s, toast: { text: "That one didn't load—try another tile.", good: false, screen: s.screen } };
        }

        if((s.myDay?.length || 0) >= 10){
          return { ...s, toast: { text: "That’s plenty for today. Let’s cap it at 10.", good: false, screen: s.screen } };
        }
        const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
        const nextCount = (s.myDay?.length || 0) + 1;
        const label = nextCount === 1 ? "activity" : "activities";
        return {
          ...s,
          myDay: [...s.myDay, { id, text: opt.text, done:false }],
          toast: {
            text: `${nextCount} ${label} added to your day. Trying is enough. Click My Day to see what your day looks like.`,
            good: true,
            screen: s.screen,
          }
        };
      }),

    setMyDayCap: (cap) =>
      setState(s => {
        const nextCap = cap === 10 ? 10 : 5;
        return { ...s, myDayCap: nextCap };
      }),

    setToast: (text, good = false) =>
      setState(s => ({ ...s, toast: { text, good, screen: s.screen } })),

    setBoardAssigned: (boardAssigned) =>
      setState(s => ({ ...s, boardAssigned: Array.isArray(boardAssigned) ? boardAssigned : [] })),

    setProfile: (patch) =>
      setState(s => {
        const nextPatch = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
        const profile = { ...(s.profile || { name: "", email: "", useNoteForAi: true, plan: "free" }), ...nextPatch };
        if(typeof profile.name !== "string") profile.name = "";
        if(profile.name.length > 40) profile.name = profile.name.slice(0, 40);

        if(typeof profile.email !== "string") profile.email = "";
        profile.email = profile.email.trim();
        if(profile.email.length > 120) profile.email = profile.email.slice(0, 120);
        if(profile.email) profile.email = profile.email.toLowerCase();

        if(typeof profile.useNoteForAi !== "boolean") profile.useNoteForAi = true;

        if(typeof profile.plan !== "string") profile.plan = "free";
        if(profile.plan !== "free" && profile.plan !== "plus") profile.plan = "free";

        return { ...s, profile };
      }),

    setPlan: (nextPlan) =>
      setState(s => {
        const plan = nextPlan === "plus" ? "plus" : "free";
        const profile = { ...(s.profile || { name: "", email: "", useNoteForAi: true, plan: "free" }), plan };
        return { ...s, profile };
      }),

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

        if(nextText.trim().length === 0){
          delete weeklyNotes[id];
        }else{
          weeklyNotes[id] = nextText;
        }

        return { ...s, weeklyNotes };
      }),

    toggleDone: (id, done) =>
      setState(s => {
        const myDay = s.myDay.map(t => t.id === id ? {...t, done} : t);
        const msg = done
          ? ENCOURAGE_DONE[Math.floor(Math.random()*ENCOURAGE_DONE.length)]
          : "No rush, you can come back to it later.";
        return { ...s, myDay, toast: { text: msg, good: !!done, screen: s.screen } };
      }),

    removeTask: (id) =>
      setState(s => ({
        ...s,
        myDay: s.myDay.filter(t => t.id !== id),
        toast: { text: "Removed. Keep it light.", good: false, screen: s.screen }
      })),

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
        return {
          ...rolled,
          options: [],
          boardAssigned: [],
          myDay: [],
          currentSpin: null,
          toast
        };
      }),

    clearToast: () => setState(s => ({...s, toast: null})),

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
