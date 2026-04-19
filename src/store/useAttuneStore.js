import { useEffect, useMemo, useRef, useState } from "react";
import { loadState, saveState, todayKey } from "../lib/storage";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import { AUTH_CALLBACK_ERROR_EVENT } from "../lib/mobile";
import { dailyMessageFromCheckin, suggestActivities, suggestLevelFromCheckin } from "../lib/attuneEngine";
import { ENCOURAGE_DONE, ENCOURAGE_EMPTY } from "../data/messages";
import { getEntitlements } from "../lib/entitlements";
import { recordEventOnState, trimEventDays } from "../lib/events";
import { addNoteToMemory, applyThemesToRememberedNote, clearNoteMemory as clearNoteMemoryObj, extractThemes } from "../lib/noteMemory";
import { buildWeekRecordsFromHistory, computeWeekSummaryFromWeekRecords, upsertWeeklySummary, weekStartMondayKey } from "../lib/weeklyHistory";
import { ensureProfile, updateProfile } from "../lib/profileApi";
import { listWeeklySummaries as listWeeklySummariesRemote, upsertWeeklySummary as upsertWeeklySummaryRemote } from "../lib/weeklySummariesApi";
import { deleteAllNoteMemory as deleteAllNoteMemoryRemote, listNoteMemory as listNoteMemoryRemote, upsertNoteMemory as upsertNoteMemoryRemote } from "../lib/noteMemoryApi";
import { fetchDeviceState, upsertDeviceState } from "../lib/deviceStateApi";
import { getApiUrl } from "../lib/api";
import {
  createPaddlePortalSession,
  fetchBillingEntitlement,
  verifyGooglePlayPurchase,
} from "../lib/billingApi";
import {
  acknowledgePlayBillingPurchase,
  getPlayBillingPackageName,
  getPlayBillingProducts,
  isPlayBillingSupported,
  purchasePlayBillingSubscription,
  restorePlayBillingPurchases,
} from "../lib/playBilling";
import { isPaddleCheckoutSupported, openPaddleCheckout } from "../lib/paddleCheckout";
import { isNativePlatform } from "../lib/platform";

const SCHEMA_VERSION = 8;

// Bump this when the AI prompt/validation changes and you want fresh boards.
const AI_BOARD_VERSION = 4;

// Bump this when the AI daily note prompt changes.
const AI_DAILY_NOTE_VERSION = 2;

const EVENT_DAYS_TO_KEEP = 90;
const NOTE_MEMORY_MAX = 30;
const PICK_TOAST_MATRIX = {
  low: {
    rest: [
      "Added to your day, just being is enough.",
      "Added to your day, nothing more is needed right now.",
      "Added to your day, this can wait until you're ready.",
      "Added to your day, take all the time you need.",
      "Added to your day, rest is doing something.",
      "Added to your day, this is already enough for today.",
      "Added to your day, you don’t need to do more.",
      "Added to your day, slow is perfectly okay.",
      "Added to your day, you’re allowed to pause here.",
      "Added to your day, let this be gentle on you.",
    ],
    gentle: [
      "Added to your day, take this slowly.",
      "Added to your day, keep it soft and simple.",
      "Added to your day, this is a small step.",
      "Added to your day, ease into it.",
      "Added to your day, no need to rush.",
      "Added to your day, just a little is enough.",
      "Added to your day, let it be light.",
      "Added to your day, move gently through this.",
      "Added to your day, this can be easy.",
      "Added to your day, keep things calm.",
    ],
    light: [
      "Added to your day, just a small step today.",
      "Added to your day, no need to push.",
      "Added to your day, this is enough movement.",
      "Added to your day, take it one step at a time.",
      "Added to your day, keep it manageable.",
      "Added to your day, a little effort is enough.",
      "Added to your day, stay within your energy.",
      "Added to your day, just try it gently.",
      "Added to your day, keep things simple.",
      "Added to your day, this is a safe step.",
    ],
    steady: [
      "Added to your day, one thing at a time.",
      "Added to your day, you’re finding your rhythm.",
      "Added to your day, stay with this pace.",
      "Added to your day, keep it steady.",
      "Added to your day, you’re doing enough.",
      "Added to your day, no need to rush forward.",
      "Added to your day, this is a balanced step.",
      "Added to your day, take it as it comes.",
      "Added to your day, this works for today.",
      "Added to your day, keep it grounded.",
    ],
    capable: [
      "Added to your day, see how it feels, no pressure.",
      "Added to your day, you can ease into this.",
      "Added to your day, try it gently.",
      "Added to your day, take it at your own pace.",
      "Added to your day, there’s no need to force it.",
      "Added to your day, just explore it lightly.",
      "Added to your day, this can stay flexible.",
      "Added to your day, go softly with it.",
      "Added to your day, feel your way through.",
      "Added to your day, this is optional.",
    ],
    brave: [
      "Added to your day, this is a strong step, go gently.",
      "Added to your day, even brave can be soft.",
      "Added to your day, take courage at your own pace.",
      "Added to your day, this is enough bravery.",
      "Added to your day, no need to push too far.",
      "Added to your day, keep it gentle even here.",
      "Added to your day, you’re allowed to take it slow.",
      "Added to your day, courage can be quiet.",
      "Added to your day, this is already a lot.",
      "Added to your day, go easy with yourself.",
    ],
  },
  mid: {
    rest: [
      "Added to your day, rest is part of progress.",
      "Added to your day, it’s okay to pause.",
      "Added to your day, take a breather here.",
      "Added to your day, slowing down helps too.",
      "Added to your day, this keeps things balanced.",
      "Added to your day, rest fits your day.",
      "Added to your day, take this moment.",
      "Added to your day, pause without guilt.",
      "Added to your day, this supports your rhythm.",
      "Added to your day, it’s good to slow down.",
    ],
    gentle: [
      "Added to your day, this feels like a good pace.",
      "Added to your day, keep it light and steady.",
      "Added to your day, this is a nice step.",
      "Added to your day, this works well.",
      "Added to your day, ease through this.",
      "Added to your day, stay relaxed with it.",
      "Added to your day, this fits your flow.",
      "Added to your day, just keep it simple.",
      "Added to your day, no need to rush.",
      "Added to your day, this feels right.",
    ],
    light: [
      "Added to your day, a nice step forward.",
      "Added to your day, this fits your day well.",
      "Added to your day, keep moving gently.",
      "Added to your day, this is a good pace.",
      "Added to your day, keep things easy.",
      "Added to your day, this keeps momentum.",
      "Added to your day, just keep going.",
      "Added to your day, this is enough effort.",
      "Added to your day, stay light with it.",
      "Added to your day, this works nicely.",
    ],
    steady: [
      "Added to your day, you’re in a good rhythm.",
      "Added to your day, keep going like this.",
      "Added to your day, this feels balanced.",
      "Added to your day, stay steady.",
      "Added to your day, you’re on track.",
      "Added to your day, this is working.",
      "Added to your day, keep this pace.",
      "Added to your day, this is solid.",
      "Added to your day, you’re doing well.",
      "Added to your day, this feels right.",
    ],
    capable: [
      "Added to your day, you’ve got this.",
      "Added to your day, this is a solid move.",
      "Added to your day, you can handle this.",
      "Added to your day, this fits your energy.",
      "Added to your day, keep going.",
      "Added to your day, this works well.",
      "Added to your day, you’re moving forward.",
      "Added to your day, this is a good step.",
      "Added to your day, you’re doing great.",
      "Added to your day, this feels strong.",
    ],
    brave: [
      "Added to your day, a bold step forward.",
      "Added to your day, this could shift your day.",
      "Added to your day, go for it.",
      "Added to your day, this is a strong choice.",
      "Added to your day, step into it.",
      "Added to your day, this is momentum.",
      "Added to your day, you’re ready.",
      "Added to your day, this is powerful.",
      "Added to your day, keep pushing forward.",
      "Added to your day, this is your move.",
    ],
  },
  high: {
    rest: [
      "Added to your day, even strong days need rest.",
      "Added to your day, take a moment to recharge.",
      "Added to your day, rest keeps this energy sustainable.",
      "Added to your day, slowing down helps you stay steady.",
      "Added to your day, this keeps things balanced.",
      "Added to your day, it’s good to pause while you can.",
      "Added to your day, rest supports your momentum.",
      "Added to your day, take this time for yourself.",
      "Added to your day, this keeps your energy grounded.",
      "Added to your day, rest is part of staying strong.",
    ],
    gentle: [
      "Added to your day, keep this energy calm and steady.",
      "Added to your day, no need to rush it.",
      "Added to your day, let this flow naturally.",
      "Added to your day, keep things smooth and easy.",
      "Added to your day, stay relaxed with this.",
      "Added to your day, this keeps your rhythm steady.",
      "Added to your day, ease through it.",
      "Added to your day, this is a good pace to stay in.",
      "Added to your day, keep it soft and consistent.",
      "Added to your day, let it unfold naturally.",
    ],
    light: [
      "Added to your day, nice and easy momentum.",
      "Added to your day, this keeps things flowing.",
      "Added to your day, just keep it moving.",
      "Added to your day, this is a smooth step forward.",
      "Added to your day, keep this going lightly.",
      "Added to your day, this fits your energy well.",
      "Added to your day, a simple step works here.",
      "Added to your day, keep things easy and moving.",
      "Added to your day, this is a good flow.",
      "Added to your day, stay light with it.",
    ],
    steady: [
      "Added to your day, you’re in a great groove.",
      "Added to your day, keep this rhythm going.",
      "Added to your day, this feels balanced.",
      "Added to your day, stay consistent with this.",
      "Added to your day, this is a strong rhythm.",
      "Added to your day, you’re moving well.",
      "Added to your day, keep this pace.",
      "Added to your day, this is working for you.",
      "Added to your day, stay in this flow.",
      "Added to your day, this is a solid rhythm.",
    ],
    capable: [
      "Added to your day, you’re moving well today.",
      "Added to your day, this fits your energy.",
      "Added to your day, you’ve got good momentum.",
      "Added to your day, this is a strong step.",
      "Added to your day, you’re handling this well.",
      "Added to your day, keep going like this.",
      "Added to your day, this suits your energy today.",
      "Added to your day, you’re in a good place for this.",
      "Added to your day, this is a confident step.",
      "Added to your day, you’re doing great with this.",
    ],
    brave: [
      "Added to your day, this is your moment.",
      "Added to your day, go for it, you’re ready.",
      "Added to your day, this could really shift your day.",
      "Added to your day, step into it fully.",
      "Added to your day, this is a bold move.",
      "Added to your day, you’ve got the energy for this.",
      "Added to your day, lean into it.",
      "Added to your day, this is a powerful step.",
      "Added to your day, go where this takes you.",
      "Added to your day, this is a strong choice.",
    ],
  },
};

