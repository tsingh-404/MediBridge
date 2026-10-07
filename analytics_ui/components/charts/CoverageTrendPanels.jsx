import React from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { formatCell, formatRateDifference, labelCode, tableCells } from '../data.js';
import { createLinearScale, linePath } from './scales.js';
import { formatMonth } from './format.js';
import { COVERAGE_TOPICS, coverageTopicSeries, isCoverageScenarioMonth, latestCoverageDelta } from './coverageTrend.js';

function pathFor(points, key, x, y) {
  const paths = [];
  let segment = [];
  for (const [index, point] of points.entries()) {
    if (point[key] == null) {
      if (segment.length) paths.push(linePath(segment));
      segment = [];
    } else segment.push({ x: x(index), y: y(point[key]) });
  }
  if (segment.length) paths.push(linePath(segment));
  return paths;
}

function TopicMiniChart({ topic, points, unit }) {
  const width = 320;
  const height = 138;
  const plot = { left: 32, right: 306, top: 12, bottom: 104 };
  const max = Math.max(1, ...points.flatMap((point) => [point.value, point.baseline]).filter((value) => value != null));
  const { scale: y } = createLinearScale([0, max], [plot.bottom, plot.top]);
  const step = points.length > 1 ? (plot.right - plot.left) / (points.length - 1) : 0;
  const x = (index) => points.length > 1 ? plot.left + index * step : (plot.left + plot.right) / 2;
  const scenarioIndices = points.map((point, index) => isCoverageScenarioMonth(point.month) ? index : -1).filter((index) => index >= 0);
  const scenarioStart = scenarioIndices.length ? Math.max(plot.left, x(scenarioIndices[0]) - step / 2) : null;
  const scenarioEnd = scenarioIndices.length ? Math.min(plot.right, x(scenarioIndices.at(-1)) + step / 2) : null;
  const current = pathFor(points, 'value', x, y);
  const baseline = pathFor(points, 'baseline', x, y);
  const labels = new Set(points.length <= 5 ? points.map((_, index) => index) : [0, Math.round((points.length - 1) / 2), points.length - 1]);
  let latestIndex = -1;
  points.forEach((point, index) => { if (point.value != null) latestIndex = index; });
  const topicLabel = labelCode(topic);
  const accessibleSummary = points.map((point) => `${formatMonth(point.month)}: ${point.value == null ? 'insufficient group size' : formatCell({ value: point.value }, unit)}${point.baselineAvailable ? `; previous year ${formatCell({ value: point.baseline }, unit)}` : '; prior-year baseline unavailable'}`).join('. ');
  return <article className="coverage-mini-panel">
    <h4>{topicLabel}</h4>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${topicLabel} monthly synthetic rate; ${accessibleSummary}`}>
      {scenarioStart != null && <g><rect className="coverage-scenario-band" x={scenarioStart} y={plot.top} width={Math.max(3, scenarioEnd - scenarioStart)} height={plot.bottom - plot.top} /><text className="coverage-scenario-label" x={(scenarioStart + scenarioEnd) / 2} y="10" textAnchor="middle">Artificial scenario</text></g>}
      {[0, max / 2, max].map((tick) => <g className="coverage-mini-gridline" key={tick}><line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} /><text x={plot.left - 4} y={y(tick) + 3} textAnchor="end">{Math.round(tick)}</text></g>)}
      {baseline.map((path, index) => <path key={`baseline-${index}`} className="coverage-mini-baseline" d={path} />)}
      {current.map((path, index) => <path key={`current-${index}`} className="coverage-mini-current" d={path} />)}
      {points.map((point, index) => point.value == null && <circle key={`hidden-${point.month}`} className="coverage-mini-suppressed" cx={x(index)} cy={(plot.top + plot.bottom) / 2} r="4" />)}
      {latestIndex >= 0 && <text className="coverage-mini-end-label" x={Math.min(plot.right, x(latestIndex) + 5)} y={y(points[latestIndex].value) - 6}>{formatCell({ value: points[latestIndex].value }, unit)}</text>}
      {points.map((point, index) => labels.has(index) && <text className="coverage-mini-month" key={`month-${point.month}`} x={x(index)} y="126" textAnchor="middle">{point.month.slice(2)}</text>)}
    </svg>
  </article>;
}

function DeltaBars({ timeline, unit }) {
  const deltas = COVERAGE_TOPICS.map((topic) => ({ topic, delta: latestCoverageDelta(coverageTopicSeries(timeline, topic)) }));
  const maximum = Math.max(1, ...deltas.map(({ delta }) => Math.abs(delta?.difference || 0)));
  return <section className="chart-panel chart-frame" aria-label="Coverage topic prior-year delta bars">
    <header className="chart-frame-heading"><div><h3>Latest coverage-topic deltas</h3><p className="muted">Current monthly rate minus the same month last year, where both periods are available and unsuppressed. Synthetic comparison only; it is not a performance score.</p></div></header>
    <ul className="coverage-delta-list">{deltas.map(({ topic, delta }) => <li key={topic}>
      <strong>{labelCode(topic)}</strong>
      {delta ? <>
        <span className="coverage-delta-month">{formatMonth(delta.month)}</span>
        <span className="coverage-delta-track" aria-hidden="true"><i className={delta.difference < 0 ? 'is-negative' : 'is-positive'} style={{ width: `${Math.max(2, Math.abs(delta.difference) / maximum * 100)}%` }} /></span>
        <b>{formatRateDifference(delta.difference)}</b>
      </> : <span className="coverage-delta-unavailable">Prior-year comparison unavailable</span>}
    </li>)}</ul>
    <p className="table-note">Unit: {unit?.replaceAll('_', ' ') || 'topic sessions per 1,000 selected sessions'}. Positive and negative values are shown as absolute bar lengths with direction in the text label.</p>
  </section>;
}

export function CoverageTrendPanels({ timeline }) {
  const series = COVERAGE_TOPICS.map((topic) => ({ topic, points: coverageTopicSeries(timeline, topic) }));
  const unit = timeline?.tables?.[`topic_month_rates.${COVERAGE_TOPICS[0]}`]?.unit || 'sessions_per_1000_selected_sessions';
  const cells = COVERAGE_TOPICS.flatMap((topic) => tableCells(timeline?.tables?.[`topic_month_rates.${topic}`]));
  const table = { unit, cells };
  const months = [...new Set(series.flatMap(({ points }) => points.map((point) => point.month)))].sort();
  return <div className="coverage-trend-panels">
    <ChartFrame title="Coverage-topic monthly rates" table={table} columns={['topic_code', 'month']} subtitle="One small multiple per coverage topic. Rates use the selected synthetic session cohort; topic categories can overlap.">
      {months.length ? <>
        <div className="coverage-mini-legend"><span><i className="coverage-legend-current" />Current synthetic rate</span><span><i className="coverage-legend-baseline" />Same month previous year</span><span><i className="coverage-legend-scenario" />Oct–Dec 2025 artificial coverage scenario</span></div>
        <div className="coverage-small-multiples">{series.map(({ topic, points }) => <TopicMiniChart key={topic} topic={topic} points={points} unit={unit} />)}</div>
        <p className="table-note">Scenario band marks a scripted demonstration window only. Values are synthetic question tags, not evidence of claims outcomes or insurer performance.</p>
      </> : <p role="status">No monthly coverage-topic rates are available for this selection.</p>}
    </ChartFrame>
    <DeltaBars timeline={timeline} unit={unit} />
  </div>;
}
