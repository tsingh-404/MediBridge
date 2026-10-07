import React from 'react';

export function Tooltip({ id, open, children }) {
  if (!open) return null;
  return <div id={id} role="tooltip" className="chart-tooltip">{children}</div>;
}
