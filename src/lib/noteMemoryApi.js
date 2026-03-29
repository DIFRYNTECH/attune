import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

function normalizeThemes(themes) {
  if (!Array.isArray(themes)) return [];
  return [...new Set(
    themes
      .filter((theme) => typeof theme === "string")
      .map((theme) => theme.trim().toLowerCase())
      .filter(Boolean),
  )].slice(0, 2);
}

export async function listNoteMemory(userId) {
  if (!userId) throw new Error("listNoteMemory: userId is required");
  const client = requireSupabase();

  const { data, error } = await client
    .from("note_memory")
    .select("id,user_id,note_date,note,themes,last_used_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("note_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertNoteMemory(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("upsertNoteMemory: entry must be an object");
  }

  const client = requireSupabase();

  const payload = {
    user_id: entry.user_id ?? entry.userId,
    note_date: entry.note_date ?? entry.noteDate,
    note: entry.note,
    themes: normalizeThemes(entry.themes),
    last_used_at: entry.last_used_at ?? entry.lastUsedAt,
  };

  if (!payload.user_id) throw new Error("upsertNoteMemory: user_id is required");
  if (!payload.note_date) throw new Error("upsertNoteMemory: note_date is required");
  if (typeof payload.note !== "string" || !payload.note.trim()) {
    throw new Error("upsertNoteMemory: note must be a non-empty string");
  }

  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  const { data, error } = await client
    .from("note_memory")
    .upsert(payload, { onConflict: "user_id,note_date" })
    .select("id,user_id,note_date,note,themes,last_used_at,created_at,updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAllNoteMemory(userId) {
  if (!userId) throw new Error("deleteAllNoteMemory: userId is required");
  const client = requireSupabase();

  const { error } = await client.from("note_memory").delete().eq("user_id", userId);
  if (error) throw error;
  return true;
}
