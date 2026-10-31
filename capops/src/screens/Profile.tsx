import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { supabase, must } from '../lib/supabase';
import type { Business } from '../lib/types';
import { Field, Notice, PageHead } from '../components/ui';

type Form = Omit<Business, 'id' | 'owner_id' | 'created_at' | 'updated_at'>;
const BLANK: Form = { name: '', industry: '', business_stage: '', location: '', years_operating: null, employee_count: null, annual_revenue_range: '', products_services: '', primary_goal: '', biggest_challenge: '' };

export default function Profile() {
  const { business, refresh, selectBusiness } = useApp();
  const [params] = useSearchParams();
  const isNew = params.get('new') === '1' || !business;
  const [form, setForm] = useState<Form>(BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (isNew) setForm(BLANK);
    else if (business) {
      const { id, owner_id, created_at, updated_at, ...rest } = business; // eslint-disable-line @typescript-eslint/no-unused-vars
      setForm({ ...BLANK, ...rest });
    }
  }, [business?.id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: k === 'years_operating' || k === 'employee_count' ? (v === '' ? null : Number(v)) : v }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ kind: 'danger', text: 'Business name is required.' }); return; }
    setBusy(true); setMsg(null);
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
    try {
      if (isNew) {
        const b = must(await supabase.from('businesses').insert(clean).select().single()) as Business;
        selectBusiness(b.id);
        await refresh();
        nav('/cap');
      } else {
        must(await supabase.from('businesses').update(clean).eq('id', business!.id).select());
        await refresh();
        setMsg({ kind: 'ok', text: 'Profile saved.' });
      }
    } catch (err) {
      setMsg({ kind: 'danger', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHead eyebrow="Step 2" title={isNew ? 'Create a business profile' : 'Business profile'} intro="These details shape the follow-up questions, corrective actions and documents. Fields marked * are required; everything else helps but can be added later." />
      <form className="card stack" onSubmit={save}>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid g2">
          <Field label="Business name *"><input required value={form.name} onChange={set('name')} /></Field>
          <Field label="Industry" hint="For example: bakery, plumbing, salon, retail"><input value={form.industry ?? ''} onChange={set('industry')} /></Field>
          <Field label="Business stage">
            <select value={form.business_stage ?? ''} onChange={set('business_stage')}>
              <option value="">Select…</option>
              <option value="idea">Idea / pre-launch</option>
              <option value="startup">Startup (under 2 years)</option>
              <option value="established">Established</option>
              <option value="growing">Growing fast</option>
              <option value="struggling">Struggling</option>
            </select>
          </Field>
          <Field label="Location" hint="City and state"><input value={form.location ?? ''} onChange={set('location')} /></Field>
          <Field label="Years operating"><input type="number" min={0} step={0.5} value={form.years_operating ?? ''} onChange={set('years_operating')} /></Field>
          <Field label="People working in the business" hint="Include the owner"><input type="number" min={0} value={form.employee_count ?? ''} onChange={set('employee_count')} /></Field>
          <Field label="Annual revenue">
            <select value={form.annual_revenue_range ?? ''} onChange={set('annual_revenue_range')}>
              <option value="">Select…</option>
              {['Pre-revenue', 'Under $50,000', '$50,000–$250,000', '$250,000–$1 million', '$1–5 million', 'Over $5 million', 'Prefer not to say'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Main products or services"><input value={form.products_services ?? ''} onChange={set('products_services')} /></Field>
        </div>
        <Field label="Primary goal for the next 12 months"><textarea value={form.primary_goal ?? ''} onChange={set('primary_goal')} /></Field>
        <Field label="Biggest challenge right now"><textarea value={form.biggest_challenge ?? ''} onChange={set('biggest_challenge')} /></Field>
        <div className="row">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Save and start CAP' : 'Save profile'}</button>
          {isNew && business && <button type="button" className="btn secondary" onClick={() => nav('/welcome')}>Cancel</button>}
        </div>
      </form>
    </div>
  );
}
