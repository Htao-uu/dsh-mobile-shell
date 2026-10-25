// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "./core/state.js";
import { $, $$, frame, hostLeftOpen, isPhone, normalizeSeparators, settingsPanel } from "./core/dom.js";
import { styleOnce } from "./core/style.js";
import { forceMountSidebar, repairLeftHost, toggleLeft, leftOpen } from "./features/left-drawer.js";
import { closeRight, openRight, preloadRight, rightPanelContentReady, stopRightOpenWait, syncRightChrome, unlockRightPanel } from "./features/right-drawer.js";
import { ensureTopButtons, installTopbarRepair, installRightInterceptors } from "./features/topbar.js";
import { ensureSettings, installSettingsWatcher } from "./features/settings.js";
import { installGestures, installDrawerAutoClose } from "./features/gestures.js";
import { installViewTabsMenu } from "./features/view-tabs.js";
import { installKeyboard } from "./features/keyboard.js";
import { installLongPress } from "./features/long-press.js";
import { installObserver } from "./features/observer.js";
import { installBackStack, installExitGuard } from "./features/back-stack.js";
import { installAttachSheet } from "./features/attach-sheet.js";
import { installSessionWatcher } from "./features/session-watch.js";

function sync() {
  const f = frame();
  if (f === null) return;
  f.setAttribute("data-dms-frame", "frame");
  const root = document.documentElement;
  root.classList.toggle("dms-left-open", leftOpen());
  // The right drawer mirrors the left one: the host panel is preloaded and
  // stays mounted, so state.rightVisible is the single state source (no host-marker
  // reconciliation, no retry clicks).
  root.classList.toggle("dms-right-open", state.rightVisible);
  // Also hide a loading cover that timed out and whose content appeared later;
  // the observer runs sync() after host DOM mutations.
  if (state.rightVisible) unlockRightPanel();
  if (state.rightVisible && rightPanelContentReady()) stopRightOpenWait(true);
  const panel = settingsPanel();
  root.classList.toggle("dms-settings-open", panel !== null);
  if (panel !== null) ensureSettings(panel);
  else {
    root.classList.remove("dms-settings-list");
    root.classList.remove("dms-settings-section");
    root.classList.remove("dms-settings-chrome-init");
    root.classList.remove("dms-plugin-section");
    if (!leftOpen()) root.classList.remove("dms-gesture-opened");
  }
  if (!state.rightViewTabsFallback) document.documentElement.classList.add("dms-vtabs-menu");
  ensureTopButtons();
  for (const header of $$('[class*="_centerCol"] header')) {
    const conversation = header.querySelector("[data-conversation-header-leading], [data-conversation-header-corner]") !== null;
    header.classList.toggle("dms-topbar", conversation);
  }
  const dock = $('[data-composer-dock], [class*="_composerDock"], [data-composer-stats]');
  if (dock !== null) normalizeSeparators(dock);
  for (const extra of $$('[class*="_statusLine"], [class*="_sessionStats"]')) normalizeSeparators(extra);
  const hero = $('[class*="_composerHero"]');
  root.classList.toggle("dms-hero-home", hero !== null && panel === null);
  // Fullscreen is plugin-state only (host chrome [全屏] toggles dms-right-full).
  syncRightChrome();
  if (isPhone()) {
    if (state.leftVisible) repairLeftHost();
    else if (!state.rightVisible) forceMountSidebar();
  }
}

function scrimOnce() {
  let el = $(".dms-scrim");
  if (el === null) {
    el = document.createElement("div");
    el.className = "dms-scrim";
    el.setAttribute("aria-hidden", "true");
    el.addEventListener("click", () => {
      if (state.rightVisible) closeRight();
      else if (leftOpen()) toggleLeft();
    });
    document.body.appendChild(el);
  }
  return el;
}

const INJECT = ["layout", "uiWorkspace", "workspaces"];

function apply(ctx) {
  state.ctxRef = ctx;
  const disposers = [];
  let started = false;
  const collect = (dispose) => {
    if (typeof dispose === "function") disposers.push(dispose);
  };
  const start = () => {
    if (started) return;
    started = true;
    const off = new Set((new URLSearchParams(location.search).get("dms-off") || "").split(","));
    state.DEBUG_OFF = off;
    if (!off.has("styles")) styleOnce();
    scrimOnce();
    collect(installTopbarRepair());
    collect(installBackStack());
    collect(installExitGuard());
    collect(installGestures());
    collect(installRightInterceptors());
    collect(installViewTabsMenu());
    collect(installKeyboard());
    collect(installSettingsWatcher());
    collect(installAttachSheet());
    collect(installSessionWatcher());
    if (!off.has("autoclose")) collect(installDrawerAutoClose());
    if (!off.has("longpress")) collect(installLongPress());
    if (!off.has("observer")) collect(installObserver(sync));
    sync();
    // Bounded startup preload: the host sidebar is toggled open once and kept
    // mounted under the page. Retry only while the mount request is in flight
    // (sidebarExpandBusy) — never re-toggle a host that is already committing.
    let leftPreloadTries = 0;
    let leftPreloadTimer = 0;
    const ensureLeftPreload = () => {
      leftPreloadTimer = 0;
      if (!isPhone() || state.leftVisible || state.rightVisible) return;
      if (hostLeftOpen()) return;
      if (state.sidebarMountState === "failed") return;
      if (state.sidebarExpandBusy) {
        if (leftPreloadTries++ < 40) leftPreloadTimer = setTimeout(ensureLeftPreload, 150);
        return;
      }
      forceMountSidebar();
      if (leftPreloadTries++ < 8) leftPreloadTimer = setTimeout(ensureLeftPreload, 200);
    };
    leftPreloadTimer = setTimeout(ensureLeftPreload, 120);
    disposers.push(() => { if (leftPreloadTimer !== 0) clearTimeout(leftPreloadTimer); });
    const preloadTimer = setTimeout(() => preloadRight(), 800);
    disposers.push(() => clearTimeout(preloadTimer));
    const wanted = new URLSearchParams(location.search).get("dms");
    if (wanted === "left" && !leftOpen()) {
      const leftTimer = setTimeout(() => toggleLeft(), 600);
      disposers.push(() => clearTimeout(leftTimer));
    }
    if (wanted === "right" && !state.rightVisible) {
      const rightTimer = setTimeout(() => openRight(), 900);
      disposers.push(() => clearTimeout(rightTimer));
    }
  };
  if (document.readyState === "loading") {
    const onReady = () => start();
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
    disposers.push(() => document.removeEventListener("DOMContentLoaded", onReady));
  } else {
    start();
  }
  ctx.effect(() => () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      try { disposers[index](); } catch (error) { /* isolated dispose */ }
    }
    for (const tag of $$('style[data-dsh-mobile-shell="styles"]')) tag.remove();
    for (const el of $$(".dms-scrim")) el.remove();
    for (const el of $$(".dms-attach-sheet, .dms-attach-backdrop, .dms-right-loading")) el.remove();
  }, "dsh-mobile-shell: teardown");
}

export { apply, INJECT };
