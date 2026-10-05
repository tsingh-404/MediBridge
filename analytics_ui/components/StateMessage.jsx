import React from 'react';
import { tableState } from './data.js';

export function StateMessage({ table, title = 'Aggregate result' }) {
  const state = tableState(table);
  if (state === 'available') return null;
  const message = state === 'suppressed'
    ? 'Insufficient group size. Values in this table are hidden; they are not zero.'
    : state === 'partially_suppressed'
      ? 'Some values are hidden for insufficient group size. The remaining aggregate values are available; hidden values are not zero.'
    : state === 'no_data'
      ? 'No matching sessions for these filters. A valid zero is different from a missing or suppressed result.'
      : 'This aggregate table is unavailable.';
  return <aside className={`state-message state-${state}`} role="status"><strong>{title}</strong><p>{message}</p></aside>;
}
