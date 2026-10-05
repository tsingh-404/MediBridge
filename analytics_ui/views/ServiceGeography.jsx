import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { RankedBars } from '../components/AggregateChart.jsx';

export function ServiceGeography({ data, filters }) {
  const tables = data?.tables || {};
  return <div className="view-stack">
    <div className="question-rail"><p className="eyebrow">Service geography</p><h2>Where are broad synthetic service questions grouped?</h2><p>Stated demo region and a service-search area are different concepts. A search area is not residence. There is no postcode or individual-path map.</p></div>
    <AggregateTable title="Sessions by broad region and location basis" table={tables.sessions_by_region_and_basis} columns={['region', 'location_basis']} />
    <AggregateTable title="Topic rates by region, basis and topic" table={tables.topic_rates} columns={['region', 'location_basis', 'topic_code']} />
    {!filters?.region && <p className="muted">Choose a broad region to focus other views. Unknown geography stays visible in session counts and quality measures.</p>}
  </div>;
}
