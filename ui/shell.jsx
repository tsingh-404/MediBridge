// MediBridge — shared UI primitives + bottom nav
const { useState, useEffect, useRef, useMemo } = React;

// ─────────── Icons (simple line) ───────────
const Icon = {
  chat: (p={}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><path d="M21 12a8 8 0 0 1-12.6 6.5L3 20l1.5-5.4A8 8 0 1 1 21 12z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  calc: (p={}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><rect x="7" y="6" width="10" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.6"/><circle cx="8.5" cy="13" r=".9" fill="currentColor"/><circle cx="12" cy="13" r=".9" fill="currentColor"/><circle cx="15.5" cy="13" r=".9" fill="currentColor"/><circle cx="8.5" cy="16.5" r=".9" fill="currentColor"/><circle cx="12" cy="16.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="16.5" r=".9" fill="currentColor"/></svg>,
  clinic: (p={}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 21s-7-5.6-7-11.5A7 7 0 0 1 19 9.5C19 15.4 12 21 12 21z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 7v5M9.5 9.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  user: (p={}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  search: (p={}) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  plus: (p={}) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  x: (p={}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...p}><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  check: (p={}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  send: (p={}) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}><path d="M3 12l18-9-9 18-2-7-7-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
  spark: (p={}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
  arrow: (p={}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  back: (p={}) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ─────────── Native hooks (no-ops on the web build) ───────────

// Register an Android back-button handler while `active` is true. The stack in
// native.js is last-in-first-served, so a nested view registered after the root
// handler gets the press first.
function useBackHandler(active, fn) {
  useEffect(() => {
    if (!active || !window.MBNative) return;
    return window.MBNative.pushBackHandler(fn);
  }, [active, fn]);
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
    <div style={{
      position: 'absolute', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, zIndex: 40,
      background: MB.badSoft, borderBottom: `1px solid ${MB.border}`,
      color: MB.ink, fontFamily: MB.sans, fontSize: 12.5, fontWeight: 550,
      padding: '8px 14px', textAlign: 'center',
    }}>
      No connection — showing the app offline. Answers and lookups need the network.
    </div>
  );
}

// ─────────── Disclaimer ───────────
// MediBridge is informational only; this needs to be visible in the app itself,
// not just the README.
function Disclaimer({ style }) {
  return (
    <div style={{
      fontFamily: MB.sans, fontSize: 11.5, lineHeight: 1.45, color: MB.inkSubtle,
      background: MB.surfaceMuted, border: `1px solid ${MB.border}`,
      borderRadius: MB.r1, padding: '8px 10px', ...style,
    }}>
      Informational only — MediBridge is not financial or medical advice. Confirm
      cover and costs with your insurer and provider before acting.
    </div>
  );
}

// ─────────── Bottom nav ───────────
function BottomNav({ active, onChange }) {
  // Hidden while the on-screen keyboard is up, so the composer keeps the space.
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;
  const items = [
    { id: 'chat', label: 'Ask', I: Icon.chat },
    { id: 'calc', label: 'Costs', I: Icon.calc },
    { id: 'clinics', label: 'Clinics', I: Icon.clinic },
    { id: 'profile', label: 'You', I: Icon.user },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', paddingTop: 8,
      background: 'rgba(255,255,255,0.82)',
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      borderTop: `1px solid ${MB.border}`,
      display: 'flex',
      boxShadow: MB.shadowMd,
    }}>
      {items.map(it => {
        const on = it.id === active;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: on ? MB.ink : MB.inkSubtle, padding: '4px 0',
            fontFamily: MB.sans, fontSize: 11.5, fontWeight: on ? 650 : 500,
            letterSpacing: 0.1,
            transition: `all ${MB.durationFast} ${MB.ease}`,
          }}>
            <span style={{
              width: 34, height: 26, borderRadius: 999,
              background: on ? MB.accentSoft : 'transparent',
              color: on ? MB.accentInk : 'currentColor',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transform: on ? 'translateY(-1px) scale(1.08)' : 'none',
              transition: `all ${MB.durationFast} ${MB.ease}`,
            }}>
              <it.I />
            </span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────── App header ───────────
function Header({ title, subtitle, right, onBack }) {
  return (
    <div style={{
      padding: '14px 20px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: `1px solid ${MB.border}`, background: MB.gradientSoft,
      boxShadow: MB.shadow,
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: 10, border: `1px solid ${MB.border}`,
          background: MB.surface, color: MB.ink, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon.back /></button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: MB.display, fontSize: 18, fontWeight: 700, color: MB.ink, letterSpacing: -0.2 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: MB.sans, fontSize: 12, color: MB.inkMuted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ─────────── Pill / Tag / Button ───────────
function Tag({ children, kind = 'neutral', size = 'sm' }) {
  const map = {
    neutral: { bg: MB.surfaceMuted, fg: MB.inkMuted, bd: MB.border },
    accent:  { bg: MB.accentSoft, fg: MB.accentInk, bd: 'transparent' },
    ok:      { bg: MB.okSoft,  fg: MB.ok,  bd: 'transparent' },
    warn:    { bg: MB.warnSoft, fg: 'oklch(48% 0.13 75)', bd: 'transparent' },
    bad:     { bg: MB.badSoft,  fg: MB.bad, bd: 'transparent' },
  }[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'xs' ? '2px 6px' : '3px 8px',
      borderRadius: 999, background: map.bg, color: map.fg,
      border: `1px solid ${map.bd}`,
      fontFamily: MB.mono, fontSize: size === 'xs' ? 11 : 11.5, fontWeight: 500,
      letterSpacing: 0.2, lineHeight: 1.4,
      boxShadow: MB.shadow,
      transition: `filter ${MB.durationFast} ${MB.ease}`,
    }}>{children}</span>
  );
}

function Button({ children, kind = 'primary', onClick, disabled, full, leading, size = 'md' }) {
  const [pressed, setPressed] = useState(false);
  const styles = {
    primary: { bg: MB.ink, fg: MB.surface, bd: MB.ink },
    secondary: { bg: MB.surface, fg: MB.ink, bd: MB.borderStrong },
    accent: { bg: MB.accent, fg: '#fff', bd: MB.accent },
    ghost: { bg: 'transparent', fg: MB.ink, bd: 'transparent' },
  }[kind];
  const sizes = {
    sm: { h: 34, px: 12, fs: 13 },
    md: { h: 44, px: 18, fs: 14 },
    lg: { h: 52, px: 22, fs: 15 },
  }[size];
  return (
    <button
      onClick={onClick}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{
      height: sizes.h, padding: `0 ${sizes.px}px`, borderRadius: 12,
      background: styles.bg, color: styles.fg, border: `1px solid ${styles.bd}`,
      fontFamily: MB.sans, fontSize: sizes.fs, fontWeight: 600,
      letterSpacing: -0.1, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, width: full ? '100%' : undefined,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      transition: `all ${MB.durationFast} ${MB.ease}`,
      transform: pressed ? 'scale(0.97)' : 'none',
      boxShadow: kind === 'primary' || kind === 'accent' ? MB.shadowMd : MB.shadow,
    }}
    >
      {leading}{children}
    </button>
  );
}

// ─────────── Currency formatter ───────────
const fmtAUD = (n) => '$' + (n ?? 0).toFixed(2);

// ─────────── Coverage calculation (mirrors backend logic) ───────────
function calcCoverage(item, tier, setting, clinicFee) {
  const fee = clinicFee != null ? clinicFee : (item.schedule_fee || 0);
  const isInHospital = setting === 'in_hospital';
  let pct;
  if (isInHospital) pct = 100;
  else pct = item.is_gp ? tier.gp : tier.spec;

  let benefit;
  if (isInHospital) benefit = item.schedule_fee || 0;
  else if (pct === 100) benefit = item.benefit_100 ?? (item.schedule_fee || 0);
  else if (pct === 85) benefit = item.benefit_85 ?? (item.schedule_fee || 0) * 0.85;
  else benefit = item.benefit_75 ?? (item.schedule_fee || 0) * 0.75;

  // Clause 3.6d cap
  benefit = Math.min(benefit, item.schedule_fee || benefit);
  const gap = Math.max(fee - benefit, 0);
  return { benefit, gap, pct, fee };
}

Object.assign(window, {
  Icon, BottomNav, Header, Tag, Button, fmtAUD,
  useBackHandler, useKeyboardOpen, useOnline, OfflineBanner, Disclaimer,
});
