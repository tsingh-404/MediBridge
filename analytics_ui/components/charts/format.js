import { format as d3Format } from '../../../mobile/node_modules/d3-format/src/index.js';
import { utcFormat } from '../../../mobile/node_modules/d3-time-format/src/index.js';
import { formatCell, labelCode } from '../data.js';

const compact = d3Format('.3~s');
const monthFormat = utcFormat('%b %Y');

export function formatCompactValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Not available';
  return compact(Number(value));
}

export function formatRateTick(value) {
  return formatCell({ value }, 'sessions_per_1000');
}

export function formatChartLabel(code) {
  return labelCode(code);
}

export function formatMonth(value) {
  const date = value instanceof Date
    ? value
    : new Date(`${value}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Not available' : monthFormat(date);
}
