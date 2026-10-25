// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { ICONS } from "../core/constants.js";
import { $, $$, isPhone, settingsPanel } from "../core/dom.js";
import { emit } from "../core/events.js";

// A preload collapse loop and an explicit user open share the same host panel.
// openRight() invalidates the loop generation so a late preload timeout cannot
// toggle the host shut under an already-open drawer.
let preloadGeneration = 0;

function rightDebugEnabled() {
  try { return new URLSearchParams(location.search).has("dms-gesture-debug"); } catch (error) { return false; }
}
function rlog(...args) {
  if (!rightDebugEnabled()) return;
  try {
    const line = "[dshm-right] " + Math.round(performance.now()) + " " + args.map((arg) => String(arg)).join(" ");
    const win = window;
    win.__dshmRightLog = win.__dshmRightLog || [];
    win.__dshmRightLog.push(line);
    if (win.__dshmRightLog.length > 120) win.__dshmRightLog.shift();
    console.log(line);
  } catch (error) { /* debug only */ }
}

function rightPanelEl() {
  return $("[data-sidebar-right-session]:not([hidden])") || $("[data-sidebar-right-session]");
}

function rightSessionId() {
  const panel = rightPanelEl();
  return panel === null ? "" : (panel.getAttribute("data-sidebar-right-session") || "");
}

function rightPanelHasTab() {
  const panel = rightPanelEl();
  return panel !== null && panel.querySelector("[data-dockkit-tab], [data-sidebar-right-tab]") !== null;
}

function rightTabBodyEl() {
  const panel = rightPanelEl();
  return panel === null ? null : panel.querySelector('[class*="_tabBody"], [data-dockkit-tab-body]');
}

function rightPanelContentReady() {
  const panel = rightPanelEl();
  if (panel === null) return false;
  if (panel.querySelector("[data-dockkit-tab], [data-sidebar-right-tab]") === null) return false;
  const body = rightTabBodyEl();
  if (body === null) return false;
  const text = (body.textContent || "").replace(/\s+/g, "");
  if (text.length > 2) return true;
  return body.querySelector("button, [class*='_entry'], [class*='_guide'], img, svg, input, textarea, iframe, canvas, video, [contenteditable='true']") !== null;
}

function rightLoadingElRef() {
  if (state.rightLoadingEl === null) {
    state.rightLoadingEl = document.createElement("div");
    state.rightLoadingEl.className = "dms-right-loading";
    state.rightLoadingEl.setAttribute("aria-hidden", "true");
    state.rightLoadingEl.innerHTML = '<div class="dms-right-loading-spinner"></div><div class="dms-right-loading-text">正在加载右侧栏…</div>';
    document.body.appendChild(state.rightLoadingEl);
  }
  return state.rightLoadingEl;
}

function showRightLoading() {
  // Intentionally no-op: a plugin-owned spinner cannot know when the host's
  // tab content is really done, so it could hang forever. The host panel is
  // preloaded before opening; never cover it with a fake loading state.
}

function hideRightLoading() {
  if (state.rightLoadingEl !== null) { state.rightLoadingEl.hidden = true; state.rightLoadingEl.setAttribute("aria-hidden", "true"); }
}

function stopRightOpenWait(hideLoader) {
  if (state.rightOpenWaitTimer !== 0) { clearInterval(state.rightOpenWaitTimer); state.rightOpenWaitTimer = 0; }
  if (hideLoader === true) hideRightLoading();
}

function startRightOpenWait() {
  // Preventive behaviour: do not create a loading cover at all. The host panel
  // is mounted/preloaded before open; if its tab body is empty that is the
  // host's own state, and the drawer must remain interactive instead of
  // showing an unresolvable spinner. There is no polling and no timeout path.
  stopRightOpenWait(true);
  state.rightWaitFallbackTried = false;
  state.rightWaitTimedOut = false;
  state.rightWaitStartedAt = 0;
  document.documentElement.removeAttribute("data-dms-right-wait-timeout");
  rlog("open-without-loader");
}

const clickHost = (el) => {
  if (el === null) return false;
  state.rightPreloadClick = true;
  try { el.click(); } catch (error) { /* host busy */ } finally { state.rightPreloadClick = false; }
  return true;
};

