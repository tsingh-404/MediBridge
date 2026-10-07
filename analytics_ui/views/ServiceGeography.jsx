import React, { useMemo, useState } from 'react';
import { AggregateHeatmap } from '../components/charts/AggregateHeatmap.jsx';
import { TileMap } from '../components/charts/TileMap.jsx';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { aggregateRegionValues } from '../components/charts/geographyData.js';

export function ServiceGeography({ data, basisMatrix, topicMatrix, serviceMatrix, filters, onSelect }) {
  const [metric, setMetric] = useState('sessions');
  const [basis, setBasis] = useState('all');
  const sessionTable = data?.tables?.sessions_by_region_and_basis;
  const selectedBasis = basis === 'all' ? null : basis;
  const scopeTable = (table) => selectedBasis ? { ...table, cells: table?.cells?.filter((cell) => (cell.dimensions || cell).location_basis === selectedBasis) } : table;
  const scopedSessions = useMemo(() => scopeTable(sessionTable), [sessionTable, selectedBasis]);
  const topicRates = useMemo(() => scopeTable(data?.tables?.topic_rates), [data, selectedBasis]);
  const serviceRates = useMemo(() => scopeTable(data?.tables?.service_rates), [data, selectedBasis]);
  const rateTable = metric === 'service-rate' ? serviceRates : topicRates;
  const rateFilter = metric === 'service-rate' ? filters?.service_code : filters?.topic_code;
  const values = useMemo(() => aggregateRegionValues(scopedSessions, rateTable, metric, rateFilter), [scopedSessions, rateTable, metric, rateFilter]);
  const tileTable = metric !== 'sessions' && !rateFilter
    ? { ...sessionTable, no_data: true, data_state: 'no_data', cells: [] }
    : scopedSessions;
  return <div className="view-stack service-geography-view">
    <div className="question-rail"><p className="eyebrow">Service geography</p><h2>Where are broad synthetic service questions grouped?</h2><p>Stated demo region and a service-search area are separate concepts. A search area is not residence. No postcode or individual path is shown. Every visual here is an aggregate-only synthetic demonstration.</p></div>
    {metric !== 'sessions' && !rateFilter && <p className="muted">Select the matching topic or service filter to show its regional rate. Session counts remain available without a category selection.</p>}
    <div className="geography-metric-switch" role="group" aria-label="Location basis filter">{[['all', 'All bases'], ['stated_demo_region', 'Stated demo region'], ['service_search_area', 'Service search area'], ['unknown', 'Unknown']].map(([value, label]) => <button key={value} type="button" aria-pressed={basis === value} onClick={() => setBasis(value)}>{label}</button>)}</div>
    <TileMap table={tileTable} values={values} metric={metric} onMetricChange={setMetric} selectedRegion={filters?.region} onSelect={onSelect} />
    <AggregateHeatmap title="Region × location basis" table={basisMatrix?.tables?.matrix} rowKey="region" columnKey="location_basis" onSelect={onSelect} />
    <AggregateHeatmap title="Service category × region" table={serviceMatrix?.tables?.matrix} rowKey="service_code" columnKey="region" onSelect={onSelect} />
    <AggregateTable title="Topic rates by region, location basis and topic" table={topicRates} columns={['region', 'location_basis', 'topic_code']} onSelect={onSelect} />
    <p className="muted">Unknown geography stays visible in session counts and quality measures. Unknown values are not mapped to a region.</p>
  </div>;
}
