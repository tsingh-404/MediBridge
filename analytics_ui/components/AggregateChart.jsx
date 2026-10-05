import React from 'react';
import { AggregateTable } from './AggregateTable.jsx';
import { cellDimensions, formatCell, formatRateDifference, labelCode, tableCells, trendBaseline, trendCategories, trendCellSeries, trendLineSegments } from './data.js';

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
  const cells = trendCellSeries(table, filterField);
  if (!filters?.[filterField]) {
    const dimensionLabel = filterField === 'concern_code' ? 'concern' : 'topic';
    return <section className="chart-panel"><h3>{title}</h3><p role="status">Select one allowlisted {dimensionLabel} to inspect its monthly series. Unselected multi-category trend tables can be fully hidden by the API’s table-local complementary suppression.</p></section>;
  }
  if (!filters?.region || filters.region === 'unknown' || !filters?.location_basis || filters.location_basis === 'unknown') {
    return <section className="chart-panel"><h3>{title}</h3><p role="status">Select one broad region and a known location basis to view segmented trend rates. Unknown region or location-basis rates are excluded by the API contract.</p></section>;
  }
  const series = cells;
  const months = [...new Set(series.map((cell) => cell.dimensions?.month || cell.dimensions?.period))].filter(Boolean).sort();
  const categories = trendCategories(series, filterField).slice(0, 4);
  const categoryLabel = filterField === 'concern_code' ? 'selected concern' : 'selected topic';
  const titleId = `monthly-trend-${filterField}-title`;
  const hasRespiratoryScenario = scenarioVersions.includes('respiratory_spike')
    && filters.topic_code === 'respiratory_information';
  const hasCoverageScenario = scenarioVersions.includes('coverage_information_spike')
    && (['coverage_benefit_exclusion', 'coverage_waiting_period', 'claims_process'].includes(filters.topic_code)
      || ['benefit_exclusion', 'waiting_period', 'claims_process'].includes(filters.concern_code));
  const chartData = months.map((month) => {
    const cell = series.find((candidate) => (candidate.dimensions?.month || candidate.dimensions?.period) === month
      && candidate.dimensions?.[filterField] === categories[0]);
    const hidden = !cell || cell.suppressed || cell.value == null;
    const baseline = trendBaseline(cell);
    return {
      month,
      cell,
      current: hidden ? null : Number(cell.value),
      baseline: baseline.available && baseline.rate != null ? Number(baseline.rate) : null,
      baselineData: baseline,
      artificial: (hasRespiratoryScenario && month >= '2025-01' && month <= '2025-03')
        || (hasCoverageScenario && month >= '2025-10' && month <= '2025-12'),
    };
  });
  const max = Math.max(1, ...chartData.flatMap((point) => [point.current || 0, point.baseline || 0]));
  const xForIndex = (index) => chartData.length < 2 ? 380 : 58 + index * (644 / (chartData.length - 1));
  const yForValue = (value) => 180 - (value / max) * 145;
  const linePoints = (key) => trendLineSegments(chartData.map((point) => point[key]))
    .map((segment) => segment.map(({ index, value }) => `${xForIndex(index)},${yForValue(value)}`).join(' '));
  const currentLines = linePoints('current');
  const baselineLines = linePoints('baseline');
  const hasBaseline = chartData.some((point) => point.baseline !== null);
  return <section className="chart-panel" aria-labelledby={titleId}>
    <h3 id={titleId}>{title}</h3>
    <p className="muted">Sessions per 1,000 sessions in each month, region and location-basis group. This is a synthetic question trend, not prevalence or an alert.</p>
    {months.length === 0 ? <p>No monthly trend values are available for this selection.</p> : <>
      <div className="trend-chart" role="img" aria-label={`${months.length} monthly points for ${categories.map(labelCode).join(', ') || categoryLabel}; current and available prior-year rates are shown as distinct lines per 1,000 sessions within each period, region, and location basis.`}>
        <svg className="trend-line-chart" viewBox="0 0 760 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
          {[0, max / 2, max].map((tick) => <g key={tick} className="trend-axis-tick"><line x1="52" x2="708" y1={yForValue(tick)} y2={yForValue(tick)} /><text x="46" y={yForValue(tick) + 4} textAnchor="end">{formatCell({ value: tick }, table?.unit)}</text></g>)}
          {currentLines.map((points, index) => <polyline key={`current-${index}`} className="trend-current-line" points={points} />)}
          {baselineLines.map((points, index) => <polyline key={`baseline-${index}`} className="trend-baseline-line" points={points} />)}
          {chartData.map((point, index) => {
            const x = xForIndex(index);
            const currentY = point.current === null ? null : yForValue(point.current);
            const baselineY = point.baseline === null ? null : yForValue(point.baseline);
            return <g key={point.month}>
              <text className="trend-month-tick" x={x} y="207" textAnchor="middle">{point.month}</text>
              {currentY !== null && <circle className="trend-current-point" cx={x} cy={currentY} r="5" />}
              {baselineY !== null && <circle className="trend-baseline-point" cx={x} cy={baselineY} r="5" />}
              {point.artificial && currentY !== null && <text className="scenario-point-label" x={x} y={currentY - 10} textAnchor="middle">Artificial demonstration pattern</text>}
            </g>;
          })}
        </svg>
      </div>
      <div className="trend-legend" aria-label="Trend line key">
        <span><i className="trend-legend-swatch current-swatch" />Current {categories.map(labelCode).join(', ')}</span>
        {hasBaseline
          ? <span><i className="trend-legend-swatch baseline-swatch" />Prior-year {categories.map(labelCode).join(', ')}</span>
          : <span className="trend-baseline-unavailable">Prior-year monthly baseline unavailable</span>}
      </div>
      <ul className="trend-period-list" aria-label="Monthly values text alternative">
        {chartData.map((point) => {
          const hidden = point.current === null;
          const baseline = point.baselineData;
          return <li key={point.month}>
            <strong>{point.month} ? {labelCode(categories[0] || categoryLabel)}</strong>
            <span>Current: {hidden ? 'Insufficient group size' : `${formatCell(point.cell, table?.unit)}; ${point.cell.numerator} / ${point.cell.denominator} sessions`}</span>
            <span>{baseline.available && baseline.rate != null
              ? `Prior year: ${formatCell({ value: baseline.rate }, table?.unit)}; ${baseline.numerator} / ${baseline.denominator} sessions; rate difference ${formatRateDifference(baseline.difference)}`
              : 'Prior-year monthly baseline unavailable'}</span>
            {point.artificial && <span className="scenario-point-label">Artificial demonstration pattern</span>}
          </li>;
        })}
      </ul>
    </>}
    <details className="trend-table-details"><summary>Open monthly values in an accessible table</summary><AggregateTable title="Monthly trend values" table={table} columns={['month', 'region', 'location_basis', filterField]} extraColumns={[
      { label: 'Prior-year numerator / denominator', render: (cell) => { const baseline = trendBaseline(cell); return baseline.available ? `${baseline.numerator ?? 'Hidden'} / ${baseline.denominator ?? 'Hidden'}` : 'Unavailable'; } },
      { label: 'Prior-year rate / 1,000', render: (cell) => { const baseline = trendBaseline(cell); return baseline.available && baseline.rate != null ? formatCell({ value: baseline.rate }, table?.unit) : 'Unavailable'; } },
      { label: 'Rate difference per 1,000', render: (cell) => { const baseline = trendBaseline(cell); return baseline.available ? formatRateDifference(baseline.difference) : 'Unavailable'; } },
    ]} /></details>
  </section>;
}
