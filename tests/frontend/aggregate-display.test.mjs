import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCell, sortCells, tableState } from '../../analytics_ui/components/data.js';

test('formatCell renders suppressed nulls as a label rather than zero', () => {
  assert.equal(formatCell({ value: null, suppressed: true }, 'sessions'), 'Insufficient group size');
});

test('formatCell formats shares as percentages and per-thousand rates with one decimal', () => {
  assert.equal(formatCell({ value: 0.125 }, 'share'), '12.5%');
  assert.equal(formatCell({ value: 82.347 }, 'topic_sessions_per_1000_selected_sessions'), '82.3 / 1,000');
});

test('sortCells keeps suppressed cells last in both sort directions', () => {
  const cells = [
    { value: 8, dimensions: { topic_code: 'b' } },
    { value: null, suppressed: true, dimensions: { topic_code: 'hidden' } },
    { value: 2, dimensions: { topic_code: 'a' } },
  ];

  assert.deepEqual(sortCells(cells, 'value', 'asc').map((cell) => cell.dimensions.topic_code), ['a', 'b', 'hidden']);
  assert.deepEqual(sortCells(cells, 'value', 'desc').map((cell) => cell.dimensions.topic_code), ['b', 'a', 'hidden']);
});

test('tableState distinguishes available, empty, and fully suppressed responses', () => {
  assert.equal(tableState({ data_state: 'available' }), 'available');
  assert.equal(tableState({ data_state: 'no_data', no_data: true }), 'no_data');
  assert.equal(tableState({ data_state: 'suppressed', suppressed: true }), 'suppressed');
});
