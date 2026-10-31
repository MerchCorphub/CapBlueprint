import { supabase } from './supabase';

export type AIAction = 'followups' | 'findings' | 'solutions' | 'document' | 'blueprint';

export type AIResult<T> = { ok: true; result: T } | { ok: false; message: string };

/** Call the server-side AI function. Never throws; failures come back as { ok:false }. */
export async function runAI<T>(action: AIAction, businessId: string, payload: unknown): Promise<AIResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('cap-ai', { body: { action, business_id: businessId, payload } });
    if (error) return { ok: false, message: error.message || 'The AI service could not be reached.' };
    if (!data?.ok) return { ok: false, message: data?.message ?? 'The AI service is unavailable.' };
    return { ok: true, result: data.result as T };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'The AI service could not be reached.' };
  }
}
