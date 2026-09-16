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
      <div
        className="mb-screen"
        style={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', gap: 14 }}
      >
        <span
          style={{
            width: 56, height: 56, borderRadius: MB.rSheet,
            background: MB.accentSoft, color: MB.accentInk,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon.mark size={30} />
        </span>
        <p className="mb-lede">MediBridge</p>
        <p className="mb-sub">Loading your cover profile</p>
        <Skeleton width={96} height={4} style={{ borderRadius: 999 }} />
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
      <main style={{ position: 'absolute', inset: 0, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div key={screen} className="mb-screen-in" style={{ height: '100%' }}>
          {screen === 'chat' && <Chat profile={profile} />}
          {screen === 'calc' && <CostCalc profile={profile} />}
          {screen === 'clinics' && <Clinics />}
          {screen === 'profile' && <Profile profile={profile} onReset={onReset} />}
        </div>
      </main>
      <BottomNav active={screen} onChange={setScreen} />
    </div>
  );
}

window.App = App;
