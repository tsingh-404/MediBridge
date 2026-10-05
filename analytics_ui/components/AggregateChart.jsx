import React from 'react';
import { AggregateTable } from './AggregateTable.jsx';
import { cellDimensions, formatCell, labelCode, tableCells } from './data.js';

export function RankedBars({ title, table, filterField, onSelect, limit = 8 }) {
  const cells = tableCells(table).slice(0, limit);
  const max = Math.max(1, ...cells.filter((cell) => !cell.suppressed).map((cell) => Number(cell.value) || 0));
  return <section className="chart-panel" aria-labelledby={`chart-${filterField || 'ranked'}`}>
    <h3 id={`chart-${filterField || 'ranked'}`}>{title}</h3>
    <p className="muted">Horizontal bars compare category values. Categories may overlap and do not add to 100%.</p>
    <ol className="bar-list" aria-label={`${title}, text alternative`}>
      {cells.map((cell, index) => {
        const dimensions = cellDimensions(cell);
        const code = dimensions[filterField] || dimensions.topic_code || dimensions.concern_code || dimensions.service_code || `Category ${index + 1}`;
        const label = labelCode(code);
        const hidden = cell.suppressed || cell.value == null;
        const width = hidden ? 0 : Math.max(2, Math.round((Number(cell.value) / max) * 100));
        return <li key={`${code}-${index}`}>
          <button type="button" className="bar-row" disabled={!onSelect || !filterField || hidden} onClick={() => onSelect(filterField, code)} aria-label={`${label}: ${hidden ? 'Insufficient group size' : formatCell(cell, table.unit)}${onSelect && !hidden ? ', apply filter' : ''}`}>
            <span className="bar-label">{label}</span><span className="bar-track"><span className="bar-fill" style={{ width: `${width}%` }} /></span><span className="bar-value">{hidden ? 'Insufficient group size' : formatCell(cell, table.unit)}</span>
          </button>
        </li>;
      })}
      {cells.length === 0 && <li>No category results for these filters.</li>}
    </ol>
    <p className="chart-description">Text summary: {cells.length} returned aggregate categories. Suppressed categories remain labelled and are not rendered as zero.</p>
  </section>;
}

export function MonthlyTrend({ table, title = 'Monthly question rate', filters, filterField = 'topic_code', scenarioVersions = [] }) {
  const cells = tableCells(table);
  if (!filters?.[filterField]) {
    const dimensionLabel = filterField === 'concern_code' ? 'concern' : 'topic';
    return <section className="chart-panel"><h3>{title}</h3><p role="status">Select one allowlisted {dimensionLabel} to inspect its monthly series. Unselected multi-category trend tables can be fully hidden by the API’s table-local complementary suppression.</p></section>;
  }
  if (!filters?.region || filters.region === 'unknown' || !filters?.location_basis || filters.location_basis === 'unknown') {
    return <section className="chart-panel"><h3>{title}</h3><p role="status">Select one broad region and a known location basis to view segmented trend rates. Unknown region or location-basis rates are excluded by the API contract.</p></section>;
  }
  const series = cells.filter((cell) => cell.series === 'current' || !cell.series);
  const months = [...new Set(series.map((cell) => cell.dimensions?.month || cell.dimensions?.period))].filter(Boolean).sort();
  const topics = [...new Set(series.map((cell) => cell.dimensions?.topic_code).filter(Boolean))].slice(0, 4);
  const max = Math.max(1, ...series.filter((cell) => !cell.suppressed).map((cell) => Number(cell.value) || 0));
  const hasRespiratoryScenario = scenarioVersions.includes('respiratory_spike')
    && filters.topic_code === 'respiratory_information';
  const hasCoverageScenario = scenarioVersions.includes('coverage_information_spike')
    && (['coverage_benefit_exclusion', 'coverage_waiting_period', 'claims_process'].includes(filters.topic_code)
      || ['benefit_exclusion', 'waiting_period', 'claims_process'].includes(filters.concern_code));
  return <section className="chart-panel" aria-labelledby="monthly-trend-title">
    <h3 id="monthly-trend-title">{title}</h3>
    <p className="muted">Sessions per 1,000 sessions in each month, region and location-basis group. This is a synthetic question trend, not prevalence or an alert.</p>
    {months.length === 0 ? <p>No monthly trend values are available for this selection.</p> : <div className="trend-chart" role="img" aria-label={`${months.length} monthly buckets for ${topics.map(labelCode).join(', ') || 'selected topics'}; rates are per 1,000 sessions within each period, region, and location basis.`}>
      {months.map((month) => {
        const artificial = (hasRespiratoryScenario && month >= '2025-01' && month <= '2025-03')
          || (hasCoverageScenario && month >= '2025-10' && month <= '2025-12');
        return <div className="trend-month" key={month}><span className="month-label">{month}</span><div className="trend-bars">
        {topics.map((topic) => {
          const cell = series.find((candidate) => (candidate.dimensions?.month || candidate.dimensions?.period) === month && candidate.dimensions?.topic_code === topic);
          const value = cell?.value;
          const hidden = !cell || cell.suppressed || value == null;
          const width = hidden ? 0 : Math.max(2, Math.round((Number(value) / max) * 100));
          const baseline = cell?.baseline_available
            ? `Prior year: ${cell.baseline_numerator} / ${cell.baseline_denominator}; ${formatCell({ value: cell.baseline_rate_per_1000 }, 'topic_sessions_per_1000_selected_sessions')}`
            : '';
          return <div key={topic} className="trend-series"><span>{labelCode(topic)}</span><span className="bar-track"><span className="bar-fill" style={{ width: `${width}%` }} /></span><span className="trend-rate">{hidden ? 'Insufficient group size' : formatCell(cell, table?.unit)}</span><span className="trend-denominator">{hidden ? 'Group counts hidden' : `${cell.numerator} / ${cell.denominator} sessions`}</span>{baseline && <small>{baseline}</small>}</div>;
        })}
      </div>{artificial && <p className="scenario-point-label">Artificial demonstration pattern</p>}</div>;
      })}
    </div>}
    <details className="trend-table-details"><summary>Open monthly values in an accessible table</summary><AggregateTable title="Monthly trend values" table={table} columns={['month', 'region', 'location_basis', 'topic_code']} /></details>
  </section>;
}
