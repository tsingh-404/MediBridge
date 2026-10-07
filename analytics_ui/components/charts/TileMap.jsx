import React from 'react';
import { ChartFrame } from './ChartFrame.jsx';
import { QLD_MAP_LABEL, QLD_TILE_LAYOUT } from './qldTiles.js';
import { formatCell } from '../data.js';

export function TileMap({ table, values = [], metric = 'sessions', onMetricChange, selectedRegion, onSelect }) {
  const byRegion = new Map(values.map((entry) => [entry.region, entry]));
  const visible = values.filter(({ value, suppressed }) => !suppressed && Number.isFinite(value));
  const max = Math.max(1, ...visible.map(({ value }) => value));
  const unit = metric.endsWith('rate') ? 'sessions_per_1000_region_sessions' : 'sessions';
  const displayTable = { ...table, unit, cells: values.map(({ region, ...cell }) => ({ dimensions: { region }, ...cell })) };
  return <ChartFrame title="Synthetic sessions by broad region" subtitle={`${QLD_MAP_LABEL}. Unknown geography remains selectable off-map.`} table={displayTable} columns={['region']} onSelect={onSelect}>
    <div className="geography-metric-switch" role="group" aria-label="Region metric">
      <button type="button" aria-pressed={metric === 'sessions'} onClick={() => onMetricChange('sessions')}>Sessions</button>
      <button type="button" aria-pressed={metric === 'topic-rate'} onClick={() => onMetricChange('topic-rate')}>Selected topic rate</button>
      <button type="button" aria-pressed={metric === 'service-rate'} onClick={() => onMetricChange('service-rate')}>Selected service rate</button>
    </div>
    <div className="qld-tile-map" role="group" aria-label={QLD_MAP_LABEL}>
      {QLD_TILE_LAYOUT.map((tile) => {
        const region = tile.regionCodes?.[0] || 'unknown';
        const cell = byRegion.get(region);
        const hidden = !cell || cell.suppressed || cell.value == null;
        const status = cell?.suppressed ? 'Insufficient group size' : 'No matching sessions';
        const value = hidden ? null : Number(cell.value);
        return <button key={tile.label} type="button" className={`qld-tile${tile.offMap ? ' is-off-map' : ''}${selectedRegion === region ? ' is-selected' : ''}${hidden ? ' is-empty' : ''}`}
          style={{ gridColumn: tile.x + 1, gridRow: tile.y + 1, '--tile-alpha': hidden ? 0.08 : 0.12 + (value / max) * 0.7 }}
          aria-label={`${tile.label}: ${hidden ? status : formatCell(cell, unit)}${tile.offMap ? ', unknown geography, shown off-map' : ''}`}
          onClick={() => onSelect?.('region', region)}>
          <span>{tile.label}</span><strong>{hidden ? '—' : formatCell(cell, unit)}</strong>
        </button>;
      })}
    </div>
    <p className="chart-description">Schematic tiles do not represent boundaries, distance, population, service coverage, or residence. Unknown geography is shown separately off-map.</p>
  </ChartFrame>;
}
