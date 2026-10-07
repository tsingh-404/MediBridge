import { cellDimensions, tableCells } from '../data.js';

export function aggregateRegionValues(sessionTable, rateTable, metric = 'sessions', selectedCode = '') {
  if (metric !== 'sessions') {
    if (!selectedCode) return [];
    const byRegion = new Map();
    for (const cell of tableCells(rateTable)) {
      const dimensions = cellDimensions(cell);
      const region = dimensions.region;
      const category = metric === 'service-rate' ? dimensions.service_code : dimensions.topic_code;
      if (!region || region === 'unknown' || category !== selectedCode) continue;
      const total = byRegion.get(region) || { numerator: 0, denominator: 0, suppressed: false };
      if (cell.suppressed || cell.numerator == null || cell.denominator == null) {
        total.suppressed = true;
        byRegion.set(region, total);
        continue;
      }
      if (cell.numerator == null || cell.denominator == null) continue;
      total.numerator += Number(cell.numerator);
      total.denominator += Number(cell.denominator);
      byRegion.set(region, total);
    }
    return [...byRegion].map(([region, total]) => total.suppressed
      ? ({ region, value: null, suppressed: true })
      : ({ region, value: total.denominator > 0 ? total.numerator / total.denominator * 1000 : null, numerator: total.numerator, denominator: total.denominator }));
  }
  const byRegion = new Map();
  for (const cell of tableCells(sessionTable)) {
    const region = cellDimensions(cell).region;
    if (!region) continue;
    const total = byRegion.get(region) || { value: 0, suppressed: false, numerator: 0, denominator: 0 };
    if (cell.suppressed || cell.value == null) total.suppressed = true;
    else { total.value += Number(cell.value); total.numerator += Number(cell.numerator ?? cell.value); total.denominator += Number(cell.denominator ?? cell.value); }
    byRegion.set(region, total);
  }
  return [...byRegion].map(([region, cell]) => ({ region, ...cell, value: cell.suppressed ? null : cell.value }));
}

export function unknownGeographyShare(sessionTable) {
  const cells = tableCells(sessionTable).filter((cell) => !cell.suppressed && cell.value != null);
  const total = cells.reduce((sum, cell) => sum + Number(cell.value), 0);
  if (!total) return null;
  const unknown = cells.filter((cell) => cellDimensions(cell).region === 'unknown')
    .reduce((sum, cell) => sum + Number(cell.value), 0);
  return unknown / total;
}

export function suppressionSummary(tables = []) {
  const cells = tables.flatMap((table) => tableCells(table));
  const hidden = cells.filter((cell) => cell.suppressed || cell.value == null).length;
  const total = cells.length;
  return { hidden, total, share: total ? hidden / total : null };
}
