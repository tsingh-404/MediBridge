import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createLinearScale, axisTitle, linePath, interpolateValue } from '../../analytics_ui/components/charts/scales.js';
import { formatCompactValue, formatRateTick, formatMonth } from '../../analytics_ui/components/charts/format.js';
import { findingTitle } from '../../analytics_ui/components/charts/insights.js';
import { QLD_TILE_LAYOUT, QLD_MAP_LABEL } from '../../analytics_ui/components/charts/qldTiles.js';
import { suppressedPatternSpec } from '../../analytics_ui/components/charts/SuppressedPattern.js';

test('linear scale exposes four to six nice ticks over the requested extent', () => {
  const { scale, ticks } = createLinearScale([2.3, 38.4], [0, 300]);
  assert.equal(scale(2.3), 0);
  assert.equal(scale(38.4), 300);
  assert.ok(ticks.length >= 4 && ticks.length <= 6);
  assert.ok(ticks.every((tick, index) => index === 0 || tick > ticks[index - 1]));
  assert.match(axisTitle('topic_sessions_per_1000'), /per 1,000/);
});

test('line geometry and numeric interpolation are computed without a DOM', () => {
  assert.equal(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }]), 'M0,1L2,3');
  assert.equal(interpolateValue(10, 30, 0.25), 15);
});

test('chart formatters use compact values and the shared cell formatter for rates', () => {
  assert.equal(formatCompactValue(12500), '12.5k');
  assert.equal(formatRateTick(2.35), '2.4 / 1,000');
  assert.equal(formatMonth('2025-01'), 'Jan 2025');
});

test('generated finding titles use neutral wording and avoid prohibited claims', () => {
  for (const direction of ['increase', 'decrease', 'steady']) {
    const title = findingTitle('respiratory_information', direction);
    assert.match(title, /selected sessions/i);
    assert.doesNotMatch(title, /diagnosis|outbreak|prevalence|market share/i);
  }
  assert.doesNotMatch(findingTitle('diagnosis_outbreak', 'increase'), /diagnosis|outbreak|prevalence|market share/i);
  assert.doesNotMatch(findingTitle('market_share', 'increase'), /diagnosis|outbreak|prevalence|market share/i);
});

test('Queensland schematic has eight known region tiles and Unknown off-map', () => {
  assert.equal(QLD_TILE_LAYOUT.length, 9);
  assert.equal(QLD_TILE_LAYOUT.filter((tile) => tile.code === 'unknown').length, 1);
  assert.equal(QLD_TILE_LAYOUT.find((tile) => tile.code === 'unknown').offMap, true);
  assert.deepEqual(QLD_TILE_LAYOUT.flatMap((tile) => tile.regionCodes || []).sort(), [
    'Brisbane', 'Central Queensland', 'Darling Downs', 'Far North Queensland',
    'Gold Coast', 'North Queensland', 'Sunshine Coast', 'Wide Bay',
  ]);
  assert.equal(QLD_TILE_LAYOUT.filter((tile) => !tile.offMap).length, 8);
  assert.match(QLD_MAP_LABEL, /schematic/i);
  assert.ok(QLD_TILE_LAYOUT.every((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y)));
});

test('suppression pattern defines a filled hatch and explicit protected-value label', () => {
  const spec = suppressedPatternSpec('cell-a');
  assert.equal(spec.patternId, 'suppressed-cell-a');
  assert.match(spec.fill, /url\(#suppressed-cell-a\)/);
  assert.match(spec.patternElement, /<pattern/);
  assert.match(spec.patternElement, /<path/);
  assert.equal(spec.backgroundFill, 'var(--surface-subtle)');
  assert.equal(spec.label, 'Insufficient group size');
  assert.equal(spec.value, null);
});

test('suppression SVG renders the shared hatch with an accessible label, without a numeric value', async () => {
  const component = await readFile(new URL('../../analytics_ui/components/charts/SuppressedPattern.jsx', import.meta.url), 'utf8');
  assert.match(component, /aria-label=\{SUPPRESSED_LABEL\}/);
  assert.match(component, /fill=\{spec\.fill\}/);
  assert.match(component, /<text[^>]*>\{SUPPRESSED_LABEL\}<\/text>/);
  assert.doesNotMatch(component, /<text[^>]*>\{[^}]*value[^}]*\}<\/text>/i);
});

test('dashboard shell and loading fallback use the required synthetic disclosure', async () => {
  const [shell, fallback] = await Promise.all([
    readFile(new URL('../../analytics_ui/app.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../analytics_ui/index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(shell, /Synthetic demo: not real student data/);
  assert.match(fallback, /Synthetic demo: not real student data/);
});

test('dashboard foundation uses General Sans values without a monospace KPI font', async () => {
  const styles = await readFile(new URL('../../analytics_ui/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /JetBrains Mono/);
  assert.match(styles, /font-variant-numeric:proportional-nums/);
  assert.match(styles, /th,td\{[^}]*font-variant-numeric:tabular-nums/);
});
