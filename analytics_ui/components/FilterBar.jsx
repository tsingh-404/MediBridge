import React, { useEffect, useMemo, useRef, useState } from 'react';
import { resetFilters } from '../filters.js';
import { labelCode } from './data.js';
import { TimelineBrush } from './TimelineBrush.jsx';

const FILTER_LABELS = {
  insurer_id: 'Insurer', tier_id: 'Tier', region: 'Region', location_basis: 'Location basis',
  topic_code: 'Topic', service_code: 'Service', concern_code: 'Concern',
};

function optionLabel(field, value) {
  if (value.startsWith('unknown')) return 'Unknown';
  return labelCode(value);
}

function periodPresets(dateRange) {
  const end = dateRange.end_date || '';
  const last12 = end ? new Date(`${end}T00:00:00Z`) : null;
  if (last12) last12.setUTCMonth(last12.getUTCMonth() - 11, 1);
  const last12Start = last12?.toISOString().slice(0, 10) || '';
  return [
    { label: 'Full range', start_date: dateRange.start_date || '', end_date: end },
    { label: 'Last 12 months', start_date: last12Start, end_date: end },
    { label: 'Respiratory scenario window', start_date: '2025-01-01', end_date: '2025-03-31' },
    { label: 'Coverage scenario window', start_date: '2025-10-01', end_date: '2025-12-31' },
  ];
}

export function FilterBar({ meta, filters, onApply, timeline, onClearField, onClearAll }) {
  const [draft, setDraft] = useState(filters);
  const [mobileOpen, setMobileOpen] = useState(false);
  const debounce = useRef(null);
  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => () => clearTimeout(debounce.current), []);

  const dateRange = meta.available_date_range || {};
  const customPeriod = (filters.start_date && filters.start_date !== dateRange.start_date)
    || (filters.end_date && filters.end_date !== dateRange.end_date);
  const count = useMemo(() => Object.entries(filters).filter(([field, value]) => !field.includes('date') && value).length + (customPeriod ? 1 : 0), [filters, customPeriod]);
  const presets = periodPresets(dateRange);
  const schedule = (next) => {
    setDraft(next);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onApply(next), 150);
  };
  const updateField = (field, value) => {
    const next = { ...draft, [field]: value };
    if (field === 'start_date' && next.end_date && value > next.end_date) next.end_date = value;
    if (field === 'end_date' && next.start_date && value < next.start_date) next.start_date = value;
    schedule(next);
  };
  const choosePreset = (preset) => {
    const boundedStart = preset.start_date < dateRange.start_date ? dateRange.start_date : preset.start_date;
    const boundedEnd = preset.end_date > dateRange.end_date ? dateRange.end_date : preset.end_date;
    if (boundedStart > boundedEnd) return;
    schedule({ ...draft, start_date: boundedStart, end_date: boundedEnd });
  };
  const clearAll = () => {
    clearTimeout(debounce.current);
    const next = resetFilters(meta);
    setDraft(next);
    onClearAll ? onClearAll(next) : onApply(next);
  };
  const updateRange = (startMonth, endMonth) => {
    const end = new Date(`${endMonth}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    const startDate = `${startMonth}-01` < dateRange.start_date ? dateRange.start_date : `${startMonth}-01`;
    const endDate = end.toISOString().slice(0, 10) > dateRange.end_date ? dateRange.end_date : end.toISOString().slice(0, 10);
    schedule({ ...draft, start_date: startDate, end_date: endDate });
  };
  const selectedMonthRange = timeline?.tables?.selected_sessions_by_month;

  return <section className="filter-panel" aria-label="Shared dashboard filters">
    <div className="filter-toolbar">
      <button className="button button-secondary mobile-filter-toggle" type="button" aria-expanded={mobileOpen} aria-controls="filter-controls" onClick={() => setMobileOpen((open) => !open)}>
        Filters ({count})
      </button>
      <div id="filter-controls" className={`filter-controls${mobileOpen ? ' filter-controls-open' : ''}`}>
        <details className="filter-popover period-popover">
          <summary aria-label="Choose date period">Period</summary>
          <div className="filter-popover-content" role="group" aria-label="Period presets">
            {presets.map((preset) => <button type="button" key={preset.label} onClick={() => choosePreset(preset)}>{preset.label}</button>)}
            <label>Start date<input type="date" min={dateRange.start_date} max={dateRange.end_date} value={draft.start_date || ''} onChange={(event) => updateField('start_date', event.target.value)} /></label>
            <label>End date<input type="date" min={dateRange.start_date} max={dateRange.end_date} value={draft.end_date || ''} onChange={(event) => updateField('end_date', event.target.value)} /></label>
          </div>
        </details>
        {Object.entries(FILTER_LABELS).map(([field, title]) => <details className="filter-popover" key={field}>
          <summary aria-label={`${title} filter`}>{title}{filters[field] ? ' •' : ''}</summary>
          <div className="filter-popover-content">
            <label htmlFor={`filter-${field}`}>{title}
              <select id={`filter-${field}`} role="combobox" value={draft[field] || ''} onChange={(event) => updateField(field, event.target.value)}>
                <option value="">All {title.toLowerCase()} values</option>
                {(meta.allowlists?.[field] || []).map((value) => <option value={value} key={value}>{optionLabel(field, value)}</option>)}
              </select>
            </label>
          </div>
        </details>)}
      </div>
      <button className="button button-secondary clear-filters" type="button" onClick={clearAll}>Clear all</button>
    </div>
    {selectedMonthRange && <TimelineBrush table={selectedMonthRange} filters={filters} onRangeChange={updateRange} scenarios={timeline?.provenance?.scenario_versions || []} />}
    <div className="filter-chip-row" aria-label="Applied filters">
      {Object.entries(filters).filter(([field, value]) => !field.includes('date') && value).map(([field, value]) => <span className="filter-chip" key={field}>
        <span>{FILTER_LABELS[field]?.replaceAll('_', ' ') || field}: {labelCode(value)}</span>
        <button type="button" aria-label={`Remove ${field.replaceAll('_', ' ')} filter`} onClick={() => onClearField?.(field)}>×</button>
      </span>)}
      {customPeriod && <span className="filter-chip"><span>Period: {filters.start_date} to {filters.end_date}</span><button type="button" aria-label="Remove period filter" onClick={() => onClearField?.('period')}>×</button></span>}
      {!count && <span className="muted">No filters selected</span>}
    </div>
    <span className="sr-only" aria-live="polite">Filter changes apply automatically.</span>
  </section>;
}
