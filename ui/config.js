// Runtime configuration. Loaded before api.js, never compiled or minified.
//
// Web (served by FastAPI at /): same-origin, apiBase stays ''.
// Mobile: mobile/scripts/prepare-www.mjs overwrites this file in www/ with the
// deployed API origin taken from $MB_API_BASE.
window.MB_CONFIG = window.MB_CONFIG || { apiBase: '' };
