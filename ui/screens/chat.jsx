// Chat / Ask MediBridge — streams SSE events from /api/chat.
function Chat({ profile }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', kind: 'intro' }]);
  const [streaming, setStreaming] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef(null);
  const historyRef = useRef([]);
  const abortRef = useRef(null);
  // BottomNav hides itself while the keyboard is open, so the 80px it normally
  // occupies must come back off the composer padding.
  const keyboardOpen = useKeyboardOpen();

  // Cancel any in-flight stream when the screen unmounts (tab switch, back button).
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const stop = () => { if (abortRef.current) abortRef.current.abort(); };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    setShowJump(dist > 220);
  };
  const jumpBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const send = async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || streaming) return;
    setInput('');

    const userMsg = { role: 'user', text: trimmed };
    const pending = { role: 'assistant', kind: 'answer', thinking: [], text: '', pending: true };
    const historySnapshot = historyRef.current.slice();

    setMessages(ms => [...ms, userMsg, pending]);
    historyRef.current.push({ role: 'user', content: trimmed });
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const replacePending = (mut) => {
      setMessages(ms => {
        const out = ms.slice();
        for (let i = out.length - 1; i >= 0; i--) {
          if (out[i] === pending || (out[i].pending && out[i].role === 'assistant')) {
            const next = { ...out[i], ...mut(out[i]) };
            out[i] = next;
            Object.assign(pending, next);
            return out;
          }
        }
        return out;
      });
    };

    try {
      await api.chatStream(
        { message: trimmed, history: historySnapshot, signal: controller.signal },
        {
          onToolCall: (ev) => replacePending(p => ({
            thinking: [...(p.thinking || []), {
              id: ev.id, tool: ev.tool,
              args: typeof ev.args === 'object' ? JSON.stringify(ev.args) : String(ev.args ?? ''),
              result: null,
            }],
          })),
          onToolResult: (ev) => replacePending(p => ({
            thinking: (p.thinking || []).map(t =>
              (ev.id && t.id === ev.id) || (!ev.id && t.tool === ev.tool && t.result == null)
                ? { ...t, result: ev.result_preview }
                : t
            ),
          })),
          onMessage: (ev) => replacePending(_ => ({ text: ev.text })),
          onDone: () => {
            replacePending(_ => ({ pending: false }));
            historyRef.current.push({ role: 'assistant', content: pending.text || '' });
          },
          onError: (err) => replacePending(_ => ({
            pending: false,
            text: `Sorry — ${err.message || 'something went wrong'}.`,
          })),
        }
      );
    } catch (e) {
      // surfaced via onError
    } finally {
      if (controller.signal.aborted) {
        replacePending(_ => ({ pending: false, text: pending.text || 'Stopped.' }));
      }
      abortRef.current = null;
      setStreaming(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: MB.bg }}>
      <Header
        title="Ask MediBridge"
        subtitle={`${profile.insurer.name} · ${profile.tier.name}`}
        right={<Tag kind="ok" size="xs">Live</Tag>}
      />

      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflow: 'auto', padding: '16px 16px 16px', position: 'relative' }}>
        {messages.map((m, i) => <Message key={i} m={m} profile={profile} onFollowup={send} />)}
      </div>
      {showJump && (
        <button onClick={jumpBottom} style={{
          position: 'absolute', right: 16, bottom: 162, zIndex: 18,
          width: 42, height: 42, borderRadius: 999, border: `1px solid ${MB.border}`,
          background: MB.surface, boxShadow: MB.shadowMd, color: MB.ink, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon.arrow style={{ transform: 'rotate(90deg)' }} /></button>
      )}

      <div style={{
        padding: keyboardOpen
          ? '10px 14px calc(env(safe-area-inset-bottom, 0px) + 10px)'
          : '10px 14px calc(env(safe-area-inset-bottom, 0px) + 80px)',
        borderTop: `1px solid ${MB.border}`, background: MB.surface,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: MB.surfaceMuted, borderRadius: 22, padding: '6px 6px 6px 16px',
          border: `1px solid ${MB.border}`,
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(input); }}
            placeholder={streaming ? 'Thinking…' : 'Ask about cover, items, costs…'}
            disabled={streaming}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: MB.sans, fontSize: 16, color: MB.ink, padding: '10px 0',
            }}
          />
          <button
            onClick={() => (streaming ? stop() : send(input))}
            disabled={!streaming && !input.trim()}
            aria-label={streaming ? 'Stop generating' : 'Send'}
            style={{
              width: 36, height: 36, borderRadius: 99,
              background: streaming || input.trim() ? MB.ink : MB.borderStrong,
              color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: `background ${MB.durationFast} ${MB.ease}`,
            }}>{streaming ? <Icon.x /> : <Icon.send />}</button>
        </div>
      </div>
    </div>
  );
}