const LOW_MOOD_WORDS = new Set(["Worn out", "Tired", "Overwhelmed", "Irritable", "Restless", "Tender", "Flat", "Anxious"]);
const MID_MOOD_WORDS = new Set(["Okay", "Settled", "Steady"]);
const HIGH_MOOD_WORDS = new Set(["Hopeful", "Motivated"]);
const PICK_TOAST_MOOD_ALIASES = {
  Steady: "Settled",
  Anxious: "Overwhelmed",
  Flat: "Tired",
};

function normalizePickToastMoodWord(word){
  return PICK_TOAST_MOOD_ALIASES[word] || word;
}

function getPickToastMoodBucket(checkin){
  const words = Array.isArray(checkin?.moodWords)
    ? checkin.moodWords.map(normalizePickToastMoodWord).filter(Boolean)
    : [];

  if(words.some((word) => LOW_MOOD_WORDS.has(word))) return "low";
  if(words.some((word) => HIGH_MOOD_WORDS.has(word))) return "high";
  if(words.some((word) => MID_MOOD_WORDS.has(word))) return "mid";

  if(checkin?.mood === "low") return "low";
  if(checkin?.mood === "good") return "high";
  return "mid";
}

function getNextPickToast(checkin, pace, cycleMap){
  const moodBucket = getPickToastMoodBucket(checkin);
  const paceKey = typeof pace === "string" && PICK_TOAST_MATRIX[moodBucket]?.[pace] ? pace : "gentle";
  const messages = PICK_TOAST_MATRIX[moodBucket][paceKey];
  const key = `${moodBucket}:${paceKey}`;
  const currentIndex = Number.isFinite(cycleMap?.[key]) ? cycleMap[key] : 0;
  const normalizedIndex = ((currentIndex % messages.length) + messages.length) % messages.length;

  return {
    text: messages[normalizedIndex],
    nextCycle: {
      ...(cycleMap && typeof cycleMap === "object" ? cycleMap : {}),
      [key]: (normalizedIndex + 1) % messages.length,
    },
  };
}

function defaultBillingState(){
  return {
    planId: "free",
    status: "active",
    source: "manual",
    currentPeriodStart: "",
    currentPeriodEnd: "",
    providerSubscriptionId: "",
    productId: "",
    purchaseStatus: "",
    acknowledged: false,
    syncing: false,
    configuredGooglePlay: false,
    configuredPaddle: false,
    customerPortalAvailable: false,
    error: "",
    lastSyncedAt: 0,
  };
}

function normalizeBillingState(input){
  const next = input && typeof input === "object" && !Array.isArray(input)
    ? { ...defaultBillingState(), ...input }
    : defaultBillingState();

  next.planId = next.planId === "plus" ? "plus" : "free";
  next.status = typeof next.status === "string" && next.status ? next.status : "active";
  next.source = typeof next.source === "string" && next.source ? next.source : "manual";
  next.currentPeriodStart = typeof next.currentPeriodStart === "string" ? next.currentPeriodStart : "";
  next.currentPeriodEnd = typeof next.currentPeriodEnd === "string" ? next.currentPeriodEnd : "";
  next.providerSubscriptionId = typeof next.providerSubscriptionId === "string" ? next.providerSubscriptionId : "";
  next.productId = typeof next.productId === "string" ? next.productId : "";
  next.purchaseStatus = typeof next.purchaseStatus === "string" ? next.purchaseStatus : "";
  next.acknowledged = next.acknowledged === true;
  next.syncing = next.syncing === true;
  next.configuredGooglePlay = next.configuredGooglePlay === true;
  next.configuredPaddle = next.configuredPaddle === true;
  next.customerPortalAvailable = next.customerPortalAvailable === true;
  next.error = typeof next.error === "string" ? next.error : "";
  next.lastSyncedAt = Number(next.lastSyncedAt) || 0;

  return next;
}

function getBillingPlanIdFromState(state){
  return state?.billing?.planId === "plus" ? "plus" : "free";
}

function hasVerifiedPlusNoteMemoryAccess(input){
  const billing = normalizeBillingState(input);
  return billing.planId === "plus" && billing.lastSyncedAt > 0 && !billing.error;
}

