export function linkedSelectionReducer(state = {}, action = {}) {
  if (action.type === 'select' && typeof action.field === 'string' && typeof action.value === 'string' && action.value) {
    const next = { ...state };
    delete next[action.field];
    next[action.field] = action.value;
    return next;
  }
  if (action.type === 'clear' && action.field) {
    const next = { ...state };
    delete next[action.field];
    return next;
  }
  if (action.type === 'clear_last') {
    const last = Object.keys(state).at(-1);
    if (!last) return state;
    const next = { ...state };
    delete next[last];
    return next;
  }
  if (action.type === 'clear_all') return {};
  return state;
}
