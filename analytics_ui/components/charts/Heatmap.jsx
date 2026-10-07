import React, { useMemo, useState } from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { formatCell, labelCode, tableCells } from '../data.js';
import { Tooltip } from './Tooltip.jsx';
import { useHover } from './useHover.js';
import { buildHeatmap, cohortScope, heatmapScenarioMonths } from './overviewData.js';

export function Heatmap({ timeline, topicCodes = [], onSelect, selectedTopic, filters = {}, scenarioVersions = [] }) {
  const [rowDirection, setRowDirection] = useState('asc');
  const [columnDirection, setColumnDirection] = useState('asc');
  const [active, setActive] = useState(null);
  const model = useMemo(() => {
    const tables = Object.entries(timeline?.tables || {}).filter(([key]) => key.startsWith('topic_month_rates.'));
    const sourceCells = tables.flatMap(([, table]) => tableCells(table));
    const table = { unit: tables[0]?.[1]?.unit || 'sessions_per_1000_selected_sessions', cells: sourceCells };
    const topics = [...new Set([...topicCodes, ...tables.map(([key]) => key.slice('topic_month_rates.'.length))])].sort();
    const grid = buildHeatmap(timeline, topics, 24);
    const months = [...new Set(grid.map((cell) => cell.month))];
    const byCell = new Map(grid.map((cell) => [`${cell.topic}|${cell.month}`, cell.cell]));
    const max = Math.max(1, ...sourceCells.filter((cell) => !cell.suppressed && cell.value != null).map((cell) => Number(cell.value)));
    return { table, topics, months, byCell, max };
  }, [timeline, topicCodes]);
  const topics = rowDirection === 'asc' ? model.topics : [...model.topics].reverse();
  const months = columnDirection === 'asc' ? model.months : [...model.months].reverse();
  const cells = tableCells(model.table);
  const tooltip = useHover();
  const focusCell = (topicIndex, monthIndex) => Array.from(document.querySelectorAll('[data-heatmap-cell]'))
    .find((element) => element.dataset.heatmapCell === `${topics[topicIndex]}|${months[monthIndex]}`)?.focus();
  const scenarioMonths = heatmapScenarioMonths(scenarioVersions);
  const scope = cohortScope(filters);
  return <ChartFrame title={`${scope} topic × month rate map`} table={model.table} columns={['topic_code', 'month']} onSelect={onSelect} subtitle={`${scope} distinct-session topic-tag rates per 1,000 selected sessions. Topic rows can overlap; suppressed cells are hidden.`}>
    <div className="heatmap-tooltip-slot" aria-live="polite"><Tooltip id="heatmap-tooltip" open={active != null}>
      {active?.cell?.suppressed || active?.cell?.value == null ? 'Insufficient group size' : <><strong>{labelCode(active.topic)} · {active.month}</strong><br />{formatCell(active.cell, model.table.unit)}<br />{active.cell.numerator ?? '—'} / {active.cell.denominator ?? '—'} sessions{active.cell.distinct_sessions != null ? ` · ${active.cell.distinct_sessions} distinct sessions` : ''}</>}
    </Tooltip></div>
    <div className="heatmap-controls" role="group" aria-label="Sort heatmap headings">
      <button type="button" aria-label={`Sort topics ${rowDirection === 'asc' ? 'descending' : 'ascending'}`} onClick={() => setRowDirection(rowDirection === 'asc' ? 'desc' : 'asc')}>Topics {rowDirection === 'asc' ? 'A–Z' : 'Z–A'}</button>
      <button type="button" aria-label={`Sort months ${columnDirection === 'asc' ? 'descending' : 'ascending'}`} onClick={() => setColumnDirection(columnDirection === 'asc' ? 'desc' : 'asc')}>Months {columnDirection === 'asc' ? 'oldest first' : 'newest first'}</button>
    </div>
    <div className="heatmap-scroll" role="grid" aria-label={`Topic by month ${scope.toLowerCase()} rate map`}>
      <div className="heatmap-grid" style={{ '--month-count': months.length }}>
        <div className="heatmap-corner" role="columnheader">Topic / month</div>
        {months.map((month, columnIndex) => <div className="heatmap-month-heading" role="columnheader" key={month} style={{ gridColumn: columnIndex + 2, gridRow: 1 }}>{month.slice(2)}</div>)}
        {topics.map((topic, rowIndex) => <React.Fragment key={topic}>
          <button type="button" role="rowheader" className={`heatmap-topic-heading${selectedTopic === topic ? ' is-selected' : ''}`} style={{ gridColumn: 1, gridRow: rowIndex + 2 }} onClick={() => onSelect?.('topic_code', topic)}>{labelCode(topic)}</button>
          {months.map((month, columnIndex) => {
            const cell = model.byCell.get(`${topic}|${month}`) || null;
            const hidden = !cell || cell.suppressed || cell.value == null;
            const value = hidden ? 0 : Number(cell.value);
            const ratio = value / model.max;
            const scenario = scenarioMonths.has(month);
            const key = `${topic}|${month}`;
            const selected = active?.key === key;
            return <button key={key} type="button" role="gridcell" data-heatmap-cell={key} tabIndex={rowIndex === 0 && columnIndex === 0 ? 0 : -1}
              aria-label={`${labelCode(topic)}, ${month}: ${hidden ? 'Insufficient group size' : `${formatCell(cell, model.table.unit)}; ${cell.numerator ?? '—'} / ${cell.denominator ?? '—'} sessions`}${scenario ? ', artificial scenario month' : ''}`}
              aria-describedby={selected ? 'heatmap-tooltip' : undefined}
              className={`heatmap-cell${hidden ? ' is-suppressed' : ''}${selectedTopic === topic ? ' topic-selected' : ''}${scenario ? ' is-scenario' : ''}`}
              style={{ gridColumn: columnIndex + 2, gridRow: rowIndex + 2, '--cell-alpha': hidden ? 0 : 0.12 + ratio * 0.76 }}
              onMouseEnter={() => { setActive({ key, topic, month, cell }); tooltip.show(); }} onMouseLeave={() => { setActive(null); tooltip.hide(); }}
              onFocus={() => { setActive({ key, topic, month, cell }); tooltip.show(); }} onBlur={() => { setActive(null); tooltip.hide(); }}
              onKeyDown={(event) => {
                const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
                if (move) { event.preventDefault(); focusCell(Math.max(0, Math.min(topics.length - 1, rowIndex + move[0])), Math.max(0, Math.min(months.length - 1, columnIndex + move[1]))); }
                if ((event.key === 'Enter' || event.key === ' ') && !hidden) { event.preventDefault(); onSelect?.('topic_code', topic); }
              }}
              onClick={() => { if (!hidden) onSelect?.('topic_code', topic); }}>
              {hidden && <span className="sr-only">Insufficient group size</span>}
            </button>;
          })}
        </React.Fragment>)}
      </div>
    </div>
    <div className="heatmap-legend"><span>Lower rate</span><i className="heatmap-legend-ramp" aria-hidden="true" /><span>Higher rate</span><span className="heatmap-legend-suppressed">Insufficient group size</span></div>
    <p className="chart-description">Keyboard: arrow keys move between month cells; Enter or Space applies the topic filter. Each topic is read from its own API table; totals are never joined across overlapping topics.</p>
  </ChartFrame>;
}
