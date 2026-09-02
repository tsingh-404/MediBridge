// Clinic finder + Profile — backed by /api/clinics and the live profile.
const BILLING_LABELS = {
  bulk: 'Bulk-billed',
  mixed: 'Mixed billing',
  private: 'Private',
  unknown: 'Billing unknown',
};
const BILLING_TAG_KIND = { bulk: 'ok', mixed: 'accent', private: 'warn', unknown: 'neutral' };
const BILLING_HINTS = {
  bulk: 'No out-of-pocket cost — provider claims directly from Medicare/OSHC.',
  mixed: 'Bulk-bills some patients (e.g. concession card holders); others pay a gap.',
  private: 'You pay upfront. Claim a partial OSHC rebate after.',
  unknown: 'Billing not recorded — call ahead to confirm.',
};
const TYPE_STYLE = {
  GP: { bg: 'oklch(95% 0.03 155)', fg: 'oklch(44% 0.09 155)', glyph: 'G' },
  Psychology: { bg: 'oklch(95% 0.03 295)', fg: 'oklch(43% 0.08 295)', glyph: 'P' },
  Pharmacy: { bg: 'oklch(95% 0.03 230)', fg: 'oklch(43% 0.1 230)', glyph: 'Rx' },
  Psychiatry: { bg: 'oklch(95% 0.03 260)', fg: 'oklch(43% 0.09 260)', glyph: 'Psi' },
  Hospital: { bg: 'oklch(95% 0.03 210)', fg: 'oklch(43% 0.1 210)', glyph: 'H' },
};

