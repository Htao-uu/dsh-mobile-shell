// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, isPhone, makeButton } from "../core/dom.js";
import { closeRight, hostRightOpen, openRight, rightExpandTrigger, rightPanelContentReady, showRightLoading, startRightOpenWait, toggleRightFullscreen } from "../features/right-drawer.js";
import { ensureSidebarMounted, toggleLeft } from "../features/left-drawer.js";

// The hamburger button lives inside the host header leading slot so it is part
// of the header layout (no two coordinate systems to keep in sync). React may
// replace the leading container at any time, so a small scoped observer puts
// the button back before the next paint.
function bindMenuPreload(menu) {
  if (menu.dataset.dmsPreloadBound === "1") return;
  menu.dataset.dmsPreloadBound = "1";
  // Start mounting the host drawer on touch-down, slightly before the click,
  // so a button-triggered open does not pay the full host commit latency.
  menu.addEventListener("pointerdown", () => ensureSidebarMounted(), { passive: true });
}

function installMenuButton(leading) {
  // Append only when the leading slot has no menu button. Never remove or
  // replace an existing button; React owns the container, we only fill the gap.
  const existing = leading.querySelector(".dms-menu");
  if (existing !== null) {
    bindMenuPreload(existing);
    return;
  }
  const menu = makeButton("menu", "打开侧边栏", () => toggleLeft());
  bindMenuPreload(menu);
  leading.appendChild(menu);
}

function installRightButton(header, moreButton) {
  // Same deployment strategy as the left hamburger: inject a normal header
  // button into the host's right action row (the person / "..." utilities),
  // never directly into the header and never as a fixed overlay. If that row
  // has not rendered yet, remove any misplaced instance and wait for the
  // header observer to call us again.
  const utilities = moreButton !== null && moreButton.parentElement !== null
    ? moreButton.parentElement
    : header.querySelector('[class*="_headerUtilities"]');
  const misplaced = [...header.querySelectorAll(".dms-right-menu")];
  if (utilities === null) {
    for (const button of misplaced) button.remove();
    return;
  }
  let existing = utilities.querySelector(".dms-right-menu");
  for (const button of misplaced) {
    if (button !== existing) button.remove();
  }
  if (existing === null) {
    existing = makeButton("panel", "打开右侧栏", () => openRight());
    existing.classList.add("dms-right-menu");
  }
  // Requested order: person, "...", right-panel button (far right).
  if (moreButton !== null && moreButton.parentElement === utilities) {
    if (existing.previousElementSibling !== moreButton) utilities.insertBefore(existing, moreButton.nextSibling);
  } else if (existing.parentElement !== utilities) {
    utilities.appendChild(existing);
  }
  // Hide the host's own expand control once ours is in the layout flow.
  for (const hostExpand of header.querySelectorAll("[data-sidebar-right-expand]")) {
    if (hostExpand === existing) continue;
    hostExpand.dataset.dmsHidden = "1";
  }
}

function ensureTopButtons() {
  if (!isPhone()) return;
  const header = $('[class*="_centerCol"] header');
  if (header === null) return;
  const leading = header.querySelector("[data-conversation-header-leading]");
  if (leading !== null) installMenuButton(leading);
  const moreButton = header.querySelector('[aria-label*="更多"], [aria-label*="More"], [aria-label="..."]');
  installRightButton(header, moreButton);
}

// Scoped repair observer: watch only the header containers that may drop our
// button, re-insert synchronously (MutationObserver callbacks run before paint,
// so the button does not flash), and never append when the container already
// has one. HTML class changes are deliberately not observed to avoid a
// reconcile loop with sync().
function installTopbarRepair() {
  let headerObserver = null;
  let centerObserver = null;
  let observedHeader = null;
  let observedCenter = null;
  let repairing = false;

  const bind = () => {
    const center = $('[class*="_centerCol"]');
    if (center !== observedCenter) {
      if (centerObserver !== null) centerObserver.disconnect();
      observedCenter = center;
      if (center !== null) {
        centerObserver = new MutationObserver(repair);
        centerObserver.observe(center, { childList: true });
      }
    }
    const header = $('[class*="_centerCol"] header');
    if (header !== observedHeader) {
      if (headerObserver !== null) headerObserver.disconnect();
      observedHeader = header;
      if (header !== null) {
        headerObserver = new MutationObserver(repair);
        headerObserver.observe(header, { childList: true, subtree: true });
      }
    }
  };

  function repair() {
    if (repairing) return;
    repairing = true;
    try {
      ensureTopButtons();
      bind();
    } catch (error) {
      // A host re-render in the middle of repair must not break the plugin.
    } finally {
      repairing = false;
    }
  }

  const onPointerUp = () => repair();
  document.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });

  ensureTopButtons();
  bind();

  return () => {
    document.removeEventListener("pointerup", onPointerUp, { capture: true });
    if (headerObserver !== null) headerObserver.disconnect();
    if (centerObserver !== null) centerObserver.disconnect();
    headerObserver = null;
    centerObserver = null;
    observedHeader = null;
    observedCenter = null;
  };
}

function installRightInterceptors() {

  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  listen(document, "click", (event) => {
    if (state.rightPreloadClick) return; // programmatic preload clicks must reach the host
    if (!isPhone()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    // Check the panel chrome before the generic expand matcher: the host's
    // collapse button has an aria-label containing "右侧边栏", so the broad
    // label fallback used to misclassify it as "expand" and reopen instead of
    // closing.
    const ownRight = target.closest(".dms-right-menu");
    if (ownRight !== null) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      openRight();
      return;
    }
    const toggle = target.closest("[data-sidebar-right-toggle]");
    const modeBtn = target.closest("[data-sidebar-right-mode]");
    const expanded = toggle === null && modeBtn === null ? rightExpandTrigger(target) : null;
    if (expanded === null && modeBtn === null && toggle === null) {
      // Any other header click (left hamburger, person, "...", title) must be
      // left entirely to the host. A previous deferred "did the host open the
      // right panel?" fallback fired for EVERY header click and made the left
      // button open the right drawer ~250 ms later.
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (toggle !== null) {
      // 宿主 [收起] = 关闭插件抽屉（全屏态先退全屏，FEATURES 语义）
      closeRight();
      return;
    }
    if (modeBtn !== null) {
      toggleRightFullscreen();
      return;
    }
    if (expanded !== null) {
      // 任务34：先同步给出可见反馈（状态+class+加载占位），再做任何内容检查。
      state.rightVisible = true;
      state.rightActivityAt = performance.now();
      state.rightFullIntent = false;
      document.documentElement.classList.add("dms-right-open");
      showRightLoading();
      try { openRight(); } catch (error) { /* openRight 已给出基础反馈 */ }
      return;
    }
    try {
      openRight();
    } catch (error) {
      // 保证点击永远不会“无反应”：至少打开抽屉/加载占位。
      state.rightVisible = true;
      document.documentElement.classList.add("dms-right-open");
      startRightOpenWait();
    }
  }, true);

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
  };
}

export { ensureTopButtons, installTopbarRepair, installRightInterceptors };
