// Onboarding wizard — 4 steps. Insurers loaded from /api/insurers.
function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [insurers, setInsurers] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [insurer, setInsurer] = useState(null);
  const [tier, setTier] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cover, setCover] = useState('single');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    api.getInsurers().then(setInsurers).catch(e => setLoadErr(e.message));
  }, []);

  const total = 5;
  const next = () => setStep(s => Math.min(s + 1, total - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  useBackHandler(step > 0, back);
  const finish = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      const profile = await api.saveProfile({
        tier_id: tier.id,
        cover_type: cover,
        policy_start_date: date,
      });
      setSaved(true);
      await new Promise(r => setTimeout(r, 650));
      onDone(profile);
    } catch (e) {
      setSaveErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: MB.bg }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {Array.from({ length: total - 1 }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 6, borderRadius: 99,
              background: i < step ? MB.accent : MB.border,
              boxShadow: i < step ? MB.shadow : 'none',
              transition: `all ${MB.duration} ${MB.ease}`,
            }} />
          ))}
        </div>
        <div style={{ fontFamily: MB.mono, fontSize: 11, color: MB.inkSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {step === 0 ? 'Welcome' : `Step ${step} of ${total - 1}`}
        </div>
        <div style={{ fontFamily: MB.display, fontSize: 30, fontWeight: 700, color: MB.ink, letterSpacing: -0.8, marginTop: 4, lineHeight: 1.15 }}>
          {step === 0 && 'Welcome to MediBridge'}
          {step === 1 && 'Who do you have OSHC with?'}
          {step === 2 && 'Which tier are you on?'}
          {step === 3 && 'When did your policy start?'}
          {step === 4 && 'Cover type?'}
        </div>
        <div style={{ fontFamily: MB.sans, fontSize: 14, color: MB.inkMuted, marginTop: 8, lineHeight: 1.45 }}>
          {step === 0 && 'Your personal OSHC assistant for cover checks, costs, and smarter clinic decisions.'}
          {step === 1 && 'We use this to show your real benefit % and exclusions.'}
          {step === 2 && 'You\'ll find this on your membership card or welcome email.'}
          {step === 3 && 'Used to check waiting periods.'}
          {step === 4 && 'Affects pricing and dependants.'}
        </div>
      </div>

      <div key={step} style={{ flex: 1, overflow: 'auto', padding: '20px 20px 0', animation: `fadeInUp ${MB.durationFast} ${MB.ease}` }}>
        {step === 0 && (
          <div style={{
            background: MB.gradientHero, border: `1px solid ${MB.border}`, borderRadius: 18, boxShadow: MB.shadowMd,
            padding: '22px 20px',
          }}>
            <div style={{
              width: 58, height: 58, borderRadius: 16, background: MB.surface, color: MB.accentInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: MB.shadow, marginBottom: 14,
            }}>
              <Icon.spark />
            </div>
            <div style={{ fontFamily: MB.display, fontSize: 24, color: MB.ink, fontWeight: 700, lineHeight: 1.1 }}>
              Understand your cover
              <br />
              before you spend.
            </div>
            <div style={{ fontFamily: MB.sans, fontSize: 14, color: MB.inkMuted, marginTop: 10, lineHeight: 1.45 }}>
              We will set up your insurer profile in under a minute so your chat answers and cost calculations match your actual OSHC tier.
            </div>
          </div>
        )}
        {loadErr && (
          <div style={{ padding: 14, background: MB.badSoft, borderRadius: 12, color: MB.bad, fontFamily: MB.sans, fontSize: 13 }}>
            Couldn't load insurers: {loadErr}
          </div>
        )}
        {!insurers && !loadErr && (
          <div style={{ fontFamily: MB.sans, fontSize: 13, color: MB.inkSubtle }}>Loading insurers…</div>
        )}

        {insurers && step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insurers.map(ins => {
              const on = insurer?.id === ins.id;
              return (
                <button key={ins.id} onClick={() => { setInsurer(ins); setTier(ins.tiers[0] || null); }} style={{
                  background: on ? MB.accentSoft : MB.surface, color: MB.ink,
                  border: `1px solid ${on ? MB.accent : MB.border}`, borderRadius: 14,
                  padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: MB.sans, fontSize: 15, fontWeight: 550,
                  boxShadow: on ? MB.shadowMd : MB.shadow,
                  transform: on ? 'scale(1.01)' : 'none',
                  transition: `all ${MB.durationFast} ${MB.ease}`,
                }}>
                  <span>{ins.name}</span>
                  {on && <Icon.check />}
                </button>
              );
            })}
          </div>
        )}
        {insurers && step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(insurer?.tiers || []).map(t => {
              const on = tier?.id === t.id;
              return (
                <button key={t.id} onClick={() => setTier(t)} style={{
                  background: on ? MB.accentSoft : MB.surface, color: MB.ink,
                  border: `1px solid ${on ? MB.accent : MB.border}`, borderRadius: 14,
                  padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: MB.sans, fontSize: 15, fontWeight: 550,
                  boxShadow: on ? MB.shadowMd : MB.shadow,
                  transform: on ? 'scale(1.01)' : 'none',
                  transition: `all ${MB.durationFast} ${MB.ease}`,
                }}>
                  <div>
                    <div>{t.name}</div>
                    <div style={{ fontFamily: MB.mono, fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                      GP {t.gp}% · Specialist {t.spec}%
                    </div>
                  </div>
                  {on && <Icon.check />}
                </button>
              );
            })}
          </div>
        )}
        {step === 3 && (
          <div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
              width: '100%', boxSizing: 'border-box',
              height: 56, padding: '0 16px', borderRadius: 14,
              border: `1px solid ${MB.border}`, background: MB.surface,
              fontFamily: MB.sans, fontSize: 17, color: MB.ink, outline: 'none',
            }} />
            <div style={{ marginTop: 12, padding: '12px 14px', background: MB.accentSoft, borderRadius: 10, fontFamily: MB.sans, fontSize: 12.5, color: MB.accentInk, lineHeight: 1.5 }}>
              Most waiting periods are 2 months for hospital, 12 months for pre‑existing conditions and pregnancy. GP visits and ambulance have no wait.
            </div>
          </div>
        )}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'single', name: 'Single', sub: 'Just me' },
              { id: 'couple', name: 'Couple', sub: 'Me and my partner' },
              { id: 'family', name: 'Family', sub: 'Two adults + dependants' },
              { id: 'sole_parent', name: 'Sole parent', sub: 'One adult + dependants' },
            ].map(c => {
              const on = cover === c.id;
              return (
                <button key={c.id} onClick={() => setCover(c.id)} style={{
                  background: on ? MB.accentSoft : MB.surface, color: MB.ink,
                  border: `1px solid ${on ? MB.accent : MB.border}`, borderRadius: 14,
                  padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: MB.sans, fontSize: 15, fontWeight: 550,
                  boxShadow: on ? MB.shadowMd : MB.shadow,
                  transform: on ? 'scale(1.01)' : 'none',
                  transition: `all ${MB.durationFast} ${MB.ease}`,
                }}>
                  <div>
                    <div>{c.name}</div>
                    <div style={{ fontSize: 12, marginTop: 2, opacity: 0.7, fontWeight: 400 }}>{c.sub}</div>
                  </div>
                  {on && <Icon.check />}
                </button>
              );
            })}
          </div>
        )}
        {saveErr && (
          <div style={{ marginTop: 12, padding: 12, background: MB.badSoft, borderRadius: 10, color: MB.bad, fontFamily: MB.sans, fontSize: 12.5 }}>
            Couldn't save profile: {saveErr}
          </div>
        )}
      </div>

      <Disclaimer style={{ margin: '0 20px 12px' }} />
      <div style={{ padding: '16px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)', display: 'flex', gap: 10, borderTop: `1px solid ${MB.border}`, background: MB.surface }}>
        {step > 0 && <Button kind="secondary" onClick={back}>Back</Button>}
        {step < total - 1 ? (
          <Button kind="accent" full onClick={next} disabled={(step === 1 && !insurer) || (step === 2 && !tier)}>
            {step === 0 ? 'Get started' : 'Continue'}
          </Button>
        ) : (
          <Button kind="accent" full onClick={finish} disabled={saving || !tier}>
            {saving ? (saved ? 'Ready!' : 'Saving...') : 'Start using MediBridge'}
          </Button>
        )}
      </div>
    </div>
  );
}

window.Onboarding = Onboarding;