function applyBillingStateToLocalState(baseState, billingPatch){
  const billing = normalizeBillingState({ ...(baseState?.billing || defaultBillingState()), ...(billingPatch || {}) });
  const planId = billing.planId === "plus" ? "plus" : "free";
  const profile = {
    ...(baseState?.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" }),
    plan: planId,
  };

  // Only enforce light theme when billing is positively confirmed as free
  // (lastSyncedAt > 0). On sign-out, billing resets to defaults with
  // lastSyncedAt === 0 — preserve the theme so it survives sign-out/sign-in.
  if(planId !== "plus" && billing.lastSyncedAt > 0) profile.theme = "light";

  const nextState = {
    ...baseState,
    billing,
    profile,
    noteMemory: planId === "plus" ? baseState.noteMemory : clearNoteMemoryObj(baseState.noteMemory),
  };

  return planId === "plus" ? nextState : toFreeLocalBoardState(nextState);
}

function getBillingErrorMessage(errorCode){
  switch(String(errorCode || "")){
    case "google_play_not_configured":
      return "Google Play billing is not configured yet.";
    case "paddle_not_configured":
      return "Web billing is not configured yet.";
    case "paddle_portal_not_configured":
      return "Billing management is not configured yet.";
    case "paddle_customer_missing":
      return "No web subscription was found for this account.";
    case "play_billing_unavailable":
      return "Google Play billing is only available inside the Android app.";
    case "play_billing_missing_product_id":
      return "Google Play product ID is missing.";
    case "missing_account_id":
      return "Sign in again before starting a purchase.";
    case "purchase_canceled":
      return "Purchase canceled.";
    case "billing_not_ready":
      return "Google Play billing is still connecting. Try again in a moment.";
    case "google_play_verify_failed":
      return "Google Play purchase verification failed.";
    case "paddle_checkout_failed":
      return "Starting web checkout failed.";
    case "paddle_portal_failed":
      return "Opening billing management failed.";
    case "google_play_account_mismatch":
      return "This Google Play purchase belongs to a different Attune account.";
    case "google_play_missing_account_binding":
      return "This purchase is missing the required account binding. Start the upgrade again from this account.";
    case "google_play_purchase_already_linked":
      return "This purchase token is already linked to another Attune account.";
    default:
      return "Billing is unavailable right now.";
  }
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

function toMs(iso){
  if(!iso || typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

async function getSupabaseAccessToken(){
  const supabase = getSupabaseClient();
  if(!supabase) return "";
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}

async function readApiErrorCode(resp){
  let errorCode = `http_${resp?.status || 0}`;
  try {
    const data = await resp.json();
    if(typeof data?.error === "string" && data.error) errorCode = data.error;
  } catch {
    // Ignore non-JSON error bodies.
  }
  return errorCode;
}

function getAiBoardErrorMessage(errorCode){
  switch(String(errorCode || "")){
    case "ai_daily_limit_reached":
      return "AI limit reached for today. Using built-in suggestions.";
    case "ai_monthly_limit_reached":
      return "AI limit reached for this month. Using built-in suggestions.";
    case "rate_limited":
      return "Too many AI requests right now. Using built-in suggestions.";
    default:
      return "Using built-in suggestions.";
  }
}

function getAiDailyNoteErrorMessage(errorCode){
  switch(String(errorCode || "")){
    case "ai_daily_limit_reached":
      return "AI note limit reached for today. Showing your on-device note.";
    case "ai_monthly_limit_reached":
      return "AI note limit reached for this month. Showing your on-device note.";
    case "rate_limited":
      return "Too many AI requests right now. Showing your on-device note.";
    default:
      return "";
  }
}

function weeklyRowToLocal(row){
  const metrics = row?.metrics && typeof row.metrics === "object" && !Array.isArray(row.metrics) ? row.metrics : {};
  const updatedAtMs = toMs(row?.updated_at) || toMs(row?.created_at) || 0;
  return {
    weekStart: typeof row?.week_start === "string" ? row.week_start : "",
    presence: Number(metrics.presence) || 0,
    completions: Number(metrics.completions) || 0,
    avgPace: typeof row?.pace === "string" ? row.pace : null,
    avgPaceIndex: typeof metrics.avgPaceIndex === "number" && Number.isFinite(metrics.avgPaceIndex)
      ? clamp(Math.round(metrics.avgPaceIndex), 0, 5)
      : null,
    weekType: typeof row?.archetype === "string" && row.archetype ? row.archetype : "Gentle Week",
    momentum: clamp(Number(metrics.momentum) || 0, 0, 100),
    weekNote: typeof row?.summary === "string" ? row.summary : "",
    weekNoteUpdatedAt: updatedAtMs,
  };
}

/**
 * Merge a remote device-state snapshot into local state.
 * Remote wins on fields the local device doesn't have yet;
 * local wins when the user has already made progress today.
 */
function mergeRemoteDeviceState(local, remote){
  if(!remote) return local;

  const localToday = local.today || todayKey();
  const remoteDate = typeof remote.date === "string" ? remote.date : "";

  // Always merge events (90-day history is always useful).
  let mergedEvents = local.events && typeof local.events === "object" ? { ...local.events } : {};
  if(remote.events && typeof remote.events === "object"){
    for(const [day, arr] of Object.entries(remote.events)){
      if(!Array.isArray(arr)) continue;
      const existing = Array.isArray(mergedEvents[day]) ? mergedEvents[day] : [];
      const combined = [...existing];
      for(const ev of arr){
        if(!combined.some((e) => e.id === ev.id)) combined.push(ev);
      }
      mergedEvents[day] = combined;
    }
  }

  // Today-specific fields: only apply if remote snapshot is also from today.
  if(remoteDate !== localToday){
    return { ...local, events: mergedEvents };
  }

  // checkedInToday: if remote checked in and local hasn't, adopt remote checkin.
  const remoteCheckedIn = remote.checked_in_today === true;
  const localCheckedIn = local.checkedInToday === true;
  const checkedInToday = localCheckedIn || remoteCheckedIn;
  const checkin = (!localCheckedIn && remoteCheckedIn && remote.checkin && typeof remote.checkin === "object")
    ? remote.checkin
    : local.checkin;
  const level = (!localCheckedIn && remoteCheckedIn && typeof remote.level === "string")
    ? remote.level
    : local.level;

  // boardAssigned: use remote if local is empty.
  const localBoard = Array.isArray(local.boardAssigned) ? local.boardAssigned : [];
  const remoteBoard = Array.isArray(remote.board_assigned) ? remote.board_assigned : [];
  const boardAssigned = localBoard.length === 0 && remoteBoard.length > 0 ? remoteBoard : localBoard;

  // options: use remote if local is empty.
  const localOptions = Array.isArray(local.options) ? local.options : [];
  const remoteOptions = Array.isArray(remote.options) ? remote.options : [];
  const options = localOptions.length === 0 && remoteOptions.length > 0 ? remoteOptions : localOptions;
  const optionsSource = localOptions.length === 0 && remoteOptions.length > 0
    ? (remote.options_source || local.optionsSource)
    : local.optionsSource;

  // myDay: union by text; prefer done=true.
  const localMyDay = Array.isArray(local.myDay) ? local.myDay : [];
  const remoteMyDay = Array.isArray(remote.my_day) ? remote.my_day : [];
  const myDayMap = new Map();
  for(const t of localMyDay) if(t && t.text) myDayMap.set(t.text, t);
  for(const t of remoteMyDay){
    if(!t || !t.text) continue;
    const existing = myDayMap.get(t.text);
    if(!existing) myDayMap.set(t.text, t);
    else if(t.done && !existing.done) myDayMap.set(t.text, { ...existing, done: true });
  }
  const myDay = Array.from(myDayMap.values());
  const myDayCap = Math.max(local.myDayCap || 5, remote.my_day_cap || 5);

  return {
    ...local,
    checkedInToday,
    checkin,
    level,
    boardAssigned,
    options,
    optionsSource,
    myDay,
    myDayCap,
    events: mergedEvents,
  };
}

function mergeWeeklySummaries(localSummaries, remoteRows){
  const local = Array.isArray(localSummaries) ? localSummaries : [];
  const remote = Array.isArray(remoteRows) ? remoteRows : [];

  const byWeek = new Map();
  for(const s of local){
    if(s && typeof s.weekStart === "string" && s.weekStart) byWeek.set(s.weekStart, s);
  }

  for(const r of remote){
    const nextLocal = weeklyRowToLocal(r);
    if(!nextLocal.weekStart) continue;
    const prev = byWeek.get(nextLocal.weekStart);

    if(!prev){
      byWeek.set(nextLocal.weekStart, nextLocal);
      continue;
    }

    // Prefer the newest weekly note; keep other computed fields merged.
    const prevNoteAt = Number(prev.weekNoteUpdatedAt) || 0;
    const nextNoteAt = Number(nextLocal.weekNoteUpdatedAt) || 0;
    const keepPrevNote = prevNoteAt && prevNoteAt > nextNoteAt;

    byWeek.set(nextLocal.weekStart, {
      ...prev,
      ...nextLocal,
      ...(keepPrevNote ? { weekNote: prev.weekNote, weekNoteUpdatedAt: prevNoteAt } : null),
    });
  }

  return Array.from(byWeek.values()).filter((s) => s && typeof s.weekStart === "string" && s.weekStart);
}

function toDbWeeklySummary({ userId, localSummary }){
  const s = localSummary && typeof localSummary === "object" ? localSummary : {};
  const weekStart = typeof s.weekStart === "string" ? s.weekStart : "";
  if(!userId || !weekStart) return null;

  const metrics = {
    presence: Number(s.presence) || 0,
    completions: Number(s.completions) || 0,
    momentum: Number(s.momentum) || 0,
    avgPaceIndex: typeof s.avgPaceIndex === "number" && Number.isFinite(s.avgPaceIndex) ? s.avgPaceIndex : null,
  };

  return {
    userId,
    weekStart,
    pace: typeof s.avgPace === "string" ? s.avgPace : null,
    archetype: typeof s.weekType === "string" ? s.weekType : null,
    summary: typeof s.weekNote === "string" ? s.weekNote : "",
    metrics,
  };
}

function normalizeThemesArray(input){
  if(!Array.isArray(input)) return [];
  return [...new Set(
    input
      .filter((theme) => typeof theme === "string")
      .map((theme) => theme.trim().toLowerCase())
      .filter(Boolean)
  )].slice(0, 2);
}

function noteRowToLocal(row){
  const date = typeof row?.note_date === "string" ? row.note_date : "";
  const text = typeof row?.note === "string" ? row.note.trim().slice(0, 200) : "";
  if(!date || !text) return null;

  const themes = normalizeThemesArray(row?.themes);
  const ts = toMs(row?.last_used_at) || toMs(row?.updated_at) || toMs(row?.created_at) || Date.now();

  return {
    date,
    text,
    themes: themes.length ? themes : extractThemes(text),
    ts,
  };
}

function mergeNoteMemory(localNoteMemory, remoteRows, maxNotes){
  const localNotes = Array.isArray(localNoteMemory?.notes) ? localNoteMemory.notes : [];
  const rows = Array.isArray(remoteRows) ? remoteRows : [];
  const byDate = new Map();

  for(const note of localNotes){
    if(note && typeof note.date === "string" && note.date) byDate.set(note.date, note);
  }

  for(const row of rows){
    const nextLocal = noteRowToLocal(row);
    if(!nextLocal) continue;

    const prev = byDate.get(nextLocal.date);
    if(!prev || (Number(prev.ts) || 0) <= (Number(nextLocal.ts) || 0)){
      byDate.set(nextLocal.date, nextLocal);
    }
  }

  const cap = typeof maxNotes === "number" ? maxNotes : NOTE_MEMORY_MAX;
  const notes = Array.from(byDate.values())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const trimmed = notes.length > cap ? notes.slice(notes.length - cap) : notes;

  return { notes: trimmed };
}

function toDbNoteMemory({ userId, localNote }){
  const note = localNote && typeof localNote === "object" ? localNote : {};
  const noteDate = typeof note.date === "string" ? note.date : "";
  const text = typeof note.text === "string" ? note.text.trim().slice(0, 200) : "";
  if(!userId || !noteDate || !text) return null;

  return {
    userId,
    noteDate,
    note: text,
    themes: normalizeThemesArray(note.themes),
    lastUsedAt: Number(note.ts) ? new Date(note.ts).toISOString() : new Date().toISOString(),
  };
}

async function syncNoteMemoryEntryRemote(userId, localNote){
  const payload = toDbNoteMemory({ userId, localNote });
  if(!payload) return null;
  return upsertNoteMemoryRemote(payload);
}

async function syncAllLocalNoteMemoryRemote(userId, noteMemory){
  const notes = Array.isArray(noteMemory?.notes) ? noteMemory.notes : [];
  if(!userId || !notes.length) return;

  await Promise.all(
    notes.map((note) =>
      syncNoteMemoryEntryRemote(userId, note).catch(() => null)
    )
  );
}

function getPendingNoteMemoryUploads(localNoteMemory, remoteRows){
  const localNotes = Array.isArray(localNoteMemory?.notes) ? localNoteMemory.notes : [];
  const rows = Array.isArray(remoteRows) ? remoteRows : [];
  const remoteByDate = new Map();

  for(const row of rows){
    const remoteNote = noteRowToLocal(row);
    if(remoteNote?.date) remoteByDate.set(remoteNote.date, remoteNote);
  }

  return localNotes.filter((localNote) => {
    if(!localNote || typeof localNote.date !== "string" || !localNote.date) return false;

    const remoteNote = remoteByDate.get(localNote.date);
    if(!remoteNote) return true;

    const localTs = Number(localNote.ts) || 0;
    const remoteTs = Number(remoteNote.ts) || 0;
    if(localTs > remoteTs) return true;
    if((localNote.text || "") !== (remoteNote.text || "")) return true;

    const localThemes = normalizeThemesArray(localNote.themes).join("|");
    const remoteThemes = normalizeThemesArray(remoteNote.themes).join("|");
    return localThemes !== remoteThemes;
  });
}

async function syncPendingLocalNoteMemoryRemote(userId, localNoteMemory, remoteRows){
  const pendingNotes = getPendingNoteMemoryUploads(localNoteMemory, remoteRows);
  if(!userId || !pendingNotes.length) return;

  await Promise.all(
    pendingNotes.map((note) =>
      syncNoteMemoryEntryRemote(userId, note).catch(() => null)
    )
  );
}

const DEFAULT_CHECKIN = {
  mood: "okay",
  moodWords: ["Okay"],
  energy: "okay",
  body: "manageable",
  note: "",
};

function patchAffectsSuggestedLevel(patch){
  if(!patch || typeof patch !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(patch, "mood") ||
    Object.prototype.hasOwnProperty.call(patch, "moodWords") ||
    Object.prototype.hasOwnProperty.call(patch, "energy") ||
    Object.prototype.hasOwnProperty.call(patch, "body")
  );
}

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
      step: "request", // request | verify
      status: "idle", // idle | sending | sent | verifying | error
      sentTo: "",
      otpCode: "",
      error: "",
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
    pickToastCycle: {},
    history: [],
    weeklySummaries: [],
    events: {},
    noteMemory: { notes: [] },
    billing: defaultBillingState(),
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

function getLocalOptionsRefreshKey(today){
  const t = typeof today === "string" && today ? today : todayKey();
  const [year, month, day] = t.split("-").map((value) => Number(value) || 0);
  const date = new Date(year, Math.max(0, month - 1), Math.max(1, day));
  const dayOfWeek = date.getDay();
  const phase = dayOfWeek >= 6 || dayOfWeek === 0
    ? "sat"
    : dayOfWeek >= 3
      ? "wed"
      : "mon";
  return `${weekStartMondayKey(t) || t}:${phase}`;
}

function getDefaultOptions(checkin, level, today, planId){
  if(planId === "plus") return suggestActivities(checkin, level);

  const seed = `${getLocalOptionsRefreshKey(today)}|${checkinSignature(checkin, level, false)}`;
  return suggestActivities(checkin, level, seed);
}

function toFreeLocalBoardState(baseState){
  const checkin = baseState?.checkin || DEFAULT_CHECKIN;
  const level = typeof baseState?.level === "string" ? baseState.level : "gentle";
  const today = typeof baseState?.today === "string" ? baseState.today : todayKey();

  return {
    ...baseState,
    options: getDefaultOptions(checkin, level, today, "free"),
    optionsSource: "default",
    boardAssigned: [],
    currentSpin: null,
    ai: { status: "idle", today: "", sig: "", tasks: [], error: "" },
  };
}

function dailyNoteSignature(checkin, level, useNoteForAi, today){
  const t = typeof today === "string" ? today : todayKey();
  return `${AI_DAILY_NOTE_VERSION}|${t}|${checkinSignature(checkin, level, useNoteForAi)}`;
}

function normalizeLoadedState(loaded){
  if(!loaded) return null;

  const next = { ...loaded };

  // Legacy (v7 and earlier): weekly notes were stored outside weekly summaries.
  const legacyWeeklyNotes =
    next.weeklyNotes && typeof next.weeklyNotes === "object" && !Array.isArray(next.weeklyNotes)
      ? next.weeklyNotes
      : null;
  const legacyWeeklyNotesMeta =
    next.weeklyNotesMeta && typeof next.weeklyNotesMeta === "object" && !Array.isArray(next.weeklyNotesMeta)
      ? next.weeklyNotesMeta
      : null;

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

  if(!next.pickToastCycle || typeof next.pickToastCycle !== "object" || Array.isArray(next.pickToastCycle)) next.pickToastCycle = {};
  if("pickToastIndex" in next) delete next.pickToastIndex;

  if(!Array.isArray(next.boardAssigned)) next.boardAssigned = [];

  // Auth (added later): keep it optional + safe.
  if(!next.auth || typeof next.auth !== "object" || Array.isArray(next.auth)){
    next.auth = {
      signedIn: false,
      username: "",
      rememberMe: true,
      view: "signin",
      step: "request",
      status: "idle",
      sentTo: "",
      otpCode: "",
      error: "",
    };
  }
  if(typeof next.auth.signedIn !== "boolean") next.auth.signedIn = false;
  if(typeof next.auth.username !== "string") next.auth.username = "";
  if(next.auth.username.length > 40) next.auth.username = next.auth.username.slice(0, 40);
  if(typeof next.auth.rememberMe !== "boolean") next.auth.rememberMe = true;
  if(typeof next.auth.view !== "string") next.auth.view = "signin";
  if(next.auth.view !== "signin" && next.auth.view !== "signup") next.auth.view = "signin";
  if(typeof next.auth.step !== "string") next.auth.step = "request";
  if(!["request","verify"].includes(next.auth.step)) next.auth.step = "request";

  if(typeof next.auth.status !== "string") next.auth.status = "idle";
  if(!["idle","sending","sent","verifying","error"].includes(next.auth.status)) next.auth.status = "idle";
  if(typeof next.auth.sentTo !== "string") next.auth.sentTo = "";
  if(typeof next.auth.otpCode !== "string") next.auth.otpCode = "";
  if(typeof next.auth.error !== "string") next.auth.error = "";

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
      weekNote: typeof x.weekNote === "string" ? x.weekNote : (typeof x.weeklyNote === "string" ? x.weeklyNote : ""),
      weekNoteUpdatedAt: Number(x.weekNoteUpdatedAt || x.weeklyNoteUpdatedAt || 0) || 0,
    }))
    .sort((a,b) => String(a.weekStart).localeCompare(String(b.weekStart)))
    .slice(-52);

  // Migrate legacy weekly notes into weeklySummaries.weekNote fields.
  if(legacyWeeklyNotes){
    const byWeekStart = new Map();
    for(const legacyWeekId of Object.keys(legacyWeeklyNotes)){
      const text = typeof legacyWeeklyNotes[legacyWeekId] === "string" ? legacyWeeklyNotes[legacyWeekId] : "";
      if(!text.trim()) continue;

      const weekStart = String(legacyWeekId).split("_")[0] || "";
      if(!weekStart) continue;

      const updatedAt = Number(legacyWeeklyNotesMeta?.[legacyWeekId]?.updatedAt) || 0;
      const prev = byWeekStart.get(weekStart);
      if(!prev || updatedAt >= (prev.updatedAt || 0)){
        byWeekStart.set(weekStart, { text, updatedAt });
      }
    }

    if(byWeekStart.size){
      const list = next.weeklySummaries.slice();
      for(const [weekStart, v] of byWeekStart.entries()){
        const idx = list.findIndex((w) => w?.weekStart === weekStart);
        if(idx >= 0){
          list[idx] = {
            ...list[idx],
            weekNote: v.text,
            weekNoteUpdatedAt: v.updatedAt || list[idx].weekNoteUpdatedAt || 0,
          };
        }else{
          list.push({
            weekStart,
            presence: 0,
            completions: 0,
            avgPace: null,
            avgPaceIndex: null,
            weekType: "Gentle Week",
            momentum: 0,
            weekNote: v.text,
            weekNoteUpdatedAt: v.updatedAt || 0,
          });
        }
      }
      list.sort((a,b) => String(a.weekStart).localeCompare(String(b.weekStart)));
      next.weeklySummaries = list.slice(-52);
    }
  }

  // Drop legacy fields so they stop persisting.
  if("weeklyNotes" in next) delete next.weeklyNotes;
  if("weeklyNotesMeta" in next) delete next.weeklyNotesMeta;

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

  if(!next.noteMemory || typeof next.noteMemory !== "object" || Array.isArray(next.noteMemory)) next.noteMemory = { notes: [] };
  if(!Array.isArray(next.noteMemory.notes)) next.noteMemory.notes = [];

  next.billing = normalizeBillingState(next.billing);
  const normalizedPlanId = next.billing.planId === "plus" ? "plus" : "free";
  next.profile.plan = normalizedPlanId;
  // Only force light theme when billing was positively confirmed as free.
  // If lastSyncedAt === 0 the billing state was never confirmed (e.g. signed
  // out mid-session), so keep the saved theme so it survives sign-out/sign-in.
  if(normalizedPlanId !== "plus" && next.billing.lastSyncedAt > 0) next.profile.theme = "light";
  // Free plan should not keep historical note memory.
  if(normalizedPlanId !== "plus") next.noteMemory = { notes: [] };
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

  // Treat the Check-in screen as a fresh form on app start — but only if
  // nothing has been filled in yet. If the user already changed mood, energy,
  // body, note, or pace from the defaults, preserve their work so a cold
  // restart (e.g. after sign-out) doesn't wipe a partially-filled check-in.
  const checkinIsDefault =
    next.checkin?.mood === DEFAULT_CHECKIN.mood &&
    next.checkin?.energy === DEFAULT_CHECKIN.energy &&
    next.checkin?.body === DEFAULT_CHECKIN.body &&
    (!next.checkin?.note || next.checkin.note.trim() === "") &&
    (next.level === "gentle" || next.level === DEFAULT_CHECKIN.level);

  if(next.today === todayKey() && next.screen === "checkin" && checkinIsDefault){
    next.checkedInToday = false;
    next.checkin = { ...DEFAULT_CHECKIN };
    next.level = "gentle";
    next.levelSource = "auto";
    next.options = [];
    next.myDayCap = 5;
    next.currentSpin = null;
  }

  if(next.levelSource === "auto"){
    next.level = suggestLevelFromCheckin(next.checkin);
    if(next.optionsSource === "default"){
      next.options = getDefaultOptions(next.checkin, next.level, next.today, normalizedPlanId);
    }
  }

  if(normalizedPlanId !== "plus"){
    next.optionsSource = "default";
    next.ai = { status: "idle", today: "", sig: "", tasks: [], error: "" };
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
  const billingSyncRef = useRef({ userId: "", promise: null });
  const supabaseSyncRef = useRef({ inFlightKey: "", lastCompletedKey: "", lastCompletedAt: 0 });

  const plan = getBillingPlanIdFromState(state);
  const entitlements = useMemo(() => getEntitlements(plan), [plan]);
  const exposedState = useMemo(() => ({ ...state, plan, entitlements }), [state, plan, entitlements]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  async function syncBillingState(forcedUserId){
    const currentUserId = typeof forcedUserId === "string" && forcedUserId
      ? forcedUserId
      : typeof stateRef.current?.auth?.userId === "string"
        ? stateRef.current.auth.userId
        : "";
    if(!currentUserId){
      billingSyncRef.current = { userId: "", promise: null };
      setState((s) => applyBillingStateToLocalState(s, {
        ...defaultBillingState(),
        syncing: false,
        error: "",
      }));
      return normalizeBillingState(defaultBillingState());
    }

    if(billingSyncRef.current.userId === currentUserId && billingSyncRef.current.promise){
      return billingSyncRef.current.promise;
    }

    const syncPromise = (async () => {
      setState((s) => applyBillingStateToLocalState(s, {
        ...s.billing,
        syncing: true,
        error: "",
      }));

      try {
        const result = await fetchBillingEntitlement();
        const entitlement = result?.entitlement && typeof result.entitlement === "object" ? result.entitlement : {};
        const normalized = normalizeBillingState({
          planId: entitlement.planId,
          status: entitlement.status,
          source: entitlement.source,
          currentPeriodStart: entitlement.currentPeriodStart,
          currentPeriodEnd: entitlement.currentPeriodEnd,
          providerSubscriptionId: entitlement.providerSubscriptionId,
          productId: entitlement.productId,
          purchaseStatus: entitlement.purchaseStatus,
          acknowledged: entitlement.acknowledged === true,
          configuredGooglePlay: result?.configured?.googlePlay === true,
          configuredPaddle: result?.configured?.paddle === true,
          customerPortalAvailable: result?.configured?.paddlePortal === true,
          syncing: false,
          error: "",
          lastSyncedAt: Date.now(),
        });

        setState((s) => applyBillingStateToLocalState(s, normalized));
        return normalized;
      } catch (error) {
        const errorCode = typeof error?.message === "string" ? error.message : "billing_sync_failed";
        setState((s) => applyBillingStateToLocalState(s, {
          ...s.billing,
          syncing: false,
          error: errorCode,
          lastSyncedAt: 0,
        }));
        throw error;
      } finally {
        if(billingSyncRef.current.userId === currentUserId && billingSyncRef.current.promise === syncPromise){
          billingSyncRef.current = { userId: currentUserId, promise: null };
        }
      }
    })();

    billingSyncRef.current = { userId: currentUserId, promise: syncPromise };
    return syncPromise;
  }

  async function hydrateProfileNameFromAccount({ userId, email }){
    const nextUserId = typeof userId === "string" ? userId : "";
    const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if(!nextUserId) return "";

    const localName = typeof stateRef.current?.profile?.name === "string"
      ? stateRef.current.profile.name.trim()
      : "";

    try {
      let remoteProfile = await ensureProfile({ userId: nextUserId, email: nextEmail });
      let remoteName = typeof remoteProfile?.name === "string" ? remoteProfile.name.trim() : "";

      if(!remoteName && localName){
        remoteProfile = await ensureProfile({ userId: nextUserId, email: nextEmail, name: localName });
        remoteName = typeof remoteProfile?.name === "string" ? remoteProfile.name.trim() : "";
      }

      return remoteName;
    } catch {
      return "";
    }
  }

  useEffect(() => {
    if(typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const billingStatus = url.searchParams.get("billing");
    if(!billingStatus) return;

    let toastText = "";
    let good = false;
    if(billingStatus === "success"){
      toastText = "Checkout completed. Refreshing your billing state...";
      good = true;
      const userId = typeof stateRef.current?.auth?.userId === "string" ? stateRef.current.auth.userId : "";
      if(userId) syncBillingState(userId).catch(() => {});
    }else if(billingStatus === "canceled"){
      toastText = "Checkout canceled.";
    }else if(billingStatus === "portal"){
      toastText = "Returned from billing management.";
      good = true;
      const userId = typeof stateRef.current?.auth?.userId === "string" ? stateRef.current.auth.userId : "";
      if(userId) syncBillingState(userId).catch(() => {});
    }

    url.searchParams.delete("billing");
    url.searchParams.delete("provider");
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);

    if(toastText){
      setState((s) => ({
        ...s,
        toast: { text: toastText, good, screen: s.screen },
      }));
    }
  }, []);

  // daily rollover
  useEffect(() => {
    if(typeof window === "undefined") return;

    let timeoutId = null;

    const applyRolloverIfNeeded = () => {
      const t = todayKey();
      if(stateRef.current.today === t) return;
      setState((prev) => rolloverStateToToday(prev, t));
    };

    const scheduleNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 50);
      const delayMs = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timeoutId = window.setTimeout(() => {
        applyRolloverIfNeeded();
        scheduleNextMidnight();
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if(document.visibilityState !== "visible") return;
      applyRolloverIfNeeded();
    };

    applyRolloverIfNeeded();
    scheduleNextMidnight();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if(timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Debounced push of board / check-in / events to Supabase for cross-device sync.
  const devicePushTimerRef = useRef(null);
  useEffect(() => {
    const userId = state?.auth?.userId;
    if(!userId) return;
    if(devicePushTimerRef.current) clearTimeout(devicePushTimerRef.current);
    devicePushTimerRef.current = setTimeout(() => {
      upsertDeviceState(userId, {
        date: state.today || todayKey(),
        checkin: state.checkin || {},
        level: state.level || "gentle",
        checkedInToday: state.checkedInToday || false,
        boardAssigned: state.boardAssigned || [],
        myDay: state.myDay || [],
        myDayCap: state.myDayCap || 5,
        options: state.options || [],
        optionsSource: state.optionsSource || "default",
        events: state.events || {},
      }).catch(() => {});
    }, 2000);
    return () => {
      if(devicePushTimerRef.current) clearTimeout(devicePushTimerRef.current);
    };
  }, [
    state?.auth?.userId,
    state?.today,
    state?.checkedInToday,
    state?.checkin,
    state?.level,
    state?.boardAssigned,
    state?.myDay,
    state?.events,
  ]);

  // Supabase auth bootstrap + listener
  useEffect(() => {
    const supabase = getSupabaseClient();
    if(!supabase) return;

    const handleAuthCallbackError = (event) => {
      const message = typeof event?.detail?.message === "string" && event.detail.message.trim()
        ? event.detail.message.trim()
        : "We couldn't complete sign-in. Try requesting a new code.";

      setState((s) => ({
        ...s,
        auth: {
          ...(s.auth || {}),
          signedIn: false,
          step: "request",
          status: "error",
          error: message,
        },
      }));
    };

    if (typeof window !== "undefined") {
      window.addEventListener(AUTH_CALLBACK_ERROR_EVENT, handleAuthCallbackError);
    }

    async function syncFromSupabase({ userId, canSyncNoteMemory, force = false }){
      if(!userId) return;
      const syncKey = `${userId}:${canSyncNoteMemory ? "plus" : "free"}`;
      const completedRecently = supabaseSyncRef.current.lastCompletedKey === syncKey
        && Date.now() - (Number(supabaseSyncRef.current.lastCompletedAt) || 0) < 5000;
      if(!force && (supabaseSyncRef.current.inFlightKey === syncKey || completedRecently)){
        return;
      }

      supabaseSyncRef.current = {
        inFlightKey: syncKey,
        lastCompletedKey: supabaseSyncRef.current.lastCompletedKey,
        lastCompletedAt: supabaseSyncRef.current.lastCompletedAt,
      };

      try {
        const remoteWeekly = await listWeeklySummariesRemote(userId);
        if(Array.isArray(remoteWeekly)){
          setState((s) => ({
            ...s,
            weeklySummaries: mergeWeeklySummaries(s.weeklySummaries, remoteWeekly),
          }));
        }
      } catch {
        // ignore
      }

      // Merge cross-device board / check-in / events snapshot.
      try {
        const remoteDevice = await fetchDeviceState(userId);
        if(remoteDevice){
          setState((s) => mergeRemoteDeviceState(s, remoteDevice));
        }
      } catch {
        // ignore — device sync is best-effort
      }

      if(!canSyncNoteMemory){
        if(supabaseSyncRef.current.inFlightKey === syncKey){
          supabaseSyncRef.current = {
            inFlightKey: "",
            lastCompletedKey: syncKey,
            lastCompletedAt: Date.now(),
          };
        }
        return;
      }
      try {
        const remoteNotes = await listNoteMemoryRemote(userId);
        const mergedNoteMemory = mergeNoteMemory(stateRef.current?.noteMemory, remoteNotes, NOTE_MEMORY_MAX);

        setState((s) => ({
          ...s,
          noteMemory: mergedNoteMemory,
        }));

      } catch {
        // ignore
      } finally {
        if(supabaseSyncRef.current.inFlightKey === syncKey){
          supabaseSyncRef.current = {
            inFlightKey: "",
            lastCompletedKey: syncKey,
            lastCompletedAt: Date.now(),
          };
        }
      }
    }

    let unsub = null;
    let bootSyncDone = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session || null;
        const email = session?.user?.email ? String(session.user.email) : "";
        const userId = session?.user?.id ? String(session.user.id) : "";

        const remoteProfileName = userId
          ? await hydrateProfileNameFromAccount({ userId, email })
          : "";

        setState((s) => ({
          ...s,
          auth: {
            ...(s.auth || {}),
            signedIn: !!session,
            userId,
            username: email || (s?.auth?.username || ""),
            step: "request",
            status: "idle",
            sentTo: "",
            otpCode: "",
            error: "",
          },
          profile: (() => {
            const currentProfile = s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" };
            const nextProfile = email ? { ...currentProfile, email } : currentProfile;
            return remoteProfileName ? { ...nextProfile, name: remoteProfileName } : nextProfile;
          })(),
        }));

        const billingState = await syncBillingState(userId).catch(() => normalizeBillingState(defaultBillingState()));
        syncFromSupabase({ userId, canSyncNoteMemory: hasVerifiedPlusNoteMemoryAccess(billingState), force: true });
        bootSyncDone = true;
      } catch {
        // Ignore; app can still run without auth.
        bootSyncDone = true;
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires synchronously on subscribe — boot getSession() already
      // handles the initial sync, so skip it here to avoid duplicate Supabase calls.
      const isInitialFire = event === "INITIAL_SESSION" || !bootSyncDone;
      const email = session?.user?.email ? String(session.user.email) : "";
      const userId = session?.user?.id ? String(session.user.id) : "";

      setState((s) => ({
        ...s,
        auth: {
          ...(s.auth || {}),
          signedIn: !!session,
          userId,
          username: email || (s?.auth?.username || ""),
          step: "request",
          status: "idle",
          sentTo: "",
          otpCode: "",
          error: "",
        },
        profile: (() => {
          const currentProfile = s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" };
          return email ? { ...currentProfile, email } : currentProfile;
        })(),
        screen: session ? (s.screen || "checkin") : "checkin",
      }));

      if(userId && !isInitialFire){
        hydrateProfileNameFromAccount({ userId, email })
          .then((remoteProfileName) => {
            if(!remoteProfileName) return;
            setState((s) => {
              if(s?.auth?.signedIn !== true || s?.auth?.userId !== userId) return s;
              const currentProfile = s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" };
              return {
                ...s,
                profile: { ...currentProfile, email: email || currentProfile.email, name: remoteProfileName },
              };
            });
          })
          .catch(() => {});

        syncBillingState(userId)
          .then((billingState) => {
            syncFromSupabase({ userId, canSyncNoteMemory: hasVerifiedPlusNoteMemoryAccess(billingState) });
          })
          .catch(() => {});
      }else if(!userId){
        // User is signed out — reset billing to free.
        supabaseSyncRef.current = { inFlightKey: "", lastCompletedKey: "", lastCompletedAt: 0 };
        syncBillingState("").catch(() => {});
      }
      // If isInitialFire && userId — boot getSession() already handles billing sync; skip.
    });
    unsub = data?.subscription?.unsubscribe || null;

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(AUTH_CALLBACK_ERROR_EVENT, handleAuthCallbackError);
      }
      try { unsub?.(); } catch { /* noop */ }
    };
  }, []);

  const actions = useMemo(() => ({
    trackEvent: (type, payload) =>
      setState(s => recordEventOnState(s, type, payload, { maxDays: EVENT_DAYS_TO_KEEP })),

    setAuthView: (view) =>
      setState(s => {
        const v = view === "signup" ? "signup" : "signin";
        return {
          ...s,
          auth: {
            ...(s.auth || {}),
            view: v,
            step: "request",
            status: "idle",
            otpCode: "",
            error: "",
          },
          toast: null,
        };
      }),

    requestEmailOtp: async ({ email, rememberMe, name } = {}) => {
      const nextEmail = String(email || "").trim().toLowerCase();
      const nextRememberMe = typeof rememberMe === "boolean" ? rememberMe : (stateRef.current?.auth?.rememberMe !== false);
      const nextName = typeof name === "string" ? name : "";
      const authView = stateRef.current?.auth?.view === "signup" ? "signup" : "signin";

      if(!nextEmail){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "request", status: "error", error: "Enter your email.", sentTo: "", otpCode: "" },
        }));
        return;
      }

      if(!isSupabaseConfigured){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "request", status: "error", error: "Supabase is not configured (missing env vars).", sentTo: "", otpCode: "" },
        }));
        return;
      }

      const supabase = getSupabaseClient();
      if(!supabase){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "request", status: "error", error: "Supabase client unavailable.", sentTo: "", otpCode: "" },
        }));
        return;
      }

      setState((s) => ({
        ...s,
        auth: {
          ...(s.auth || {}),
          rememberMe: nextRememberMe,
          username: clampText(nextEmail, 120),
          step: "request",
          status: "sending",
          error: "",
          sentTo: "",
          otpCode: "",
        },
        profile: nextName.trim()
          ? { ...(s.profile || {}), name: clampText(nextName, 40) }
          : s.profile,
      }));

      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: nextEmail,
          options: {
            shouldCreateUser: authView === "signup",
          },
        });

        if(error){
          setState((s) => ({
            ...s,
            auth: { ...(s.auth || {}), step: "request", status: "error", error: error.message || "Could not send code.", sentTo: "", otpCode: "" },
          }));
          return;
        }

        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "verify", status: "sent", sentTo: nextEmail, error: "", otpCode: "" },
        }));
      } catch {
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "request", status: "error", error: "Could not send code.", sentTo: "", otpCode: "" },
        }));
      }
    },

    verifyEmailOtp: async ({ email, code } = {}) => {
      const nextEmail = String(email || stateRef.current?.auth?.sentTo || stateRef.current?.auth?.username || "").trim().toLowerCase();
      const nextCode = String(code || "").trim();
      const authView = stateRef.current?.auth?.view === "signup" ? "signup" : "signin";

      if(!nextEmail){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "request", status: "error", error: "Enter your email first.", sentTo: "", otpCode: "" },
        }));
        return;
      }

      if(!nextCode){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "verify", status: "error", error: "Enter the code from your email.", sentTo: nextEmail, otpCode: "" },
        }));
        return;
      }

      if(!isSupabaseConfigured){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "verify", status: "error", error: "Supabase is not configured (missing env vars).", sentTo: nextEmail, otpCode: nextCode },
        }));
        return;
      }

      const supabase = getSupabaseClient();
      if(!supabase){
        setState((s) => ({
          ...s,
          auth: { ...(s.auth || {}), step: "verify", status: "error", error: "Supabase client unavailable.", sentTo: nextEmail, otpCode: nextCode },
        }));
        return;
      }

      setState((s) => ({
        ...s,
        auth: {
          ...(s.auth || {}),
          username: clampText(nextEmail, 120),
          step: "verify",
          status: "verifying",
          sentTo: nextEmail,
          otpCode: nextCode,
          error: "",
        },
      }));

      try {
        const verificationTypes = authView === "signup"
          ? ["signup", "magiclink", "email"]
          : ["magiclink", "email", "signup"];

        let verificationError = null;

        for (const verificationType of verificationTypes) {
          const { error } = await supabase.auth.verifyOtp({
            email: nextEmail,
            token: nextCode,
            type: verificationType,
          });

          if (!error) {
            verificationError = null;
            break;
          }

          verificationError = error;
        }

        if(verificationError){
          setState((s) => ({
            ...s,
            auth: {
              ...(s.auth || {}),
              step: "verify",
              status: "error",
              sentTo: nextEmail,
              otpCode: nextCode,
              error: verificationError.message || "Could not verify code.",
            },
          }));
        }
      } catch {
        setState((s) => ({
          ...s,
          auth: {
            ...(s.auth || {}),
            step: "verify",
            status: "error",
            sentTo: nextEmail,
            otpCode: nextCode,
            error: "Could not verify code.",
          },
        }));
      }
    },

    resetEmailOtp: () =>
      setState((s) => ({
        ...s,
        auth: {
          ...(s.auth || {}),
          step: "request",
          status: "idle",
          sentTo: "",
          otpCode: "",
          error: "",
        },
        profile: (() => {
          const currentProfile = s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" };
          return email ? { ...currentProfile, email } : currentProfile;
        })(),
      })),

    logout: async () => {
      const supabase = getSupabaseClient();
      try {
        await supabase?.auth?.signOut?.();
      } catch {
        // ignore
      }
      setState((s) => ({
        ...s,
        auth: {
          ...(s.auth || {}),
          signedIn: false,
          username: s?.auth?.rememberMe !== false ? (s?.auth?.username || "") : "",
          step: "request",
          status: "idle",
          sentTo: "",
          otpCode: "",
          error: "",
          view: "signin",
        },
        toast: null,
        screen: "checkin",
      }));
    },

    go: (screen) => {
      const current = stateRef.current;
      if(screen !== "wheel"){
        setState((s) => ({ ...s, screen, toast: null }));
        return;
      }

      const options = current.options?.length
        ? current.options
        : getDefaultOptions(current.checkin, current.level, current.today, getBillingPlanIdFromState(current));

      const nextBase = {
        ...current,
        screen: "wheel",
        options,
        toast: null,
        checkedInToday: current.screen === "checkin" ? true : current.checkedInToday,
      };

      let next = nextBase;
      let latestRemembered = null;

      if(current.screen === "checkin"){
        const note = typeof current.checkin?.note === "string" ? current.checkin.note.trim().slice(0, 200) : "";
        let withEvents = recordEventOnState(
          nextBase,
          "checkinSaved",
          {
            mood: current.checkin?.mood,
            energy: current.checkin?.energy,
            body: current.checkin?.body,
            pace: current.level,
            ...(note ? { note } : {}),
          },
          { maxDays: EVENT_DAYS_TO_KEEP }
        );

        const isPlus = hasVerifiedPlusNoteMemoryAccess(current?.billing);
        if(isPlus && note){
          const nextNoteMemory = addNoteToMemory(withEvents.noteMemory, { date: withEvents.today, text: note }, NOTE_MEMORY_MAX);
          latestRemembered = Array.isArray(nextNoteMemory?.notes) && nextNoteMemory.notes.length
            ? nextNoteMemory.notes[nextNoteMemory.notes.length - 1]
            : null;

          withEvents = {
            ...withEvents,
            noteMemory: nextNoteMemory,
          };
        }

        next = withEvents;
      }

      setState(next);

      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      const canSyncNoteMemory = hasVerifiedPlusNoteMemoryAccess(current?.billing);
      if(userId && canSyncNoteMemory && latestRemembered){
        syncNoteMemoryEntryRemote(userId, latestRemembered).catch(() => {});
      }
    },

    setCheckin: (patch) =>
      setState(s => {
        const checkin = { ...s.checkin, ...patch };
        const shouldResuggestLevel = patchAffectsSuggestedLevel(patch);
        const source = shouldResuggestLevel ? "auto" : (s.levelSource === "manual" ? "manual" : "auto");
        const level = source === "manual" ? s.level : suggestLevelFromCheckin(checkin);
        const options = getDefaultOptions(checkin, level, s.today, getBillingPlanIdFromState(s));
        return { ...s, checkin, level, levelSource: source, options, optionsSource: "default", dailyMessage: dailyMessageFromCheckin(checkin, level) };
      }),

    setLevel: (level) =>
      setState(s => {
        const options = getDefaultOptions(s.checkin, level, s.today, getBillingPlanIdFromState(s));
        return {...s, level, levelSource: "manual", options, optionsSource: "default", dailyMessage: dailyMessageFromCheckin(s.checkin, level) }
      }),

    suggestLevel: () =>
      setState(s => {
        const suggested = suggestLevelFromCheckin(s.checkin);
        const options = getDefaultOptions(s.checkin, suggested, s.today, getBillingPlanIdFromState(s));
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
        options: (getBillingPlanIdFromState(s) === "plus" && s.ai?.status === "ready" && s.ai.today === s.today && s.ai.sig === checkinSignature(s.checkin, s.level, s.profile?.useNoteForAi) && Array.isArray(s.ai.tasks) && s.ai.tasks.length)
          ? s.ai.tasks.map(t => ({ text: t.text, level: s.level }))
          : getDefaultOptions(s.checkin, s.level, s.today, getBillingPlanIdFromState(s)),
        optionsSource: (getBillingPlanIdFromState(s) === "plus" && s.ai?.status === "ready" && s.ai.today === s.today && s.ai.sig === checkinSignature(s.checkin, s.level, s.profile?.useNoteForAi) && Array.isArray(s.ai.tasks) && s.ai.tasks.length)
          ? "ai"
          : "default",
        boardAssigned: [],
        currentSpin: null,
      })),

    ensureAiBoard: async (checkin, level, today) => {
      if(getBillingPlanIdFromState(stateRef.current) !== "plus") return;

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
        const token = await getSupabaseAccessToken();
        const checkinForAi = includeNote ? checkin : { ...(checkin || {}), note: "" };
        const resp = await fetch(getApiUrl("/api/generate-board"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({ checkin: checkinForAi, level }),
        });

        if(!resp.ok){
          throw new Error(await readApiErrorCode(resp));
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
            : getAiBoardErrorMessage(err?.message);

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
        const token = await getSupabaseAccessToken();
        const checkinForAi = includeNote ? checkin : { ...(checkin || {}), note: "" };
        const resp = await fetch(getApiUrl("/api/daily-note"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({ checkin: checkinForAi, level, today: t }),
        });

        if(!resp.ok){
          throw new Error(await readApiErrorCode(resp));
        }

        const data = await resp.json();
        const note = data?.note && typeof data.note === "object" ? data.note : null;
        const title = typeof note?.title === "string" ? note.title.trim() : "";
        const body = typeof note?.body === "string" ? note.body.trim() : "";
        const focus = typeof note?.focus === "string" ? note.focus.trim() : "";
        const noteTextForSync = typeof checkin?.note === "string" ? checkin.note.trim().slice(0, 200) : "";
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
          const isPlus = hasVerifiedPlusNoteMemoryAccess(s?.billing);
          const shouldApplyThemes = isPlus && s.profile?.useNoteForAi !== false && noteTextForSync && themes.length > 0;
          const nextNoteMemory = shouldApplyThemes
            ? applyThemesToRememberedNote(s.noteMemory, { date: t, themes })
            : s.noteMemory;

          return {
            ...s,
            noteMemory: nextNoteMemory,
            aiDailyNote: { status: "ready", today: t, sig, title, body, focus, themes, error: "" },
          };
        });

        const currentUserId = typeof stateRef.current?.auth?.userId === "string" ? stateRef.current.auth.userId : "";
        const canSyncNoteMemory = hasVerifiedPlusNoteMemoryAccess(stateRef.current?.billing);
        if(currentUserId && canSyncNoteMemory && noteTextForSync && themes.length > 0){
          syncNoteMemoryEntryRemote(currentUserId, {
            date: t,
            text: noteTextForSync,
            themes,
            ts: Date.now(),
          }).catch(() => {});
        }
      } catch (err) {
        if(requestId !== aiNoteReqRef.current.requestId) return;

        const message =
          err && typeof err === "object" && (err.name === "AbortError" || String(err.message || "").includes("aborted"))
            ? ""
            : getAiDailyNoteErrorMessage(err?.message);

        setState(s => {
          const liveSig = dailyNoteSignature(s.checkin, s.level, s.profile?.useNoteForAi, t);
          if(s.today !== t || liveSig !== sig) return s;

          // Silent fallback: keep local dailyMessage visible.
          return {
            ...s,
            aiDailyNote: { ...s.aiDailyNote, status: "error", today: t, sig, title: "", body: "", focus: "", themes: [], error: message },
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
        const pickToast = getNextPickToast(s.checkin, s.currentSpin?.level || s.level, s.pickToastCycle);
        const next = {
          ...s,
          myDay: [...s.myDay, { id, text: s.currentSpin.text, done:false }],
          pickToastCycle: pickToast.nextCycle,
          currentSpin: null,
          toast: {
            text: pickToast.text,
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
        const pickToast = getNextPickToast(s.checkin, opt.level || s.level, s.pickToastCycle);
        const next = {
          ...s,
          myDay: [...s.myDay, { id, text: opt.text, done:false }],
          pickToastCycle: pickToast.nextCycle,
          toast: {
            text: pickToast.text,
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
        if(getBillingPlanIdFromState(s) === "plus") return s;
        const f = typeof feature === "string" ? feature : "plus";
        const src = typeof source === "string" ? source : "";
        return { ...s, paywall: { feature: f, source: src } };
      }),

    closePaywall: () => setState(s => ({ ...s, paywall: null })),

    refreshBilling: async () => {
      try {
        return await syncBillingState();
      } catch (error) {
        const message = getBillingErrorMessage(error?.message);
        setState((s) => ({
          ...s,
          toast: { text: message, good: false, screen: s.screen },
        }));
        throw error;
      }
    },

    startBillingUpgrade: async () => {
      const current = stateRef.current;
      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      if(!userId){
        setState((s) => ({
          ...s,
          toast: { text: "Sign in before upgrading Attune.", good: false, screen: s.screen },
        }));
        return;
      }

      if(!isNativePlatform()){
        setState((s) => applyBillingStateToLocalState(s, {
          ...s.billing,
          syncing: true,
          error: "",
        }));

        try {
          const email = typeof current?.auth?.email === "string" && current.auth.email
            ? current.auth.email
            : typeof current?.profile?.email === "string"
              ? current.profile.email
              : "";
          const billingState = await syncBillingState(userId).catch(() => normalizeBillingState(defaultBillingState()));
          if(!(billingState.configuredPaddle === true && isPaddleCheckoutSupported())) {
            throw new Error("paddle_not_configured");
          }

          await openPaddleCheckout({
            email,
            userId,
            onEvent: (event) => {
              const eventName = String(event?.name || "");

              if(eventName === "checkout.completed"){
                setState((s) => ({
                  ...s,
                  paywall: null,
                  toast: { text: "Checkout completed. Refreshing your billing state...", good: true, screen: s.screen },
                }));

                window.setTimeout(() => {
                  syncBillingState(userId)
                    .then((nextBilling) => {
                      setState((s) => ({
                        ...s,
                        toast: {
                          text: nextBilling.planId === "plus"
                            ? "Attune Plus is now active for this account."
                            : "Checkout completed. Billing is still syncing.",
                          good: nextBilling.planId === "plus",
                          screen: s.screen,
                        },
                      }));
                    })
                    .catch(() => {});
                }, 1500);
                return;
              }

              if(eventName === "checkout.closed"){
                setState((s) => applyBillingStateToLocalState(s, {
                  ...s.billing,
                  syncing: false,
                }));
                return;
              }

              if(eventName === "checkout.error"){
                setState((s) => applyBillingStateToLocalState({
                  ...s,
                  toast: { text: getBillingErrorMessage("paddle_checkout_failed"), good: false, screen: s.screen },
                }, {
                  ...s.billing,
                  syncing: false,
                  error: "paddle_checkout_failed",
                }));
              }
            },
          });
          return;
        } catch (error) {
          const errorCode = typeof error?.message === "string" ? error.message : "paddle_checkout_failed";
          setState((s) => applyBillingStateToLocalState({
            ...s,
            toast: { text: getBillingErrorMessage(errorCode), good: false, screen: s.screen },
          }, {
            ...s.billing,
            syncing: false,
            error: errorCode,
          }));
          return;
        }
      }

      if(!isPlayBillingSupported()){
        setState((s) => ({
          ...s,
          toast: { text: "Google Play billing is only available inside the Android app right now.", good: false, screen: s.screen },
        }));
        return;
      }

      setState((s) => applyBillingStateToLocalState(s, {
        ...s.billing,
        syncing: true,
        error: "",
      }));

      try {
        const products = await getPlayBillingProducts();
        if(!Array.isArray(products) || !products.length) throw new Error("play_billing_product_not_found");

        const purchaseResult = await purchasePlayBillingSubscription(userId);
        const purchases = Array.isArray(purchaseResult?.purchases) ? purchaseResult.purchases : [];
        if(!purchases.length) throw new Error("play_billing_purchase_missing");

        for(const purchase of purchases){
          const purchaseToken = typeof purchase?.purchaseToken === "string" ? purchase.purchaseToken.trim() : "";
          if(!purchaseToken) continue;

          const verification = await verifyGooglePlayPurchase({
            packageName: getPlayBillingPackageName(),
            purchaseToken,
          });

          const acknowledged = purchase?.acknowledged === true || verification?.purchase?.acknowledged === true;
          if(!acknowledged){
            await acknowledgePlayBillingPurchase(purchaseToken).catch(() => {});
          }
        }

        await syncBillingState(userId);
        setState((s) => ({
          ...s,
          paywall: null,
          toast: { text: "Attune Plus is now active for this account.", good: true, screen: s.screen },
        }));
      } catch (error) {
        const errorCode = typeof error?.message === "string" ? error.message : "billing_purchase_failed";
        setState((s) => applyBillingStateToLocalState({
          ...s,
          toast: { text: getBillingErrorMessage(errorCode), good: false, screen: s.screen },
        }, {
          ...s.billing,
          syncing: false,
          error: errorCode,
        }));
      }
    },

    restoreBillingPurchases: async () => {
      const current = stateRef.current;
      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      if(!userId){
        setState((s) => ({
          ...s,
          toast: { text: "Sign in before restoring purchases.", good: false, screen: s.screen },
        }));
        return;
      }

      if(!isNativePlatform()){
        try {
          const billingState = await syncBillingState(userId);
          setState((s) => ({
            ...s,
            toast: {
              text: billingState.planId === "plus"
                ? "Refreshed your web billing state."
                : "No active web subscription was found for this account.",
              good: billingState.planId === "plus",
              screen: s.screen,
            },
          }));
        } catch (error) {
          const errorCode = typeof error?.message === "string" ? error.message : "billing_restore_failed";
          setState((s) => ({
            ...s,
            toast: { text: getBillingErrorMessage(errorCode), good: false, screen: s.screen },
          }));
        }
        return;
      }

      if(!isPlayBillingSupported()){
        setState((s) => ({
          ...s,
          toast: { text: "Restore purchases is only available inside the Android app.", good: false, screen: s.screen },
        }));
        return;
      }

      setState((s) => applyBillingStateToLocalState(s, {
        ...s.billing,
        syncing: true,
        error: "",
      }));

      try {
        const purchases = await restorePlayBillingPurchases();
        let verifiedCount = 0;
        for(const purchase of purchases){
          const purchaseToken = typeof purchase?.purchaseToken === "string" ? purchase.purchaseToken.trim() : "";
          if(!purchaseToken) continue;
          await verifyGooglePlayPurchase({
            packageName: getPlayBillingPackageName(),
            purchaseToken,
          });
          if(purchase?.acknowledged !== true){
            await acknowledgePlayBillingPurchase(purchaseToken).catch(() => {});
          }
          verifiedCount += 1;
        }

        const billingState = await syncBillingState(userId);
        setState((s) => ({
          ...s,
          toast: {
            text: verifiedCount > 0 && billingState.planId === "plus"
              ? "Restored your Attune Plus purchase."
              : "No active Play purchase was found for this account.",
            good: verifiedCount > 0 && billingState.planId === "plus",
            screen: s.screen,
          },
        }));
      } catch (error) {
        const errorCode = typeof error?.message === "string" ? error.message : "billing_restore_failed";
        setState((s) => applyBillingStateToLocalState({
          ...s,
          toast: { text: getBillingErrorMessage(errorCode), good: false, screen: s.screen },
        }, {
          ...s.billing,
          syncing: false,
          error: errorCode,
        }));
      }
    },

    openBillingPortal: async () => {
      const current = stateRef.current;
      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      if(!userId){
        setState((s) => ({
          ...s,
          toast: { text: "Sign in before managing billing.", good: false, screen: s.screen },
        }));
        return;
      }

      if(isNativePlatform()){
        setState((s) => ({
          ...s,
          toast: { text: "Billing management is available on the web right now.", good: false, screen: s.screen },
        }));
        return;
      }

      setState((s) => applyBillingStateToLocalState(s, {
        ...s.billing,
        syncing: true,
        error: "",
      }));

      try {
        const session = await createPaddlePortalSession();
        const url = typeof session?.url === "string" ? session.url.trim() : "";
        if(!url) throw new Error("paddle_portal_failed");
        window.location.assign(url);
      } catch (error) {
        const errorCode = typeof error?.message === "string" ? error.message : "paddle_portal_failed";
        setState((s) => applyBillingStateToLocalState({
          ...s,
          toast: { text: getBillingErrorMessage(errorCode), good: false, screen: s.screen },
        }, {
          ...s.billing,
          syncing: false,
          error: errorCode,
        }));
      }
    },

    setBoardAssigned: (boardAssigned) =>
      setState(s => ({ ...s, boardAssigned: Array.isArray(boardAssigned) ? boardAssigned : [] })),

    setProfile: (patch) => {
      const rawPatch = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
      const { plan: _ignoredPlan, email: _ignoredEmail, ...nextPatch } = rawPatch;
      const current = stateRef.current || {};
      const currentProfile = current.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" };
      const previousName = typeof currentProfile.name === "string" ? currentProfile.name : "";

      let nextNameForSync = "";
      let shouldSyncName = false;

      setState(s => {
        const profile = { ...(s.profile || { name: "", email: "", useNoteForAi: true, theme: "light", plan: "free" }), ...nextPatch };
        if(typeof profile.name !== "string") profile.name = "";
        if(profile.name.length > 40) profile.name = profile.name.slice(0, 40);

        const authEmail = typeof s?.auth?.username === "string" ? s.auth.username.trim().toLowerCase() : "";
        if(authEmail) profile.email = authEmail;
        else if(typeof profile.email !== "string") profile.email = "";

        if(typeof profile.useNoteForAi !== "boolean") profile.useNoteForAi = true;

        if(typeof profile.theme !== "string") profile.theme = "light";
        if(profile.theme !== "light" && profile.theme !== "dark") profile.theme = "light";

        if(typeof profile.plan !== "string") profile.plan = "free";
        if(profile.plan !== "free" && profile.plan !== "plus") profile.plan = "free";

        if(profile.plan !== "plus") profile.theme = "light";

        nextNameForSync = profile.name;
        shouldSyncName = Object.prototype.hasOwnProperty.call(nextPatch, "name") && profile.name !== previousName;

        return { ...s, profile };
      });

      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      if(shouldSyncName && userId){
        updateProfile(userId, { name: nextNameForSync }).catch(() => {});
      }
    },

    setPlan: (nextPlan) => {
      const requestedPlan = nextPlan === "plus" ? "plus" : "free";
      setState((s) => ({
        ...s,
        toast: {
          text: requestedPlan === "plus"
            ? "Direct local plan changes are disabled. Use real billing instead."
            : "Free plan is controlled by your verified billing state.",
          good: false,
          screen: s.screen,
        },
      }));
    },

    clearNoteMemory: () => {
      const current = stateRef.current;
      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      const canSyncNoteMemory = hasVerifiedPlusNoteMemoryAccess(current?.billing);

      setState(s => ({
        ...s,
        noteMemory: clearNoteMemoryObj(s.noteMemory),
        toast: {
          text: userId && canSyncNoteMemory
            ? "Cleared note memory on this device. Clearing synced notes..."
            : "Cleared note memory on this device.",
          good: true,
          screen: s.screen,
        },
      }));

      if(userId && canSyncNoteMemory){
        deleteAllNoteMemoryRemote(userId)
          .then(() => {
            setState((s) => ({
              ...s,
              toast: { text: "Cleared synced note history.", good: true, screen: s.screen },
            }));
          })
          .catch(() => {
            setState((s) => ({
              ...s,
              toast: {
                text: "Cleared note memory on this device, but synced notes could not be cleared.",
                good: false,
                screen: s.screen,
              },
            }));
          });
      }
    },

    clearDeviceData: () =>
      setState(() => ({
        ...defaultState(),
        toast: { text: "Signed out. This device is cleared.", good: false, screen: "checkin" },
      })),

    saveWeeklyNote: (weekStart, text) => {
      const current = stateRef.current;
      const startKey = typeof weekStart === "string" ? weekStart : "";
      if(!startKey) return;

      const NOTE_CHAR_LIMIT = 500;
      const input = typeof text === "string" ? text : "";
      const nextText = input.length > NOTE_CHAR_LIMIT ? input.slice(0, NOTE_CHAR_LIMIT) : input;
      const nowMs = Date.now();

      // Compute the updated weeklySummaries list.
      const weekRecords = buildWeekRecordsFromHistory(current.history, startKey).map((d) => {
        if(d.date !== current.today) return d;
        return {
          ...d,
          checkedIn: !!current.checkedInToday,
          level: current.level,
          tasksAdded: current.myDay?.length || 0,
          tasksDone: current.myDay?.filter((t) => t.done).length || 0,
        };
      });
      const computed = computeWeekSummaryFromWeekRecords(weekRecords, startKey);
      let weeklySummaries = computed ? upsertWeeklySummary(current.weeklySummaries, computed, 52) : (Array.isArray(current.weeklySummaries) ? current.weeklySummaries : []);

      const list = weeklySummaries.slice();
      const idx = list.findIndex((w) => w?.weekStart === startKey);
      if(idx < 0) return;

      let toastText = "Saved.";

      const trimmed = nextText.trim();
      const prev = list[idx] || null;
      if(!trimmed){
        const hadExistingNote = !!(prev?.weekNote || prev?.weekNoteUpdatedAt);
        if(!hadExistingNote) return;
        toastText = "Note cleared.";
        const { weekNote: _weekNote, weekNoteUpdatedAt: _weekNoteUpdatedAt, ...rest } = prev || {};
        list[idx] = { ...rest };
      }else{
        const unchanged = prev?.weekNote === nextText;
        if(unchanged) return;
        if(!unchanged) list[idx] = { ...prev, weekNote: nextText, weekNoteUpdatedAt: nowMs };
      }

      const nextState = {
        ...current,
        weeklySummaries: list,
        toast: { text: toastText, good: true, screen: current.screen },
      };

      setState(nextState);

      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      if(userId){
        const localSummary = list[idx];
        const payload = toDbWeeklySummary({ userId, localSummary });
        if(payload) upsertWeeklySummaryRemote(payload).catch(() => {});
      }
    },

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

    endDay: () => {
      const current = stateRef.current;
      const doneCount = current.myDay.filter(x=>x.done).length;

      let toast;
      if(current.myDay.length === 0){
        toast = { text: ENCOURAGE_EMPTY[Math.floor(Math.random()*ENCOURAGE_EMPTY.length)], good: false, screen: current.screen };
      }else if(doneCount === 0){
        toast = { text: "That’s okay. Choosing was still care. Tomorrow we go gently again.", good: false, screen: current.screen };
      }else{
        toast = { text: "You did what you could today. That matters.", good: true, screen: current.screen };
      }

      const rolled = rollDayToHistory(current);

        // Snapshot/update weekly summary for this week.
      const weekStart = weekStartMondayKey(rolled.today);
      let weeklySummaries = rolled.weeklySummaries;
      let computedSummary = null;
      if(weekStart){
        const weekRecords = buildWeekRecordsFromHistory(rolled.history, weekStart);
        computedSummary = computeWeekSummaryFromWeekRecords(weekRecords, weekStart);
        if(computedSummary) weeklySummaries = upsertWeeklySummary(weeklySummaries, computedSummary, 52);
      }

      const nextState = {
        ...rolled,
        weeklySummaries,
        options: [],
        boardAssigned: [],
        myDay: [],
        currentSpin: null,
        toast,
      };

      setState(nextState);

      const userId = typeof current?.auth?.userId === "string" ? current.auth.userId : "";
      if(userId && computedSummary && weekStart){
        // If a note exists locally for this week, include it.
        const existing = Array.isArray(nextState.weeklySummaries)
          ? nextState.weeklySummaries.find((w) => w?.weekStart === weekStart)
          : null;

        const payload = toDbWeeklySummary({ userId, localSummary: existing || computedSummary });
        if(payload) upsertWeeklySummaryRemote(payload).catch(() => {});
      }
    },

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
      setState(s => {
        // Keep tasks the user has already completed — they earned those.
        const doneTasks = Array.isArray(s.myDay) ? s.myDay.filter(t => t?.done) : [];
        return {
          ...s,
          options: [],
          optionsSource: "default",
          boardAssigned: [],
          myDay: doneTasks,
          currentSpin: null,
          myDayCap: 5,
          toast: { text: "Reset done. Fresh start, gently.", good: false, screen: s.screen }
        };
      }),
  }), []);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

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

function rolloverStateToToday(prev, nextToday){
  const rolled = rollDayToHistory(prev);
  const weekStart = weekStartMondayKey(prev.today);
  let weeklySummaries = rolled.weeklySummaries;

  if(weekStart){
    const weekRecords = buildWeekRecordsFromHistory(rolled.history, weekStart);
    const summary = computeWeekSummaryFromWeekRecords(weekRecords, weekStart);
    if(summary) weeklySummaries = upsertWeeklySummary(weeklySummaries, summary, 52);
  }

  const checkin = { ...DEFAULT_CHECKIN };
  const level = "gentle";

  return {
    ...rolled,
    today: nextToday,
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
}
