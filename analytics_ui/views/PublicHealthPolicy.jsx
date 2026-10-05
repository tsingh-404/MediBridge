import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { MonthlyTrend } from '../components/AggregateChart.jsx';

export function PublicHealthPolicy({ data, trend, filters }) {
  return <div className="view-stack">
    <div className="question-rail"><p className="eyebrow">Public health and policy review</p><h2>What synthetic question pattern warrants external review?</h2><p>Question tags are not diagnoses, prevalence, surveillance, or confirmed outbreaks. A displayed spike is an artificial demonstration pattern only.</p></div>
    <p className="scenario-banner"><strong>Artificial demonstration pattern.</strong> Any injected spike is synthetic and needs independent evidence before a policy decision.</p>
    <MonthlyTrend table={trend?.tables?.topic_code_trend} title="Topic question trend" filters={filters} scenarioVersions={trend?.provenance?.scenario_versions || []} />
    <MonthlyTrend table={trend?.tables?.concern_code_trend} title="Concern question trend" filters={filters} filterField="concern_code" scenarioVersions={trend?.provenance?.scenario_versions || []} />
    <AggregateTable title="Broad region topic rates" table={data?.tables?.topic_rates} columns={['region', 'location_basis', 'topic_code']} />
    <aside className="question-rail"><h3>Evidence still needed</h3><ul><li>Independent, representative population data</li><li>Validated topic taxonomy and capture coverage</li><li>Clinical and service-system review before action</li></ul></aside>
  </div>;
}
