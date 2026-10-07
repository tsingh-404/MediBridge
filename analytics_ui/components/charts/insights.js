import { labelCode } from '../data.js';

const DISALLOWED = /diagnosis|outbreak|prevalence|market\s*share/i;

export function findingTitle(code, direction = 'steady') {
  const input = String(code || 'selected_topic');
  const searchable = input.replace(/[_-]+/g, ' ');
  const safeLabel = DISALLOWED.test(searchable) ? 'Selected topic' : labelCode(input);
  if (direction === 'increase') return `${safeLabel} questions increased in the selected sessions`;
  if (direction === 'decrease') return `${safeLabel} questions decreased in the selected sessions`;
  return `${safeLabel} questions appeared at a similar level in the selected sessions`;
}