function preloadRight() {
  if (!isPhone() || settingsPanel() !== null || state.rightVisible) return;
  if (state.rightPreloadState === "busy") return;
  const sid = rightSessionId();
  if (sid === "") return;
  if (state.rightPreloadAttempts.has(sid)) return;
  if (hostRightOpen()) {
    state.rightPreloadAttempts.add(sid);
    clickHost($("[data-sidebar-right-toggle]"));
    state.rightPreloadState = rightPanelHasTab() ? "ok" : "idle";
    return;
  }
  const expand = $("[data-sidebar-right-expand]");
  if (expand === null) return;
  const now = performance.now();
  if (now - state.lastRightPreloadAt < 2000) return;
  state.lastRightPreloadAt = now;
  state.rightPreloadAttempts.add(sid);
  state.rightPreloadState = "busy";
  const generation = ++preloadGeneration;
  document.documentElement.classList.add("dms-preload-right");
  clickHost(expand);
  const started = now;
  let addTried = false;
  let collapsed = false;
  const collapse = () => {
    if (collapsed) return;
    if (generation !== preloadGeneration || state.rightVisible) {
      // User opened the drawer (or a newer preload started): stop without
      // touching the host state, otherwise the timeout would close it.
      collapsed = true;
      return;
    }
    if (hostRightOpen()) {
      if (!rightPanelHasTab() && !addTried) {
        const addBtn = $("[data-dockkit-add-tab]");
        if (addBtn !== null) { addTried = true; clickHost(addBtn); }
      }
      if (rightPanelContentReady()) {
        collapsed = true;
        setTimeout(() => {
          if (generation !== preloadGeneration || state.rightVisible) return;
          clickHost($("[data-sidebar-right-toggle]"));
          state.rightPreloadState = "ok";
          document.documentElement.setAttribute("data-dms-right-preloaded", "1");
        }, 80);
        return;
      }
    }
    if (performance.now() - started > 2600) {
      if (generation !== preloadGeneration || state.rightVisible) { collapsed = true; return; }
      collapsed = true;
      clickHost($("[data-sidebar-right-toggle]"));
      state.rightPreloadState = "fail";
      document.documentElement.setAttribute("data-dms-right-preload-failed", "1");
      return;
    }
    requestAnimationFrame(collapse);
  };
  requestAnimationFrame(collapse);
}

// The host keeps its collapsed tab pane marked [inert] (and aria-hidden) even
// while the plugin shows the panel with CSS. Inert subtrees are excluded from
// hit testing, so visually-open buttons are dead until the host expands. We
// unlock exactly the inert nodes inside the current right session while the
// drawer is open and restore them when it closes. This is the actual root
// cause of "看起来打开了，但按钮点不动" (confirmed via WebView DevTools).
let unlockedInert = [];
let restoreLeftToken = 0;

function hideLeftSidebar() {
  const col = document.querySelector('[class*="_sidebarCol"]');
  if (col !== null) col.style.setProperty("display", "none", "important");
}

