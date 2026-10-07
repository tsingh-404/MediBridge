import { cellDimensions, formatCell, sortCells, tableCells } from '../data.js';
import { formatMonth } from './format.js';

export function leadingTopicRate(topicSessions, topicRates) {
  const leading = sortCells(tableCells(topicSessions), 'value', 'desc').find((cell) => !cell.suppressed && cell.value != null);
  if (!leading) return null;
  const code = cellDimensions(leading).topic_code;
  return tableCells(topicRates).find((cell) => cellDimensions(cell).topic_code === code) || null;
}

export function topicCodesFromRates(topicRates) {
  return [...new Set(tableCells(topicRates).map((cell) => cellDimensions(cell).topic_code).filter(Boolean))].sort();
}

export function timelineTopicTables(timeline) {
  return Object.entries(timeline?.tables || {})
    .filter(([key]) => key.startsWith('topic_month_rates.'))
    .map(([key, table]) => ({ code: key.slice('topic_month_rates.'.length), table }));
}

export function selectTopicTrend(timeline, topicCode) {
  const tables = timelineTopicTables(timeline);
  if (!tables.length) return null;
  return tables.find(({ code }) => code === topicCode)?.table || tables[0].table;
}

export function buildHeatmap(timeline, topicCodes, monthLimit = 24) {
  const tables = timelineTopicTables(timeline);
  const byTopic = new Map(tables.map(({ code, table }) => [code, tableCells(table)]));
  const months = [...new Set(tables.flatMap(({ table }) => tableCells(table)
    .map((cell) => cellDimensions(cell).month).filter(Boolean)))].sort().slice(-monthLimit);
  const rows = topicCodes.slice(0, 17).sort();
  const indexed = new Map();
  for (const code of rows) {
    for (const cell of byTopic.get(code) || []) {
      const month = cellDimensions(cell).month;
      if (month) indexed.set(`${code}|${month}`, cell);
    }
  }
  return rows.flatMap((topic) => months.map((month) => {
    const cell = indexed.get(`${topic}|${month}`);
    return { topic, month, cell: cell || null, value: !cell || cell.suppressed ? null : cell.value,
      suppressed: Boolean(cell?.suppressed || cell?.value == null), missing: !cell };
  }));
}

export function selectedWindow(months, filters = {}) {
  return months.map((month) => (!filters.start_date || month >= filters.start_date.slice(0, 7))
    && (!filters.end_date || month <= filters.end_date.slice(0, 7)));
}

export function compatibleSparkline(metricTable, monthlyTable) {
  const metricUnit = metricTable?.unit;
  const monthlyUnit = monthlyTable?.unit;
  if (!metricUnit || !monthlyUnit) return false;
  if (metricUnit === monthlyUnit) return true;
  return metricUnit.includes('per_1000_selected_sessions') && monthlyUnit.includes('per_1000_selected_sessions');
}

export function cohortScope(filters = {}) {
  return ['region', 'location_basis', 'insurer_id', 'tier_id'].some((field) => Boolean(filters[field])) ? 'Selected cohort' : 'Statewide';
}

export function heatmapScenarioMonths(scenarioVersions = []) {
  const months = new Set();
  if (scenarioVersions.includes('respiratory_spike')) {
    ['2025-01', '2025-02', '2025-03'].forEach((month) => months.add(month));
  }
  if (scenarioVersions.includes('coverage_information_spike')) {
    ['2025-10', '2025-11', '2025-12'].forEach((month) => months.add(month));
  }
  return months;
}

export function latestPeriodDelta(monthlyTable) {
  const cells = [...(monthlyTable?.cells || [])]
    .sort((left, right) => String(right.dimensions?.month || '').localeCompare(String(left.dimensions?.month || '')));
  const latest = cells.find((cell) => !cell.suppressed && cell.value != null && cell.baseline_available);
  if (!latest) return null;
  const difference = latest.difference ?? latest.rate_difference_per_1000
    ?? (latest.baseline_value == null ? null : Number(latest.value) - Number(latest.baseline_value));
  return difference == null || !Number.isFinite(Number(difference))
    ? null
    : { month: latest.dimensions.month, difference: Number(difference) };
}

export function formatPeriodDelta(periodDelta, unit, label = 'vs same month last year') {
  if (!periodDelta || periodDelta.difference == null) return 'Prior-year comparison unavailable';
  const difference = Number(periodDelta.difference);
  const direction = difference > 0 ? 'Increased by' : difference < 0 ? 'Decreased by' : 'No change';
  const amount = difference === 0 ? '' : ` ${formatCell({ value: Math.abs(difference) }, unit)}`;
  return `${direction}${amount} · ${formatMonth(periodDelta.month)} ${label}`;
}
