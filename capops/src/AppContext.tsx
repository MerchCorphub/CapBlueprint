import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, must } from './lib/supabase';
import { loadBundle, loadQuestions, type BusinessBundle } from './lib/data';
import type { Assessment, Business, CapQuestion } from './lib/types';

interface Ctx {
  session: Session | null;
  authReady: boolean;
  recovery: boolean;
  setRecovery: (v: boolean) => void;
  businesses: Business[];
  business: Business | null;
  selectBusiness: (id: string | null) => void;
  questions: CapQuestion[];
  bundle: BusinessBundle | null;
  latest: Assessment | null;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const AppCtx = createContext<Ctx | null>(null);
const KEY = 'capops.business';

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [questions, setQuestions] = useState<CapQuestion[]>([]);
  const [bundle, setBundle] = useState<BusinessBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session) { setBusinesses([]); setBundle(null); return; }
    setLoading(true); setError(null);
    try {
      const [bs, qs] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        questions.length ? Promise.resolve(null) : loadQuestions(),
      ]);
      const list = must(bs) as Business[];
      setBusinesses(list);
      if (qs) setQuestions(qs);
      let id = businessId;
      if (!id || !list.some((b) => b.id === id)) id = list[0]?.id ?? null;
      if (id !== businessId) setBusinessId(id);
      setBundle(id ? await loadBundle(id) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your data.');
    } finally {
      setLoading(false);
    }
  }, [session, businessId, questions.length]);

  useEffect(() => { refresh(); }, [session?.user.id, businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectBusiness = (id: string | null) => {
    setBusinessId(id);
    try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  };

  const business = businesses.find((b) => b.id === businessId) ?? null;
  const latest = bundle?.assessments.length ? bundle.assessments[bundle.assessments.length - 1] : null;

  const value = useMemo<Ctx>(() => ({
    session, authReady, recovery, setRecovery, businesses, business, selectBusiness, questions, bundle, latest, refresh, loading, error,
  }), [session, authReady, recovery, businesses, business, questions, bundle, latest, refresh, loading, error]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}
