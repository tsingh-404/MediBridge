import { cellDimensions, tableCells } from '../components/data.js';

export function outcomeSegments(table) {
  return tableCells(table).flatMap((cell) => {
    if (cell.suppressed || cell.numerator == null || cell.denominator == null) return [];
    const total = Number(cell.denominator);
    const unresolved = Number(cell.numerator);
    if (!Number.isFinite(total) || !Number.isFinite(unresolved) || total <= 0) return [];
    const dimensions = cellDimensions(cell);
    return [{
      topic: dimensions.topic_code,
      service: dimensions.service_code,
      resolved: Math.max(0, total - unresolved),
      unresolved: Math.max(0, unresolved),
      total,
    }].filter((row) => row.topic && row.service);
  }).map((row) => ({
    ...row,
    resolvedWidth: row.resolved / row.total * 100,
    unresolvedWidth: row.unresolved / row.total * 100,
  }));
}

export function comparisonCellStatus(cell) {
  if (!cell) return 'No matching sessions';
  if (cell.suppressed) return 'Insufficient group size';
  if (cell.value == null || !Number.isFinite(Number(cell.value))) return 'Not available';
  return null;
}

export function insurerMatrixFilters(filters = {}) {
  return { ...filters, insurer_id: '' };
}
