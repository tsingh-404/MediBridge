import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { SampleSizeChart } from '../components/charts/SampleSizeChart.jsx';
import { formatCell, tableCells } from '../components/data.js';
import { suppressionSummary } from '../components/charts/geographyData.js';

function QualityMeter({ title, table, description }) {
  const cell = tableCells(table)[0];
  const value = cell && !cell.suppressed && cell.value != null ? Number(cell.value) : null;
  const share = value == null ? null : Math.max(0, Math.min(1, value));
  return <article className={`quality-meter chart-panel${title === 'Unknown geography share' ? ' unknown-geography-meter' : ''}`} aria-label={title}>
    <p className="eyebrow">{title}</p><strong>{share == null ? 'Not available' : formatCell(cell, table?.unit || 'share')}</strong>
    <meter min="0" max="1" {...(share == null ? {} : { value: share })} aria-label={`${title}: ${share == null ? 'not available' : formatCell(cell, table?.unit || 'share')}`} />
    <p>{description}</p>
    {cell && !cell.suppressed && <small>{cell.numerator ?? 'â€”'} / {cell.denominator ?? 'â€”'} selected sessions</small>}
  </article>;
}

export function DataQuality({ data, meta, geography, timeline, currentTables = [] }) {
  const tables = data?.tables || {};
  const suppression = meta?.suppression || {};
  const geoMeter = tables.unknown_location_share;
  const summary = suppressionSummary(currentTables);
  const provenance = data?.provenance || {};
  const span = provenance.source_span || {};
  return <div className="view-stack data-quality-view">
    <div className="question-rail"><p className="eyebrow">Data quality and provenance</p><h2>What do the synthetic aggregates leave unknown?</h2><p>Quality measures describe the current selected synthetic cohort. Metadata describes the generator and source span; neither establishes representativeness or real-data safety.</p></div>
    <section className="quality-meter-grid" aria-label="Unknown data quality measures">
      <QualityMeter title="Unknown topic share" table={tables.unknown_topic_share} description="Sessions without a classified topic / selected sessions." />
      <QualityMeter title="Unknown geography share" table={geoMeter} description="Sessions whose broad region is unknown / selected sessions. Location is not imputed." />
    </section>
    <section className="suppression-summary chart-panel" aria-label="Suppression summary for current view">
      <div><p className="eyebrow">Current view suppression</p><h3>{summary.hidden} hidden of {summary.total} aggregate cells</h3></div>
      <strong>{summary.share == null ? 'Not available' : `${(summary.share * 100).toFixed(1)}%`}</strong>
      <p>Hidden or insufficient group-size cells across the requests used by the current dashboard view. Minimum support: {suppression.min_sessions ?? 'metadata unavailable'} sessions.</p>
    </section>
    <SampleSizeChart table={timeline?.tables?.selected_sessions_by_month} scenarioVersions={provenance.scenario_versions || timeline?.provenance?.scenario_versions || []} />
    <section className="provenance-card chart-panel" aria-label="Synthetic data provenance">
      <p className="eyebrow">Synthetic data provenance</p><h3>Generator and source span</h3>
      <dl><div><dt>Generator version</dt><dd>{provenance.generator_version || 'not available'}</dd></div><div><dt>Taxonomy version</dt><dd>{provenance.taxonomy_version || 'not available'}</dd></div><div><dt>Metric version</dt><dd>{provenance.metric_version || 'not available'}</dd></div><div><dt>Source span</dt><dd>{span.start_date || 'not available'} â€“ {span.end_date || 'not available'}</dd></div><div><dt>Scenario versions</dt><dd>{(provenance.scenario_versions || []).join(', ') || 'None reported'}</dd></div></dl>
      <p>All figures shown here come from an artificial aggregate-only demo. Scenario markers are scripted and do not describe real events.</p>
    </section>
    <div className="quality-detail-grid">
      <AggregateTable title="Unknown topic share" table={tables.unknown_topic_share} />
      <AggregateTable title="Unknown location share" table={tables.unknown_location_share} />
      <AggregateTable title="Unclassified topic events" table={tables.unclassified_topic_events} />
      <AggregateTable title="Unknown outcome events" table={tables.unknown_outcome_events} />
    </div>
    <section className="definition-section chart-panel"><p className="eyebrow">Metric definitions</p><h3>How to read these measures</h3>
      <dl className="definition-grid">
        <div><dt>Unknown topic share</dt><dd>Selected sessions with no classified topic divided by all selected sessions.</dd></div>
        <div><dt>Unknown geography share</dt><dd>Sessions with an unknown broad region divided by selected sessions; no location is inferred.</dd></div>
        <div><dt>Suppressed cell</dt><dd>A group below the configured minimum support. Its value is hidden and must not be read as zero.</dd></div>
        <div><dt>Monthly sample size</dt><dd>Count of selected synthetic sessions in that month. Amber marks show artificial scenario months.</dd></div>
        <div><dt>Location basis</dt><dd>Stated demo region and service-search area are separate categories. A service search is not residence.</dd></div>
        <div><dt>Question tag</dt><dd>A taxonomy category attached to a synthetic question, not a diagnosis, prevalence estimate, or confirmed need.</dd></div>
      </dl>
    </section>
  </div>;
}
