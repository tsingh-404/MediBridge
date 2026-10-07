import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHeatmap, compatibleSparkline, cohortScope, formatPeriodDelta, heatmapScenarioMonths, latestPeriodDelta, leadingTopicRate, selectTopicTrend } from '../../analytics_ui/components/charts/overviewData.js';

test('leading topic rate comes from the topic_rates API table', () => {
  const overview = { cells: [
    { dimensions: { topic_code: 'topic_a' }, value: 30, numerator: 30, denominator: 100 },
    { dimensions: { topic_code: 'topic_b' }, value: 40, numerator: 40, denominator: 100 },
  ] };
  const rates = { unit: 'topic_sessions_per_1000_selected_sessions', cells: [
    { dimensions: { topic_code: 'topic_a' }, value: 300, numerator: 30, denominator: 100 },
    { dimensions: { topic_code: 'topic_b' }, value: 400, numerator: 40, denominator: 100 },
  ] };
  assert.deepEqual(leadingTopicRate(overview, rates), rates.cells[1]);
});

test('heatmap preserves null suppressed values and fills the topic by month grid', () => {
  const timeline = { tables: {
    'topic_month_rates.topic_a': { cells: [
    { dimensions: { topic_code: 'topic_a', month: '2025-01' }, value: 2 },
    { dimensions: { topic_code: 'topic_a', month: '2025-02' }, value: null, suppressed: true },
    ] },
    'topic_month_rates.topic_b': { cells: [
      { dimensions: { topic_code: 'topic_b', month: '2025-01' }, value: 1 },
    ] },
  } };
  const result = buildHeatmap(timeline, ['topic_a', 'topic_b'], 24);
  assert.equal(result.length, 4);
  assert.equal(result.find((cell) => cell.topic === 'topic_a' && cell.month === '2025-02').value, null);
  assert.equal(result.find((cell) => cell.topic === 'topic_b' && cell.month === '2025-02').missing, true);
});

test('statewide topic trend uses only its per-topic timeline table and does not require segment filters', () => {
  const timeline = { tables: {
    'topic_month_rates.topic_a': { unit: 'sessions_per_1000_selected_sessions', cells: [{ dimensions: { topic_code: 'topic_a', month: '2025-01' }, value: 10 }] },
    'topic_month_rates.topic_b': { unit: 'sessions_per_1000_selected_sessions', cells: [{ dimensions: { topic_code: 'topic_b', month: '2025-01' }, value: 20 }] },
  } };
  assert.equal(selectTopicTrend(timeline, 'topic_b'), timeline.tables['topic_month_rates.topic_b']);
  assert.equal(selectTopicTrend(timeline, null), timeline.tables['topic_month_rates.topic_a']);
});

