// MediBridge frontend ↔ FastAPI client.
// Web: same-origin (uvicorn mounts the SPA at /). Mobile: MB_CONFIG.apiBase points
// at the deployed API, so every request becomes cross-origin — see the CORS
// middleware in src/medibridge/server/main.py.

(function () {
  const API_BASE = (window.MB_CONFIG && window.MB_CONFIG.apiBase) || '';

  // Per-install identity. Not auth — just a stable opaque id so each device gets
  // its own profile row instead of everyone sharing user_profile id=1.
  // Requests without this header fall back to the legacy shared profile.
  let _deviceId = null;
  function deviceId() {
    if (_deviceId) return _deviceId;
    try { _deviceId = localStorage.getItem('mb_device_id'); } catch {}
    if (!_deviceId) {
      _deviceId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'mb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      // May throw in a WebView with site data blocked; the id then lasts one session.
      try { localStorage.setItem('mb_device_id', _deviceId); } catch {}
    }
    return _deviceId;
  }

  function isNativeApp() {
    return !!(window.MBNative && window.MBNative.isNative && window.MBNative.isNative());
  }

  function headers(json) {
    const h = {};
    if (isNativeApp()) h['X-MB-Device'] = deviceId();
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async function _request(method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail || ''; } catch {}
      const err = new Error(`HTTP ${res.status} ${res.statusText}${detail ? '. ' + detail : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function qs(params) {
    const usp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') usp.set(k, v);
    });
    const s = usp.toString();
    return s ? '?' + s : '';
  }

  // SSE over POST: parse `event:` / `data:` framed lines from a streaming response body.
  // Deliberately fetch + ReadableStream, not EventSource (GET-only) and not
  // CapacitorHttp (its native fetch buffers the whole body and breaks streaming).
  // `signal` lets the UI cancel a run; an abort resolves quietly, without onError.
  async function chatStream({ message, history, signal }, callbacks) {
    const { onToolCall, onToolResult, onMessage, onDone, onError } = callbacks || {};
    const aborted = () => signal && signal.aborted;
    let res;
    try {
      res = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { ...headers(true), 'Accept': 'text/event-stream' },
        body: JSON.stringify({ message, history: history || [] }),
        signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      onError && onError(e);
      throw e;
    }
    if (!res.ok || !res.body) {
      const err = new Error(`Chat HTTP ${res.status}`);
      onError && onError(err);
      throw err;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let curEvent = 'message';
    let curData = '';

    const flush = () => {
      if (!curData) { curEvent = 'message'; return; }
      let parsed;
      try { parsed = JSON.parse(curData); } catch { parsed = { raw: curData }; }
      if (curEvent === 'tool_call') onToolCall && onToolCall(parsed);
      else if (curEvent === 'tool_result') onToolResult && onToolResult(parsed);
      else if (curEvent === 'assistant_message') onMessage && onMessage(parsed);
      else if (curEvent === 'done') onDone && onDone();
      else if (curEvent === 'error') onError && onError(new Error(parsed.message || 'Stream error'));
      curEvent = 'message';
      curData = '';
    };

    while (true) {
      let value, done;
      try {
        ({ value, done } = await reader.read());
      } catch (e) {
        if (aborted() || (e && e.name === 'AbortError')) return;
        onError && onError(e);
        return;
      }
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line === '') { flush(); continue; }
        if (line.startsWith(':')) continue; // comment
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') curEvent = value;
        else if (field === 'data') curData += (curData ? '\n' : '') + value;
      }
    }
    flush();
  }

  window.api = {
    getInsurers: () => _request('GET', '/api/insurers'),
    getProfile: async () => {
      try { return await _request('GET', '/api/profile'); }
      catch (e) { if (e.status === 404) return null; throw e; }
    },
    saveProfile: (payload) => _request('PUT', '/api/profile', payload),
    deleteProfile: () => _request('DELETE', '/api/profile'),
    coverage: (item_num, setting) => _request('POST', '/api/coverage', { item_num, setting }),
    searchMbs: (q, limit = 8) => _request('GET', '/api/mbs/search' + qs({ q, limit })),
    getMbs: (item_num) => _request('GET', '/api/mbs/' + encodeURIComponent(item_num)),
    searchClinics: ({ postcode, suburb, type, billing } = {}) =>
      _request('GET', '/api/clinics' + qs({ postcode, suburb, type, billing })),
    clinicTypes: () => _request('GET', '/api/clinics/types'),
    clinicBilling: () => _request('GET', '/api/clinics/billing'),
    chatStream,
  };
})();
