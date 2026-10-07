import React, { useState } from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { cellDimensions, formatCell, formatRateDifference, labelCode, tableCells, trendBaseline, trendLineSegments } from '../data.js';
import { createLinearScale, linePath } from './scales.js';
import { formatMonth } from './format.js';
import { Tooltip } from './Tooltip.jsx';
import { useHover } from './useHover.js';
import { cohortScope } from './overviewData.js';

const RESPIRATORY_MONTHS = ['2025-01', '2025-02', '2025-03'];
const COVERAGE_MONTHS = ['2025-10', '2025-11', '2025-12'];

export function TrendChart({ table, title, topicCode, filters = {}, scenarioVersions = [] }) {
  const [active, setActive] = useState(null);
  const cells = tableCells(table);
  const months = [...new Set(cells.map((cell) => cellDimensions(cell).month).filter(Boolean))].sort();
  const points = months.map((month) => {
    const cell = cells.find((candidate) => cellDimensions(candidate).month === month);
    const baseline = trendBaseline(cell);
    const hidden = !cell || cell.suppressed || cell.value == null;
    const injected = scenarioVersions.includes('respiratory_spike') && topicCode === 'respiratory_information' && RESPIRATORY_MONTHS.includes(month)
      || scenarioVersions.includes('coverage_information_spike') && ['coverage_benefit_exclusion', 'coverage_waiting_period', 'claims_process'].includes(topicCode) && COVERAGE_MONTHS.includes(month);
    return { month, cell, value: hidden ? null : Number(cell.value), baseline: baseline.available && baseline.rate != null ? Number(baseline.rate) : null, baselineData: baseline, injected };
  });
  const max = Math.max(1, ...points.flatMap((point) => [point.value, point.baseline]).filter((value) => value != null));
  const x = (index) => points.length < 2 ? 380 : 58 + index * (644 / (points.length - 1));
  const { scale: y } = createLinearScale([0, max], [180, 24]);
  const lineFor = (key) => trendLineSegments(points.map((point) => point[key]))
    .map((segment) => linePath(segment.map(({ index, value }) => ({ x: x(index), y: y(value) }))));
  const current = lineFor('value');
  const baseline = lineFor('baseline');
  const areaPaths = trendLineSegments(points.map((point) => point.value)).map((segment) => {
    const coordinates = segment.map(({ index, value }) => ({ x: x(index), y: y(value) }));
    if (coordinates.length < 2) return null;
    return `M${coordinates[0].x},180L${coordinates.map((point) => `${point.x},${point.y}`).join('L')}L${coordinates.at(-1).x},180Z`;
  }).filter(Boolean);
  const baselineExists = points.some((point) => point.baseline != null);
  const selected = active == null ? null : points[active];
  const scope = cohortScope(filters);
  const frameTitle = title || `${scope} monthly topic rate`;
  const hover = useHover();
  const tableColumns = ['month', 'topic_code'];
  const maxLabels = 8;
  const labelIndices = new Set(months.length <= maxLabels ? months.map((_, i) => i) : Array.from({ length: maxLabels }, (_, i) => Math.round(i * (months.length - 1) / (maxLabels - 1))));
  const visiblePoint = [...points].reverse().find((point) => point.value != null);
  const scenarioWindows = points.reduce((windows, point, index) => {
    if (!point.injected) return windows;
    const last = windows.at(-1);
    if (last && last.end === index - 1) last.end = index;
    else windows.push({ start: index, end: index, label: 'Artificial demonstration pattern' });
    return windows;
  }, []);
  return <ChartFrame title={frameTitle} table={table} columns={tableColumns} subtitle={`${scope} synthetic topic-tag rate per 1,000 selected sessions. Topic categories can overlap; this is not prevalence or an alert.`}>
    {!points.length ? <p role="status">No monthly values are available for this topic.</p> : <>
      <div className="trend-visual-wrap">
        <div className="trend-tooltip-anchor" aria-live="polite">
          <Tooltip id="trend-tooltip" open={active != null}>
            {selected?.value == null ? 'Insufficient group size' : <><strong>{formatMonth(selected.month)}</strong><br />{formatCell(selected.cell, table?.unit)}<br />{selected.cell?.numerator ?? '—'} / {selected.cell?.denominator ?? '—'} sessions{selected.cell?.distinct_sessions != null ? ` · ${selected.cell.distinct_sessions} distinct sessions` : ''}{selected.baselineData.available ? <><br />Prior year: {formatCell({ value: selected.baseline }, table?.unit)} · change {formatRateDifference(selected.baselineData.difference)}</> : null}</>}
          </Tooltip>
        </div>
        <svg className="trend-chart-svg" viewBox="0 0 760 230" role="group" aria-label={`${scope} ${months.length} month trend for ${labelCode(topicCode)}; focus a month to inspect its value.`}>
          <defs><pattern id="trend-suppressed-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--surface-subtle)" /><path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" stroke="var(--muted)" strokeWidth=".8" /></pattern></defs>
          {[0, max / 2, max].map((tick) => <g className="trend-gridline" key={tick}><line x1="52" x2="708" y1={y(tick)} y2={y(tick)} /><text x="45" y={y(tick) + 4} textAnchor="end">{formatCell({ value: tick }, table?.unit)}</text></g>)}
          {scenarioWindows.map((window, index) => <g key={`scenario-${index}`}><rect className="scenario-band" x={x(window.start) - 12} y="20" width={Math.max(24, x(window.end) - x(window.start) + 24)} height="166" /><text className="scenario-band-label" x={(x(window.start) + x(window.end)) / 2} y="16" textAnchor="middle">{window.label}</text></g>)}
          {areaPaths.map((path, index) => <path key={`area-${index}`} className="trend-current-area" d={path} />)}
          {baseline.map((path, index) => <path key={`baseline-${index}`} className="trend-baseline-path" d={path} />)}
          {current.map((path, index) => <path key={`current-${index}`} className="trend-current-path" d={path} />)}
          {active != null && <line className="trend-crosshair" x1={x(active)} x2={x(active)} y1="20" y2="186" />}
          {visiblePoint && <text className="trend-end-label" x={Math.min(700, x(points.indexOf(visiblePoint)) + 6)} y={y(visiblePoint.value) - 8}>{formatCell(visiblePoint.cell, table?.unit)}</text>}
          {points.map((point, index) => <g key={point.month}>
            {point.value == null && <rect className="trend-suppressed-mark" x={x(index) - 8} y="80" width="16" height="16" fill="url(#trend-suppressed-hatch)" aria-label="Insufficient group size" />}
            {point.value != null && <circle className="trend-current-point" cx={x(index)} cy={y(point.value)} r="4" />}
            {point.baseline != null && <circle className="trend-baseline-point" cx={x(index)} cy={y(point.baseline)} r="3" />}
            <rect className="trend-hit-target" x={x(index) - 12} y="20" width="24" height="174" tabIndex="0" role="button" aria-describedby={active === index ? 'trend-tooltip' : undefined}
              aria-label={`${formatMonth(point.month)}: ${point.value == null ? 'Insufficient group size' : `${formatCell(point.cell, table?.unit)}; ${point.cell?.numerator ?? '—'} of ${point.cell?.denominator ?? '—'} sessions`}`}
              {...hover.triggerProps} onFocus={() => { setActive(index); hover.show(); }} onBlur={() => { setActive(null); hover.hide(); }} onMouseEnter={() => { setActive(index); hover.show(); }} onMouseLeave={() => { setActive(null); hover.hide(); }} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.parentElement?.parentElement?.querySelectorAll('.trend-hit-target')[Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))]?.focus(); } }} />
            {labelIndices.has(index) && <text className="trend-month-label" x={x(index)} y="215" textAnchor="middle">{point.month}</text>}
          </g>)}
        </svg>
      </div>
      <div className="trend-legend"><span><i className="trend-legend-current" />Selected topic</span><span><i className="trend-legend-baseline" />Prior-year baseline {baselineExists ? '' : '(unavailable)'}</span></div>
      <ul className="trend-text-alternative" aria-label={`${scope} monthly values text alternative`}>{points.map((point) => <li key={point.month}><strong>{formatMonth(point.month)}</strong><span>{point.value == null ? 'Insufficient group size' : `${formatCell(point.cell, table?.unit)}; ${point.cell?.numerator ?? '—'} / ${point.cell?.denominator ?? '—'} sessions`}</span><span>{point.baselineData.available ? `Prior year: ${formatCell({ value: point.baseline }, table?.unit)}; change ${formatRateDifference(point.baselineData.difference)}` : 'Prior-year monthly baseline unavailable'}</span>{point.injected && <span className="scenario-label">Artificial demonstration pattern</span>}</li>)}</ul>
      <p className="scenario-caveat">Synthetic scenario caveat: highlighted scenario windows are artificial demonstration patterns, not real-world events.</p>
    </>}
  </ChartFrame>;
}
