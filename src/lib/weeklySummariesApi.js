import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

export async function listWeeklySummaries(userId) {
  if (!userId) throw new Error("listWeeklySummaries: userId is required");
  const client = requireSupabase();

  const { data, error } = await client
    .from("weekly_summaries")
    .select(
      "id,user_id,week_start,pace,archetype,summary,metrics,created_at,updated_at",
    )
    .eq("user_id", userId)
    .order("week_start", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertWeeklySummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("upsertWeeklySummary: summary must be an object");
  }

  const client = requireSupabase();

  // Accept either camelCase or snake_case from the caller.
  const payload = {
    id: summary.id,
    user_id: summary.user_id ?? summary.userId,
    week_start: summary.week_start ?? summary.weekStart,
    pace: summary.pace,
    archetype: summary.archetype,
    summary: summary.summary,
    metrics: summary.metrics,
  };

  if (!payload.user_id) throw new Error("upsertWeeklySummary: user_id is required");
  if (!payload.week_start) throw new Error("upsertWeeklySummary: week_start is required");

  // Remove undefined keys so we don't accidentally null-out columns.
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data, error } = await client
    .from("weekly_summaries")
    .upsert(payload, { onConflict: "user_id,week_start" })
    .select(
      "id,user_id,week_start,pace,archetype,summary,metrics,created_at,updated_at",
    )
    .single();

  if (error) throw error;
  return data;
}
