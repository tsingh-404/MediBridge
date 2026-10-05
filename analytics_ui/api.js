import { serializeFilters } from './filters.js';

const ENDPOINTS = new Set([
  'meta', 'overview', 'topics', 'trend', 'regions', 'coverage-friction', 'quality',
]);

export async function fetchAggregate(endpoint, filters = {}, options = {}) {
  if (!ENDPOINTS.has(endpoint)) throw new Error(`Unsupported aggregate endpoint: ${endpoint}`);
  const { signal, fetchImpl = globalThis.fetch, bucket = 'month' } = options;
  const params = serializeFilters(filters);
  if (endpoint === 'trend' && ['month', 'week'].includes(bucket)) params.set('bucket', bucket);
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
