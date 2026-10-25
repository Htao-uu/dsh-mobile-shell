// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, frame, settingsPanel } from "../core/dom.js";
import { on } from "../core/events.js";

// Event-driven reconciler: no polling interval.
//
// The host is a React app, so it re-renders chrome at unpredictable moments.
// A fixed 400 ms timer used to catch that, but it also kept waking the CPU
// while the page was idle. Instead we watch the few chrome containers we care
// about (header / composer / settings / rightbar / frame attributes) with
// scoped MutationObservers and schedule a debounced reconcile when one of them
// changes. User gestures, visibility changes and window events are extra
// triggers for cases React does not surface as a DOM mutation.
//
// The reconcile itself (sync) must stay idempotent: it only writes when a
// value actually differs, otherwise the observer would feed its own writes
// back into another round.
const DEBOUNCE_MS = 80;

function installObserver(syncFn) {
  let timer = 0;
  let scheduled = false;
  let disposed = false;
  const observed = new WeakSet();

  const chromeObserver = new MutationObserver(schedule);
  const bodyObserver = new MutationObserver(schedule);
  const frameObserver = new MutationObserver(schedule);

  function schedule() {
    if (disposed || scheduled) return;
    scheduled = true;
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  function run() {
    scheduled = false;
    timer = 0;
    if (disposed) return;
    observeAll();
    if (state.DEBUG_OFF.has("observer-sync")) return;
    try {
      syncFn();
    } catch (error) {
      // A broken reconcile must never take the page down.
    }
    observeAll();
  }

  function observe(target, options, observer) {
    if (!(target instanceof Node) || observed.has(target)) return;
    try {
      observer.observe(target, options);
      observed.add(target);
    } catch (error) {
      // Detached/foreign nodes are fine to skip.
    }
  }

  function observeAll() {
    observe(document.body, { childList: true }, bodyObserver);
    const header = $('[class*="_centerCol"] header');
    if (header !== null) observe(header, { childList: true, subtree: true }, chromeObserver);
    const panel = settingsPanel();
    if (panel !== null) observe(panel, { childList: true, subtree: true }, chromeObserver);
    const composer = $('[data-composer-card], [class*="_composerDock"]');
    if (composer !== null) observe(composer, { childList: true, subtree: true }, chromeObserver);
    const rightbar = $('[class*="_rightbarCol"]');
    if (rightbar !== null) observe(rightbar, { childList: true, subtree: true }, chromeObserver);
    const f = frame();
    if (f !== null) observe(f, { attributes: true, attributeFilter: ["class", "data-sidebar-collapsed"] }, frameObserver);
  }

  const listeners = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };

  // A tap can change the host route/mode without our side knowing; reconcile
  // once after the gesture instead of polling for it.
  listen(document, "pointerup", schedule, { capture: true, passive: true });
  listen(document, "visibilitychange", () => { if (!document.hidden) schedule(); });
  listen(window, "resize", schedule, { passive: true });
  listen(window, "orientationchange", schedule, { passive: true });
  listen(window, "popstate", schedule);
  listen(window, "hashchange", schedule);
  const offSession = on("session-switch", schedule);

  observeAll();

  return () => {
    disposed = true;
    if (timer !== 0) clearTimeout(timer);
    chromeObserver.disconnect();
    bodyObserver.disconnect();
    frameObserver.disconnect();
    for (let index = listeners.length - 1; index >= 0; index -= 1) listeners[index]();
    if (typeof offSession === "function") offSession();
  };
}

export { installObserver };
