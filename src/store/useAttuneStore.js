import { useEffect, useMemo, useState } from "react";
import { loadState, saveState, todayKey } from "../lib/storage";
import { dailyMessageFromCheckin, suggestActivities, suggestLevelFromCheckin } from "../lib/attuneEngine";
import { ENCOURAGE_DONE, ENCOURAGE_EMPTY } from "../data/messages";

const SCHEMA_VERSION = 6;

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
    boardAssigned: [],
    myDay: [],
    myDayCap: 5,
    history: [],
    weeklyNotes: {},
    profile: {
      name: "",
      email: "",
    },
    dailyMessage: dailyMessageFromCheckin(checkin, level),
    toast: null, // {text, good, screen}
    currentSpin: null,
  };
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
    if(next.checkin.note.length > 100) next.checkin.note = next.checkin.note.slice(0, 100);

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

  if(!next.profile || typeof next.profile !== "object" || Array.isArray(next.profile)) next.profile = { name: "", email: "" };
  if(typeof next.profile.name !== "string") next.profile.name = "";
  if(typeof next.profile.email !== "string") next.profile.email = "";

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
        return { ...s, checkin, level, options, dailyMessage: dailyMessageFromCheckin(checkin, level) };
      }),

    setLevel: (level) =>
      setState(s => {
        const options = suggestActivities(s.checkin, level);
        return {...s, level, options, dailyMessage: dailyMessageFromCheckin(s.checkin, level) }
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
        options: suggestActivities(s.checkin, s.level),
        boardAssigned: [],
        currentSpin: null,
      })),

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
        const profile = { ...(s.profile || { name: "", email: "" }), ...nextPatch };
        if(typeof profile.name !== "string") profile.name = "";
        if(profile.name.length > 40) profile.name = profile.name.slice(0, 40);

        if(typeof profile.email !== "string") profile.email = "";
        profile.email = profile.email.trim();
        if(profile.email.length > 120) profile.email = profile.email.slice(0, 120);
        if(profile.email) profile.email = profile.email.toLowerCase();

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
          : "No worries.There is no rush, you can come back to it later.";
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
        boardAssigned: [],
        myDay: [],
        currentSpin: null,
        myDayCap: 5,
        toast: { text: "Reset done. Fresh start, gently.", good: false, screen: s.screen }
      })),
  }), []);

  return { state, actions };
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
