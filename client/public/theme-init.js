// No-flash theme script: sets <html class="light|dark"> and style.colorScheme
// before first paint. Mirrors resolveTheme() in src/lib/theme.ts
// (key: containeryard-theme; light by default).
// It is a separate file, not inline, because the CSP is script-src 'self'.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("containeryard-theme");
  } catch (e) {
    // storage blocked (private mode, sandboxed iframe): fall back to light
  }
  var resolved = stored === "dark" ? "dark" : "light";
  var root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#0b0f17" : "#f8fafc");
  }
})();
    
