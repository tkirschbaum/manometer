// Office.js nulls history.pushState/replaceState in some hosts (master prompt §6.9). Keep the originals so
// the app can restore them after Office.onReady. A separate file because the CSP allows no inline scripts.
window.__pulseHistory = { pushState: history.pushState, replaceState: history.replaceState };
