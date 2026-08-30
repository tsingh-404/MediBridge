// App mount. Compiled to js/boot.js and loaded last — every global it needs
// (App, MBNative, and React/ReactDOM from vendor/) is defined by the scripts
// above it.
MBNative.init();
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
