import React from 'react';
import { StatTile } from '../components/charts/StatTile.jsx';
import { RankedBar } from '../components/charts/RankedBar.jsx';
import { TrendChart } from '../components/charts/TrendChart.jsx';
import { Heatmap } from '../components/charts/Heatmap.jsx';
import { findingTitle } from '../components/charts/insights.js';
import { cohortScope, leadingTopicRate, selectTopicTrend, topicCodesFromRates } from '../components/charts/overviewData.js';
import { cellDimensions, formatCell, labelCode, tableCells, trendBaseline } from '../components/data.js';

function insightFor(topicCode, trendTable) {
  const latest = tableCells(trendTable).filter((cell) => !cell.suppressed && cell.value != null)
    .sort((a, b) => String(cellDimensions(b).month || '').localeCompare(String(cellDimensions(a).month || '')))[0];
  const baseline = trendBaseline(latest);
  const direction = baseline.available && baseline.difference != null
    ? baseline.difference > 0 ? 'increase' : baseline.difference < 0 ? 'decrease' : 'steady'
    : 'steady';
  const confidence = !latest ? 'Low synthetic confidence' : latest.denominator >= 100 ? 'Higher synthetic support' : latest.denominator >= 30 ? 'Moderate synthetic support' : 'Lower synthetic support';
  return { title: findingTitle(topicCode, direction), latest, baseline, confidence };
}

export function Overview({ data, ratesData, timeline, filters = {}, onSelect }) {
  const overview = data?.tables || {};
  const topicRates = ratesData?.tables?.topic_rates;
  const leadingRate = leadingTopicRate(overview.topic_sessions, topicRates);
  const leadingCode = cellDimensions(leadingRate || {}).topic_code || cellDimensions(tableCells(overview.topic_sessions)[0] || {}).topic_code;
  const trendCode = filters.topic_code || leadingCode;
  const trendTable = selectTopicTrend(timeline, trendCode);
  const scope = cohortScope(filters);
  const monthlySessions = timeline?.tables?.selected_sessions_by_month;
  const heatmapTopics = topicCodesFromRates(topicRates);
  const insight = insightFor(trendCode || 'selected_topic', trendTable);
  const latestValue = insight.latest ? formatCell(insight.latest, trendTable?.unit) : 'No unsuppressed monthly value';
  return <div className="view-stack overview-view">
    <section className="overview-finding" aria-labelledby="overview-finding-title">
      <p className="eyebrow">Synthetic overview finding</p>
      <h2 id="overview-finding-title">{insight.title}</h2>
      <p>Leading topic in the selected synthetic session cohort: <strong>{leadingCode ? labelCode(leadingCode) : 'No unsuppressed topic'}</strong>. Topic categories can overlap and each rate uses selected sessions as its denominator.</p>
      <span className="synthetic-confidence" aria-label={insight.confidence}>{insight.confidence}</span>
    </section>
    <section aria-label="Selected cohort metrics" className="stat-tile-grid">
      <StatTile title="Selected sessions" table={overview.selected_sessions} monthlyTable={monthlySessions} filters={filters} description="Distinct sessions after the selected filters; includes unknown-topic sessions." />
      <StatTile title="Question turns" table={overview.question_turns} monthlyTable={timeline?.tables?.question_turns_by_month} filters={filters} description="Distinct tagged user messages; sessions are supporting context." />
      <StatTile title={leadingCode ? `${labelCode(leadingCode)} rate` : 'Leading topic rate'} table={leadingRate ? { unit: topicRates?.unit, cells: [leadingRate] } : topicRates} monthlyTable={trendCode === leadingCode ? trendTable : undefined} filters={filters} description="Leading topic rate from the API topic_rates table, per 1,000 selected sessions." />
      <StatTile title="Unknown topic share" table={overview.unknown_topic_share} monthlyTable={timeline?.tables?.unknown_topic_share_by_month} filters={filters} description="Sessions without a classified topic; denominator is all selected sessions." />
    </section>
    <Heatmap timeline={timeline} topicCodes={heatmapTopics} onSelect={onSelect} selectedTopic={filters.topic_code} filters={filters} scenarioVersions={timeline?.provenance?.scenario_versions || []} />
    <div className="overview-analysis-grid">
      <RankedBar title="Topic sessions, ranked" table={overview.topic_sessions} filterField="topic_code" onSelect={onSelect} selected={filters.topic_code} />
      <aside className="insight-panel" aria-labelledby="insight-panel-title">
        <p className="eyebrow">Discussion guide</p><h3 id="insight-panel-title">What this pattern can support</h3>
        <dl><dt>So what</dt><dd>{labelCode(trendCode || 'selected_topic')} appears in {latestValue} for the latest visible month.</dd>
          <dt>Why</dt><dd>These are distinct synthetic session tags. Categories may overlap, and the trend uses a per-month selected-session denominator.</dd>
          <dt>Now what</dt><dd>Review the question examples and independent evidence before making a service or policy decision.</dd></dl>
        <span className="synthetic-confidence">{insight.confidence}</span>
      </aside>
    </div>
    <TrendChart table={trendTable} topicCode={trendCode || 'selected_topic'} filters={filters} title={`${scope} trend · ${labelCode(trendCode || 'leading topic')}`} scenarioVersions={timeline?.provenance?.scenario_versions || []} />
    <p className="scenario-caveat">Synthetic scenario caveat: highlighted windows are artificial demonstration patterns only. They are not real-world events or evidence of diagnoses, outbreaks, prevalence, or market share.</p>
  </div>;
}
