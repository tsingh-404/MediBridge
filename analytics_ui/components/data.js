const wholeNumber = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatCell(cell, unit = '') {
  if (!cell || cell.suppressed) return 'Insufficient group size';
  if (cell.value === null || cell.value === undefined || !Number.isFinite(Number(cell.value))) return 'Not available';
  const value = Number(cell.value);
  if (unit.includes('share')) return `${oneDecimal.format(value * 100)}%`;
  if (unit.includes('per_1000')) return `${oneDecimal.format(value)} / 1,000`;
  return wholeNumber.format(value);
}

export function formatRateDifference(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Not available';
  const difference = Number(value);
  return `${difference > 0 ? '+' : ''}${oneDecimal.format(difference)} / 1,000`;
}

export function sortCells(cells = [], key = 'value', direction = 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...cells].sort((left, right) => {
    const leftHidden = left.suppressed || left[key] === null || left[key] === undefined;
    const rightHidden = right.suppressed || right[key] === null || right[key] === undefined;
    if (leftHidden !== rightHidden) return leftHidden ? 1 : -1;
    if (leftHidden) return 0;
    const leftValue = typeof left[key] === 'number' ? left[key] : String(left[key]).toLocaleLowerCase();
    const rightValue = typeof right[key] === 'number' ? right[key] : String(right[key]).toLocaleLowerCase();
    if (leftValue === rightValue) return 0;
    return (leftValue < rightValue ? -1 : 1) * multiplier;
  });
}

export function tableState(table) {
  if (!table) return 'unavailable';
  if (table.no_data || table.data_state === 'no_data') return 'no_data';
  if (table.data_state === 'suppressed') return 'suppressed';
  const cells = tableCells(table);
  const hiddenCells = cells.filter((cell) => cell.suppressed || cell.value == null);
  if (cells.length > 0 && hiddenCells.length === cells.length) return 'suppressed';
  if (hiddenCells.length > 0) return 'partially_suppressed';
  return 'available';
}

export function trendCellSeries(table, filterField) {
  return tableCells(table).filter((cell) =>
    (cell.series === 'current' || !cell.series) && cellDimensions(cell)[filterField]
  );
}

export function trendCategories(cells, filterField) {
  return [...new Set(cells.map((cell) => cellDimensions(cell)[filterField]).filter(Boolean))].sort();
}

export function trendBaseline(cell) {
  if (!cell?.baseline_available) return { available: false, numerator: null, denominator: null, rate: null, difference: null };
  return {
    available: true,
    numerator: cell.baseline_numerator ?? null,
    denominator: cell.baseline_denominator ?? null,
    rate: cell.baseline_rate_per_1000 ?? null,
    difference: cell.rate_difference_per_1000 ?? null,
  };
}

export function trendLineSegments(values) {
  const segments = [];
  let active = [];
  values.forEach((value, index) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      if (active.length) segments.push(active);
      active = [];
      return;
    }
    active.push({ index, value: Number(value) });
  });
  if (active.length) segments.push(active);
  return segments;
}

export function trendTickIndices(count, maxTicks) {
  const size = Math.max(0, Math.floor(Number(count) || 0));
  if (!size) return [];
  const limit = Math.max(1, Math.floor(Number(maxTicks) || 1));
  if (size <= limit) return Array.from({ length: size }, (_, index) => index);
  if (limit === 1) return [0];
  return Array.from({ length: limit }, (_, index) => Math.round(index * (size - 1) / (limit - 1)));
}

export function labelCode(value = '') {
  if (value === 'unknown_unclassified' || value === 'unknown_not_assessed' || value === 'unknown') return 'Unknown';
  return value
    .split('_')
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ');
}

export function cellDimensions(cell) {
  return cell?.dimensions && typeof cell.dimensions === 'object' ? cell.dimensions : {};
}

export function tableCells(table) {
  return Array.isArray(table?.cells) ? table.cells : [];
}
