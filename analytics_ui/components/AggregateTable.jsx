import React, { useMemo, useState } from 'react';
import { cellDimensions, formatCell, labelCode, sortCells, tableCells } from './data.js';

export function AggregateTable({ title, table, columns = [], extraColumns = [], onSelect }) {
  const [sort, setSort] = useState({ key: 'value', direction: 'desc' });
  const cells = useMemo(() => sortCells(tableCells(table), sort.key, sort.direction), [table, sort]);
  if (!table) return <p className="muted">This measure is not available for the current selection.</p>;
  if (table.no_data || table.data_state === 'no_data') return <p className="muted">No matching aggregate values.</p>;
  const keys = columns.length ? columns : Object.keys(cellDimensions(cells[0] || {}));
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="table-scroll" role="region" aria-label={`${title} data table`} tabIndex="0">
      <table>
        <caption>{title}. Unit: {table.unit || 'aggregate value'}. {table.caveat || ''}</caption>
        <thead><tr>
          {keys.map((key) => <th scope="col" key={key}>{key.replaceAll('_', ' ')}</th>)}
          <th scope="col"><button className="sort-button" type="button" aria-label={`Sort ${title} by value`} onClick={() => toggleSort('value')}>Value {sort.key === 'value' ? (sort.direction === 'desc' ? '↓' : '↑') : ''}</button></th>
          <th scope="col">Numerator / denominator</th>
          {extraColumns.map((column) => <th scope="col" key={column.label}>{column.label}</th>)}
        </tr></thead>
        <tbody>
          {cells.map((cell, index) => {
            const dimensions = cellDimensions(cell);
            const code = dimensions.topic_code || dimensions.concern_code || dimensions.service_code || dimensions.region;
            return <tr key={`${JSON.stringify(dimensions)}-${index}`}>
              {keys.map((key) => <td key={key}>{labelCode(dimensions[key] ?? '—')}</td>)}
              <td>{cell.suppressed ? 'Insufficient group size' : formatCell(cell, table.unit)}</td>
              <td>{cell.suppressed ? 'Hidden for group-size protection' : `${cell.numerator ?? '—'} / ${cell.denominator ?? '—'}`}</td>
              {extraColumns.map((column) => <td key={column.label}>{cell.suppressed ? 'Hidden for group-size protection' : column.render(cell)}</td>)}
            </tr>;
          })}
          {cells.length === 0 && <tr><td colSpan={keys.length + 2 + extraColumns.length}>No rows returned for this aggregate.</td></tr>}
        </tbody>
      </table>
      <p className="table-note">For a narrow screen, scroll this labelled table region horizontally. {onSelect && 'Select a category in the ranked chart to apply its allowlisted filter. Table sorting does not issue a new aggregate request.'}</p>
    </div>
  );
}
