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
  if (table.suppressed || table.data_state === 'suppressed') return 'suppressed';
  return 'available';
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
