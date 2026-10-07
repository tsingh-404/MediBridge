import React, { useMemo } from 'react';
import { brushRange } from '../timeline.js';
import { cellDimensions } from './data.js';

const WINDOWS = [
  { version: 'respiratory_spike', start: '2025-01', end: '2025-03', label: 'Respiratory scenario' },
  { version: 'coverage_information_spike', start: '2025-10', end: '2025-12', label: 'Coverage scenario' },
];

export function TimelineBrush({ table, filters, onRangeChange, scenarios = [] }) {
  const months = useMemo(() => (table?.cells || []).map((cell) => cellDimensions(cell).month).filter(Boolean).sort(), [table]);
  if (!months.length) return null;
  const dateIndex = (date, fallback) => {
    const month = date?.slice(0, 7);
    const found = months.indexOf(month);
    return found < 0 ? fallback : found;
  };
  const selected = brushRange(dateIndex(filters.start_date, 0), dateIndex(filters.end_date, months.length - 1), months.length);
  const values = months.map((month) => {
    const cell = (table.cells || []).find((candidate) => cellDimensions(candidate).month === month);
    return cell && !cell.suppressed && cell.value != null ? Number(cell.value) : null;
  });
  const max = Math.max(1, ...values.filter((value) => value != null));
  const update = (start, end) => {
    const range = brushRange(start, end, months.length);
    onRangeChange?.(months[range.start], months[range.end]);
  };
  const activeScenarios = WINDOWS.filter((scenario) => scenarios.includes(scenario.version));
  const scenarioPosition = (scenario) => {
    const start = months.indexOf(scenario.start);
    const end = months.indexOf(scenario.end);
    if (start < 0 || end < 0) return null;
    return { left: `${(start / months.length) * 100}%`, width: `${((end - start + 1) / months.length) * 100}%` };
  };

  return <div className="timeline-brush" aria-label="Monthly selected-session timeline">
    <div className="timeline-heading"><strong>Selected sessions by month</strong><span>{months[selected.start]} to {months[selected.end]}</span></div>
    <div className="timeline-plot" role="group" aria-label="Choose a monthly date range">
      {activeScenarios.map((scenario) => scenarioPosition(scenario) && <span className="timeline-scenario" style={scenarioPosition(scenario)} key={scenario.version} aria-label={scenario.label} title={scenario.label} />)}
      <svg viewBox={`0 0 ${months.length * 8} 48`} preserveAspectRatio="none" aria-hidden="true">
        {values.map((value, index) => <rect key={months[index]} className={index >= selected.start && index <= selected.end ? 'timeline-bar is-selected' : 'timeline-bar'} x={index * 8 + 1} y={value == null ? 44 : 44 - Math.max(2, (value / max) * 38)} width="6" height={value == null ? 3 : Math.max(2, (value / max) * 38)} rx="1" />)}
      </svg>
      <div className="timeline-range-controls">
        <input aria-label="Timeline start month" type="range" min="0" max={months.length - 1} value={selected.start} onChange={(event) => update(Number(event.target.value), selected.end)} />
        <input aria-label="Timeline end month" type="range" min="0" max={months.length - 1} value={selected.end} onChange={(event) => update(selected.start, Number(event.target.value))} />
      </div>
    </div>
    <div className="timeline-month-labels"><span>{months[0]}</span><span>{months.at(-1)}</span></div>
  </div>;
}
