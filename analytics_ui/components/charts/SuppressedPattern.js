export const SUPPRESSED_LABEL = 'Insufficient group size';

export function suppressedPatternSpec(id = 'cell') {
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
  const patternId = `suppressed-${safeId}`;
  return {
    patternId,
    fill: `url(#${patternId})`,
    patternElement: `<pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" /></pattern>`,
    backgroundFill: 'var(--surface-subtle)',
    label: SUPPRESSED_LABEL,
    value: null,
  };
}
