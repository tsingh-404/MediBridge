// Clinic finder + Profile — backed by /api/clinics and the live profile.
const BILLING_LABELS = {
  bulk: 'Bulk-billed',
  mixed: 'Mixed billing',
  private: 'Private',
  unknown: 'Billing unknown',
};
const BILLING_TAG_KIND = { bulk: 'ok', mixed: 'accent', private: 'warn', unknown: 'neutral' };
const COVER_LABELS = {
  single: 'Single',
  couple: 'Couple',
  family: 'Family',
  sole_parent: 'Sole parent',
};
const BILLING_HINTS = {
  bulk: 'No out-of-pocket cost. The provider claims directly from Medicare or OSHC.',
  mixed: 'Bulk-bills some patients, such as concession card holders. Everyone else pays a gap.',
  private: 'You pay upfront, then claim a partial OSHC rebate.',
  unknown: 'Billing is not recorded for these listings. Call ahead to confirm.',
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
    <div className="mb-screen">
      <Header title="Find a clinic" subtitle="Queensland clinics, pharmacies, and hospitals" />
      <div style={{ padding: '14px 16px 10px' }}>
        <div className="mb-field">
          <Icon.search />
          <input
            className="mb-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Suburb or postcode, for example 4059"
            aria-label="Suburb or postcode"
          />
          {q && (
            <button type="button" className="mb-field__clear" onClick={() => setQ('')} aria-label="Clear search">
              <Icon.x />
            </button>
          )}
        </div>

        <div className="mb-filters" style={{ marginTop: 10 }} role="group" aria-label="Clinic type">
          {types.map(t => (
            <button key={t} type="button" className="mb-filter" aria-pressed={filter === t} onClick={() => setFilter(t)}>
              {t}
            </button>
          ))}
        </div>

        <p className="mb-meta" style={{ marginTop: 10 }}>Billing</p>
        <div className="mb-filters" style={{ marginTop: 6 }} role="group" aria-label="Billing type">
          {billingOpts.map(b => (
            <button key={b} type="button" className="mb-filter" aria-pressed={billing === b} onClick={() => setBilling(b)}>
              {b === 'All' ? 'All' : (BILLING_LABELS[b] || b)}
            </button>
          ))}
        </div>

        {billing !== 'All' && BILLING_HINTS[billing] && (
          <p className={`mb-note${billing === 'bulk' ? ' mb-note--ok' : ''}`} style={{ marginTop: 10 }}>
            {BILLING_HINTS[billing]}
          </p>
        )}
      </div>

      <div className="mb-scroll" style={{ padding: '6px 16px 96px' }}>
        {!q.trim() && (
          <p className="mb-sub" style={{ padding: '20px 4px', textAlign: 'center' }}>
            Enter a suburb or postcode to see clinics near you.
          </p>
        )}
        {loading && (
          <div className="mb-list" aria-label="Searching" role="status">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="mb-row" style={{ flexDirection: 'column', gap: 8 }}>
                <Skeleton width={i % 2 ? '56%' : '72%'} height={14} />
                <Skeleton width="84%" height={11} />
              </div>
            ))}
          </div>
        )}
        {err && (
          <p className="mb-note mb-note--bad">Clinic search failed: {err}. Check your connection and try again.</p>
        )}
        {!loading && q.trim() && rows.length === 0 && !err && (
          <p className="mb-sub" style={{ padding: '20px 4px', textAlign: 'center' }}>
            No clinics match those filters. Try a nearby postcode, or set the type back to All.
          </p>
        )}
        {!loading && rows.length > 0 && (
          <div className="mb-list">
            {rows.map((c, i) => {
              const billingKey = (c.billing || '').toLowerCase();
              return (
                <div key={i} className="mb-row" style={{ flexDirection: 'column', gap: 4 }}>
                  <p className="mb-body" style={{ fontWeight: 600 }}>{c.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {c.type && <Tag>{c.type}</Tag>}
                    {c.billing && (
                      <Tag kind={BILLING_TAG_KIND[billingKey] || 'neutral'}>
                        {BILLING_LABELS[billingKey] || c.billing}
                      </Tag>
                    )}
                  </div>
                  {/* The scraped address already ends in the suburb and postcode,
                      so only fall back to them when it is missing. */}
                  {c.address ? (
                    <p className="mb-sub" style={{ fontSize: 12.5 }}>{c.address}</p>
                  ) : (
                    <p className="mb-num" style={{ fontSize: 11, color: MB.inkSubtle }}>
                      {c.suburb} · {c.postcode}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Profile({ profile, onReset }) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  useBackHandler(confirmingReset, () => setConfirmingReset(false));
  const initials = (profile.insurer?.name || 'MB').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const start = new Date(profile.date);
  const elapsedMonths = Math.max((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375), 0);
  const waitingRows = [
    { label: 'GP and outpatient', months: 0 },
    { label: 'Hospital', months: 2 },
    { label: 'Pre-existing conditions', months: 12 },
    { label: 'Pregnancy', months: 12 },
  ];
  const pct = (months) => months === 0 ? 100 : Math.min((elapsedMonths / months) * 100, 100);

  return (
    <div className="mb-screen">
      <Header title="Your profile" />
      <div className="mb-scroll" style={{ padding: '16px 16px 96px' }}>
        <div className="mb-sheet" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <span
            aria-hidden="true"
            style={{
              width: 52, height: 52, flexShrink: 0, borderRadius: MB.rPill,
              background: MB.accentSoft, color: MB.accentInk,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MB.sans, fontSize: 18, fontWeight: 650,
            }}
          >{initials}</span>
          <div style={{ minWidth: 0 }}>
            <p className="mb-lede" style={{ fontSize: 18 }}>{profile.insurer.name}</p>
            <p className="mb-sub" style={{ marginTop: 2 }}>{profile.tier.name}</p>
          </div>
        </div>

        <Section label="OSHC policy">
          <Row k="Insurer" v={profile.insurer.name} />
          <Row k="Tier" v={profile.tier.name} />
          <Row k="GP benefit" v={`${profile.tier.gp}%`} />
          <Row k="Specialist benefit" v={`${profile.tier.spec}%`} />
          <Row k="In hospital" v={`${profile.tier.in_hospital ?? 100}%`} />
          <Row k="Cover type" v={COVER_LABELS[profile.cover] || profile.cover} />
          <Row k="Policy started" v={profile.date} />
        </Section>

        <Section label="Waiting periods">
          {waitingRows.map((row) => {
            const progress = pct(row.months);
            const done = progress >= 100;
            const status = row.months === 0 ? 'No wait' : (done ? 'Served' : `${row.months} months`);
            return (
              <div key={row.label} style={{ padding: '13px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="mb-sub" style={{ fontSize: 13.5 }}>{row.label}</span>
                  <span className="mb-sub" style={{ fontSize: 13.5, fontWeight: 600, color: done ? MB.okInk : MB.ink }}>
                    {status}
                  </span>
                </div>
                <div
                  className="mb-track"
                  style={{ marginTop: 7 }}
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${row.label} waiting period`}
                >
                  <span className={`mb-track__fill${done ? ' mb-track__fill--done' : ''}`} style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}
        </Section>

        <Section label="Account">
          {!confirmingReset ? (
            <button
              type="button"
              className="mb-row"
              style={{ color: MB.badInk, fontFamily: MB.sans, fontSize: 14, fontWeight: 550 }}
              onClick={() => setConfirmingReset(true)}
            >
              Restart onboarding
            </button>
          ) : (
            <div style={{ padding: '14px 16px' }}>
              <p className="mb-sub">This clears your saved profile and starts setup again.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Button kind="secondary" size="sm" onClick={() => setConfirmingReset(false)}>Cancel</Button>
                <Button kind="primary" size="sm" onClick={onReset}>Clear profile</Button>
              </div>
            </div>
          )}
        </Section>

        <Disclaimer />
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 className="mb-label">{label}</h2>
      <div className="mb-list">{children}</div>
    </section>
  );
}

function Row({ k, v }) {
  return (
    <div className="mb-row mb-row--between">
      <span className="mb-sub" style={{ fontSize: 13.5 }}>{k}</span>
      <span className="mb-sub" style={{ fontSize: 13.5, fontWeight: 550, color: MB.ink }}>{v}</span>
    </div>
  );
}

Object.assign(window, { Clinics, Profile });
