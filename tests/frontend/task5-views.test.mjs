import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coverageTopicSeries, isCoverageScenarioMonth, latestCoverageDelta, latestVisibleBaselineCell } from '../../analytics_ui/components/charts/coverageTrend.js';
import { comparisonCellStatus, insurerMatrixFilters, outcomeSegments } from '../../analytics_ui/views/insurerData.js';

test('insurer view fetches coverage outcomes, topic rates and insurer comparison matrix', async () => {
  const app = await readFile(new URL('../../analytics_ui/app.jsx', import.meta.url), 'utf8');
  assert.match(app, /view === 'insurer'.*coverage-friction.*topics.*endpoint: 'matrix'.*pair: 'topic_code:insurer_id'/);
  assert.match(app, /data=\{payloads\['coverage-friction'\]\} topics=\{payloads\.topics\} timeline=\{payloads\.timeline\} matrix=\{payloads\.insurerMatrix\}/);
});

test('coverage monthly small multiples use topic timeline baselines and exclude suppressed deltas', async () => {
  const timeline = { tables: { 'topic_month_rates.coverage_benefit_exclusion': { unit: 'sessions_per_1000_selected_sessions', cells: [
    { dimensions: { month: '2025-10' }, value: 5, baseline_available: true, baseline_rate_per_1000: 3, rate_difference_per_1000: 2 },
    { dimensions: { month: '2025-11' }, value: null, suppressed: true, baseline_available: false, baseline_rate_per_1000: null, rate_difference_per_1000: null },
    { dimensions: { month: '2025-12' }, value: 6, baseline_available: true, baseline_rate_per_1000: 6, rate_difference_per_1000: 0 },
  ] } } };
  const series = coverageTopicSeries(timeline, 'coverage_benefit_exclusion');
  assert.deepEqual(series.map(({ value, baseline }) => [value, baseline]), [[5, 3], [null, null], [6, 6]]);
  assert.deepEqual(latestCoverageDelta(series), { month: '2025-12', difference: 0 });
  assert.equal(isCoverageScenarioMonth('2025-10'), true);
  assert.equal(isCoverageScenarioMonth('2025-12'), true);
  assert.equal(isCoverageScenarioMonth('2026-01'), false);
  const component = await readFile(new URL('../../analytics_ui/components/charts/CoverageTrendPanels.jsx', import.meta.url), 'utf8');
  assert.match(component, /Coverage-topic monthly rates/);
  assert.match(component, /Latest coverage-topic deltas/);
  assert.match(component, /Oct–Dec 2025 artificial coverage scenario/);
});

test('outcome stacks derive resolved and unresolved counts per topic-service denominator', () => {
  const rows = outcomeSegments({ cells: [
    { dimensions: { topic_code: 'coverage_waiting_period', service_code: 'gp' }, numerator: 2, denominator: 10, value: 0.2 },
    { dimensions: { topic_code: 'coverage_waiting_period', service_code: 'pharmacy' }, numerator: 1, denominator: 4, value: 0.25, suppressed: true },
  ] });
  assert.equal(rows.length, 1);
  assert.deepEqual({ topic: rows[0].topic, service: rows[0].service, resolved: rows[0].resolved, unresolved: rows[0].unresolved, resolvedWidth: rows[0].resolvedWidth, unresolvedWidth: rows[0].unresolvedWidth }, {
    topic: 'coverage_waiting_period', service: 'gp', resolved: 8, unresolved: 2, resolvedWidth: 80, unresolvedWidth: 20,
  });
});

test('insurer matrix distinguishes empty pairs from suppressed cells and preserves selected tier', () => {
  assert.equal(comparisonCellStatus(undefined), 'No matching sessions');
  assert.equal(comparisonCellStatus({ value: null, suppressed: true }), 'Insufficient group size');
  assert.equal(comparisonCellStatus({ value: 0.5, suppressed: false }), null);
  assert.deepEqual(insurerMatrixFilters({ insurer_id: 'allianz', tier_id: 'cbhs_standard', topic_code: 'coverage_waiting_period' }), {
    insurer_id: '', tier_id: 'cbhs_standard', topic_code: 'coverage_waiting_period',
  });
});

test('policy selects the newest visible month that has a safe prior-year baseline', () => {
  const latest = latestVisibleBaselineCell([
    { dimensions: { month: '2025-01' }, value: 2, baseline_available: true, rate_difference_per_1000: 1 },
    { dimensions: { month: '2025-02' }, value: 3, baseline_available: false, rate_difference_per_1000: null },
    { dimensions: { month: '2025-03' }, value: 4, suppressed: true, baseline_available: true, rate_difference_per_1000: 2 },
  ]);
  assert.equal(latest.dimensions.month, '2025-01');
  assert.equal(latestVisibleBaselineCell([{ dimensions: { month: '2025-02' }, value: 3, baseline_available: false }]), null);
});

test('insurer view describes synthetic insurer tiers and comparison without market claims', async () => {
  const view = await readFile(new URL('../../analytics_ui/views/InsurerNeeds.jsx', import.meta.url), 'utf8');
  assert.match(view, /Comparison among synthetic app sessions/);
  assert.match(view, /'allianz', 'cbhs', 'medibank'/);
  assert.match(view, /tierNames\(insurer\)/);
  assert.match(view, /Composition of topic-tagged synthetic sessions across shortlisted insurers/);
  assert.match(view, /denominatorDescription=/);
  assert.match(view, /Unknown scripted outcome events/);
  const labels = await readFile(new URL('../../analytics_ui/components/data.js', import.meta.url), 'utf8');
  for (const label of ['Allianz Care Australia', 'CBHS International Health', 'Medibank Private', 'Essentials', 'Comprehensive']) assert.ok(labels.includes(label));
  assert.match(view, /not.*market share/i);
});

test('policy view uses topic and regional rates with evidence-needed decision language', async () => {
  const [app, view] = await Promise.all([
    readFile(new URL('../../analytics_ui/app.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/views/PublicHealthPolicy.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /view === 'policy'.*topics.*regions/);
  assert.match(view, /region-rate-list/);
  assert.match(view, /evidence still needed/i);
  assert.match(view, /decision cards/i);
});
