import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { MetricCard } from '../components/MetricCard.jsx';

export function DataQuality({ data, meta }) {
  const tables = data?.tables || {};
  const suppression = meta?.suppression || {};
  return <div className="view-stack">
    <div className="question-rail"><p className="eyebrow">Data quality and provenance</p><h2>What do the synthetic aggregates leave unknown?</h2><p>Metadata describes the synthetic generator and selected source span. It does not establish representativeness or real-data safety.</p></div>
    <div className="metric-grid">
      <MetricCard title="Unknown topic share" table={tables.unknown_topic_share} description="Sessions without a classified topic / selected sessions." />
      <MetricCard title="Unknown location share" table={tables.unknown_location_share} description="Sessions with unknown location basis / selected sessions." />
    </div>
    <AggregateTable title="Unknown topic share" table={tables.unknown_topic_share} />
    <AggregateTable title="Unknown location share" table={tables.unknown_location_share} />
    <AggregateTable title="Unclassified topic events" table={tables.unclassified_topic_events} />
    <AggregateTable title="Unknown outcome events" table={tables.unknown_outcome_events} />
    <section className="question-rail"><h3>Suppression and metric glossary</h3><p>Minimum support: {suppression.min_sessions ?? 'metadata unavailable'} sessions. Scope: {suppression.scope || 'metadata unavailable'}. This is table-local demonstration suppression and does not prevent differencing across separate requests.</p><p>Taxonomy: {data?.provenance?.taxonomy_version || 'not available'}. The API contract version is authoritative; design mockup labels are placeholders.</p></section>
  </div>;
}
