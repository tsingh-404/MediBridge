import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../../analytics_ui/api.js';
const { fetchAggregate } = api;
import { linkedSelectionReducer } from '../../analytics_ui/linkedSelection.js';
import { brushRange, brushRangeFromKeys } from '../../analytics_ui/timeline.js';

test('timeline and matrix are allowlisted and matrix pair must be exact', async () => {
  const allowedPairs = ['topic_code:region', 'service_code:region', 'topic_code:insurer_id', 'region:location_basis'];
  assert.equal(Object.hasOwn(api, 'MATRIX_PAIRS'), false);
  for (const pair of allowedPairs) {
    let requested;
    await fetchAggregate('matrix', { region: 'Brisbane' }, {
      pair,
      fetchImpl: async (url) => { requested = url; return { ok: true, json: async () => ({}) }; },
    });
    assert.equal(new URL(requested, 'http://localhost').searchParams.get('pair'), pair);
  }
  for (const pair of ['region:topic_code', 'topic_code:topic_code', 'topic_code:region:extra', '']) {
    let called = false;
    await assert.rejects(fetchAggregate('matrix', {}, {
      pair,
      fetchImpl: async () => { called = true; },
    }), /Unsupported matrix pair/);
    assert.equal(called, false);
  }
  await fetchAggregate('timeline', {}, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
});

test('linked selection applies a dimension and Escape clears the most recent selection', () => {
  const selected = linkedSelectionReducer({}, { type: 'select', field: 'region', value: 'Brisbane' });
  assert.deepEqual(selected, { region: 'Brisbane' });
  const next = linkedSelectionReducer(selected, { type: 'select', field: 'topic_code', value: 'care_navigation' });
  assert.deepEqual(next, { region: 'Brisbane', topic_code: 'care_navigation' });
  assert.deepEqual(linkedSelectionReducer(next, { type: 'clear_last' }), { region: 'Brisbane' });
  assert.deepEqual(linkedSelectionReducer(selected, { type: 'clear', field: 'region' }), {});
});

test('reselecting a dimension moves it to the end of selection recency', () => {
  let selected = linkedSelectionReducer({}, { type: 'select', field: 'region', value: 'Brisbane' });
  selected = linkedSelectionReducer(selected, { type: 'select', field: 'topic_code', value: 'care_navigation' });
  selected = linkedSelectionReducer(selected, { type: 'select', field: 'region', value: 'Gold Coast' });
  assert.deepEqual(linkedSelectionReducer(selected, { type: 'clear_last' }), {
    topic_code: 'care_navigation',
  });
});

test('timeline brush and keyboard navigation clamp to valid monthly ranges', () => {
  assert.deepEqual(brushRange(2, 7, 12), { start: 2, end: 7 });
  assert.deepEqual(brushRange(8, 3, 12), { start: 3, end: 8 });
  assert.deepEqual(brushRange(-4, 40, 12), { start: 0, end: 11 });
  assert.deepEqual(brushRangeFromKeys({ start: 3, end: 7 }, 'ArrowRight', 12), { start: 4, end: 8 });
  assert.deepEqual(brushRangeFromKeys({ start: 0, end: 4 }, 'ArrowLeft', 12), { start: 0, end: 4 });
});

test('shell retains required disclosure, tabs, theme and mobile filter affordances', async () => {
  const { readFile } = await import('node:fs/promises');
  const [app, styles, filterBar, charts, frame] = await Promise.all([
    readFile(new URL('../../analytics_ui/app.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/components/FilterBar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/components/AggregateChart.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/components/charts/ChartFrame.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /Synthetic demo: not real student data/);
  assert.match(app, /role="tablist"/);
  assert.match(app, /aria-label="Toggle theme"/);
  assert.match(app, /Present/);
  assert.match(filterBar, /Filters \(/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)/);
  assert.match(styles, /position:\s*sticky/);
  assert.match(charts, /point\.month\} · \{labelCode/);
  assert.doesNotMatch(charts, /point\.month\} \? \{/);
  assert.match(charts, /<ChartFrame/);
  assert.match(frame, /Insufficient group size/);
  assert.match(frame, /Synthetic demo/);
  assert.match(frame, />Chart</);
  assert.match(frame, />Table</);
});
