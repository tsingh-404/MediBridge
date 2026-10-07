import React, { useEffect, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchAggregate } from './api.js';
import { parseFilters, resolveView, serializeFilters } from './filters.js';
import { FilterBar } from './components/FilterBar.jsx';
import { linkedSelectionReducer } from './linkedSelection.js';
import { Provenance } from './components/Provenance.jsx';
import { StateMessage } from './components/StateMessage.jsx';
import { Overview } from './views/Overview.jsx';
import { InsurerNeeds } from './views/InsurerNeeds.jsx';
import { PublicHealthPolicy } from './views/PublicHealthPolicy.jsx';
import { ServiceGeography } from './views/ServiceGeography.jsx';
import { DataQuality } from './views/DataQuality.jsx';
import { insurerMatrixFilters } from './views/insurerData.js';

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'insurer', label: 'Insurer needs' },
  { id: 'policy', label: 'Public health and policy' },
  { id: 'geography', label: 'Service geography' },
  { id: 'quality', label: 'Data quality' },
];
const PRESENTATION_WALKTHROUGHS = {
  insurer: [
    { view: 'overview', caption: 'Hook — what questions appear most often in this synthetic cohort?' },
    { view: 'insurer', topic_code: 'coverage_benefit_exclusion', caption: 'Situation — review coverage questions across shortlisted insurers and their available tiers.' },
    { view: 'insurer', topic_code: 'coverage_waiting_period', caption: 'Complication — compare waiting-period questions and the synthetic answer-outcome proxy.' },
    { view: 'geography', topic_code: 'coverage_benefit_exclusion', caption: 'Resolution — inspect broad regions and service-search areas separately.' },
    { view: 'quality', caption: 'Call to action — check suppression, sample size, and provenance before drawing conclusions.' },
  ],
  public: [
    { view: 'overview', caption: 'Hook — start with the topics appearing in this synthetic cohort.' },
    { view: 'policy', topic_code: 'respiratory_information', caption: 'Situation — inspect the respiratory question pattern and its limits.' },
    { view: 'policy', topic_code: 'preventive_health_information', caption: 'Complication — compare related information needs without treating tags as diagnoses.' },
    { view: 'geography', topic_code: 'respiratory_information', caption: 'Resolution — review broad regions while keeping unknown geography visible.' },
    { view: 'quality', caption: 'Call to action — identify what external validation and better data would be needed.' },
  ],
};

