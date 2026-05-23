import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ——————————————————————————————
// Supabase client — browser-safe singleton.
// Returns null when env vars are missing (falls back to localStorage).
// ——————————————————————————————

let client: SupabaseClient | null = null;
let checked = false;

export function getSupabase(): SupabaseClient | null {
  if (checked) return client;
  checked = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.log('[Supabase] env vars missing — using localStorage fallback');
    return null;
  }

  client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  console.log('[Supabase] client initialized');
  return client;
}

export function hasSupabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
