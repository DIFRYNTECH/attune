import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

export async function getProfile(userId) {
  if (!userId) throw new Error("getProfile: userId is required");
  const client = requireSupabase();

  const { data, error } = await client
    .from("profiles")
    .select(
      "user_id,name,email,theme,use_note_for_ai,my_day_cap,created_at,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  if (!userId) throw new Error("updateProfile: userId is required");
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("updateProfile: updates must be an object");
  }

  const client = requireSupabase();

  const { data, error } = await client
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select(
      "user_id,name,email,theme,use_note_for_ai,my_day_cap,created_at,updated_at",
    )
    .single();

  if (error) throw error;
  return data;
}

export async function ensureProfile({ userId, email, name } = {}) {
  const uid = typeof userId === "string" ? userId : "";
  if (!uid) throw new Error("ensureProfile: userId is required");

  const client = requireSupabase();

  const payload = {
    user_id: uid,
  };

  const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const nextName = typeof name === "string" ? name.trim() : "";

  if (nextEmail) payload.email = nextEmail;
  if (nextName) payload.name = nextName;

  const { data, error } = await client
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "user_id,name,email,theme,use_note_for_ai,my_day_cap,created_at,updated_at",
    )
    .single();

  if (error) throw error;
  return data;
}
