import React, { useMemo, useState } from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { cellDimensions, formatCell, labelCode, sortCells, tableCells } from '../data.js';

export function RankedBar({ title, table, filterField = 'topic_code', onSelect, selected, limit = 8 }) {
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => sortCells(tableCells(table), 'value', 'desc'), [table]);
  const cells = showAll ? all : all.slice(0, limit);
  const max = Math.max(1, ...all.filter((cell) => !cell.suppressed && cell.value != null).map((cell) => Number(cell.value)));
  return <ChartFrame title={title} table={table} columns={[filterField]} onSelect={onSelect} subtitle="Categories may overlap; rates and totals do not imply a share of all sessions.">
    <ol className="ranked-bars" aria-label={`${title} text alternative`}>
      {cells.map((cell, index) => {
        const code = cellDimensions(cell)[filterField] || `Category ${index + 1}`;
        const hidden = Boolean(cell.suppressed || cell.value == null);
        const isSelected = selected === code;
        const width = hidden ? 100 : Math.max(2, Number(cell.value) / max * 100);
        return <li key={code}>
          <button type="button" className={`ranked-bar-row${isSelected ? ' is-selected' : ''}${selected && !isSelected ? ' is-muted' : ''}${hidden ? ' is-suppressed' : ''}`}
            disabled={!onSelect || hidden} aria-pressed={onSelect ? isSelected : undefined}
            aria-label={`${labelCode(code)}: ${hidden ? 'Insufficient group size' : formatCell(cell, table?.unit)}${onSelect && !hidden ? ', filter by topic' : ''}`}
            onClick={() => onSelect?.(filterField, code)}>
            <span className="ranked-bar-label">{labelCode(code)}</span>
            <span className="ranked-bar-track" aria-hidden="true"><span className="ranked-bar-fill" style={{ width: `${width}%` }} /></span>
            <span className="ranked-bar-value">{hidden ? 'Insufficient group size' : formatCell(cell, table?.unit)}</span>
          </button>
        </li>;
      })}
    </ol>
    {all.length > limit && <button type="button" className="show-all-categories" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top topics' : `Show all ${all.length} topics`}</button>}
    <p className="chart-description">Text alternative lists {cells.length} returned categories. Suppressed values remain hidden and hatched.</p>
  </ChartFrame>;
}
