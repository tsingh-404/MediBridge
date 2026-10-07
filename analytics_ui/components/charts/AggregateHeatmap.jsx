import React from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { cellDimensions, formatCell, labelCode, tableCells } from '../data.js';

export function AggregateHeatmap({ title, table, rowKey, columnKey, onSelect }) {
  const cells = tableCells(table);
  const rows = [...new Set(cells.map((cell) => cellDimensions(cell)[rowKey]).filter(Boolean))].sort();
  const columns = [...new Set(cells.map((cell) => cellDimensions(cell)[columnKey]).filter(Boolean))].sort();
  const visible = cells.filter((cell) => !cell.suppressed && cell.value != null);
  const max = Math.max(1, ...visible.map((cell) => Number(cell.value)));
  const lookup = new Map(cells.map((cell) => {
    const dimensions = cellDimensions(cell); return [`${dimensions[rowKey]}|${dimensions[columnKey]}`, cell];
  }));
  return <ChartFrame title={title} table={table} columns={[rowKey, columnKey]} onSelect={onSelect} subtitle="Synthetic cells are separately suppressed for small groups; colors are relative to the visible cells in this selection.">
    <div className="aggregate-heatmap-scroll" role="region" aria-label={`${title} aggregate heatmap`} tabIndex="0">
      <table className="aggregate-heatmap"><thead><tr><th scope="col">{labelCode(rowKey)} / {labelCode(columnKey)}</th>{columns.map((column) => <th scope="col" key={column}>{labelCode(column)}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row}><th scope="row">{labelCode(row)}</th>{columns.map((column) => {
          const cell = lookup.get(`${row}|${column}`);
          const suppressed = Boolean(cell?.suppressed);
          const hidden = !cell || suppressed || cell.value == null;
          const status = suppressed ? 'Insufficient group size' : 'No matching sessions';
          return <td key={column}><button type="button" className={`aggregate-heatmap-cell${hidden ? ' is-suppressed' : ''}`}
            style={{ '--heat-alpha': hidden ? 0 : 0.12 + Number(cell.value) / max * 0.72 }}
            aria-label={`${labelCode(row)}, ${labelCode(column)}: ${hidden ? status : `${formatCell(cell, table?.unit)}; ${cell.numerator ?? 'not available'} / ${cell.denominator ?? 'not available'}`}`}
            onClick={() => !hidden && onSelect?.(rowKey, row)}>{hidden ? '—' : formatCell(cell, table?.unit)}</button></td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  </ChartFrame>;
}
