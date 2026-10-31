import { createClient } from '@supabase/supabase-js';

// The URL and publishable key are public by design; data is protected by
// Row Level Security. Override with VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://cpzhfefqvqjontyktwxr.supabase.co';
const key = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_hEzawPqm9z1yU9L6e7vfTA_iera7SyS';

export const supabase = createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Throw a readable error from a Supabase response. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
