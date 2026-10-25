// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, $$ } from "../core/dom.js";
import { emit } from "../core/events.js";
import { preloadRight } from "../features/right-drawer.js";

function conversationSessionKey() {
  const content = $("[data-conversation-content]");
  const id = content === null ? "" : (content.getAttribute("data-conversation-session") || "");
  return id + "@" + location.pathname + location.search;
}

function isEditorTarget(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest("[data-composer-input]") !== null) return true;
  return el.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]') !== null;
}

function blurHostEditor(force) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return;
  if (!isEditorTarget(active)) return;
  // A blur we caused ourselves 80/320ms later must not steal a focus the user
  // just placed in the composer deliberately.
  if (!force && state.lastPointerInEditor && performance.now() - state.lastPointerAt < 900) return;
  try { active.blur(); } catch (error) { /* host busy */ }
}

function handleSessionSwitch() {
  // 任务29：切换会话后不聚焦 composer、不弹键盘；弹层立即关闭。
  emit("session-switch");
  blurHostEditor(true);
  setTimeout(() => blurHostEditor(false), 80);
  setTimeout(() => blurHostEditor(false), 320);
  setTimeout(() => preloadRight(), 900);
}

function fastSessionWatch() {
  state.sessionFastRaf = 0;
  const key = conversationSessionKey();
  if (key !== state.sessionKeyPrev) {
    state.sessionKeyPrev = key;
    state.sessionFastUntil = 0;
    handleSessionSwitch();
    return;
  }
  if (performance.now() > state.sessionFastUntil) return;
  state.sessionFastRaf = requestAnimationFrame(fastSessionWatch);
}

function installSessionWatcher() {
  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  state.sessionKeyPrev = conversationSessionKey();
  const startFastWatch = () => {
    state.sessionFastUntil = performance.now() + 1500;
    if (state.sessionFastRaf === 0) state.sessionFastRaf = requestAnimationFrame(fastSessionWatch);
  };
  const pointer = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    state.lastPointerAt = performance.now();
    state.lastPointerInEditor = target !== null && target.closest('[contenteditable="true"], [role="textbox"], textarea, input, [data-composer-card], [data-composer-seat], [class*="_inputBar"]') !== null;
    if (target !== null && target.closest('[class*="_sessionRow"]') !== null) startFastWatch();
  };
  listen(document, "touchstart", pointer, { passive: true, capture: true });
  listen(document, "pointerdown", pointer, { passive: true, capture: true });
  const timer = setInterval(() => {
    if (state.DEBUG_OFF.has("session-watch")) return;
    const key = conversationSessionKey();
    if (key === state.sessionKeyPrev) return;
    state.sessionKeyPrev = key;
    handleSessionSwitch();
  }, 120);
  if (timer && typeof timer.unref === "function") timer.unref();

  disposers.push(() => clearInterval(timer));
  disposers.push(() => { if (state.sessionFastRaf !== 0) cancelAnimationFrame(state.sessionFastRaf); });
  return () => { for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index](); };
}

export { conversationSessionKey, isEditorTarget, blurHostEditor, handleSessionSwitch, fastSessionWatch, installSessionWatcher };
