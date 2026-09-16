// Chat / Ask MediBridge — streams SSE events from /api/chat.
const CHAT_SUGGESTIONS = [
  'How much does a GP visit cost?',
  "What's the gap on a specialist?",
  'Am I covered for pregnancy yet?',
  'Is dental covered by OSHC?',
];

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
            failed: true,
            text: err.message
              ? `That request failed: ${err.message}. Try asking again.`
              : 'That request failed. Try asking again.',
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
    <div className="mb-screen">
      <Header
        title="Ask MediBridge"
        subtitle={`${profile.insurer.name} · ${profile.tier.name}`}
      />

      <div ref={scrollRef} onScroll={onScroll} className="mb-scroll" style={{ padding: 16 }}>
        {messages.map((m, i) => <Message key={i} m={m} onFollowup={send} />)}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpBottom}
          aria-label="Jump to latest"
          className="mb-iconbtn mb-iconbtn--round"
          style={{ position: 'absolute', right: 16, bottom: 150, zIndex: 18, boxShadow: MB.shadow }}
        >
          <Icon.down />
        </button>
      )}

      <div
        className="mb-composer"
        style={{
          paddingBottom: keyboardOpen
            ? 'calc(env(safe-area-inset-bottom, 0px) + 10px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        }}
      >
        <div className="mb-composer__field">
          <input
            className="mb-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(input); }}
            placeholder={streaming ? 'Waiting for an answer' : 'Ask about cover, items, costs'}
            aria-label="Ask a question"
            disabled={streaming}
          />
          <button
            type="button"
            className="mb-iconbtn mb-iconbtn--solid mb-iconbtn--round"
            onClick={() => (streaming ? stop() : send(input))}
            disabled={!streaming && !input.trim()}
            aria-label={streaming ? 'Stop generating' : 'Send'}
          >
            {streaming ? <Icon.stop /> : <Icon.send />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({ m, onFollowup }) {
  // Minimal markdown for streamed answers. Styling for the emitted tags lives
  // in ui/styles.css under .mb-bubble--bot.
  const renderRich = (raw) => {
    if (!raw) return '';
    let html = raw
      // inline code & links first so emphasis can't clobber their contents
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
      // bold before italic so the ** pair is consumed first
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
    // block-level, line-anchored, before newline -> <br/>
    html = html
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^\s*(?:---|\*\*\*)\s*$/gm, '<hr/>')
      .replace(/^(\d+)\. (.+)$/gm, '<span style="display:inline-block;">$1. $2</span>')
      .replace(/^- (.+)$/gm, '• $1');
    // drop the newline that follows a block element to avoid a double gap
    html = html.replace(/(<\/h[2-4]>|<hr[^>]*\/>)\n/g, '$1');
    return html.replace(/\n/g, '<br/>');
  };

  if (m.kind === 'intro') {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="mb-avatar"><Icon.mark size={18} /></span>
          <p className="mb-bubble mb-bubble--bot">
            G'day. I help international students work out OSHC cover, MBS items, and
            out-of-pocket costs. Ask me anything in plain English.
          </p>
        </div>
        <p className="mb-meta" style={{ margin: '16px 0 8px 40px' }}>Try one of these</p>
        <div className="mb-list" style={{ marginLeft: 40 }}>
          {CHAT_SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              className="mb-row mb-row--between"
              style={{ padding: '12px 14px' }}
              onClick={() => onFollowup(s)}
            >
              <span className="mb-sub" style={{ color: MB.ink }}>{s}</span>
              <Icon.next size={16} style={{ color: MB.inkSubtle, flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (m.role === 'user') {
    return (
      <div style={{ display: 'flex', marginBottom: 14 }}>
        <p className="mb-bubble mb-bubble--user">{m.text}</p>
      </div>
    );
  }

  const thinking = m.thinking || [];
  const text = m.text || '';
  return (
    <div style={{ marginBottom: 20 }}>
      {thinking.length > 0 && (
        <details className="mb-trace" style={{ marginBottom: 8, marginLeft: 40 }} open={!!m.pending}>
          <summary>
            <Icon.down size={14} />
            {m.pending ? 'Looking things up' : `Checked ${thinking.length} source${thinking.length > 1 ? 's' : ''}`}
          </summary>
          <div>
            {thinking.map((t, i) => (
              <div key={i} className="mb-trace__step">
                <span style={{ color: MB.accentInk, fontWeight: 600 }}>{t.tool}</span>({t.args})
                <span style={{ display: 'block', color: MB.inkSubtle, marginTop: 2 }}>
                  {t.result == null ? 'running' : t.result}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {(text || m.pending) && (
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="mb-avatar"><Icon.mark size={18} /></span>
          {text ? (
            <div
              className={`mb-bubble mb-bubble--bot${m.failed ? ' mb-bubble--failed' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderRich(text) }}
            />
          ) : (
            // The answer takes the shape of the text about to replace it.
            <div className="mb-bubble mb-bubble--bot" aria-label="Writing an answer" role="status">
              <Skeleton width="92%" height={11} />
              <Skeleton width="100%" height={11} style={{ marginTop: 7 }} />
              <Skeleton width="64%" height={11} style={{ marginTop: 7 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

window.Chat = Chat;
