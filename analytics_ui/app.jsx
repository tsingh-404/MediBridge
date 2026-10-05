import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchAggregate } from './api.js';
import { parseFilters, resolveView, serializeFilters } from './filters.js';
import { FilterBar } from './components/FilterBar.jsx';
import { Provenance } from './components/Provenance.jsx';
import { StateMessage } from './components/StateMessage.jsx';
import { Overview } from './views/Overview.jsx';
import { InsurerNeeds } from './views/InsurerNeeds.jsx';
import { PublicHealthPolicy } from './views/PublicHealthPolicy.jsx';
import { ServiceGeography } from './views/ServiceGeography.jsx';
import { DataQuality } from './views/DataQuality.jsx';

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'insurer', label: 'Insurer needs' },
  { id: 'policy', label: 'Public health and policy' },
  { id: 'geography', label: 'Service geography' },
  { id: 'quality', label: 'Data quality' },
];

function App() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({});
  const [view, setView] = useState(resolveView(new URLSearchParams(location.search), VIEWS.map((item) => item.id)));
  const [audience, setAudience] = useState('insurer');
  const [payloads, setPayloads] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('Loading synthetic dashboard metadata.');

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
    if (!meta) return undefined;
    const controller = new AbortController();
    const endpoints = view === 'overview' ? ['overview', 'trend']
      : view === 'insurer' ? ['coverage-friction']
        : view === 'policy' ? ['topics', 'trend', 'regions']
          : view === 'geography' ? ['regions'] : ['quality'];
    setLoading(true);
    setError('');
    setAnnouncement(`Loading ${VIEWS.find((item) => item.id === view)?.label || 'dashboard'} aggregates.`);
    Promise.all(endpoints.map((endpoint) => fetchAggregate(endpoint, filters, { signal: controller.signal, bucket: 'month' }).then((data) => [endpoint, data])))
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

  const appliedCount = useMemo(() => Object.entries(filters).filter(([key, value]) => key !== 'start_date' && key !== 'end_date' && value).length, [filters]);
  const applyFilters = (next) => {
    const params = serializeFilters(next);
    const queryView = view !== 'overview' ? `&view=${encodeURIComponent(view)}` : '';
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${queryView}`);
    setFilters(next);
  };
  const changeView = (nextView) => {
    setView(nextView);
    const params = serializeFilters(filters);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}&` : '?'}view=${encodeURIComponent(nextView)}`);
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
  const selectFilter = (field, value) => applyFilters({ ...filters, [field]: value });
  const current = VIEWS.find((item) => item.id === view) || VIEWS[0];
  const trend = payloads.trend;
  const primary = payloads.overview || payloads['coverage-friction'] || payloads.topics || payloads.regions || payloads.quality;

  if (!meta && !error) return <main className="dashboard-shell"><p role="status">Loading synthetic demo metadata…</p></main>;

  return <div className="dashboard-shell">
    <header className="site-header">
      <div><p className="eyebrow">MediBridge · local stakeholder presentation</p><h1>MediBridge Analytics</h1></div>
      <p className="synthetic-banner">Synthetic demo — not real student data</p>
    </header>
    <div className="audience-controls" role="group" aria-label="Presentation emphasis">
      <span>Emphasis</span>
      <button type="button" aria-pressed={audience === 'insurer'} onClick={() => setAudience('insurer')}>Insurer</button>
      <button type="button" aria-pressed={audience === 'public'} onClick={() => setAudience('public')}>Public health</button>
      <span className="muted">Narrative emphasis only; definitions and measures stay the same.</span>
    </div>
    {meta && <FilterBar meta={meta} filters={filters} onApply={applyFilters} />}
    {filters && Object.entries(filters).filter(([, value]) => value).length > 0 && <section className="applied-filters" aria-label="Applied filters"><strong>{appliedCount} dimension filters</strong>{Object.entries(filters).filter(([, value]) => value).map(([key, value]) => <span className="filter-chip" key={key}>{key.replaceAll('_', ' ')}: {value}</span>)}</section>}
    <nav aria-label="Dashboard views" className="view-navigation"><div role="tablist" aria-label="Dashboard views" onKeyDown={handleTabKeyDown}>{VIEWS.map((item) => <button role="tab" id={`tab-${item.id}`} aria-selected={view === item.id} aria-controls="dashboard-view" tabIndex={view === item.id ? 0 : -1} key={item.id} onClick={() => changeView(item.id)}>{item.label}</button>)}</div></nav>
    <main id="dashboard-view" role="tabpanel" aria-labelledby={`tab-${current.id}`}>
      <div className="view-heading"><p className="eyebrow">{current.label}</p><h2>{current.label}</h2></div>
      {error && <div className="error-panel" role="alert"><h3>Could not load aggregates</h3><p>{error}</p><p>Check that the loopback demo service and synthetic aggregate store are available.</p></div>}
      {loading && !error && <p className="loading-panel" role="status">Loading aggregate results…</p>}
      {!loading && !error && view === 'overview' && <Overview data={payloads.overview} trend={trend} filters={filters} onSelect={selectFilter} />}
      {!loading && !error && view === 'insurer' && <InsurerNeeds data={payloads['coverage-friction']} onSelect={selectFilter} />}
      {!loading && !error && view === 'policy' && <PublicHealthPolicy data={payloads.regions} trend={trend} filters={filters} />}
      {!loading && !error && view === 'geography' && <ServiceGeography data={payloads.regions} filters={filters} />}
      {!loading && !error && view === 'quality' && <DataQuality data={payloads.quality} meta={meta} />}
      {!loading && !error && <StateMessage table={primary} title="Current aggregate selection" />}
    </main>
    {primary && <Provenance response={primary} />}
    <footer className="site-footer"><span>Loopback-only synthetic demonstration</span><span>No transcripts, person/session IDs, row data, or individual paths are shown or exported.</span></footer>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
