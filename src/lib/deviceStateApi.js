import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

const COLS =
  "id,user_id,date,checkin,level,checked_in_today,board_assigned,my_day,my_day_cap,options,options_source,events,updated_at";

/**
 * Fetch the stored device state snapshot for a user.
 * Returns null if none exists yet.
 */
export async function fetchDeviceState(userId) {
  if (!userId) throw new Error("fetchDeviceState: userId is required");
  const client = requireSupabase();

  const { data, error } = await client
    .from("user_device_state")
    .select(COLS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Upsert (insert-or-update) a device state snapshot for a user.
 * Conflicts on user_id (one row per user).
 */
export async function upsertDeviceState(userId, payload) {
  if (!userId) throw new Error("upsertDeviceState: userId is required");
  const client = requireSupabase();

  const row = {
    user_id: userId,
    date: payload.date,
    checkin: payload.checkin ?? {},
    level: payload.level ?? "gentle",
    checked_in_today: payload.checkedInToday ?? false,
    board_assigned: payload.boardAssigned ?? [],
    my_day: payload.myDay ?? [],
    my_day_cap: payload.myDayCap ?? 5,
    options: payload.options ?? [],
    options_source: payload.optionsSource ?? "default",
    events: payload.events ?? {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("user_device_state")
    .upsert(row, { onConflict: "user_id" })
    .select(COLS)
    .single();

  if (error) throw error;
  return data;
}
