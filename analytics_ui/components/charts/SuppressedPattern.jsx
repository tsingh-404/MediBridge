import React from 'react';
import { SUPPRESSED_LABEL, suppressedPatternSpec } from './SuppressedPattern.js';

export function SuppressedPattern({ id = 'cell', width = 120, height = 36 }) {
  const spec = suppressedPatternSpec(id);
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={SUPPRESSED_LABEL}>
    <defs><pattern id={spec.patternId} width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill={spec.backgroundFill} />
      <path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" fill="none" stroke="currentColor" strokeWidth="0.75" />
    </pattern></defs>
    <rect width="100%" height="100%" fill={spec.fill} />
    <text x="6" y={height / 2} dominantBaseline="middle">{SUPPRESSED_LABEL}</text>
  </svg>;
}
