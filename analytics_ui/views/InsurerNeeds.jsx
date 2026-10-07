import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { ChartFrame } from '../components/charts/ChartFrame.jsx';
import { CoverageTrendPanels } from '../components/charts/CoverageTrendPanels.jsx';
import { StatTile } from '../components/charts/StatTile.jsx';
import { cellDimensions, formatCell, labelCode, tableCells } from '../components/data.js';
import { comparisonCellStatus, outcomeSegments } from './insurerData.js';

const COVERAGE_TOPICS = ['coverage_benefit_exclusion', 'coverage_waiting_period', 'cost_out_of_pocket'];

function insurersFromMeta(meta) {
  return (meta?.insurers || []).filter(({ id }) => ['allianz', 'cbhs', 'medibank'].includes(id));
}

function tierNames(insurer) {
  return (insurer?.tiers || []).map((tier) => typeof tier === 'string' ? labelCode(tier) : tier.name || labelCode(tier.id)).filter(Boolean);
}

function StackedOutcomes({ table }) {
  const rows = outcomeSegments(table);
  return <ChartFrame title="Resolved and unresolved scripted outcomes" table={table} columns={['topic_code', 'service_code']} subtitle="Each bar is one topic and service pair; segment sizes come from resolved and unresolved event counts, not sessions or satisfaction.">
    {rows.length ? <div className="outcome-stack-list" aria-label="Resolved and unresolved event counts by topic and service">
      {rows.map((row) => <div className="outcome-stack-row" key={`${row.topic}-${row.service}`}>
        <strong>{labelCode(row.topic)} · {labelCode(row.service)}</strong>
        <div className="outcome-stack" role="img" aria-label={`${labelCode(row.topic)}, ${labelCode(row.service)}: ${row.resolved} resolved events and ${row.unresolved} unresolved events`}>
          <span className="outcome-segment outcome-resolved" style={{ width: `${row.resolvedWidth}%` }} title={`Resolved ${row.resolved}`} />
          <span className="outcome-segment outcome-unresolved" style={{ width: `${row.unresolvedWidth}%` }} title={`Unresolved ${row.unresolved}`} />
        </div>
        <span className="outcome-stack-legend">Resolved {row.resolved} · Unresolved {row.unresolved}</span>
      </div>)}
    </div> : <p className="muted">No unsuppressed scripted outcome events are available for this selection.</p>}
  </ChartFrame>;
}

function InsurerComparison({ table, insurers }) {
  const cells = tableCells(table).filter((cell) => COVERAGE_TOPICS.includes(cellDimensions(cell).topic_code));
  const values = cells.filter((cell) => !cell.suppressed && cell.value != null).map((cell) => Number(cell.value));
  const max = Math.max(1, ...values);
  const topics = COVERAGE_TOPICS;
  return <ChartFrame title="Composition of topic-tagged synthetic sessions across shortlisted insurers" table={table} columns={['topic_code', 'insurer_id']} denominatorDescription="topic-tagged sessions across insurers in this row" subtitle="Each rate shows an insurer's composition of the topic-tagged sessions in that row, per 1,000 topic-tagged sessions across the shortlisted insurers. This is not insurer performance or market share.">
    <div className="insurer-dot-plot" role="group" aria-label="Comparison among synthetic app sessions by coverage topic and insurer">
      {topics.map((topic) => <section className="insurer-dot-row" key={topic} aria-label={labelCode(topic)}>
        <h4>{labelCode(topic)}</h4>
        <div className="insurer-dot-values">{insurers.map((insurer) => {
          const cell = cells.find((candidate) => cellDimensions(candidate).topic_code === topic && cellDimensions(candidate).insurer_id === insurer.id);
          const status = comparisonCellStatus(cell);
          const value = status ? null : Number(cell.value);
          return <div className="insurer-dot-item" key={insurer.id}>
            <span>{insurer.name}</span>
            <div className="insurer-dot-track" aria-hidden="true">{!status && <i style={{ left: `${Math.max(1, value / max * 100)}%` }} />}</div>
            <strong>{status || formatCell(cell, table?.unit)}</strong>
          </div>;
        })}</div>
      </section>)}
    </div>
    <p className="table-note">Missing pairs have no matching sessions in the selected cohort and tier. Explicitly suppressed pairs remain hidden. Tier labels in the product list identify seeded product names; aggregate composition does not establish policy quality or suitability.</p>
  </ChartFrame>;
}

