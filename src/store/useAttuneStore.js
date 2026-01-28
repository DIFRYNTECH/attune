import { useEffect, useMemo, useState } from "react";
import { loadState, saveState, todayKey } from "../lib/storage";
import { dailyMessageFromCheckin, generateOptions, suggestLevelFromCheckin } from "../lib/attuneEngine";
import { ENCOURAGE_DONE, ENCOURAGE_EMPTY } from "../data/messages";

const SCHEMA_VERSION = 5;

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
    myDay: [],
    history: [],
    dailyMessage: dailyMessageFromCheckin(checkin, level),
    toast: null, // {text, good}
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
  }

  // Treat the Check-in screen as a fresh form on app start.
  // This avoids confusing "defaults" that persist from an old selection.
  if(next.today === todayKey() && next.screen === "checkin"){
    next.checkedInToday = false;
    next.checkin = { ...DEFAULT_CHECKIN };
    next.level = "gentle";
    next.options = [];
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
          const next = { ...s, screen: "wheel" };
          if(!next.options?.length){
            next.options = generateOptions(next.level);
          }
          // Treat entering the Wheel from Check-in as completing today’s check-in.
          if(s.screen === "checkin"){
            next.checkedInToday = true;
          }
          return next;
        }
        return { ...s, screen };
      }),

    setCheckin: (patch) =>
      setState(s => {
        const checkin = { ...s.checkin, ...patch };
        return { ...s, checkin, dailyMessage: dailyMessageFromCheckin(checkin, s.level) };
      }),

    setLevel: (level) =>
      setState(s => ({...s, level, dailyMessage: dailyMessageFromCheckin(s.checkin, level) })),

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

    startWheelFromCheckin: () =>
      setState(s => ({
        ...s,
        checkedInToday: true,
        options: generateOptions(s.level),
        currentSpin: null,
        screen: "wheel",
      })),

    generateOptions: () =>
      setState(s => ({
        ...s,
        options: generateOptions(s.level),
        currentSpin: null,
        screen: "wheel"
      })),

    spinPick: () =>
      setState(s => {
        if(!s.options.length){
          return { ...s, options: generateOptions(s.level) };
        }
        const picked = s.options[Math.floor(Math.random()*s.options.length)];
        return { ...s, currentSpin: picked };
      }),

    addCurrent: () =>
      setState(s => {
        if(!s.currentSpin){
          return { ...s, toast: { text: "Spin first — or just take a breath. No rush.", good: false } };
        }
        const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
        return {
          ...s,
          myDay: [...s.myDay, { id, text: s.currentSpin.text, done:false }],
          currentSpin: null,
          toast: { text: "Added to your day. Small is enough.", good: true }
        };
      }),

    toggleDone: (id, done) =>
      setState(s => {
        const myDay = s.myDay.map(t => t.id === id ? {...t, done} : t);
        const msg = done
          ? ENCOURAGE_DONE[Math.floor(Math.random()*ENCOURAGE_DONE.length)]
          : "No worries. You can come back to it later — or not.";
        return { ...s, myDay, toast: { text: msg, good: !!done } };
      }),

    removeTask: (id) =>
      setState(s => ({
        ...s,
        myDay: s.myDay.filter(t => t.id !== id),
        toast: { text: "Removed. Keep it light.", good: false }
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
          toast = { text: ENCOURAGE_EMPTY[Math.floor(Math.random()*ENCOURAGE_EMPTY.length)], good: false };
        }else if(doneCount === 0){
          toast = { text: "That’s okay. Choosing was still care. Tomorrow we go gently again.", good: false };
        }else{
          toast = { text: "You did what you could today. That matters.", good: true };
        }

        const rolled = rollDayToHistory(s);
        return {
          ...rolled,
          options: [],
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
        myDay: [],
        currentSpin: null,
        toast: { text: "Reset done. Fresh start, gently.", good: false }
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
