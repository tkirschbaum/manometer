// Startup placeholder (no "slide in between"): until the app has rendered, the frame shows the slide background and
// the join code of the last Pulse slide shown in this browser, instead of a blank frame while Office.js and the app
// load. Sizes are measured like the real stage (1 % of the frame height/width in px, see stage.css). The styles are
// in index.html; App.tsx removes the placeholder on its first render. A separate file because the CSP allows no
// inline scripts.
(function () {
  try {
    var boot = JSON.parse(window.localStorage.getItem('pulse.boot') || 'null');
    var h = window.innerHeight;
    var w = window.innerWidth;
    if (!boot || !(h > 0) || !(w > 0)) return;
    var root = document.documentElement;
    root.setAttribute('data-boot', boot.theme === 'dark' ? 'dark' : 'light');
    if (typeof boot.code === 'string' && /^\d{3} \d{3}$/.test(boot.code))
      root.setAttribute('data-boot-code', boot.code);
    root.style.setProperty('--boot-u', h / 100 + 'px');
    root.style.setProperty('--boot-uw', w / 100 + 'px');
  } catch (e) {
    // storage unavailable: no placeholder
  }
})();