export function InsurerNeeds({ data, topics, timeline, matrix, meta, onSelect }) {
  const coverageTables = data?.tables || {};
  const topicRates = topics?.tables?.topic_rates;
  const rates = tableCells(topicRates).filter((cell) => COVERAGE_TOPICS.includes(cellDimensions(cell).topic_code));
  const selectedCode = topics?.filters?.topic_code;
  const insurerList = insurersFromMeta(meta);
  return <div className="view-stack insurer-view">
    <div className="question-rail"><p className="eyebrow">Insurer discussion</p><h2>Where do synthetic sessions ask about cover and cost?</h2><p>Comparison among synthetic app sessions only. Question tags are not claims friction, coverage failures, member satisfaction, insurer performance, or market share.</p></div>
    <section className="insurer-kpi-grid" aria-label="Coverage topic rates">
      {COVERAGE_TOPICS.map((topic) => {
        const cell = rates.find((candidate) => cellDimensions(candidate).topic_code === topic);
        const table = { ...topicRates, cells: cell ? [cell] : [] };
        return <StatTile key={topic} title={`${labelCode(topic)} rate`} table={table} description="Distinct synthetic sessions tagged with this topic per 1,000 selected sessions. Topics may overlap." />;
      })}
    </section>
    <div className="insurer-topic-grid" aria-label="Coverage topic detail">
      {COVERAGE_TOPICS.filter((topic) => !selectedCode || topic === selectedCode).map((topic) => {
        const cell = rates.find((candidate) => cellDimensions(candidate).topic_code === topic);
        return <article className="insurer-topic-card" key={topic}><p className="eyebrow">Synthetic topic tag</p><h3>{labelCode(topic)}</h3>
          <p className="insurer-topic-value">{formatCell(cell, topicRates?.unit)}</p>
          <p>{cell ? `${cell.numerator ?? cell.value} of ${cell.denominator ?? '—'} selected sessions` : 'No unsuppressed rate available'}</p>
          <button type="button" className="show-all-categories" aria-pressed={selectedCode === topic} onClick={() => onSelect?.('topic_code', topic)}>Focus this topic</button>
        </article>;
      })}
    </div>
    <CoverageTrendPanels timeline={timeline} />
    <InsurerComparison table={matrix?.tables?.matrix} insurers={insurerList} />
    <StackedOutcomes table={coverageTables.answer_outcome_share} />
    <section className="question-rail product-evidence-panel"><p className="eyebrow">Shortlisted products and evidence</p><h3>Seeded insurer tiers in the codebase</h3>
      <ul className="insurer-product-list">{insurerList.map((insurer) => <li key={insurer.id}><strong>{insurer.name}</strong><span>{tierNames(insurer).join(' · ') || 'Tier labels unavailable'}</span></li>)}</ul>
      <p>These names identify the shortlisted products in the demonstration setup. The charts describe only generated app sessions. Product terms, current benefits, claims outcomes, and suitability require independent source review.</p>
      <h4>Outcome evidence limits</h4><p>Scripted resolved/unresolved segments count generated tagged events only. Unknown_not_assessed events are reported separately below, not assigned to either segment.</p>
    </section>
    <AggregateTable title="Unknown scripted outcome events" table={coverageTables.unknown_outcome_events} columns={['topic_code', 'service_code']} />
    <AggregateTable title="Coverage topic counts" table={coverageTables.topic_sessions} columns={['topic_code']} onSelect={onSelect} />
  </div>;
}
