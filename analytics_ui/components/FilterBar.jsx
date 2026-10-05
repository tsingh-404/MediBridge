import React, { useEffect, useState } from 'react';
import { resetFilters } from '../filters.js';
import { labelCode } from './data.js';

const FILTER_LABELS = {
  insurer_id: 'Insurer',
  tier_id: 'Tier',
  region: 'Broad region',
  location_basis: 'Location basis',
  topic_code: 'Topic',
  service_code: 'Service',
  concern_code: 'Concern',
};

function optionLabel(field, value) {
  if (value === 'unknown_unclassified') return 'Unknown / unclassified';
  if (value === 'unknown_not_assessed') return 'Unknown / not assessed';
  if (value === 'unknown') return `Unknown (${field.replaceAll('_', ' ')})`;
  return labelCode(value);
}

export function FilterBar({ meta, filters, onApply }) {
  const [draft, setDraft] = useState(filters);
  const [expanded, setExpanded] = useState(() => !window.matchMedia('(max-width: 600px)').matches);
  const [error, setError] = useState('');

  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 600px)');
    const updateForWidth = (event) => setExpanded(!event.matches);
    breakpoint.addEventListener('change', updateForWidth);
    return () => breakpoint.removeEventListener('change', updateForWidth);
  }, []);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const apply = (event) => {
    event.preventDefault();
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
      setError('Start date must be on or before end date.');
      return;
    }
    setError('');
    onApply(draft);
  };
  const reset = () => {
    const next = resetFilters(meta);
    setError('');
    setDraft(next);
    onApply(next);
  };
  const allowlists = meta.allowlists || {};
  const dateRange = meta.available_date_range || {};

  return (
    <section className="filter-panel" aria-labelledby="filter-title">
      <div className="filter-heading">
        <div>
          <p className="eyebrow">Shared controls</p>
          <h2 id="filter-title">Filter this presentation</h2>
          <p className="muted">One selected value per dimension; all views use these filters.</p>
        </div>
        <div className="filter-actions">
          <button className="button button-secondary narrow-filter-toggle" type="button" aria-expanded={expanded} aria-controls="filter-fields" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Hide filters' : 'Show filters'}
          </button>
          <button className="button button-secondary" type="button" onClick={reset}>Clear all</button>
        </div>
      </div>
      <form onSubmit={apply}>
        <div id="filter-fields" className={`filter-fields${expanded ? '' : ' filter-fields-collapsed'}`}>
          <label className="control-label" htmlFor="filter-start-date">Start date
            <input id="filter-start-date" type="date" min={dateRange.start_date || undefined} max={dateRange.end_date || undefined} value={draft.start_date} onChange={(event) => setField('start_date', event.target.value)} />
          </label>
          <label className="control-label" htmlFor="filter-end-date">End date
            <input id="filter-end-date" type="date" min={dateRange.start_date || undefined} max={dateRange.end_date || undefined} value={draft.end_date} onChange={(event) => setField('end_date', event.target.value)} />
          </label>
          {Object.entries(FILTER_LABELS).map(([field, title]) => (
            <label className="control-label" htmlFor={`filter-${field}`} key={field}>{title}
              <select id={`filter-${field}`} value={draft[field] || ''} onChange={(event) => setField(field, event.target.value)}>
                <option value="">All {title.toLowerCase()} values</option>
                {(allowlists[field] || []).map((value) => <option value={value} key={value}>{optionLabel(field, value)}</option>)}
              </select>
            </label>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="filter-footer">
          <p className="muted" aria-live="polite">{Object.values(draft).filter(Boolean).length} filters applied after update</p>
          <button className="button button-primary" type="submit">Apply filters</button>
        </div>
      </form>
    </section>
  );
}
