// Thin wrapper over the Capacitor native bridge.
//
// The SPA is a set of classic scripts with no module resolution, so we never
// `import` the plugin packages. Capacitor's native bridge registers every plugin
// compiled into the app on `window.Capacitor.Plugins` at runtime, which is
// reachable from plain script. The npm packages are still required — `cap sync`
// uses them to add the native code — they just aren't imported here.
//
// On the desktop web build `window.Capacitor` is undefined and every function
// below degrades to a no-op, so the same ui/ serves both targets.
(function () {
  const cap = () => window.Capacitor;
  const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
  const platform = () => (cap() && cap().getPlatform ? cap().getPlatform() : 'web');
  const plugin = (name) => {
    const c = cap();
    return (c && c.Plugins && c.Plugins[name]) || null;
  };

  // Android hardware back button. Screens push a handler while they have
  // somewhere to go back to; the last one registered wins, so nested views take
  // priority over the root tab switch. Empty stack -> leave the app.
  const backStack = [];
  function pushBackHandler(fn) {
    backStack.push(fn);
    return function pop() {
      const i = backStack.indexOf(fn);
      if (i >= 0) backStack.splice(i, 1);
    };
  }

  function initBackButton() {
    const App = plugin('App');
    if (!App) return;
    App.addListener('backButton', () => {
      const handler = backStack[backStack.length - 1];
      if (handler) handler();
      else App.exitApp();
    });
  }

  // Keyboard: the chat composer sits above an 80px bottom nav. When the keyboard
  // opens the nav is hidden, so that reserved space has to come back off.
  const keyboardSubs = [];
  let keyboardOpen = false;
  function onKeyboard(fn) {
    keyboardSubs.push(fn);
    fn(keyboardOpen);
    return () => {
      const i = keyboardSubs.indexOf(fn);
      if (i >= 0) keyboardSubs.splice(i, 1);
    };
  }
  function setKeyboardOpen(open) {
    if (open === keyboardOpen) return;
    keyboardOpen = open;
    keyboardSubs.forEach((f) => f(open));
  }
  function initKeyboard() {
    const Keyboard = plugin('Keyboard');
    if (!Keyboard) return;
    // *Will* rather than *Did* so the layout moves with the keyboard animation.
    Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
  }

  // Network: drives the offline banner. Falls back to navigator.onLine on web.
  const netSubs = [];
  let online = true;
  function onNetwork(fn) {
    netSubs.push(fn);
    fn(online);
    return () => {
      const i = netSubs.indexOf(fn);
      if (i >= 0) netSubs.splice(i, 1);
    };
  }
  function setOnline(v) {
    if (v === online) return;
    online = v;
    netSubs.forEach((f) => f(v));
  }
  function initNetwork() {
    const Network = plugin('Network');
    if (Network) {
      Network.getStatus().then((s) => setOnline(!!s.connected)).catch(() => {});
      Network.addListener('networkStatusChange', (s) => setOnline(!!s.connected));
      return;
    }
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      setOnline(navigator.onLine);
      window.addEventListener('online', () => setOnline(true));
      window.addEventListener('offline', () => setOnline(false));
    }
  }

  function initChrome() {
    const StatusBar = plugin('StatusBar');
    if (StatusBar) {
      // Dark glyphs on the light #F5F6F0 shell (Style.Light = light content is
      // wrong here; "Light" in Capacitor means light *text*).
      StatusBar.setStyle({ style: 'LIGHT' }).catch(() => {});
      if (platform() === 'android') {
        StatusBar.setBackgroundColor({ color: '#F5F6F0' }).catch(() => {});
      }
    }
  }

  // Called once the first real screen has painted, so the branded splash hands
  // over to the app's own loading state without a white flash.
  function hideSplash() {
    const SplashScreen = plugin('SplashScreen');
    if (SplashScreen) SplashScreen.hide().catch(() => {});
  }

  function init() {
    initNetwork();
    if (!isNative()) return;
    initBackButton();
    initKeyboard();
    initChrome();
  }

  window.MBNative = {
    isNative,
    platform,
    plugin,
    init,
    hideSplash,
    pushBackHandler,
    onKeyboard,
    onNetwork,
  };
})();
