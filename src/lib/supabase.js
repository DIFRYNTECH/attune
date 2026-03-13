import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

let _client = null;

export function getSupabaseClient() {
	if (_client) return _client;
	if (!isSupabaseConfigured) return null;
	_client = createClient(supabaseUrl, supabaseAnonKey);
	return _client;
}