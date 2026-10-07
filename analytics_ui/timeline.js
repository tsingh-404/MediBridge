export function brushRange(first, last, count) {
  const size = Math.max(0, Math.floor(Number(count) || 0));
  if (!size) return { start: 0, end: -1 };
  const clamp = (value) => Math.min(size - 1, Math.max(0, Math.floor(Number(value) || 0)));
  const a = clamp(first);
  const b = clamp(last);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function brushRangeFromKeys(range, key, count) {
  const current = brushRange(range.start, range.end, count);
  const size = Math.max(0, Math.floor(Number(count) || 0));
  if (!size || !['ArrowLeft', 'ArrowRight'].includes(key)) return current;
  const delta = key === 'ArrowRight' ? 1 : -1;
  const width = current.end - current.start;
  const start = Math.min(size - width - 1, Math.max(0, current.start + delta));
  return { start, end: start + width };
}
