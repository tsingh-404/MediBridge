import { serializeFilters } from './filters.js';

const ENDPOINTS = new Set([
  'meta', 'overview', 'topics', 'trend', 'regions', 'coverage-friction', 'quality', 'timeline', 'matrix',
]);

const MATRIX_PAIRS = new Set([
  'topic_code:region', 'service_code:region', 'topic_code:insurer_id', 'region:location_basis',
]);

export async function fetchAggregate(endpoint, filters = {}, options = {}) {
  if (!ENDPOINTS.has(endpoint)) throw new Error(`Unsupported aggregate endpoint: ${endpoint}`);
  const { signal, fetchImpl = globalThis.fetch, bucket = 'month', pair } = options;
  if (endpoint === 'matrix' && !MATRIX_PAIRS.has(pair)) throw new Error(`Unsupported matrix pair: ${pair || ''}`);
  const params = serializeFilters(filters);
  if (endpoint === 'trend' && ['month', 'week'].includes(bucket)) params.set('bucket', bucket);
  if (endpoint === 'matrix') params.set('pair', pair);
  const query = params.toString();
  const response = await fetchImpl(`/api/demo/${endpoint}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    let detail = `Analytics request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep the status message when the server does not return JSON.
    }
    throw new Error(detail);
  }
  return response.json();
}
