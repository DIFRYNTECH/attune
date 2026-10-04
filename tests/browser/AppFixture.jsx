import { useMemo, useState } from "react";
import { AppExperience } from "../../src/app/App.jsx";
import { useAttuneStore } from "../../src/store/useAttuneStore.js";
import { getEntitlements } from "../../src/lib/entitlements.js";
import { todayKey } from "../../src/lib/storage.js";
import { buildWeekRecordsFromHistory, computeWeekSummaryFromWeekRecords, weekStartMondayKey } from "../../src/lib/weeklyHistory.js";
import "../../src/index.css";
import "../../src/attune.css";
import "../../src/app-theme.css";

const params = new URLSearchParams(window.location.search);
const initialScreen = params.get("screen") || "checkin";
const plan = params.get("plan") === "free" ? "free" : "plus";
const initialAuth = params.get("auth");
const history = Array.from({ length: 21 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() - index - 1);
  return { date: todayKey(date), checkedIn: index % 4 !== 0, level: "gentle", tasksAdded: 3, tasksDone: index % 4 };
});
const summaries = [...new Set(history.map(day => weekStartMondayKey(day.date)))].map(start =>
  computeWeekSummaryFromWeekRecords(buildWeekRecordsFromHistory(history, start), start));
const sampleActivities = ["Take a quiet five-minute break", "Prepare something simple to eat", "Spend a few minutes with a favourite book"];
const sampleEvents = Object.fromEntries(history.map(day => [day.date, Array.from({ length: day.tasksDone }, (_, index) => ({
  id: `fixture-${day.date}-${index}`, type: "activityCompleted", text: sampleActivities[index], pace: "gentle", ts: new Date(`${day.date}T12:00:00`).getTime(),
}))]));

// Only this dev HTML entry renders synthetic identity. The real store remains signed out.
export default function AppFixture() {
  const { state, actions } = useAttuneStore();
  const [screen, setScreen] = useState(initialScreen);
  const [auth, setAuth] = useState({ signedIn: !initialAuth, view: initialAuth || "signin", step: "request", status: "idle", rememberMe: false });
  const [profile, setProfile] = useState({ name: params.get("name") || "Alex", email: "alex@example.test", theme: params.get("theme") || "light" });
  const fixtureActions = useMemo(() => ({
    ...actions,
    go: next => { actions.go(next); setScreen(next); },
    setProfile: next => setProfile(current => ({ ...current, ...next })),
    ensureAiBoard: () => {},
    ensureAiDailyNote: () => {},
    refreshBilling: async () => {},
    startBillingUpgrade: () => {},
    openBillingPortal: () => {},
    restoreBillingPurchases: () => {},
    clearDeviceData: () => {},
    clearNoteMemory: () => {},
    signOut: () => setAuth(current => ({ ...current, signedIn: false })),
    setAuthView: view => setAuth(current => ({ ...current, view, step: "request" })),
    requestEmailOtp: ({ email }) => setAuth(current => ({ ...current, step: "verify", sentTo: email })),
    resetEmailOtp: () => setAuth(current => ({ ...current, step: "request" })),
    verifyEmailOtp: () => setAuth(current => ({ ...current, signedIn: true })),
  }), [actions]);
  if (state.auth.signedIn) return <p>This fixture requires a separate, signed-out local origin.</p>;
  return <AppExperience state={{ ...state, screen, auth, profile: { ...state.profile, ...profile },
    entitlements: getEntitlements(plan), history: params.has("empty") ? [] : history,
    weeklySummaries: [...new Map([...(params.has("empty") ? [] : summaries), ...state.weeklySummaries].map(week => [week.weekStart, week])).values()],
    events: { ...(params.has("empty") ? {} : sampleEvents), ...state.events },
    ai: { status: "error", error: "" }, aiDailyNote: { status: "idle" },
  }} actions={fixtureActions} />;
}