// Restore the preloaded left sidebar only after the pushed page has fully
// covered it again. Event-driven: transitionend plus a rAF check for
// reduced-motion/instant cases; no fixed timeout.
function restoreLeftAfterShift() {
  const token = ++restoreLeftToken;
  const col = document.querySelector('[class*="_sidebarCol"]');
  const center = document.querySelector('[class*="_centerCol"]');
  const finish = () => {
    if (token !== restoreLeftToken) return;
    if (state.rightVisible) return;
    if (col !== null) col.style.removeProperty("display");
  };
  if (col === null || center === null) { finish(); return; }
  center.addEventListener("transitionend", (event) => {
    if (event.target === center && event.propertyName === "transform") finish();
  }, { once: true });
  const check = () => {
    if (token !== restoreLeftToken) return;
    if (state.rightVisible) return;
    const transform = window.getComputedStyle(center).transform;
    if (transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)") { finish(); return; }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function unlockRightPanel() {
  const session = document.querySelector("[data-sidebar-right-session]");
  if (session === null) return;
  const nodes = [];
  if (session.hasAttribute("inert")) nodes.push(session);
  const panel = session.closest("[data-sidebar-right-panel]");
  if (panel !== null && panel.hasAttribute("inert")) nodes.push(panel);
  const inertNodes = session.querySelectorAll("[inert]");
  for (const el of inertNodes) nodes.push(el);
  for (const el of nodes) {
    if (unlockedInert.indexOf(el) < 0) unlockedInert.push(el);
    el.removeAttribute("inert");
  }
}

function lockRightPanel() {
  for (const el of unlockedInert) {
    if (el.isConnected && !el.hasAttribute("inert")) el.setAttribute("inert", "");
  }
  unlockedInert = [];
}

function openRight() {
  state.rightVisible = true;
  state.rightActivityAt = performance.now();
  state.rightFullIntent = false;
  // A user open cancels the background preload: its 2.6s timeout must not
  // toggle the host panel shut after this point.
  preloadGeneration += 1;
  if (state.rightPreloadState === "busy") state.rightPreloadState = "cancelled";
  // Drop the preload gate when the panel becomes interactive; the open rules
  // below (and the width override in right-drawer.css) keep it laid out.
  restoreLeftToken += 1;
  hideLeftSidebar();
  document.documentElement.classList.remove("dms-preload-right");
  document.documentElement.classList.add("dms-right-open");
  unlockRightPanel();
  rlog("open", "preloaded=" + document.documentElement.hasAttribute("data-dms-right-preloaded"));
  // Always open synchronously; no loading gate to get stuck.
  startRightOpenWait();
}

function closeRight() {
  state.rightVisible = false;
  state.rightFullIntent = false;
  state.rightActivityAt = performance.now();
  // Let the gesture layer cancel any in-flight spring/inline transform before
  // the close classes run; otherwise the page can stay pushed and reveal the
  // preloaded left sidebar.
  emit("drawer-close", "right");
  stopRightOpenWait(true);
  state.rightWaitTimedOut = false;
  lockRightPanel();
  const root = document.documentElement;
  root.removeAttribute("data-dms-right-wait-timeout");
  root.classList.remove("dms-right-full");
  root.classList.remove("dms-right-open");
  root.classList.add("dms-preload-right");
  restoreLeftAfterShift();
  if (state.rightFallbackOpen) {
    state.rightFallbackOpen = false;
    clickHost($("[data-sidebar-right-toggle]"));
  }
}

function toggleRightFullscreen() {
  const root = document.documentElement;
  if (root.classList.contains("dms-right-full")) {
    state.rightFullIntent = false;
    root.classList.remove("dms-right-full");
  } else {
    state.rightFullIntent = true;
    state.rightVisible = true;
    root.classList.remove("dms-preload-right");
    root.classList.add("dms-right-open");
    root.classList.add("dms-right-full");
    unlockRightPanel();
  }
  syncRightChrome();
}

function syncRightChrome() {
  if (!isPhone()) return;
  const modeBtn = $("[data-sidebar-right-mode]");
  if (modeBtn === null) return;
  const full = document.documentElement.classList.contains("dms-right-full");
  const want = full ? ICONS.exitFull : ICONS.full;
  try {
    if (modeBtn.innerHTML !== want) modeBtn.innerHTML = want;
  } catch (error) { /* host busy */ }
  const label = full ? "退出全屏" : "进入全屏";
  if (modeBtn.getAttribute("aria-label") !== label) modeBtn.setAttribute("aria-label", label);
}



const hostRightOpen = () => $("[data-sidebar-right-session]:not([hidden]) [data-sidebar-right-open]") !== null;

const rightOpen = () => $("[data-sidebar-right-open]") !== null;

function rightExpandTriggerInHeader() {
  const header = document.querySelector('[class*="_centerCol"] header');
  if (header === null) return null;
  return header.querySelector("[data-sidebar-right-expand]") ||
    header.querySelector('[aria-label="打开右侧边栏"], [aria-label="展开右侧边栏"], [aria-label="Open right sidebar"], [aria-label="Expand right sidebar"], [aria-label*="右侧栏"], [aria-label*="右侧边栏"]');
}

function rightExpandTrigger(node) {
  if (!(node instanceof Element)) return null;
  // Anything inside the right panel is panel UI, never the header expand
  // trigger. The host's collapse button aria-label contains "右侧边栏" and used
  // to be classified as "expand" by the label fallback below.
  if (node.closest("[data-sidebar-right-session]") !== null) return null;
  const direct = node.closest("[data-sidebar-right-expand]");
  if (direct !== null) return direct;
  const labelled = node.closest('[aria-label="打开右侧边栏"], [aria-label="展开右侧边栏"], [aria-label="Open right sidebar"], [aria-label="Expand right sidebar"], [aria-label*="右侧栏"], [aria-label*="右侧边栏"]');
  if (labelled !== null) return labelled;
  // 兼容宿主把按钮包在 wrapper 里 / 自定义 data-* 的情况：只在 header 内向上找 4 层。
  const header = node.closest("header");
  if (header === null) return null;
  let el = node;
  for (let depth = 0; el !== null && el !== header && depth < 5; depth++, el = el.parentElement) {
    const cls = typeof el.className === "string" ? el.className : "";
    if ((el.tagName === "BUTTON" || el.getAttribute("role") === "button") && /expand|sidebar-right/i.test(cls + " " + (el.getAttribute("data-sidebar-right-expand") || ""))) return el;
  }
  return null;
}

function exitRightFullscreen(closeDrawer) {
  state.rightFullIntent = false;
document.documentElement.classList.remove("dms-right-full");
if (closeDrawer === true) closeRight();
}

export { rightPanelEl, rightSessionId, rightPanelHasTab, rightTabBodyEl, rightPanelContentReady, rightLoadingElRef, showRightLoading, hideRightLoading, stopRightOpenWait, startRightOpenWait, clickHost, preloadRight, openRight, closeRight, toggleRightFullscreen, syncRightChrome, hostRightOpen, rightOpen, rightExpandTriggerInHeader, rightExpandTrigger, exitRightFullscreen, unlockRightPanel, lockRightPanel };
