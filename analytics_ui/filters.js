export const FILTER_FIELDS = [
  'start_date', 'end_date', 'insurer_id', 'tier_id', 'region',
  'location_basis', 'topic_code', 'service_code', 'concern_code',
];

const DIMENSION_FIELDS = FILTER_FIELDS.filter((field) => !['start_date', 'end_date'].includes(field));

function paramsFrom(input) {
  if (input instanceof URLSearchParams) return input;
  return new URLSearchParams(input || '');
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function resetFilters(meta = {}) {
  const range = meta.available_date_range || {};
  return {
    start_date: range.start_date || '',
    end_date: range.end_date || '',
    insurer_id: '',
    tier_id: '',
    region: '',
    location_basis: '',
    topic_code: '',
    service_code: '',
    concern_code: '',
  };
}

export function parseFilters(input, meta = {}) {
  const params = paramsFrom(input);
  const filters = resetFilters(meta);
  const allowlists = meta.allowlists || {};

  for (const field of DIMENSION_FIELDS) {
    const values = params.getAll(field);
    const allowed = allowlists[field];
    if (values.length === 1 && Array.isArray(allowed) && allowed.includes(values[0])) {
      filters[field] = values[0];
    }
  }

  const startValues = params.getAll('start_date');
  const endValues = params.getAll('end_date');
  const start = startValues.length === 1 ? startValues[0] : '';
  const end = endValues.length === 1 ? endValues[0] : '';
  const range = meta.available_date_range || {};
  const validStart = !start || (isIsoDate(start) && (!range.start_date || start >= range.start_date) && (!range.end_date || start <= range.end_date));
  const validEnd = !end || (isIsoDate(end) && (!range.start_date || end >= range.start_date) && (!range.end_date || end <= range.end_date));

  if (validStart && validEnd && (!start || !end || start <= end)) {
    filters.start_date = start || range.start_date || '';
    filters.end_date = end || range.end_date || '';
  }
  return filters;
}

export function serializeFilters(filters = {}) {
  const params = new URLSearchParams();
  for (const field of FILTER_FIELDS) {
    const value = filters[field];
    if (typeof value === 'string' && value !== '') params.set(field, value);
  }
  return params;
}

export function resolveView(input, allowedViews = ['overview']) {
  const params = paramsFrom(input);
  const values = params.getAll('view');
  return values.length === 1 && allowedViews.includes(values[0]) ? values[0] : 'overview';
}
