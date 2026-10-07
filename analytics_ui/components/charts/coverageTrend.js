import { cellDimensions, tableCells } from '../data.js';

export const COVERAGE_TOPICS = ['coverage_benefit_exclusion', 'coverage_waiting_period', 'cost_out_of_pocket'];
export const COVERAGE_SCENARIO_MONTHS = ['2025-10', '2025-11', '2025-12'];

export function coverageTopicSeries(timeline, topicCode) {
  const table = timeline?.tables?.[`topic_month_rates.${topicCode}`];
  return tableCells(table).filter((cell) => !cell.series || cell.series === 'current')
    .map((cell) => {
      const month = cellDimensions(cell).month;
      const hidden = cell.suppressed || cell.value == null;
      const baselineAvailable = !hidden && Boolean(cell.baseline_available) && cell.baseline_rate_per_1000 != null;
      return {
        month,
        cell,
        value: hidden ? null : Number(cell.value),
        baseline: baselineAvailable ? Number(cell.baseline_rate_per_1000) : null,
        baselineAvailable,
        difference: baselineAvailable && cell.rate_difference_per_1000 != null ? Number(cell.rate_difference_per_1000) : null,
      };
    })
    .filter((point) => point.month)
    .sort((left, right) => left.month.localeCompare(right.month));
}

export function latestCoverageDelta(points) {
  const latest = [...(points || [])].reverse().find((point) => point.value != null && point.baselineAvailable && point.difference != null);
  return latest ? { month: latest.month, difference: latest.difference } : null;
}

export function latestVisibleBaselineCell(cells) {
  return [...(cells || [])]
    .sort((left, right) => String(cellDimensions(right).month || '').localeCompare(String(cellDimensions(left).month || '')))
    .find((cell) => !cell.suppressed && cell.value != null && cell.baseline_available && cell.rate_difference_per_1000 != null) || null;
}

export function isCoverageScenarioMonth(month) {
  return COVERAGE_SCENARIO_MONTHS.includes(month);
}