function App() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({});
  const [view, setView] = useState(resolveView(new URLSearchParams(location.search), VIEWS.map((item) => item.id)));
  const [audience, setAudience] = useState('insurer');
  const [theme, setTheme] = useState('system');
  const [linkedSelections, dispatchSelection] = useReducer(linkedSelectionReducer, {});
  const [payloads, setPayloads] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('Loading synthetic dashboard metadata.');
  const [presenting, setPresenting] = useState(false);
  const [presentationBeat, setPresentationBeat] = useState(0);
  const [walkthrough, setWalkthrough] = useState('insurer');

  useEffect(() => {
    const controller = new AbortController();
    fetchAggregate('meta', {}, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setMeta(result);
      setFilters(parseFilters(new URLSearchParams(location.search), result));
      setAnnouncement('Synthetic dashboard metadata loaded.');
    }).catch((cause) => {
      if (!controller.signal.aborted) { setError(cause.message); setLoading(false); setAnnouncement('Dashboard metadata failed to load.'); }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('medibridge-analytics-theme');
    const next = ['light', 'dark'].includes(saved) ? saved : 'system';
    setTheme(next);
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
  }, []);

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('medibridge-analytics-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('medibridge-analytics-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!meta) return undefined;
    const controller = new AbortController();
    const viewEndpoints = view === 'overview' ? ['overview', 'topics']
      : view === 'insurer' ? ['coverage-friction', 'topics', { endpoint: 'matrix', key: 'insurerMatrix', pair: 'topic_code:insurer_id', filters: insurerMatrixFilters(filters) }]
        : view === 'policy' ? ['topics', 'regions']
          : view === 'geography' ? ['regions',
            { endpoint: 'matrix', key: 'basisMatrix', pair: 'region:location_basis' },
            { endpoint: 'matrix', key: 'serviceMatrix', pair: 'service_code:region' },
            { endpoint: 'matrix', key: 'topicMatrix', pair: 'topic_code:region' }]
            : ['quality', 'regions'];
    const endpoints = [...new Set([...viewEndpoints, 'timeline'])];
    setLoading(true);
    setError('');
    setAnnouncement(`Loading ${VIEWS.find((item) => item.id === view)?.label || 'dashboard'} aggregates.`);
    Promise.all(endpoints.map((request) => {
      const config = typeof request === 'string' ? { endpoint: request, key: request } : request;
      return fetchAggregate(config.endpoint, config.filters || filters, { signal: controller.signal, bucket: 'month', pair: config.pair })
        .then((data) => [config.key, data]);
    }))
      .then((entries) => {
        if (controller.signal.aborted) return;
        setPayloads(Object.fromEntries(entries));
        setLoading(false);
        setAnnouncement(`${VIEWS.find((item) => item.id === view)?.label || 'Dashboard'} aggregates updated.`);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause.message);
        setLoading(false);
        setAnnouncement('Aggregate request failed. Existing results are not current.');
      });
    return () => controller.abort();
  }, [meta, filters, view]);

  const applyFilters = (next) => {
    const params = serializeFilters(next);
    const queryView = view !== 'overview' ? `&view=${encodeURIComponent(view)}` : '';
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}${queryView}` : (queryView ? `?${queryView.slice(1)}` : '')}`);
    setFilters(next);
  };
  const changeView = (nextView) => {
    setView(nextView);
    const params = serializeFilters(filters);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}&` : '?'}view=${encodeURIComponent(nextView)}`);
  };
  const goToBeat = (index) => {
    const beats = PRESENTATION_WALKTHROUGHS[walkthrough];
    const nextIndex = Math.max(0, Math.min(beats.length - 1, index));
    const beat = beats[nextIndex];
    setPresentationBeat(nextIndex);
    applyFilters({ ...filters, topic_code: beat.topic_code || '' });
    changeView(beat.view);
  };
  const handleTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = VIEWS.findIndex((item) => item.id === view);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
    const next = VIEWS[nextIndex];
    changeView(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  const selectFilter = (field, value) => {
    dispatchSelection({ type: 'select', field, value });
    applyFilters({ ...filters, [field]: value });
  };
  const clearFilter = (field) => {
    dispatchSelection({ type: 'clear', field });
    if (field === 'period' || field === 'start_date' || field === 'end_date') {
      applyFilters({ ...filters, start_date: meta?.available_date_range?.start_date || '', end_date: meta?.available_date_range?.end_date || '' });
    } else applyFilters({ ...filters, [field]: '' });
  };
  const clearAll = (next) => {
    dispatchSelection({ type: 'clear_all' });
    applyFilters(next);
  };
  useEffect(() => {
    const clearLatest = (event) => {
      if (event.key !== 'Escape') return;
      const field = Object.keys(linkedSelections).at(-1);
      if (!field) return;
      event.preventDefault();
      clearFilter(field);
      setAnnouncement(`${field.replaceAll('_', ' ')} selection cleared.`);
    };
    window.addEventListener('keydown', clearLatest);
    return () => window.removeEventListener('keydown', clearLatest);
  }, [linkedSelections, filters, meta]);
  const toggleTheme = () => {
    const active = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    setTheme(active === 'dark' ? 'light' : 'dark');
  };
  const togglePresentation = async () => {
    if (presenting) { if (document.fullscreenElement) await document.exitFullscreen(); setPresenting(false); return; }
    goToBeat(0);
    setPresenting(true);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* CSS presentation mode remains available. */ }
  };
  useEffect(() => {
    const handlePresentationKey = (event) => {
      if (!presenting) return;
      if (event.key === 'Escape') setPresenting(false);
      if (event.key === 'ArrowRight') { event.preventDefault(); goToBeat(presentationBeat + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToBeat(presentationBeat - 1); }
    };
    document.body.classList.toggle('is-presenting', presenting);
    window.addEventListener('keydown', handlePresentationKey);
    return () => { document.body.classList.remove('is-presenting'); window.removeEventListener('keydown', handlePresentationKey); };
  }, [presenting, presentationBeat, filters]);
  const current = VIEWS.find((item) => item.id === view) || VIEWS[0];
  const trend = payloads.timeline;
  const primary = payloads.overview || payloads['coverage-friction'] || payloads.topics || payloads.regions || payloads.quality;

  if (!meta && !error) return <main className="dashboard-shell"><p role="status">Loading synthetic demo metadata…</p></main>;

  return <div className="dashboard-shell">
    <header className="site-header">
      <div className="brand-lockup"><h1>MediBridge Analytics</h1><p className="synthetic-banner">Synthetic demo: not real student data</p></div>
      <div className="shell-actions">
        <div className="audience-controls" role="group" aria-label="Presentation emphasis">
          <button type="button" aria-pressed={audience === 'insurer'} onClick={() => setAudience('insurer')}>Insurer</button>
          <button type="button" aria-pressed={audience === 'public'} onClick={() => setAudience('public')}>Public health</button>
        </div>
        <button className="button button-secondary theme-toggle" type="button" aria-label="Toggle theme" onClick={toggleTheme}>Theme: {theme === 'system' ? 'System' : theme}</button>
        <button className="button button-secondary present-placeholder" type="button" aria-pressed={presenting} onClick={togglePresentation}>{presenting ? 'Exit presentation' : 'Present'}</button>
      </div>
    </header>
    {meta && <FilterBar meta={meta} filters={filters} timeline={payloads.timeline} onApply={applyFilters} onClearField={clearFilter} onClearAll={clearAll} />}
    <nav aria-label="Dashboard views" className="view-navigation"><div role="tablist" aria-label="Dashboard views" onKeyDown={handleTabKeyDown}>{VIEWS.map((item) => <button role="tab" id={`tab-${item.id}`} aria-selected={view === item.id} aria-controls="dashboard-view" tabIndex={view === item.id ? 0 : -1} key={item.id} onClick={() => changeView(item.id)}>{item.label}</button>)}</div></nav>
    <main id="dashboard-view" role="tabpanel" aria-labelledby={`tab-${current.id}`}>
      {presenting && <section className="presentation-caption chart-panel" aria-live="polite"><p className="eyebrow">Walkthrough beat {presentationBeat + 1} of {PRESENTATION_WALKTHROUGHS[walkthrough].length}</p><label>Walkthrough <select value={walkthrough} onChange={(event) => { const nextWalkthrough = event.target.value; const firstBeat = PRESENTATION_WALKTHROUGHS[nextWalkthrough][0]; setWalkthrough(nextWalkthrough); setPresentationBeat(0); applyFilters({ ...filters, topic_code: firstBeat.topic_code || '' }); changeView(firstBeat.view); }}><option value="insurer">Insurer</option><option value="public">Public health</option></select></label><p>{PRESENTATION_WALKTHROUGHS[walkthrough][presentationBeat].caption}</p><button type="button" disabled={presentationBeat === 0} onClick={() => goToBeat(presentationBeat - 1)}>Previous</button> <button type="button" disabled={presentationBeat === PRESENTATION_WALKTHROUGHS[walkthrough].length - 1} onClick={() => goToBeat(presentationBeat + 1)}>Next</button> <small>Use ← and → to move through the walkthrough.</small></section>}
      <div className="view-heading"><p className="eyebrow">{current.label}</p><h2>{current.label}</h2></div>
      {error && <div className="error-panel" role="alert"><h3>Could not load aggregates</h3><p>{error}</p><p>Check that the loopback demo service and synthetic aggregate store are available.</p></div>}
      {loading && !error && <p className="loading-panel" role="status">Loading aggregate results…</p>}
      {!loading && !error && view === 'overview' && <Overview data={payloads.overview} ratesData={payloads.topics} timeline={payloads.timeline} filters={filters} onSelect={selectFilter} />}
      {!loading && !error && view === 'insurer' && <InsurerNeeds data={payloads['coverage-friction']} topics={payloads.topics} timeline={payloads.timeline} matrix={payloads.insurerMatrix} meta={meta} onSelect={selectFilter} />}
      {!loading && !error && view === 'policy' && <PublicHealthPolicy data={payloads.regions} topics={payloads.topics} timeline={trend} filters={filters} />}
      {!loading && !error && view === 'geography' && <ServiceGeography data={payloads.regions} basisMatrix={payloads.basisMatrix} serviceMatrix={payloads.serviceMatrix} topicMatrix={payloads.topicMatrix} filters={filters} onSelect={selectFilter} />}
      {!loading && !error && view === 'quality' && <DataQuality data={payloads.quality} meta={meta} geography={payloads.regions} timeline={payloads.timeline} currentTables={Object.values(payloads).flatMap((payload) => Object.values(payload?.tables || {}))} />}
      {!loading && !error && <StateMessage table={primary} title="Current aggregate selection" />}
    </main>
    {primary && <Provenance response={primary} />}
    <footer className="site-footer"><span>Loopback-only synthetic demonstration</span><span>No transcripts, person/session IDs, row data, or individual paths are shown or exported.</span></footer>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
