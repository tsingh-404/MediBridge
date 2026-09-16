// Cost Calculator — multi-item bill backed by real MBS catalogue + /api/coverage.
const SETTINGS = [['out_of_hospital', 'Out of hospital'], ['in_hospital', 'In hospital']];

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

  // The headline gap counts to its new value so a change in the bill reads as a
  // change, not a redraw. Honors reduced motion by skipping the tween.
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = displayGap;
    const to = gap;
    if (reduce || Math.abs(to - from) < 0.01) { setDisplayGap(to); return; }
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
      <div className="mb-screen">
        <Header title="Add an item" subtitle="Search the MBS by keyword or item number" onBack={() => setView('list')} />
        <div style={{ padding: '14px 16px 8px' }}>
          <div className="mb-field">
            <Icon.search />
            <input
              autoFocus
              className="mb-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='Try "GP", "specialist consultation", or "23"'
              aria-label="Search MBS items"
            />
            {query && (
              <button type="button" className="mb-field__clear" onClick={() => setQuery('')} aria-label="Clear search">
                <Icon.x />
              </button>
            )}
          </div>
        </div>
        <div className="mb-scroll" style={{ padding: '6px 16px 100px' }}>
          {!query.trim() && (
            <p className="mb-sub" style={{ padding: '20px 4px', textAlign: 'center' }}>
              Search the live MBS catalogue to add what the clinic charged you for.
            </p>
          )}
          {searching && (
            <div className="mb-list" aria-label="Searching" role="status">
              {[0, 1, 2].map(i => (
                <div key={i} className="mb-row" style={{ flexDirection: 'column', gap: 8 }}>
                  <Skeleton width={84} height={14} />
                  <Skeleton width={i % 2 ? '70%' : '90%'} height={12} />
                </div>
              ))}
            </div>
          )}
          {searchErr && (
            <p className="mb-note mb-note--bad">Search failed: {searchErr}. Check your connection and try again.</p>
          )}
          {!searching && query.trim() && results.length === 0 && !searchErr && (
            <p className="mb-sub" style={{ padding: '20px 4px', textAlign: 'center' }}>
              No items match that. Try a shorter keyword, or the item number from your bill.
            </p>
          )}
          {!searching && results.length > 0 && (
            <div className="mb-list">
              {results.map(it => {
                const inList = items.some(x => x.item_num === it.item_num);
                const isGp = (it.benefit_type || '').toUpperCase() === 'E' || ['A1', 'A2'].includes((it.group_code || '').toUpperCase());
                return (
                  <div key={it.item_num} className="mb-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <Tag kind="accent">MBS {it.item_num}</Tag>
                        <Tag>{isGp ? 'GP' : 'Specialist'}</Tag>
                      </div>
                      <p className="mb-sub mb-clamp" style={{ color: MB.ink, marginBottom: 4 }}>{it.description}</p>
                      <p className="mb-num" style={{ fontSize: 11, color: MB.inkSubtle }}>
                        Schedule fee {fmtAUD(it.schedule_fee)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mb-iconbtn"
                      onClick={() => addItem(it)}
                      disabled={inList}
                      aria-label={inList ? `MBS ${it.item_num} already added` : `Add MBS ${it.item_num}`}
                    >
                      {inList
                        ? <Icon.check style={{ color: MB.okInk }} />
                        : <Icon.plus style={{ color: MB.accentInk }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-screen">
      <Header
        title="Cost calculator"
        subtitle={`${profile.insurer.name} · ${profile.tier.name}`}
        // While the list is empty the empty state owns the only call to action.
        right={items.length > 0 ? (
          <Button kind="primary" size="sm" onClick={() => setView('search')} leading={<Icon.plus size={16} />}>
            Add item
          </Button>
        ) : null}
      />

      <div
        className="mb-scroll"
        style={{
          padding: `14px 16px ${items.length ? 210 : 120}px`,
          // Empty: centre the one thing on screen. Auto margins rather than
          // justify-content so a short viewport can still scroll to the top.
          display: items.length === 0 ? 'flex' : undefined,
          flexDirection: items.length === 0 ? 'column' : undefined,
        }}
      >
        {items.length === 0 ? (
          <div className="mb-empty" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
            <span className="mb-empty__glyph"><Icon.costs size={24} /></span>
            <p className="mb-lede">Add items from your bill</p>
            <p className="mb-sub" style={{ margin: '8px auto 18px', maxWidth: '34ch' }}>
              Find each MBS item the clinic charged you for, enter the bill total, and
              MediBridge works out your gap from your real OSHC tier.
            </p>
            <Button kind="accent" onClick={() => setView('search')} leading={<Icon.plus size={16} />}>
              Add item
            </Button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 className="mb-label">Items on your bill</h2>
              <p className="mb-num" style={{ fontSize: 11, color: MB.inkSubtle }}>
                {items.length} item{items.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="mb-list" style={{ marginBottom: 20 }}>
              {perItem.map((row) => {
                const isGp = (row.it.benefit_type || '').toUpperCase() === 'E' || ['A1', 'A2'].includes((row.it.group_code || '').toUpperCase());
                return (
                  <div
                    key={row.it.uid}
                    className="mb-row"
                    style={{ background: row.isCovered === false ? MB.badSoft : undefined }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                        <Tag kind="accent">MBS {row.it.item_num}</Tag>
                        <Tag>{isGp ? 'GP' : 'Specialist'}</Tag>
                        {!row.loading && row.isCovered === false && <Tag kind="bad">Not covered</Tag>}
                      </div>
                      <p className="mb-sub mb-clamp mb-clamp--2" style={{ color: MB.ink, fontWeight: 550, marginBottom: 8 }}>
                        {row.it.description}
                      </p>

                      <div className="mb-segment" style={{ marginBottom: 10 }}>
                        {SETTINGS.map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className="mb-segment__opt"
                            aria-pressed={row.it.setting === k}
                            onClick={() => setSetting(row.it.uid, k)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {row.loading ? (
                        <Skeleton width={180} height={11} />
                      ) : (
                        <p className="mb-num" style={{ fontSize: 11, color: MB.inkSubtle, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <span>Fee <b style={{ color: MB.ink }}>{fmtAUD(row.schedule)}</b></span>
                          <span>
                            OSHC{row.pct ? ` ${row.pct}%` : ''}{' '}
                            <b style={{ color: row.isCovered === false ? MB.badInk : MB.okInk }}>
                              {row.error ? 'error' : fmtAUD(row.benefit)}
                            </b>
                          </span>
                          <span>
                            Gap{' '}
                            <b style={{ color: (row.oopFallback || 0) > 0 ? MB.warnInk : MB.okInk }}>
                              {row.error || row.oop == null ? 'n/a' : fmtAUD(row.oopFallback)}
                            </b>
                          </span>
                        </p>
                      )}

                      {row.notes.length > 0 && (
                        <p className="mb-meta" style={{ marginTop: 8 }}>
                          {row.notes.join(' ')}
                        </p>
                      )}
                      {row.error && (
                        <p className="mb-meta" style={{ marginTop: 8, color: MB.badInk }}>
                          Coverage lookup failed: {row.error}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(row.it.uid)}
                      aria-label={`Remove MBS ${row.it.item_num}`}
                      className="mb-field__clear"
                    >
                      <Icon.x />
                    </button>
                  </div>
                );
              })}
            </div>

            <h2 className="mb-label">Total clinic charge</h2>
            <div className="mb-sheet" style={{ marginBottom: 20, padding: '14px 16px' }}>
              <label className="mb-sub" htmlFor="mb-charge" style={{ display: 'block', marginBottom: 10 }}>
                The total amount the clinic billed you for this visit.
              </label>
              <div className={`mb-field${aboveSchedule ? ' mb-field--invalid' : ''}`} style={{ minHeight: 52, background: MB.bg }}>
                <span className="mb-num" style={{ fontSize: 18, color: MB.inkSubtle }}>$</span>
                <input
                  id="mb-charge"
                  className="mb-input mb-num"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={totalCharge ?? ''}
                  onChange={e => { const v = e.target.value; setTotalCharge(v === '' ? null : (parseFloat(v) || 0)); }}
                  style={{ fontSize: 22, fontWeight: 700, color: MB.ink }}
                />
              </div>
              <p className="mb-num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: MB.inkSubtle }}>
                <span>Total schedule fee</span>
                <span>{fmtAUD(totalSchedule)}</span>
              </p>
              {aboveSchedule && (
                <p className="mb-note mb-note--warn" style={{ marginTop: 10 }}>
                  Your clinic charged {fmtAUD(totalCharge - totalSchedule)} above the MBS
                  schedule. OSHC will not reimburse the excess.
                </p>
              )}
            </div>

            <h2 className="mb-label">
              {mode === 'estimated' ? 'Estimated breakdown, at the MBS schedule rate' : 'Estimated breakdown'}
            </h2>
            <div className="mb-sheet" style={{ padding: '14px 16px' }}>
              <BreakdownRow
                label={mode === 'estimated' ? 'Total schedule fee' : 'Total clinic charge'}
                value={fmtAUD(mode === 'estimated' ? totalSchedule : totalCharge)}
              />
              <span className="mb-rule" />
              <BreakdownRow
                label="OSHC covers"
                value={`-${fmtAUD(cappedBenefit)}`}
                sub={`Sum of benefits across ${items.length} item${items.length !== 1 ? 's' : ''}`}
                accent="ok"
              />
              <span className="mb-rule" />
              <BreakdownRow
                label="Your gap"
                value={fmtAUD(gap)}
                sub={mode === 'estimated'
                  ? (gap > 0 || totalItemOOP > 0 ? 'Estimated. Enter the clinic total for the actual gap.' : 'Fully covered')
                  : (gap > 0 ? 'Out of pocket' : 'Fully covered')}
                accent={gap > 0 ? 'warn' : 'ok'}
                bold
              />
              {derivedFeeCount > 0 && (
                <p className="mb-note mb-note--warn" style={{ marginTop: 12 }}>
                  {derivedFeeCount} item{derivedFeeCount !== 1 ? 's have' : ' has'} no automatic
                  estimate, so the totals understate the real gap. See the item notes.
                </p>
              )}
              {mode === 'estimated' && anaesCount > 0 && (
                <p className="mb-note mb-note--warn" style={{ marginTop: 12 }}>
                  This bill includes time-based anaesthesia items, so the actual cost varies
                  with how long the procedure took.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div className="mb-dock" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p className="mb-sub" style={{ fontSize: 12.5 }}>
                {mode === 'estimated' ? 'Estimated gap at schedule rate' : 'Estimated out-of-pocket'}
              </p>
              <p className="mb-num" style={{ fontSize: 11, color: MB.inkSubtle, marginTop: 2 }}>
                {mode === 'estimated'
                  ? `Across ${items.length} item${items.length !== 1 ? 's' : ''}`
                  : `${fmtAUD(totalCharge)} less ${fmtAUD(cappedBenefit)} covered`}
              </p>
            </div>
            <p className="mb-num" style={{
              fontSize: 30, fontWeight: 700, letterSpacing: -0.6,
              color: gap > 0 ? MB.warnInk : MB.okInk,
            }}>{fmtAUD(displayGap)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, sub, accent, bold }) {
  const color = accent === 'ok' ? MB.okInk : accent === 'warn' ? MB.warnInk : MB.ink;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <p className="mb-sub" style={{ color: MB.ink, fontWeight: bold ? 650 : 500 }}>{label}</p>
        {sub && <p className="mb-meta" style={{ marginTop: 2 }}>{sub}</p>}
      </div>
      <p className="mb-num" style={{ fontSize: bold ? 22 : 15, fontWeight: 700, letterSpacing: -0.3, color }}>
        {value}
      </p>
    </div>
  );
}

window.CostCalc = CostCalc;