function Message({ m, profile, onFollowup }) {
  const renderRich = (raw) => {
    if (!raw) return '';
    let html = raw
      // inline code & links first so emphasis can't clobber their contents
      .replace(/`([^`]+)`/g, '<code style="font-family:var(--mono,monospace);background:rgba(20,20,20,0.06);padding:1px 4px;border-radius:4px;">$1</code>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
      // bold before italic so the ** pair is consumed first
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
    // block-level, line-anchored — before newline→<br/>
    html = html
      .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:14px;font-weight:650;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 5px;font-size:15.5px;font-weight:700;">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 style="margin:14px 0 6px;font-size:17px;font-weight:700;">$1</h2>')
      .replace(/^\s*(?:---|\*\*\*)\s*$/gm, '<hr style="border:none;border-top:1px solid rgba(20,20,20,0.12);margin:10px 0;"/>')
      .replace(/^(\d+)\. (.+)$/gm, '<span style="display:inline-block;">$1. $2</span>')
      .replace(/^- (.+)$/gm, '• $1');
    // drop the newline that follows a block element to avoid a double gap
    html = html.replace(/(<\/h[2-4]>|<hr[^>]*\/>)\n/g, '$1');
    return html.replace(/\n/g, '<br/>');
  };

  if (m.kind === 'intro') {
    return (
      <div style={{ marginBottom: 16, animation: `fadeInUp ${MB.durationFast} ${MB.ease}` }}>
        <div style={{
          background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: 18, padding: 18, boxShadow: MB.shadow,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8, background: MB.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
            </div>
            <div style={{ fontFamily: MB.sans, fontSize: 14, fontWeight: 650, color: MB.ink }}>MediBridge</div>
          </div>
          <div style={{ fontFamily: MB.sans, fontSize: 15, color: MB.ink, lineHeight: 1.5 }}>
            G'day. I help international students figure out OSHC cover, MBS items, and out‑of‑pocket costs. Ask me anything in plain English.
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'How much does a GP visit cost?',
              "What's the gap on a specialist?",
              'Am I covered for pregnancy yet?',
              'Is dental covered by OSHC?',
            ].map(s => (
              <button key={s} onClick={() => onFollowup(s)} style={{
                background: MB.surfaceMuted, border: `1px solid ${MB.border}`,
                borderRadius: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                fontFamily: MB.sans, fontSize: 13.5, color: MB.ink,
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: MB.shadow,
                transition: `all ${MB.durationFast} ${MB.ease}`,
              }}>
                <Icon.spark style={{ color: MB.accent, flexShrink: 0 }} />
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          maxWidth: '82%', background: MB.ink, color: '#fff',
          padding: '10px 14px', borderRadius: '18px 18px 4px 18px',
          fontFamily: MB.sans, fontSize: 14.5, lineHeight: 1.45,
          animation: `fadeInUp ${MB.durationFast} ${MB.ease}`,
        }}>{m.text}</div>
      </div>
    );
  }
  const thinking = m.thinking || [];
  const text = m.text || '';
  return (
    <div style={{ marginBottom: 18, animation: `fadeInUp ${MB.durationFast} ${MB.ease}` }}>
      {thinking.length > 0 && (
        <details style={{ marginBottom: 8 }} open={!!m.pending}>
          <summary style={{
            cursor: 'pointer', listStyle: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle,
            background: MB.accentSoft, padding: '4px 10px', borderRadius: 99,
            border: `1px solid ${MB.border}`,
          }}>
            <Icon.spark style={{ color: MB.accent }} />
            <span>{m.pending ? 'Using' : 'Used'} {thinking.length} tool{thinking.length > 1 ? 's' : ''}</span>
          </summary>
          <div style={{ marginTop: 6, paddingLeft: 4 }}>
            {thinking.map((t, i) => (
              <div key={i} style={{
                fontFamily: MB.mono, fontSize: 11, color: MB.inkMuted,
                padding: '6px 10px', background: MB.gradientSoft,
                borderLeft: `2px solid ${MB.accent}`, marginBottom: 4,
                borderRadius: '0 6px 6px 0', lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                <div><span style={{ color: MB.accentInk, fontWeight: 600 }}>{t.tool}</span>({t.args})</div>
                <div style={{ color: MB.inkSubtle, marginTop: 2 }}>→ {t.result == null ? 'running…' : t.result}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {(text || m.pending) && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: MB.gradientHero, color: MB.accentInk, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4,
          }}><Icon.spark /></div>
          <div
            style={{
              background: MB.surface, border: `1px solid ${MB.border}`, borderRadius: '18px 18px 18px 4px',
              padding: '12px 14px', fontFamily: MB.sans, fontSize: 14.5, color: MB.ink, lineHeight: 1.5, flex: 1, minWidth: 0,
            }}
            dangerouslySetInnerHTML={{
              __html: text
                ? renderRich(text)
                : '<span style="display:inline-flex;align-items:center;gap:4px;color:#8893A0"><span style="width:6px;height:6px;border-radius:999px;background:#8893A0;animation:pulse 1s ease-in-out infinite"></span><span style="width:6px;height:6px;border-radius:999px;background:#8893A0;animation:pulse 1s .15s ease-in-out infinite"></span><span style="width:6px;height:6px;border-radius:999px;background:#8893A0;animation:pulse 1s .3s ease-in-out infinite"></span></span>',
            }}
          />
        </div>
      )}
    </div>
  );
}

window.Chat = Chat;
