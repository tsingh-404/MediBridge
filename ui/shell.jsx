// MediBridge — shared UI primitives + bottom nav.
// Presentation lives in ui/styles.css; this file owns structure and behaviour.
const { useState, useEffect, useRef, useMemo } = React;

// ─────────── Icons ───────────
// One family, one stroke weight, round joins. `glyph` keeps every icon on the
// same geometry so a 22px nav icon and a 14px inline icon still match.
const glyph = (paths, defaultSize) => ({ size = defaultSize, ...rest } = {}) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" {...rest}
  >
    {paths}
  </svg>
);

const Icon = {
  // The brand mark: a deck carried on two piers over an arch. Drawn on the
  // same 24-unit grid as the interface icons so it sits correctly next to text.
  mark: glyph(
    <>
      <path d="M2.5 9h19" />
      <path d="M6.5 9v11" />
      <path d="M17.5 9v11" />
      <path d="M6.5 17a5.5 5.5 0 0 1 11 0" />
    </>,
    22
  ),
  chat: glyph(<path d="M21 12a8 8 0 0 1-12.6 6.5L3 20l1.5-5.4A8 8 0 1 1 21 12z" />, 22),
  costs: glyph(
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3.5" />
    </>,
    22
  ),
  clinic: glyph(
    <>
      <path d="M12 21s-6.5-5.4-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.6-6.5 11-6.5 11z" />
      <path d="M12 7.5v5" />
      <path d="M9.5 10h5" />
    </>,
    22
  ),
  user: glyph(
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 20c1.3-3.3 3.7-5 6.5-5s5.2 1.7 6.5 5" />
    </>,
    22
  ),
  search: glyph(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M19.5 19.5l-4-4" />
    </>,
    18
  ),
  plus: glyph(
    <>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </>,
    18
  ),
  x: glyph(
    <>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </>,
    16
  ),
  check: glyph(<path d="M5.5 12.5l4.5 4.5 8.5-9.5" />, 18),
  back: glyph(<path d="M14.5 19l-7-7 7-7" />, 20),
  next: glyph(<path d="M9.5 5l7 7-7 7" />, 20),
  down: glyph(<path d="M6 9.5l6 6 6-6" />, 20),
  send: glyph(
    <>
      <path d="M12 19.5V5.5" />
      <path d="M6 11.5l6-6 6 6" />
    </>,
    20
  ),
  stop: glyph(<rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="currentColor" />, 18),
};

// ─────────── Native hooks (no-ops on the web build) ───────────

// Register an Android back-button handler while `active` is true. The stack in
// native.js is last-in-first-served, so a nested view registered after the root
// handler gets the press first.
function useBackHandler(active, fn) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    if (!active || !window.MBNative) return;
    return window.MBNative.pushBackHandler(() => fnRef.current && fnRef.current());
  }, [active]);
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => (window.MBNative ? window.MBNative.onKeyboard(setOpen) : undefined), []);
  return open;
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => (window.MBNative ? window.MBNative.onNetwork(setOnline) : undefined), []);
  return online;
}

// ─────────── Offline banner ───────────
function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p
      role="status"
      style={{
        position: 'absolute', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, zIndex: 40,
        background: MB.badSoft, borderBottom: `1px solid ${MB.border}`, color: MB.badInk,
        fontFamily: MB.sans, fontSize: 12.5, fontWeight: 550, padding: '8px 14px', textAlign: 'center',
      }}
    >
      No connection. Answers and lookups need the network.
    </p>
  );
}

// ─────────── Disclaimer ───────────
// MediBridge is informational only; this needs to be visible in the app itself,
// not just the README.
function Disclaimer({ style }) {
  return (
    <p className="mb-disclaimer" style={style}>
      Informational only. MediBridge is not financial or medical advice. Confirm
      cover and costs with your insurer and provider before acting.
    </p>
  );
}

// ─────────── Skeleton ───────────
// Loading placeholders take the shape of the content that replaces them.
function Skeleton({ width = '100%', height = 12, style }) {
  return <span className="mb-skeleton" style={{ display: 'block', width, height, ...style }} />;
}

// ─────────── Bottom nav ───────────
function BottomNav({ active, onChange }) {
  // Hidden while the on-screen keyboard is up, so the composer keeps the space.
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;
  const items = [
    { id: 'chat', label: 'Ask', I: Icon.chat },
    { id: 'calc', label: 'Costs', I: Icon.costs },
    { id: 'clinics', label: 'Clinics', I: Icon.clinic },
    { id: 'profile', label: 'You', I: Icon.user },
  ];
  return (
    <nav className="mb-nav" aria-label="Sections">
      {items.map(it => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            className="mb-nav__item"
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(it.id)}
          >
            <span className="mb-nav__glyph"><it.I /></span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─────────── App header ───────────
function Header({ title, subtitle, right, onBack }) {
  return (
    <header className="mb-header">
      {onBack && (
        <button type="button" className="mb-iconbtn" onClick={onBack} aria-label="Back">
          <Icon.back />
        </button>
      )}
      <div className="mb-header__text">
        <h1 className="mb-title">{title}</h1>
        {subtitle && <p className="mb-meta" style={{ marginTop: 2 }}>{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

// ─────────── Chip / Button ───────────
function Tag({ children, kind = 'neutral' }) {
  return <span className={`mb-chip mb-chip--${kind}`}>{children}</span>;
}

function Button({ children, kind = 'primary', onClick, disabled, full, leading, size = 'md' }) {
  const cls = ['mb-btn', `mb-btn--${kind}`];
  if (size !== 'md') cls.push(`mb-btn--${size}`);
  if (full) cls.push('mb-btn--full');
  return (
    <button type="button" className={cls.join(' ')} onClick={onClick} disabled={disabled}>
      {leading}{children}
    </button>
  );
}

// ─────────── Currency formatter ───────────
const fmtAUD = (n) => '$' + (n ?? 0).toFixed(2);

Object.assign(window, {
  Icon, BottomNav, Header, Tag, Button, Skeleton, fmtAUD,
  useBackHandler, useKeyboardOpen, useOnline, OfflineBanner, Disclaimer,
});
