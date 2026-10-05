import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { MonthlyTrend, RankedBars } from '../components/AggregateChart.jsx';
import { MetricCard } from '../components/MetricCard.jsx';
import { StateMessage } from '../components/StateMessage.jsx';
import { cellDimensions, labelCode, sortCells } from '../components/data.js';

export function Overview({ data, trend, filters, onSelect }) {
  const overview = data?.tables || {};
  const leadingTopic = sortCells(overview.topic_sessions?.cells || [], 'value', 'desc').find((cell) => !cell.suppressed);
  const leadingTopicCode = cellDimensions(leadingTopic || {}).topic_code;
  const leadingTopicTable = leadingTopic ? { unit: overview.topic_sessions?.unit, cells: [leadingTopic] } : undefined;
  return <div className="view-stack">
    <div className="question-rail"><p className="eyebrow">Question to review</p><h2>Which topics appear in this synthetic session cohort?</h2><p>Use category counts and rates to frame a discussion. They describe tagged questions and do not establish prevalence, unmet need, or outcomes.</p></div>
    <section aria-label="Selected cohort metrics" className="metric-grid">
      <MetricCard title="Selected sessions" table={overview.selected_sessions} description="Cohort size after date, insurer, tier, region and location-basis filters." />
      <MetricCard title="Tagged question turns" table={overview.question_turns} description="Distinct user messages with a matched issue tag; sessions are supporting context." />
      <MetricCard title={leadingTopicCode ? `Sessions tagged ${labelCode(leadingTopicCode)}` : 'Highest-ranked topic sessions'} table={leadingTopicTable} description="Distinct sessions in one topic category; categories may overlap and this is not all selected sessions." />
      <MetricCard title="Unknown topic share" table={overview.unknown_topic_share} description="Includes sessions without a classified topic, using all selected sessions as denominator." />
    </section>
    <RankedBars title="Ranked topic sessions" table={overview.topic_sessions} filterField="topic_code" onSelect={onSelect} />
    <MonthlyTrend table={trend?.tables?.topic_code_trend} filters={filters} scenarioVersions={trend?.provenance?.scenario_versions || []} />
    <AggregateTable title="Topic session aggregates" table={overview.topic_sessions} columns={['topic_code']} onSelect={onSelect} />
    <StateMessage table={overview.topic_sessions} title="Topic results" />
  </div>;
}
