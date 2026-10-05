import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchAggregate } from '../../analytics_ui/api.js';
import { parseFilters, resetFilters, serializeFilters } from '../../analytics_ui/filters.js';

const meta = {
  available_date_range: { start_date: '2024-10-01', end_date: '2026-09-30' },
  allowlists: {
    insurer_id: ['demo_insurer_a'],
    tier_id: ['demo_standard'],
    region: ['Brisbane', 'unknown'],
    location_basis: ['stated_demo_region', 'service_search_area', 'unknown'],
    topic_code: ['care_navigation', 'unknown_unclassified'],
    service_code: ['gp', 'unknown'],
    concern_code: ['information_gap', 'unknown'],
  },
};

test('resetFilters clears dimensions and restores the API date range', () => {
  assert.deepEqual(resetFilters(meta), {
    start_date: '2024-10-01',
    end_date: '2026-09-30',
    insurer_id: '',
    tier_id: '',
    region: '',
    location_basis: '',
    topic_code: '',
    service_code: '',
    concern_code: '',
  });
});

test('parseFilters keeps exact allowlisted unknown tokens and ignores invalid URL values', () => {
  const parsed = parseFilters(new URLSearchParams(
    'region=unknown&location_basis=unknown&topic_code=unknown_unclassified&service_code=bogus&start_date=2025-02-01&end_date=2025-01-01'
  ), meta);

  assert.deepEqual(parsed, {
    start_date: '2024-10-01',
    end_date: '2026-09-30',
    insurer_id: '',
    tier_id: '',
    region: 'unknown',
    location_basis: 'unknown',
    topic_code: 'unknown_unclassified',
    service_code: '',
    concern_code: '',
  });
});

test('parseFilters rejects duplicate dimensions and dates outside metadata bounds', () => {
  const parsed = parseFilters(new URLSearchParams(
    'region=unknown&region=Brisbane&start_date=2024-09-30&end_date=2025-01-01&insurer_id=demo_insurer_a'
  ), meta);

  assert.equal(parsed.region, '');
  assert.equal(parsed.start_date, '2024-10-01');
  assert.equal(parsed.end_date, '2026-09-30');
  assert.equal(parsed.insurer_id, 'demo_insurer_a');
});

test('serializeFilters emits only non-empty allowlisted filters', () => {
  const query = serializeFilters({
    region: 'unknown',
    topic_code: 'unknown_unclassified',
    start_date: '',
    arbitrary: 'ignored',
  });

  assert.equal(query.toString(), 'region=unknown&topic_code=unknown_unclassified');
});

test('fetchAggregate requests only an aggregate endpoint and propagates the shared filters', async () => {
  let requested;
  const payload = { synthetic: true, tables: { selected_sessions: { cells: [] } } };
  const response = await fetchAggregate('overview', { region: 'unknown', topic_code: 'unknown_unclassified' }, {
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return { ok: true, json: async () => payload };
    },
  });

  assert.deepEqual(response, payload);
  const url = new URL(requested.url, 'http://localhost');
  assert.equal(url.pathname, '/api/demo/overview');
  assert.equal(url.searchParams.get('region'), 'unknown');
  assert.equal(url.searchParams.get('topic_code'), 'unknown_unclassified');
  assert.equal(requested.options.method, 'GET');
});

test('fetchAggregate reports failed API requests without returning response rows', async () => {
  await assert.rejects(
    fetchAggregate('overview', {}, {
      fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ detail: 'region is not allowed' }) }),
    }),
    /region is not allowed/
  );
});

test('fetchAggregate rejects unknown endpoint names before making a request', async () => {
  let requested = false;
  await assert.rejects(
    fetchAggregate('../sessions', {}, { fetchImpl: async () => { requested = true; } }),
    /Unsupported aggregate endpoint/
  );
  assert.equal(requested, false);
});
