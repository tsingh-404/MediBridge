import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aggregateRegionValues, unknownGeographyShare, suppressionSummary } from '../../analytics_ui/components/charts/geographyData.js';

test('region aggregation preserves unknown as a separate geography and supports a selected topic rate', () => {
  const sessions = { cells: [
    { dimensions: { region: 'Brisbane', location_basis: 'service_search_area' }, value: 4 },
    { dimensions: { region: 'Brisbane', location_basis: 'stated_demo_region' }, value: 6 },
    { dimensions: { region: 'unknown', location_basis: 'unknown' }, value: 2 },
  ] };
  const rates = { cells: [
    { dimensions: { region: 'Brisbane', location_basis: 'service_search_area', topic_code: 'primary_care' }, numerator: 6, denominator: 500, value: 12 },
    { dimensions: { region: 'Brisbane', location_basis: 'stated_demo_region', topic_code: 'primary_care' }, numerator: 4, denominator: 500, value: 8 },
    { dimensions: { region: 'Brisbane', location_basis: 'service_search_area', topic_code: 'pharmacy_medicines' }, numerator: 200, denominator: 1000, value: 200 },
  ] };
  assert.deepEqual(aggregateRegionValues(sessions, rates, 'sessions', 'primary_care'), [
    { region: 'Brisbane', value: 10 }, { region: 'unknown', value: 2 },
  ]);
  assert.deepEqual(aggregateRegionValues(sessions, rates, 'rate', 'primary_care'), [
    { region: 'Brisbane', value: 10 },
  ]);
});

test('unknown geography share is calculated from unknown geography sessions and keeps missing denominators unavailable', () => {
  assert.equal(unknownGeographyShare({ cells: [
    { dimensions: { region: 'Brisbane' }, value: 7 },
    { dimensions: { region: 'unknown' }, value: 3 },
  ] }), 0.3);
  assert.equal(unknownGeographyShare({ cells: [] }), null);
});

test('suppression summary counts hidden cells without substituting zero', () => {
  assert.deepEqual(suppressionSummary([{ cells: [{ value: 2 }, { value: null, suppressed: true }] }, { cells: [{ value: null }] }]), { hidden: 2, total: 3, share: 2 / 3 });
});

test('geography and quality views expose the requested aggregate-only visual sections and endpoint pairs', async () => {
  const [app, geography, quality] = await Promise.all([
    readFile(new URL('../../analytics_ui/app.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/views/ServiceGeography.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/views/DataQuality.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /pair: 'topic_code:region'/);
  assert.match(app, /pair: 'service_code:region'/);
  assert.match(app, /pair: 'region:location_basis'/);
  assert.match(geography, /TileMap/);
  assert.match(geography, /title="Region × location basis"/);
  assert.match(geography, /title="Region × service category"/);
  assert.match(quality, /unknown-geography-meter/);
  assert.match(quality, /suppression-summary/);
  assert.match(quality, /SampleSizeChart/);
  assert.match(quality, /definition-grid/);
});
