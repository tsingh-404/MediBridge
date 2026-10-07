import React from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { cellDimensions, formatCell, sortCells, tableCells } from '../data.js';
import { compatibleSparkline, latestPeriodDelta, selectedWindow } from './overviewData.js';
import { createLinearScale, linePath } from './scales.js';
import { formatPeriodDelta } from './overviewData.js';

function sparkPoints(monthlyTable, filters) {
  const cells = sortCells(tableCells(monthlyTable), 'value', 'asc');
  const ordered = [...cells].sort((left, right) => String(cellDimensions(left).month || '').localeCompare(String(cellDimensions(right).month || ''))).slice(-24);
  const visible = ordered.filter((cell) => !cell.suppressed && cell.value != null);
  if (visible.length < 2) return { ordered, path: '', windows: selectedWindow(ordered.map((cell) => cellDimensions(cell).month || ''), filters) };
  const max = Math.max(1, ...visible.map((cell) => Number(cell.value)));
  const scaleX = createLinearScale([0, ordered.length - 1], [6, 294]).scale;
  const scaleY = createLinearScale([0, max], [44, 4]).scale;
  const segments = [];
  let active = [];
  ordered.forEach((cell, index) => {
    if (cell.suppressed || cell.value == null) {
      if (active.length > 1) segments.push(active);
      active = [];
    } else active.push({ x: scaleX(index), y: scaleY(Number(cell.value)) });
  });
  if (active.length > 1) segments.push(active);
  return { ordered, path: segments.map((segment) => linePath(segment)).join(' '), windows: selectedWindow(ordered.map((cell) => cellDimensions(cell).month || ''), filters) };
}

export function StatTile({ title, table, monthlyTable, filters, description, delta: suppliedDelta, deltaLabel }) {
  const cell = tableCells(table)[0];
  const visible = cell && !cell.suppressed && cell.value != null;
  const denominator = visible ? cell.denominator : null;
  const spark = compatibleSparkline(table, monthlyTable)
    ? sparkPoints(monthlyTable, filters)
    : { ordered: [], path: '', windows: [] };
  const latestDelta = latestPeriodDelta(monthlyTable);
  const delta = suppliedDelta ?? latestDelta?.difference;
  const deltaText = formatPeriodDelta(latestDelta ? { ...latestDelta, difference: delta } : null, table?.unit, deltaLabel || 'vs same month last year');
  const deltaArrow = delta == null ? '—' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  return <ChartFrame title={title} table={table} columns={[]} subtitle={description}>
    <article className="stat-tile" aria-label={`${title}: ${formatCell(cell, table?.unit)}`}>
      <p className="stat-value" style={{ '--value-scale': Math.max(0.72, Math.min(1, 7 / String(cell?.value ?? '—').length)) }}>{formatCell(cell, table?.unit)}</p>
      <p className="stat-unit">{table?.unit?.replaceAll('_', ' ') || 'aggregate measure'}</p>
      <p className="stat-delta" aria-label={deltaText}><span aria-hidden="true" className={delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}>{deltaArrow}</span> {deltaText}</p>
      {denominator != null && <p className="stat-denominator">{cell.numerator ?? cell.value} / {denominator} in selected cohort</p>}
      {table?.unit === 'question_turns' && cell?.distinct_sessions != null && <p className="stat-denominator">Across {cell.distinct_sessions} supporting sessions</p>}
      {spark.ordered.length > 1 && <div className="stat-sparkline" role="img" aria-label={`24 month sparkline for ${title}; selected window highlighted. Suppressed months are omitted.`}>
        <svg viewBox="0 0 300 52" aria-hidden="true" focusable="false">
          {spark.windows.map((selected, index) => selected && <rect key={`window-${index}`} className="spark-window" x={6 + index * (288 / Math.max(1, spark.windows.length - 1)) - 5} y="1" width="10" height="46" />)}
          {spark.path && <path className="sparkline-path" d={spark.path} />}
          {spark.ordered.map((item, index) => (item.suppressed || item.value == null) && <circle key={`suppressed-${index}`} className="sparkline-suppressed" cx={6 + index * (288 / Math.max(1, spark.ordered.length - 1))} cy="25" r="4" aria-label="Insufficient group size" />)}
        </svg>
      </div>}
    </article>
  </ChartFrame>;
}
