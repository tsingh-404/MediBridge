// analytics_ui sits beside mobile rather than under its npm package root.
// Resolve the locked d3 ESM entry points here so direct root-level Node tests
// and the esbuild dashboard bundle use the same installed modules.
import { scaleLinear, scaleTime } from '../../../mobile/node_modules/d3-scale/src/index.js';
import { extent, ticks as d3Ticks } from '../../../mobile/node_modules/d3-array/src/index.js';
import { line as d3Line } from '../../../mobile/node_modules/d3-shape/src/index.js';
import { interpolateNumber } from '../../../mobile/node_modules/d3-interpolate/src/index.js';

const NICE_TICK_COUNT = 5;

export function niceTicks(domain, count = NICE_TICK_COUNT) {
  const [minimum, maximum] = domain;
  if (!Number.isFinite(Number(minimum)) || !Number.isFinite(Number(maximum))) return [];
  const low = Math.min(Number(minimum), Number(maximum));
  const high = Math.max(Number(minimum), Number(maximum));
  if (low === high) {
    const padding = Math.abs(low) * 0.05 || 0.5;
    return d3Ticks(low - padding, high + padding, Math.min(6, Math.max(4, Math.floor(count))));
  }
  return d3Ticks(low, high, Math.min(6, Math.max(4, Math.floor(count))));
}

export function createLinearScale(domain, range, tickCount = NICE_TICK_COUNT) {
  let normalized = domain.map(Number);
  if (normalized[0] === normalized[1]) normalized = [normalized[0] - 0.5, normalized[1] + 0.5];
  const scale = scaleLinear().domain(normalized).range(range);
  const niceDomain = scale.copy().nice().domain();
  return { scale, ticks: niceTicks(niceDomain, tickCount) };
}

export function createTimeScale(values, range) {
  const dates = values.map((value) => value instanceof Date ? value : new Date(value));
  const [minimum, maximum] = extent(dates);
  const scale = scaleTime().domain(minimum && maximum ? [minimum, maximum] : [new Date(0), new Date(0)]).range(range);
  return { scale, ticks: scale.ticks(5) };
}

export function linePath(points, x = (point) => point.x, y = (point) => point.y) {
  return d3Line().x(x).y(y)(points);
}

export function interpolateValue(start, end, amount) {
  return interpolateNumber(Number(start), Number(end))(Math.max(0, Math.min(1, Number(amount))));
}

export function axisTitle(unit = '') {
  if (unit.includes('per_1000')) return 'Sessions x per 1,000 selected sessions';
  return unit.replaceAll('_', ' ').trim();
}
