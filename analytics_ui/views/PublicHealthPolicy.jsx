import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { ChartFrame } from '../components/charts/ChartFrame.jsx';
import { StatTile } from '../components/charts/StatTile.jsx';
import { TrendChart } from '../components/charts/TrendChart.jsx';
import { cellDimensions, formatCell, formatRateDifference, labelCode, sortCells, tableCells } from '../components/data.js';
import { selectTopicTrend } from '../components/charts/overviewData.js';
import { formatMonth } from '../components/charts/format.js';
import { latestVisibleBaselineCell } from '../components/charts/coverageTrend.js';
import { POLICY_SCENARIO_CAVEAT } from '../scenarios.js';

function leadingTopic(topicRates, selectedTopic) {
  const cells = tableCells(topicRates).filter((cell) => !cell.suppressed && cell.value != null);
  if (selectedTopic) return cells.find((cell) => cellDimensions(cell).topic_code === selectedTopic) || null;
  return sortCells(cells, 'value', 'desc')[0] || null;
}

function RegionComparison({ table, topicCode }) {
  const cells = tableCells(table).filter((cell) => !topicCode || cellDimensions(cell).topic_code === topicCode);
  const max = Math.max(1, ...cells.filter((cell) => !cell.suppressed && cell.value != null).map((cell) => Number(cell.value)));
  return <ChartFrame title="Selected topic by broad region" table={table} columns={['region', 'location_basis', 'topic_code']} subtitle="Descriptive synthetic session rates. Region is a broad fictional grouping, not a population estimate.">
    {cells.length ? <ul className="region-rate-list" aria-label={`${labelCode(topicCode)} rates by broad region`}>
      {sortCells(cells, 'value', 'desc').map((cell, index) => {
        const region = cellDimensions(cell).region || `Region ${index + 1}`;
        const hidden = cell.suppressed || cell.value == null;
        return <li key={`${region}-${cellDimensions(cell).location_basis || ''}`}>
          <span>{labelCode(region)}{cellDimensions(cell).location_basis ? ` · ${labelCode(cellDimensions(cell).location_basis)}` : ''}</span>
          <span className="region-rate-track" aria-hidden="true"><i style={{ width: `${hidden ? 0 : Number(cell.value) / max * 100}%` }} /></span>
          <strong>{hidden ? 'Insufficient group size' : formatCell(cell, table?.unit)}</strong>
        </li>;
      })}
    </ul> : <p className="muted">No regional values are available for this topic.</p>}
  </ChartFrame>;
}

export function PublicHealthPolicy({ data, topics, timeline, filters }) {
  const rateTable = topics?.tables?.topic_rates;
  const leading = leadingTopic(rateTable, filters?.topic_code);
  const topicCode = cellDimensions(leading || {}).topic_code || filters?.topic_code || 'unknown_unclassified';
  const selectedRate = leading ? { ...rateTable, cells: [leading] } : { ...rateTable, cells: [] };
  const topicTrend = selectTopicTrend(timeline, topicCode);
  const regionRates = data?.tables?.topic_rates;
  const monthly = tableCells(topicTrend);
  const latest = latestVisibleBaselineCell(monthly);
  const delta = latest
    ? formatRateDifference(latest.rate_difference_per_1000) : 'Prior-year comparison unavailable';
  return <div className="view-stack policy-view">
    <div className="question-rail"><p className="eyebrow">Public health and policy review</p><h2>What synthetic question pattern warrants external review?</h2><p>Question tags are not diagnoses, prevalence, surveillance, or confirmed outbreaks. A displayed pattern is an artificial demonstration only.</p></div>
    <p className="scenario-banner">{POLICY_SCENARIO_CAVEAT} Any interpretation needs independent evidence before a policy decision.</p>
    <section className="policy-kpi-grid" aria-label="Selected topic summary">
      <StatTile title={`${labelCode(topicCode)} rate`} table={selectedRate} monthlyTable={topicTrend} filters={filters} description="Selected topic tags per 1,000 selected synthetic sessions. Topic categories may overlap." />
      <article className="metric-card policy-delta-card"><p className="eyebrow">Latest available comparison</p><h3>{latest ? formatMonth(cellDimensions(latest).month) : 'No visible month'}</h3><p className="policy-delta-value">{delta}</p><p>Compared with the same month in the previous year, when a safe baseline is available.</p></article>
    </section>
    <TrendChart table={topicTrend} title={`${labelCode(topicCode)} monthly question rate`} topicCode={topicCode} filters={filters} scenarioVersions={timeline?.provenance?.scenario_versions || []} />
    <RegionComparison table={regionRates} topicCode={topicCode} />
    <section className="policy-decision-section" aria-labelledby="policy-decisions-title"><p className="eyebrow">Review pathway</p><h3 id="policy-decisions-title">Decision cards · evidence still needed</h3>
      <div className="policy-decision-grid">
        <article className="policy-decision-card"><h4>Check the signal</h4><p>Review the selected topic’s monthly rate and denominator. Suppressed or missing values remain unknown.</p><strong>Current comparison: {delta}</strong></article>
        <article className="policy-decision-card"><h4>Check regional capture</h4><p>Compare only the broad synthetic region groupings returned here. Location basis and unknown geography can change interpretation.</p><strong>Regional evidence: descriptive only</strong></article>
        <article className="policy-decision-card"><h4>Validate independently</h4><p>Use representative population data, a validated taxonomy, and clinical or service-system review before considering action.</p><strong>No policy conclusion from this demo</strong></article>
      </div>
    </section>
    <AggregateTable title="Broad region topic rates" table={regionRates} columns={['region', 'location_basis', 'topic_code']} />
  </div>;
}