test('overview fetch wiring requests topic rates and keeps the statewide trend source', async () => {
  const [app, view] = await Promise.all([
    readFile(new URL('../../analytics_ui/app.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/views/Overview.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /view === 'overview' \? \['overview', 'topics'\]/);
  assert.match(view, /topic_rates/);
  assert.match(view, /selectTopicTrend/);
});

test('stat tile sparklines require a metric-compatible monthly table', () => {
  const sessions = { unit: 'sessions' };
  const sessionMonths = { unit: 'sessions' };
  const rate = { unit: 'topic_sessions_per_1000_selected_sessions' };
  const rateMonths = { unit: 'sessions_per_1000_selected_sessions' };
  assert.equal(compatibleSparkline(sessions, sessionMonths), true);
  assert.equal(compatibleSparkline(rate, rateMonths), true);
  assert.equal(compatibleSparkline({ unit: 'question_turns' }, sessionMonths), false);
  assert.equal(compatibleSparkline({ unit: 'share' }, sessionMonths), false);
});

test('chart scope describes segmented cohorts without calling them statewide', () => {
  assert.equal(cohortScope({}), 'Statewide');
  for (const filters of [{ region: 'Brisbane' }, { location_basis: 'stated_demo_region' }, { insurer_id: 'allianz' }, { tier_id: 'standard' }]) {
    assert.equal(cohortScope(filters), 'Selected cohort');
  }
});

test('heatmap scenario months only highlight the matching scenario version', () => {
  assert.deepEqual([...heatmapScenarioMonths(['respiratory_spike'])], ['2025-01', '2025-02', '2025-03']);
  assert.deepEqual([...heatmapScenarioMonths(['coverage_information_spike'])], ['2025-10', '2025-11', '2025-12']);
  assert.equal(heatmapScenarioMonths([]).size, 0);
});

test('Overview does not reuse selected-session sparkline data for unrelated metrics', async () => {
  const view = await readFile(new URL('../../analytics_ui/views/Overview.jsx', import.meta.url), 'utf8');
  assert.match(view, /title="Selected sessions"[^\n]*monthlyTable=\{monthlySessions\}/);
  assert.match(view, /title="Question turns" table=\{overview\.question_turns\} monthlyTable=\{timeline\?\.tables\?\.question_turns_by_month\}/);
  assert.match(view, /title="Unknown topic share" table=\{overview\.unknown_topic_share\} monthlyTable=\{timeline\?\.tables\?\.unknown_topic_share_by_month\}/);
  assert.match(view, /monthlyTable=\{trendCode === leadingCode \? trendTable : undefined\}/);
});

test('trend and heatmap descriptions use selected-cohort scope and scenario-specific month sets', async () => {
  const [trend, heatmap] = await Promise.all([
    readFile(new URL('../../analytics_ui/components/charts/TrendChart.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/components/charts/Heatmap.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(trend, /\$\{scope\} synthetic topic-tag rate/);
  assert.match(trend, /\$\{scope\} \$\{months\.length\} month trend/);
  assert.match(heatmap, /\$\{scope\} distinct-session topic-tag rates/);
  assert.match(heatmap, /heatmapScenarioMonths\(scenarioVersions\)/);
  assert.doesNotMatch(heatmap, /SCENARIO_MONTHS/);
});

test('latest period delta selects the newest visible metric baseline and preserves zero', () => {
  const table = { cells: [
    { dimensions: { month: '2025-01' }, value: 4, baseline_available: true, difference: 2 },
    { dimensions: { month: '2025-02' }, value: null, suppressed: true, baseline_available: false },
    { dimensions: { month: '2025-03' }, value: 7, baseline_available: true, difference: 0 },
  ] };
  assert.deepEqual(latestPeriodDelta(table), { month: '2025-03', difference: 0 });
  assert.equal(latestPeriodDelta({ cells: [{ dimensions: { month: '2025-03' }, value: null, suppressed: true }] }), null);
});

test('all four Overview tiles receive only their matching monthly metric series', async () => {
  const [view, statTile] = await Promise.all([
    readFile(new URL('../../analytics_ui/views/Overview.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/components/charts/StatTile.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(view, /monthlyTable=\{monthlySessions\}/);
  assert.match(view, /monthlyTable=\{timeline\?\.tables\?\.question_turns_by_month\}/);
  assert.match(view, /monthlyTable=\{trendCode === leadingCode \? trendTable : undefined\}/);
  assert.match(view, /monthlyTable=\{timeline\?\.tables\?\.unknown_topic_share_by_month\}/);
  assert.match(statTile, /latestPeriodDelta\(monthlyTable\)/);
});

test('delta text exposes the comparison month while the tile has one arrow indicator', async () => {
  assert.equal(formatPeriodDelta({ month: '2025-10', difference: 3 }, 'question_turns'), 'Increased by 3 · Oct 2025 vs same month last year');
  assert.equal(formatPeriodDelta(null, 'sessions'), 'Prior-year comparison unavailable');
  const statTile = await readFile(new URL('../../analytics_ui/components/charts/StatTile.jsx', import.meta.url), 'utf8');
  assert.match(statTile, /formatPeriodDelta\(/);
  assert.match(statTile, /aria-label=\{deltaText\}/);
  assert.doesNotMatch(statTile, /const deltaText = .*Number\(delta\) > 0/);
});
