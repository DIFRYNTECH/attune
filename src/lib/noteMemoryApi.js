import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

export async function listNoteMemory(userId) {
  if (!userId) throw new Error("listNoteMemory: userId is required");
  const client = requireSupabase();

  const { data, error } = await client
    .from("note_memory")
    .select("id,user_id,note,pinned,last_used_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createNoteMemory(note) {
  if (!note || typeof note !== "object" || Array.isArray(note)) {
    throw new Error("createNoteMemory: note must be an object");
  }

  const client = requireSupabase();

  const payload = {
    user_id: note.user_id ?? note.userId,
    note: note.note,
    pinned: note.pinned,
    last_used_at: note.last_used_at ?? note.lastUsedAt,
  };

  if (!payload.user_id) throw new Error("createNoteMemory: user_id is required");
  if (typeof payload.note !== "string" || !payload.note.trim()) {
    throw new Error("createNoteMemory: note.note must be a non-empty string");
  }

  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data, error } = await client
    .from("note_memory")
    .insert(payload)
    .select("id,user_id,note,pinned,last_used_at,created_at,updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateNoteMemory(id, updates) {
  if (!id) throw new Error("updateNoteMemory: id is required");
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("updateNoteMemory: updates must be an object");
  }

  const client = requireSupabase();

  const payload = {
    note: updates.note,
    pinned: updates.pinned,
    last_used_at: updates.last_used_at ?? updates.lastUsedAt,
  };

  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data, error } = await client
    .from("note_memory")
    .update(payload)
    .eq("id", id)
    .select("id,user_id,note,pinned,last_used_at,created_at,updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNoteMemory(id) {
  if (!id) throw new Error("deleteNoteMemory: id is required");
  const client = requireSupabase();

  const { error } = await client.from("note_memory").delete().eq("id", id);
  if (error) throw error;
  return true;
}
