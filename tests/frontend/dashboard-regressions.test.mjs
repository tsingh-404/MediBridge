import test from 'node:test';
import assert from 'node:assert/strict';

import { tableState, trendCategories, trendCellSeries, trendBaseline, trendLineSegments, trendTickIndices } from '../../analytics_ui/components/data.js';
import { resolveView } from '../../analytics_ui/filters.js';
import { POLICY_SCENARIO_CAVEAT } from '../../analytics_ui/scenarios.js';

const trendTable = {
  cells: [
    {
      series: 'current', value: 16.5, dimensions: { month: '2025-03', concern_code: 'information_gap' },
      baseline_available: true, baseline_numerator: 6, baseline_denominator: 500,
      baseline_rate_per_1000: 12, rate_difference_per_1000: 4.5,
    },
    { series: 'current', value: 8, dimensions: { month: '2025-03', topic_code: 'care_navigation' } },
  ],
};

test('trend data and labels use the selected filter dimension', () => {
  const cells = trendCellSeries(trendTable, 'concern_code');
  assert.deepEqual(trendCategories(cells, 'concern_code'), ['information_gap']);
  assert.equal(cells[0].dimensions.concern_code, 'information_gap');
});

test('monthly trend exposes baseline rate and current-minus-baseline difference', () => {
  assert.deepEqual(trendBaseline(trendTable.cells[0]), {
    available: true,
    numerator: 6,
    denominator: 500,
    rate: 12,
    difference: 4.5,
  });
  assert.deepEqual(trendBaseline({ baseline_available: false }), {
    available: false,
    numerator: null,
    denominator: null,
    rate: null,
    difference: null,
  });
});

test('trend lines break at missing or suppressed monthly values', () => {
  assert.deepEqual(trendLineSegments([12, null, 4, undefined, 8]), [
    [{ index: 0, value: 12 }],
    [{ index: 2, value: 4 }],
    [{ index: 4, value: 8 }],
  ]);
});

test('trend axis ticks are sparse at narrow width while spanning the full series', () => {
  assert.deepEqual(trendTickIndices(24, 5), [0, 6, 12, 17, 23]);
  assert.deepEqual(trendTickIndices(24, 12), [0, 2, 4, 6, 8, 10, 13, 15, 17, 19, 21, 23]);
  assert.deepEqual(trendTickIndices(3, 5), [0, 1, 2]);
  assert.deepEqual(trendTickIndices(0, 5), []);
});

test('available tables with hidden siblings report partial suppression', () => {
  assert.equal(tableState({
    data_state: 'available', suppressed: true,
    cells: [{ value: 12, suppressed: false }, { value: null, suppressed: true }],
  }), 'partially_suppressed');
  assert.equal(tableState({ data_state: 'suppressed', suppressed: true }), 'suppressed');
  assert.equal(tableState({
    data_state: 'available', cells: [{ value: null, suppressed: true }],
  }), 'suppressed');
});

test('unknown dashboard view values resolve to overview', () => {
  const allowed = ['overview', 'insurer', 'policy', 'geography', 'quality'];
  assert.equal(resolveView(new URLSearchParams('view=policy'), allowed), 'policy');
  assert.equal(resolveView(new URLSearchParams('view=not-a-view'), allowed), 'overview');
  assert.equal(resolveView(new URLSearchParams('view=insurer&view=policy'), allowed), 'overview');
});

test('policy scenario caveat distinguishes labeled injected points from ordinary synthetic values', () => {
  assert.match(POLICY_SCENARIO_CAVEAT, /only points labeled .* are injected/i);
  assert.match(POLICY_SCENARIO_CAVEAT, /unlabeled months are not the injected spike/i);
  assert.doesNotMatch(POLICY_SCENARIO_CAVEAT, /^Artificial demonstration pattern/i);
});
