// MediBridge design tokens.
//
// Every value resolves to a CSS custom property declared in the :root block of
// index.html, which pairs an sRGB hex fallback with the oklch() original. This
// object exists so the inline styles left in the screens read from the same
// source as ui/styles.css — component-level styling belongs in the stylesheet.
window.MB = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surfaceMuted: 'var(--surface-muted)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  ink: 'var(--ink)',
  inkMuted: 'var(--ink-muted)',
  inkSubtle: 'var(--ink-subtle)',

  // One accent. accentStrong is the only teal that carries white text.
  accent: 'var(--accent)',
  accentStrong: 'var(--accent-strong)',
  accentSoft: 'var(--accent-soft)',
  accentInk: 'var(--accent-ink)',

  // Semantic only. The -Ink variants are the text-safe pair for each fill.
  ok: 'var(--ok)',
  okInk: 'var(--ok-ink)',
  okSoft: 'var(--ok-soft)',
  warn: 'var(--warn)',
  warnInk: 'var(--warn-ink)',
  warnSoft: 'var(--warn-soft)',
  bad: 'var(--bad)',
  badInk: 'var(--bad-ink)',
  badSoft: 'var(--bad-soft)',

  display: 'var(--font-display)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',

  shadow: 'var(--shadow-1)',
  ease: 'var(--ease)',
  durationFast: 'var(--dur-fast)',
  duration: 'var(--dur)',

  rChip: 8, rControl: 12, rSheet: 16, rPill: 999,
};
