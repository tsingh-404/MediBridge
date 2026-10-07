import React from 'react';
import { formatCell } from './data.js';

export function MetricCard({ title, table, description, denominatorLabel }) {
  const cell = table?.cells?.[0];
  const value = table?.value ?? cell?.value;
  const numerator = table?.numerator ?? cell?.numerator;
  const denominator = table?.denominator ?? cell?.denominator;
  const displayed = formatCell({ value, suppressed: table?.suppressed || cell?.suppressed }, table?.unit || '');
  return (
    <article className="metric-card" aria-label={`${title}: ${displayed}`}>
      <p className="eyebrow">{title}</p>
      <p className="metric-value">{displayed}</p>
      <p className="metric-unit">{table?.unit?.replaceAll('_', ' ') || 'aggregate measure'}</p>
      {denominator !== null && denominator !== undefined && <p className="metric-denominator">{numerator ?? '—'} / {denominator}</p>}
      {denominatorLabel && <p className="metric-denominator">{denominatorLabel}</p>}
      {table?.unit === 'question_turns' && cell?.distinct_sessions !== undefined && <p className="metric-denominator">Across {cell.distinct_sessions} supporting sessions</p>}
      {description && <p className="muted metric-description">{description}</p>}
    </article>
  );
}
