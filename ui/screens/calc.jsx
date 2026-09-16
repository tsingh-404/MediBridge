// Cost Calculator — multi-item bill backed by real MBS catalogue + /api/coverage.
function CostCalc({ profile }) {
  const [view, setView] = useState('list');

  // Registered after App's tab handler, so back closes search first.
  useBackHandler(view === 'search', () => setView('list'));
  const [items, setItems] = useState([]); // each: server item + uid + setting + coverage{benefit,pct,notes,is_covered}
  const [totalCharge, setTotalCharge] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const uidRef = useRef(1);
  const debounceRef = useRef(null);
  const [displayGap, setDisplayGap] = useState(0);

  // debounced live MBS search
  useEffect(() => {
    if (view !== 'search') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearchErr(null); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      api.searchMbs(query.trim(), 8)
        .then(rows => { setResults(rows); setSearchErr(null); })
        .catch(e => { setResults([]); setSearchErr(e.message); })
        .finally(() => setSearching(false));
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, view]);

  const fetchCoverage = async (item, setting) => {
    try {
      return await api.coverage(item.item_num, setting);
    } catch (e) {
      return { error: e.message };
    }
  };

  const addItem = async (it) => {
    const uid = uidRef.current++;
    const setting = 'out_of_hospital';
    const placeholder = { ...it, uid, setting, coverage: null };
    setItems(arr => [...arr, placeholder]);
    setView('list');
    setQuery('');
    const cov = await fetchCoverage(it, setting);
    setItems(arr => arr.map(x => x.uid === uid ? { ...x, coverage: cov } : x));
  };

  const removeItem = (uid) => setItems(arr => arr.filter(i => i.uid !== uid));

  const setSetting = async (uid, setting) => {
    setItems(arr => arr.map(i => i.uid === uid ? { ...i, setting, coverage: null } : i));
    const target = items.find(i => i.uid === uid);
    if (!target) return;
    const cov = await fetchCoverage(target, setting);
    setItems(arr => arr.map(x => x.uid === uid ? { ...x, coverage: cov } : x));
  };

  const perItem = items.map(it => {
    const cov = it.coverage || {};
    const schedule = cov.schedule_fee ?? it.schedule_fee ?? 0;
    const benefit = cov.oshc_benefit ?? 0;
    const oopRaw = cov.estimated_out_of_pocket;
    const oop = oopRaw == null ? null : oopRaw;
    return {
      it,
      schedule,
      benefit,
      oop,
      oopFallback: oop == null ? Math.max(schedule - benefit, 0) : oop,
      pct: cov.benefit_pct ?? 0,
      isCovered: cov.is_covered !== false,
      notes: cov.notes || [],
      loading: !it.coverage,
      error: it.coverage && it.coverage.error,
    };
  });
  const totalSchedule = perItem.reduce((s, x) => s + (x.schedule || 0), 0);
  const totalBenefit = perItem.reduce((s, x) => s + (x.benefit || 0), 0);
  const totalItemOOP = perItem.reduce((s, x) => s + (x.oopFallback || 0), 0);
  const hasCharge = totalCharge != null && totalCharge > 0;
  const mode = hasCharge ? 'actual' : 'estimated';
  const derivedFeeCount = perItem.filter(x => !x.loading && !x.error && x.oop == null).length;
  const anaesCount = perItem.filter(x => (x.it.benefit_type || '').toUpperCase() === 'A').length;

  let cappedBenefit, gap;
  if (!hasCharge) {
    cappedBenefit = totalBenefit;
    gap = totalItemOOP;
  } else if (totalCharge >= totalSchedule) {
    cappedBenefit = totalBenefit;
    gap = Math.max(totalCharge - totalBenefit, 0);
  } else {
    cappedBenefit = Math.min(totalBenefit, totalCharge);
    gap = Math.max(totalCharge - cappedBenefit, 0);
  }
  const aboveSchedule = hasCharge && totalCharge > totalSchedule && totalSchedule > 0;
  useEffect(() => {
    const from = displayGap;
    const to = gap;
    if (Math.abs(to - from) < 0.01) return;
    const start = performance.now();
    const duration = 260;
    let frame;
    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayGap(from + (to - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [gap]);

  if (view === 'search') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: MB.bg }}>
        <Header title="Add item from your bill" subtitle="Search MBS by keyword or item number" onBack={() => setView('list')} />
        <div style={{ padding: '14px 20px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 12, padding: '0 14px', height: 46 }}>
            <Icon.search style={{ color: MB.inkSubtle }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder='Try "GP", "specialist consultation", or "23"' style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: MB.sans, fontSize: 16, color: MB.ink }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: MB.inkSubtle, cursor: 'pointer' }}><Icon.x /></button>}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 100px' }}>
          {!query.trim() && (
            <div style={{ padding: 20, textAlign: 'center', fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>
              Type to search the live MBS catalogue.
            </div>
          )}
          {searching && <div style={{ padding: 12, fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>Searching…</div>}
          {searchErr && <div style={{ padding: 12, fontFamily: MB.sans, fontSize: 13, color: MB.bad }}>{searchErr}</div>}
          {!searching && query.trim() && results.length === 0 && !searchErr && (
            <div style={{ padding: 20, textAlign: 'center', fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>No items found.</div>
          )}
          {results.map(it => {
            const inList = items.some(x => x.item_num === it.item_num);
            const isGp = (it.benefit_type || '').toUpperCase() === 'E' || ['A1', 'A2'].includes((it.group_code || '').toUpperCase());
            return (
              <div key={it.item_num} style={{ background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: MB.mono, fontSize: 11, fontWeight: 600, color: MB.accentInk, background: MB.accentSoft, padding: '2px 7px', borderRadius: 6 }}>MBS {it.item_num}</span>
                    <Tag kind="neutral" size="xs">{isGp ? 'GP' : 'Specialist'}</Tag>
                  </div>
                  <div style={{ fontFamily: MB.sans, fontSize: 13, color: MB.ink, lineHeight: 1.4, marginBottom: 4 }}>{it.description}</div>
                  <div style={{ fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle }}>Schedule fee {fmtAUD(it.schedule_fee)}</div>
                </div>
                <button onClick={() => !inList && addItem(it)} disabled={inList} style={{ width: 36, height: 36, borderRadius: 10, background: inList ? MB.surfaceMuted : MB.ink, color: inList ? MB.inkSubtle : '#fff', border: 'none', cursor: inList ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{inList ? <Icon.check /> : <Icon.plus />}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: MB.bg }}>
      <Header title="Cost calculator" subtitle="Add items, enter the bill total, see your gap." right={
        <button onClick={() => setView('search')} style={{ height: 32, padding: '0 12px', borderRadius: 10, background: MB.ink, color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MB.sans, fontSize: 13, fontWeight: 600 }}><Icon.plus />Add item</button>
      } />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 220px' }}>
        {items.length === 0 ? (
          <div style={{ background: MB.gradientHero, border: `1px solid ${MB.border}`, borderRadius: 14, padding: 24, textAlign: 'center', marginTop: 8, boxShadow: MB.shadowMd }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: MB.surface, color: MB.accentInk, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, boxShadow: MB.shadow }}><Icon.calc /></div>
            <div style={{ fontFamily: MB.sans, fontSize: 15, color: MB.ink, fontWeight: 650, marginBottom: 4 }}>Add items from your bill</div>
            <div style={{ fontFamily: MB.sans, fontSize: 12.5, color: MB.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>Find each MBS item the clinic charged you for, enter the bill total, and we'll calculate your out‑of‑pocket gap using your real OSHC tier.</div>
            <Button kind="primary" onClick={() => setView('search')} leading={<Icon.plus />}>Add MBS item</Button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
              <div style={{ fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                <span style={{ color: MB.accentInk, marginRight: 6 }}>1</span>Items on your bill
              </div>
              <div style={{ fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle }}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
            </div>

            <div style={{ background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
              {perItem.map((row, idx) => {
                const isGp = (row.it.benefit_type || '').toUpperCase() === 'E' || ['A1', 'A2'].includes((row.it.group_code || '').toUpperCase());
                return (
                  <div key={row.it.uid} style={{ padding: '12px 14px', borderBottom: idx < perItem.length - 1 ? `1px solid ${MB.border}` : 'none', animation: `fadeInUp ${MB.durationFast} ${MB.ease}`, background: row.isCovered === false ? MB.badSoft : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontFamily: MB.mono, fontSize: 11, fontWeight: 600, color: MB.accentInk, background: MB.accentSoft, padding: '2px 7px', borderRadius: 6 }}>MBS {row.it.item_num}</span>
                          <Tag kind="neutral" size="xs">{isGp ? 'GP' : 'Specialist'}</Tag>
                          {!row.loading && row.isCovered === false && <Tag kind="bad" size="xs">Not covered</Tag>}
                        </div>
                        <div style={{ fontFamily: MB.sans, fontSize: 13, color: MB.ink, lineHeight: 1.35, fontWeight: 550, marginBottom: 6 }}>{row.it.description}</div>

                        <div style={{ display: 'flex', background: MB.bg, padding: 2, borderRadius: 10, border: `1px solid ${MB.border}`, width: 'fit-content', marginBottom: 8 }}>
                          {[['out_of_hospital', 'OOH'], ['in_hospital', 'In‑hospital']].map(([k, l]) => {
                            const on = row.it.setting === k;
                            return (
                              <button key={k} onClick={() => setSetting(row.it.uid, k)} style={{ height: 32, padding: '0 12px', borderRadius: 8, background: on ? MB.surface : 'transparent', color: on ? MB.ink : MB.inkMuted, border: 'none', fontFamily: MB.sans, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', transition: `all ${MB.durationFast} ${MB.ease}` }}>{l}</button>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', gap: 16, fontFamily: MB.mono, fontSize: 11, flexWrap: 'wrap' }}>
                          <span style={{ color: MB.inkSubtle }}>Sched. <span style={{ color: MB.ink, fontWeight: 600 }}>{fmtAUD(row.schedule)}</span></span>
                          <span style={{ color: MB.inkSubtle }}>
                            OSHC{row.pct ? ` ${row.pct}%` : ''}: <span style={{ color: row.isCovered === false ? MB.bad : MB.ok, fontWeight: 600 }}>
                              {row.loading ? '…' : (row.error ? 'error' : fmtAUD(row.benefit))}
                            </span>
                          </span>
                          <span style={{ color: MB.inkSubtle }}>
                            Gap: <span style={{ color: (row.oopFallback || 0) > 0 ? 'oklch(48% 0.13 75)' : MB.ok, fontWeight: 600 }}>
                              {row.loading ? '…' : (row.error ? '—' : (row.oop == null ? '—' : fmtAUD(row.oopFallback)))}
                            </span>
                          </span>
                        </div>
                        {row.notes.length > 0 && (
                          <div style={{ marginTop: 6, fontFamily: MB.sans, fontSize: 11, color: MB.inkMuted, lineHeight: 1.4 }}>
                            {row.notes.map((n, i) => <div key={i}>· {n}</div>)}
                          </div>
                        )}
                        {row.error && (
                          <div style={{ marginTop: 6, fontFamily: MB.sans, fontSize: 11, color: MB.bad }}>Coverage lookup failed: {row.error}</div>
                        )}
                      </div>
                      <button onClick={() => removeItem(row.it.uid)} style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none', color: MB.inkSubtle, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon.x /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '0 4px 8px', fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              <span style={{ color: MB.accentInk, marginRight: 6 }}>2</span>Total clinic charge
            </div>
            <div style={{ background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontFamily: MB.sans, fontSize: 12.5, color: MB.inkMuted, marginBottom: 10, lineHeight: 1.45 }}>
                The total amount the clinic billed you for this visit.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', background: MB.bg, border: `1px solid ${aboveSchedule ? 'oklch(72% 0.13 75)' : MB.border}`, borderRadius: 12, padding: '0 14px', height: 52 }}>
                <span style={{ fontFamily: MB.sans, fontSize: 18, color: MB.inkSubtle, marginRight: 4 }}>$</span>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={totalCharge ?? ''} onChange={e => { const v = e.target.value; setTotalCharge(v === '' ? null : (parseFloat(v) || 0)); }} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: MB.mono, fontSize: 22, fontWeight: 700, color: MB.ink, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle }}>
                <span>Total schedule fee</span>
                <span>{fmtAUD(totalSchedule)}</span>
              </div>
              {aboveSchedule && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: MB.warnSoft, borderRadius: 8, fontFamily: MB.sans, fontSize: 11.5, color: 'oklch(40% 0.12 75)', lineHeight: 1.45 }}>
                  Your clinic charged {fmtAUD(totalCharge - totalSchedule)} above the MBS schedule. OSHC won't reimburse the excess.
                </div>
              )}
            </div>

            <div style={{ padding: '0 4px 8px', fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              <span style={{ color: MB.accentInk, marginRight: 6 }}>3</span>{mode === 'estimated' ? 'Estimated breakdown (at MBS schedule rate)' : 'Estimated breakdown'}
            </div>
            <div style={{ background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 14, padding: '14px 16px' }}>
              <BreakdownRow label={mode === 'estimated' ? 'Total schedule fee' : 'Total clinic charge'} value={fmtAUD(mode === 'estimated' ? totalSchedule : totalCharge)} />
              <div style={{ height: 1, background: MB.border, margin: '8px 0' }} />
              <BreakdownRow label="OSHC covers" value={`− ${fmtAUD(cappedBenefit)}`} sub={`Sum of benefits across ${items.length} item${items.length !== 1 ? 's' : ''}`} accent="ok" />
              <div style={{ height: 1, background: MB.border, margin: '8px 0' }} />
              <BreakdownRow
                label="Your gap"
                value={fmtAUD(gap)}
                sub={mode === 'estimated'
                  ? (gap > 0 ? 'Estimated — enter clinic total for actual gap' : (totalItemOOP === 0 ? 'Fully covered' : 'Estimated — enter clinic total for actual gap'))
                  : (gap > 0 ? 'Out of pocket' : 'Fully covered')}
                accent={gap > 0 ? 'warn' : 'ok'}
                bold
              />
              {derivedFeeCount > 0 && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: MB.warnSoft, borderRadius: 8, fontFamily: MB.sans, fontSize: 11.5, color: 'oklch(40% 0.12 75)', lineHeight: 1.45 }}>
                  {derivedFeeCount} item{derivedFeeCount !== 1 ? 's have' : ' has'} no automatic estimate — see notes. Totals understate the real gap.
                </div>
              )}
              {mode === 'estimated' && anaesCount > 0 && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: MB.warnSoft, borderRadius: 8, fontFamily: MB.sans, fontSize: 11.5, color: 'oklch(40% 0.12 75)', lineHeight: 1.45 }}>
                  Includes time-based anaesthesia items — actual cost varies with duration.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)', left: 0, right: 0, zIndex: 20, padding: '14px 16px', background: 'rgba(255,255,255,0.9)', borderTop: `1px solid ${MB.border}`, boxShadow: MB.shadowLg, backdropFilter: 'saturate(180%) blur(12px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontFamily: MB.sans, fontSize: 12, color: MB.inkMuted }}>{mode === 'estimated' ? 'Estimated gap (schedule rate)' : 'Estimated out‑of‑pocket'}</div>
              <div style={{ fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle, marginTop: 2 }}>
                {mode === 'estimated'
                  ? `Sum of per-item gaps across ${items.length} item${items.length !== 1 ? 's' : ''}`
                  : `${fmtAUD(totalCharge)} − ${fmtAUD(cappedBenefit)} covered`}
              </div>
            </div>
            <div style={{ fontFamily: MB.mono, fontSize: 30, fontWeight: 700, color: gap > 0 ? 'oklch(48% 0.13 75)' : MB.ok, letterSpacing: -0.6 }}>{fmtAUD(displayGap)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, sub, accent, bold }) {
  const color = accent === 'ok' ? MB.ok : accent === 'warn' ? 'oklch(48% 0.13 75)' : MB.ink;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div>
        <div style={{ fontFamily: MB.sans, fontSize: 13, color: MB.ink, fontWeight: bold ? 650 : 500 }}>{label}</div>
        {sub && <div style={{ fontFamily: MB.mono, fontSize: 10.5, color: MB.inkSubtle, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: MB.mono, fontSize: bold ? 22 : 15, fontWeight: 700, color, letterSpacing: -0.3 }}>{value}</div>
    </div>
  );
}

window.CostCalc = CostCalc;