function Clinics() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [billing, setBilling] = useState('All');
  const [types, setTypes] = useState(['All']);
  const [billingOpts, setBillingOpts] = useState(['All']);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.clinicTypes()
      .then(t => setTypes(['All', ...t]))
      .catch(() => setTypes(['All', 'GP', 'Psychology', 'Pharmacy', 'Psychiatry', 'Hospital']));
    api.clinicBilling()
      .then(b => setBillingOpts(['All', ...b]))
      .catch(() => setBillingOpts(['All', 'bulk', 'mixed', 'private', 'unknown']));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setRows([]); setErr(null); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const isPostcode = /^\d{3,4}$/.test(q.trim());
      const params = isPostcode ? { postcode: q.trim() } : { suburb: q.trim() };
      if (filter !== 'All') params.type = filter;
      if (billing !== 'All') params.billing = billing;
      api.searchClinics(params)
        .then(r => { setRows(r); setErr(null); })
        .catch(e => { setRows([]); setErr(e.message); })
        .finally(() => setLoading(false));
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, filter, billing]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: MB.bg }}>
      <Header title="Find a clinic" subtitle="Queensland clinics, pharmacies, hospitals" />
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 12,
          padding: '0 14px', height: 46,
        }}>
          <Icon.search style={{ color: MB.inkSubtle }} />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Suburb or postcode (e.g. 4059)"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: MB.sans, fontSize: 16, color: MB.ink }}
          />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: MB.inkSubtle, cursor: 'pointer' }}><Icon.x /></button>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              flexShrink: 0, height: 34, padding: '0 13px', borderRadius: 99,
              background: filter === t ? MB.ink : MB.surface,
              color: filter === t ? '#fff' : MB.inkMuted,
              border: `1px solid ${filter === t ? MB.ink : MB.border}`,
              fontFamily: MB.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, overflowX: 'auto', paddingBottom: 4 }}>
          <span style={{ flexShrink: 0, fontFamily: MB.mono, fontSize: 10.5, color: MB.inkSubtle, letterSpacing: 0.4, textTransform: 'uppercase', marginRight: 2 }}>Billing</span>
          {billingOpts.map(b => {
            const on = billing === b;
            const isBulk = b === 'bulk';
            const label = b === 'All' ? 'All' : (BILLING_LABELS[b] || b);
            const activeBg = isBulk ? MB.ok : MB.ink;
            return (
              <button key={b} onClick={() => setBilling(b)} style={{
                flexShrink: 0, height: 28, padding: '0 11px', borderRadius: 99,
                background: on ? activeBg : MB.surface,
                color: on ? '#fff' : (isBulk ? MB.ok : MB.inkMuted),
                border: `1px solid ${on ? activeBg : (isBulk ? MB.ok : MB.border)}`,
                fontFamily: MB.sans, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {isBulk && <span style={{ fontSize: 10 }}>★</span>}
                {label}
              </button>
            );
          })}
        </div>
        {billing !== 'All' && BILLING_HINTS[billing] && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: billing === 'bulk' ? MB.okSoft : MB.surfaceMuted, borderRadius: 10, fontFamily: MB.sans, fontSize: 11.5, color: billing === 'bulk' ? MB.ok : MB.inkMuted, lineHeight: 1.45 }}>
            {BILLING_HINTS[billing]}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 100px' }}>
        {!q.trim() && (
          <div style={{ padding: 24, textAlign: 'center', fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>
            Enter a postcode or suburb to search.
          </div>
        )}
        {loading && <div style={{ padding: 12, fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>Searching…</div>}
        {err && <div style={{ padding: 12, fontFamily: MB.sans, fontSize: 13, color: MB.bad }}>{err}</div>}
        {!loading && q.trim() && rows.length === 0 && !err && (
          <div style={{ padding: 24, textAlign: 'center', fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>
            No clinics match.
          </div>
        )}
        {rows.map((c, i) => (
          (() => {
            const topType = (c.type || '').split(',')[0]?.trim();
            const typeStyle = TYPE_STYLE[topType] || { bg: MB.accentSoft, fg: MB.accentInk, glyph: 'C' };
            const isBulk = (c.billing || '').toLowerCase() === 'bulk';
            return (
          <div key={i} style={{
            background: MB.surface, border: `1px solid ${MB.border}`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 8,
            display: 'flex', gap: 12, alignItems: 'flex-start',
            boxShadow: MB.shadow,
            borderLeft: isBulk ? `4px solid ${MB.ok}` : `1px solid ${MB.border}`,
            animation: `fadeInUp ${MB.durationFast} ${MB.ease}`,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: typeStyle.bg, color: typeStyle.fg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontFamily: MB.mono, fontSize: 10, fontWeight: 700,
            }}>{typeStyle.glyph}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MB.sans, fontSize: 14, color: MB.ink, fontWeight: 600 }}>{c.name}</span>
                {c.type && <Tag size="xs">{c.type}</Tag>}
                {c.billing && (
                  <Tag size="xs" kind={BILLING_TAG_KIND[c.billing.toLowerCase()] || 'neutral'}>
                    {BILLING_LABELS[c.billing.toLowerCase()] || c.billing}
                  </Tag>
                )}
                {isBulk && <Tag size="xs" kind="ok">Top pick</Tag>}
              </div>
              {c.address && <div style={{ fontFamily: MB.sans, fontSize: 12.5, color: MB.inkMuted, lineHeight: 1.4 }}>{c.address}</div>}
              <div style={{ fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle, marginTop: 2 }}>
                {c.suburb} · {c.postcode}
              </div>
            </div>
          </div>
            );
          })()
        ))}
      </div>
    </div>
  );
}

function Profile({ profile, onReset }) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  useBackHandler(confirmingReset, () => setConfirmingReset(false));
  const initials = (profile.insurer?.name || 'S').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const start = new Date(profile.date);
  const elapsedMonths = Math.max((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375), 0);
  const waitingRows = [
    { label: 'GP / outpatient', months: 0 },
    { label: 'Hospital', months: 2 },
    { label: 'Pre-existing', months: 12 },
    { label: 'Pregnancy', months: 12 },
  ];
  const pct = (months) => months === 0 ? 100 : Math.min((elapsedMonths / months) * 100, 100);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: MB.bg }}>
      <Header title="Your profile" />
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px' }}>
        <div style={{
          background: MB.gradientHero, border: `1px solid ${MB.border}`, borderRadius: 14,
          padding: 18, marginBottom: 16, boxShadow: MB.shadowMd,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 99, background: MB.surface, color: MB.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MB.sans, fontSize: 22, fontWeight: 600, marginBottom: 12,
          }}>{initials}</div>
          <div style={{ fontFamily: MB.sans, fontSize: 18, fontWeight: 650, color: MB.ink }}>Student</div>
          <div style={{ fontFamily: MB.sans, fontSize: 13, color: MB.inkMuted, marginTop: 2 }}>Onboarded · {profile.date}</div>
        </div>

        <Section label="OSHC policy">
          <Row k="Insurer" v={profile.insurer.name} />
          <Row k="Tier" v={profile.tier.name} />
          <Row k="GP benefit" v={`${profile.tier.gp}%`} />
          <Row k="Specialist benefit" v={`${profile.tier.spec}%`} />
          <Row k="In‑hospital" v={`${profile.tier.in_hospital ?? 100}%`} />
          <Row k="Cover type" v={profile.cover} />
          <Row k="Started" v={profile.date} last />
        </Section>

        <Section label="Waiting periods">
          {waitingRows.map((row, idx) => {
            const progress = pct(row.months);
            const done = progress >= 100;
            return (
              <div key={row.label} style={{ padding: '12px 16px', borderBottom: idx === waitingRows.length - 1 ? 'none' : `1px solid ${MB.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MB.sans, fontSize: 13.5 }}>
                  <span style={{ color: MB.inkMuted }}>{row.label}</span>
                  <span style={{ color: done ? MB.ok : MB.ink, fontWeight: 600 }}>{row.months} mo</span>
                </div>
                <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: MB.surfaceMuted, overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: done ? MB.ok : MB.warn, transition: `width ${MB.duration} ${MB.ease}` }} />
                </div>
              </div>
            );
          })}
        </Section>

        <Section label="Account">
          {!confirmingReset ? (
            <button onClick={() => setConfirmingReset(true)} style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              padding: '14px 16px', textAlign: 'left',
              fontFamily: MB.sans, fontSize: 14, color: MB.bad, fontWeight: 550,
            }}>Restart onboarding</button>
          ) : (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontFamily: MB.sans, fontSize: 12.5, color: MB.inkMuted, marginBottom: 10 }}>Are you sure? This will clear your saved profile.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button kind="secondary" size="sm" onClick={() => setConfirmingReset(false)}>Cancel</Button>
                <Button kind="primary" size="sm" onClick={onReset}>Yes, restart</Button>
              </div>
            </div>
          )}
        </Section>

        <Disclaimer style={{ marginBottom: 14 }} />
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: MB.mono, fontSize: 10.5, color: MB.inkSubtle,
        letterSpacing: 0.4, textTransform: 'uppercase', padding: '0 4px 6px',
      }}>{label}</div>
      <div style={{ background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
      borderBottom: last ? 'none' : `1px solid ${MB.border}`,
      fontFamily: MB.sans, fontSize: 13.5,
    }}>
      <span style={{ color: MB.inkMuted }}>{k}</span>
      <span style={{ color: MB.ink, fontWeight: 550 }}>{v}</span>
    </div>
  );
}

Object.assign(window, { Clinics, Profile });
