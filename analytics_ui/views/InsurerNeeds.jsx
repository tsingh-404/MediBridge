import React from 'react';
import { AggregateTable } from '../components/AggregateTable.jsx';
import { RankedBars } from '../components/AggregateChart.jsx';
import { StateMessage } from '../components/StateMessage.jsx';

export function InsurerNeeds({ data, onSelect }) {
  const tables = data?.tables || {};
  return <div className="view-stack">
    <div className="question-rail"><p className="eyebrow">Insurer discussion</p><h2>Where do synthetic sessions ask about cover and cost?</h2><p>These are scripted question tags, not claims friction, coverage failures, member satisfaction, or market share. Each selected cohort has its own denominator.</p></div>
    <RankedBars title="Coverage and cost question sessions" table={tables.topic_sessions} filterField="topic_code" onSelect={onSelect} />
    <AggregateTable title="Question sessions by topic" table={tables.topic_sessions} columns={['topic_code']} onSelect={onSelect} />
    <AggregateTable title="Scripted answer outcome share" table={tables.answer_outcome_share} columns={['topic_code', 'service_code', 'answer_outcome']} />
    <AggregateTable title="Unknown scripted outcome events" table={tables.unknown_outcome_events} columns={['topic_code']} />
    <StateMessage table={tables.topic_sessions} title="Coverage topics" />
  </div>;
}
