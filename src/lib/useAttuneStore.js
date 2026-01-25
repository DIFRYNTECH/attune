import { useEffect, useMemo, useState } from "react";
import { loadState, saveState, todayKey } from "./storage";
import { generateOptions, suggestLevelFromCheckin } from "./attuneEngine";
import { MESSAGES, ENCOURAGE_DONE, ENCOURAGE_EMPTY } from "../data/messages";

function defaultState(){
  return {
    screen: "checkin",
    today: todayKey(),
    checkin: { mood:"okay", energy:"low", body:"achey" },
    level: "gentle",
    options: [],
    myDay: [],
    history: [],
    dailyMessage: MESSAGES[Math.floor(Math.random()*MESSAGES.length)],
    toast: null, // {text, good}
  };
}

export function useAttuneStore(){
  const [state, setState] = useState(() => loadState() || defaultState());

  // daily rollover
  useEffect(() => {
    const t = todayKey();
    if(state.today !== t){
      setState(prev => {
        const rolled = rollDayToHistory(prev);
        const next = {
          ...rolled,
          today: t,
          options: [],
          myDay: [],
          toast: null,
          dailyMessage: MESSAGES[Math.floor(Math.random()*MESSAGES.length)],
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
    go: (screen) => setState(s => ({...s, screen})),

    setCheckin: (patch) =>
      setState(s => ({...s, checkin: {...s.checkin, ...patch}})),

    setLevel: (level) =>
      setState(s => ({...s, level })),

    suggestLevel: () =>
      setState(s => {
        const suggested = suggestLevelFromCheckin(s.checkin);
        return {
          ...s,
          level: suggested,
          dailyMessage: {
            a: `Based on today, this looks like a ${suggested} day.`,
            b: "You can change it anytime — your pace is allowed."
          }
        };
      }),

    generateOptions: () =>
      setState(s => ({
        ...s,
        options: generateOptions(s.level),
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
        dailyMessage: MESSAGES[Math.floor(Math.random()*MESSAGES.length)]
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
    checkedIn: true,
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
