// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, $$, settingsPanel, showToast } from "../core/dom.js";
import { leftOpen, toggleLeft } from "../features/left-drawer.js";
import { closeRight, exitRightFullscreen } from "../features/right-drawer.js";
import { settingsBack } from "../features/settings.js";

function installBackStack() {
  const previous = window.__dshmBack;
  const back = function dshMobileShellBack() {
    if (settingsPanel() !== null) { if (settingsBack()) return true; }
    if (document.documentElement.classList.contains("dms-right-full")) { exitRightFullscreen(true); return true; }
    if (state.rightVisible) { closeRight(); return true; }
    if (leftOpen()) { toggleLeft(); return true; }
    const layout = state.ctxRef && state.ctxRef.layout;
    if (layout && typeof layout.selectPanel === "function" && $('[data-composer-card]') === null) {
      try { layout.selectPanel(null); return true; } catch (error) { /* fall through */ }
    }
    if (typeof previous === "function" && document.querySelector('[role="dialog"], [role="menu"]') !== null) return previous();
    return false;
  };
  window.__dshmBack = back;
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (state.rightVisible || leftOpen()) { e.preventDefault(); window.__dshmBack(); }
  };
  document.addEventListener("keydown", onKey, true);
  return () => {
    document.removeEventListener("keydown", onKey, true);
    if (window.__dshmBack === back) window.__dshmBack = previous;
  };
}

function installExitGuard() {
  const base = window.__dshmBack;
  let lastAt = 0;
  const guard = function dshMobileShellBackGuard() {
    const handled = typeof base === "function" ? base() : false;
    if (handled) return true;
    const now = Date.now();
    if (now - lastAt < 2000) { lastAt = 0; return false; }
    lastAt = now;
    showToast("再按一次退出");
    return true;
  };
  window.__dshmBack = guard;
  return () => { if (window.__dshmBack === guard) window.__dshmBack = base; };
}

export { installBackStack, installExitGuard };
