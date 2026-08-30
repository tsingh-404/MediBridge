// MediBridge mobile web app shell — full-viewport, server-backed.
// Profile lives in SQLite via the FastAPI; missing profile → onboarding gate.

function App() {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState('chat');

  useEffect(() => {
    let alive = true;
    api.getProfile()
      .then(p => { if (alive) { setProfile(p); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  // Hand the native splash over to the app's own loading state once we've
  // painted something real.
  useEffect(() => {
    if (loaded && window.MBNative) window.MBNative.hideSplash();
  }, [loaded]);

  // Android back on a non-root tab returns to chat; on chat the stack is empty
  // and native.js lets the press exit the app.
  useBackHandler(screen !== 'chat', () => setScreen('chat'));

  if (!loaded) {
    return (
      <div style={{
        height: '100%', minHeight: '100dvh', background: MB.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: 14, background: MB.gradientHero,
          border: `1px solid ${MB.border}`, boxShadow: MB.shadowMd, color: MB.accentInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse 1.2s ease-in-out infinite',
        }}>
          <Icon.spark />
        </div>
        <div style={{ fontFamily: MB.display, fontSize: 22, color: MB.ink, fontWeight: 700, letterSpacing: -0.4 }}>MediBridge</div>
        <div style={{ fontFamily: MB.mono, fontSize: 11.5, color: MB.inkSubtle }}>Loading your cover profile</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ height: '100%', minHeight: '100dvh', background: MB.bg, position: 'relative' }}>
        <OfflineBanner />
        <Onboarding onDone={(p) => { setProfile(p); setScreen('chat'); }} />
      </div>
    );
  }

  const onReset = async () => {
    await api.deleteProfile();
    setProfile(null);
  };

  return (
    <div style={{ height: '100%', minHeight: '100dvh', position: 'relative', background: MB.bg, overflow: 'hidden' }}>
      <OfflineBanner />
      <div style={{ position: 'absolute', inset: 0, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div key={screen} style={{ height: '100%', animation: `slideIn ${MB.durationFast} ${MB.ease}` }}>
          {screen === 'chat' && <Chat profile={profile} />}
          {screen === 'calc' && <CostCalc profile={profile} />}
          {screen === 'clinics' && <Clinics />}
          {screen === 'profile' && <Profile profile={profile} onReset={onReset} />}
        </div>
      </div>
      <BottomNav active={screen} onChange={setScreen} />
    </div>
  );
}

window.App = App;
