import React from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { cellDimensions, tableCells } from '../data.js';
import { formatMonth } from './format.js';

export function SampleSizeChart({ table, scenarioVersions = [] }) {
  const cells = tableCells(table).filter((cell) => cellDimensions(cell).month).sort((a, b) => cellDimensions(a).month.localeCompare(cellDimensions(b).month)).slice(-24);
  const visible = cells.filter((cell) => !cell.suppressed && cell.value != null);
  const max = Math.max(1, ...visible.map((cell) => Number(cell.value)));
  const scenarioMonths = new Set(scenarioVersions.flatMap((version) => {
    if (typeof version === 'object') return version.months || version.affected_months || [];
    if (version === 'respiratory_spike') return ['2025-01', '2025-02', '2025-03'];
    if (version === 'coverage_information_spike') return ['2025-10', '2025-11', '2025-12'];
    return [];
  }));
  return <ChartFrame title="Monthly selected-session sample size" table={table} columns={['month']} subtitle="Counts describe selected synthetic sessions only; artificial scenario months are marked amber.">
    <div className="sample-size-chart" role="list" aria-label="Monthly selected session counts; amber bars indicate artificial scenario versions.">
      {cells.map((cell) => { const month = cellDimensions(cell).month; const hidden = cell.suppressed || cell.value == null;
        const scenario = scenarioMonths.has(month);
        return <div key={month} role="listitem" tabIndex="0" aria-label={`${formatMonth(month)}: ${hidden ? 'Insufficient group size' : `${cell.value} selected sessions`}${scenario ? ', artificial scenario month' : ''}`} className={`sample-size-column${scenario ? ' is-scenario' : ''}${hidden ? ' is-suppressed' : ''}`} title={`${formatMonth(month)}: ${hidden ? 'Insufficient group size' : cell.value}${scenario ? ', artificial scenario month' : ''}`}>
          <span className="sample-size-bar" style={{ height: `${hidden ? 0 : Math.max(2, Number(cell.value) / max * 100)}%` }} />
          <span className="sample-size-label">{month.slice(2)}</span>
        </div>;
      })}
    </div>
    <p className="chart-description">Amber marks show artificial scenario months; they do not indicate real-world events.</p>
  </ChartFrame>;
}
