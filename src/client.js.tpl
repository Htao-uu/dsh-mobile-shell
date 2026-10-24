/**
 * dsh-mobile-shell — browser half.
 *
 * A client-only DSH Web UI plugin that turns the stock three-column shell into
 * a phone-first shell modelled on the official DeepSeek app:
 *
 *   - the permanent left rail is hidden; a hamburger opens the original
 *     sidebar content as an 88vw drawer with a dimmed scrim;
 *   - the right details panel becomes a right-hand drawer, leaving part of the
 *     conversation visible behind it;
 *   - the session header gets app-style left/right action buttons;
 *   - the composer, hero and settings surfaces are restyled with the app's
 *     palette, radii and spacing;
 *   - edge swipes open/close both drawers and the Android hardware back key is
 *     routed through a single back stack (settings -> right drawer -> left
 *     drawer -> host).
 *
 * The plugin never moves a host React node: it only adds its own DOM
 * (buttons, scrims, one style tag) and a handful of data-* markers on the
 * existing frame. Host classes are matched by their stable suffix
 * ([class*="_sidebarCol"]) so version hash churn is irrelevant.
 */
window.__ModuleLoader__.load({
  id: "dsh-mobile-shell",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const CSS = __CSS_JSON__;
    const MEDIA = "(max-width: 1023px)";
    const EDGE = 26;
    const TRIGGER = 56;
    const LOCK = 6;

    const ICONS = {
      menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
      plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      panel: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/></svg>',
      camera: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 8.5h3l1.4-2h7.2L17 8.5h3A1.5 1.5 0 0 1 21.5 10v7.5A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V10A1.5 1.5 0 0 1 4 8.5Z"/><circle cx="12" cy="13.7" r="3.3"/></svg>',
      image: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.2" cy="9.2" r="1.6"/><path d="m4.8 17 4.4-4.3 3 2.8 2.6-2.3 4.4 3.8"/></svg>',
      full: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5.8A1.8 1.8 0 0 1 5.8 4H9M15 4h3.2A1.8 1.8 0 0 1 20 5.8V9M20 15v3.2a1.8 1.8 0 0 1-1.8 1.8H15M9 20H5.8A1.8 1.8 0 0 1 4 18.2V15"/></svg>',
      exitFull: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v3.2A1.8 1.8 0 0 1 7.2 9H4M15 4v3.2A1.8 1.8 0 0 0 16.8 9H20M9 20v-3.2A1.8 1.8 0 0 0 7.2 15H4M15 20v-3.2a1.8 1.8 0 0 1 1.8-1.8H20"/></svg>',
      file: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3.5h7l5 5v12H6z"/><path d="M13 3.5v5h5"/></svg>',
      check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>'
    };

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
    const isPhone = () => window.matchMedia(MEDIA).matches;
    const frame = () => $('[class*="_frame"]');
    const sidebarCol = () => $('[class*="_sidebarCol"]');
    const rightbarCol = () => $('[class*="_rightbarCol"]');
    const settingsPanel = () => $('[data-shortcut-modal="settings"]');
    const hostLeftOpen = () => { const f = frame(); return f !== null && !f.hasAttribute("data-sidebar-collapsed"); };
    let leftVisible = false;
    let rightVisible = false;
    let sidebarExpandBusy = false;
    let sidebarExpandTimer = 0;
    let rightActivityAt = 0;
    let leftRepairTimer = 0;
    const leftOpen = () => leftVisible;
    const rightOpen = () => $("[data-sidebar-right-open]") !== null;
    const hostRightOpen = () => $("[data-sidebar-right-session]:not([hidden]) [data-sidebar-right-open]") !== null;
    let rightPreloadClick = false;
    let rightPreloadState = "idle";
    let rightPreloadAttempts = new Set();
    let rightFallbackOpen = false;
    let rightLoadingEl = null;
    let rightOpenWaitTimer = 0;
    let rightWaitFallbackTried = false;
    let rightViewTabsInjected = false;
    let rightViewMenuObserver = null;
    let rightViewMenuRaf = 0;
    let rightViewTabsFallback = false;
    let lastRightPreloadAt = 0;
    let closeAttachForSession = null;
    let sessionKeyPrev = "";
    let lastPointerInEditor = false;
    let lastPointerAt = 0;

    let ctxRef = null;
    let gestureBusy = false;
    let springAnimating = false;
    let DEBUG_OFF = new Set();

    function styleOnce() {
      let tag = document.querySelector('style[data-dsh-mobile-shell="styles"]');
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.dshMobileShell = "styles";
        tag.dataset.plugin = "dsh-mobile-shell";
        document.head.appendChild(tag);
      }
      if (tag.textContent !== CSS) tag.textContent = CSS;
      return tag;
    }

    function scrimOnce() {
      let el = $(".dms-scrim");
      if (el === null) {
        el = document.createElement("div");
        el.className = "dms-scrim";
        el.setAttribute("aria-hidden", "true");
        el.addEventListener("click", () => {
          if (rightVisible) closeRight();
          else if (leftOpen()) toggleLeft();
        });
        document.body.appendChild(el);
      }
      return el;
    }

    function cloneIcon(selector) {
      const host = $(selector);
      const svg = host === null ? null : host.querySelector("svg");
      return svg === null ? "" : svg.outerHTML;
    }
    function iconFor(kind) {
      // 任务29：左上角永远用我们的「三」汉堡图标，不克隆宿主 expand/panel 的方框图标
      if (kind === "menu") return ICONS.menu;
      if (kind === "plus") return cloneIcon('[class*="_sidebarCol"] [class*="_newSession"]') || ICONS.plus;
      if (kind === "panel") return cloneIcon("[data-sidebar-right-expand]") || ICONS.panel;
      return "";
    }
    function makeButton(kind, label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dms-iconbtn dms-" + kind;
      b.setAttribute("aria-label", label);
      b.innerHTML = iconFor(kind);
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
      return b;
    }

    function ensureSidebarMounted() {
      if (!isPhone() || hostLeftOpen() || sidebarExpandBusy) return;
      if (rightVisible || document.documentElement.classList.contains("dms-right-open")) return;
      sidebarExpandBusy = true;
      document.documentElement.classList.add("dms-preload-left");
      const layout = ctxRef && ctxRef.layout;
      if (layout && typeof layout.toggleSidebar === "function") layout.toggleSidebar();
      else {
        const col = sidebarCol();
        const btn = col ? col.querySelector('[class*="_toggle"]') : null;
        if (btn) btn.click();
      }
      setTimeout(() => { sidebarExpandBusy = false; }, 900);
    }
    let lastMountAttempt = 0;
    function forceMountSidebar() {
      if (!isPhone() || leftVisible || rightVisible) return;
      const root = document.documentElement;
      root.classList.add("dms-preload-left");
      const f = frame();
      if (f === null) return;
      if (!f.hasAttribute("data-sidebar-collapsed")) return;
      const now = performance.now();
      if (now - lastMountAttempt < 450) return;
      lastMountAttempt = now;
      const layout = ctxRef && ctxRef.layout;
      if (layout && typeof layout.toggleSidebar === "function") layout.toggleSidebar();
      else {
        const col = sidebarCol();
        const btn = col ? col.querySelector('[class*="_toggle"]') : null;
        if (btn) btn.click();
      }
    }

    function preloadSidebar() {
      if (!isPhone() || leftVisible || rightVisible || settingsPanel() !== null) return;
      if (hostLeftOpen() || sidebarExpandBusy) return;
      const root = document.documentElement;
      root.classList.add("dms-preload-left");
      ensureSidebarMounted();
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
      return body.querySelector("button, [class*='_entry'], [class*='_guide'], img, svg, input, textarea") !== null;
    }
    function rightLoadingElRef() {
      if (rightLoadingEl === null) {
        rightLoadingEl = document.createElement("div");
        rightLoadingEl.className = "dms-right-loading";
        rightLoadingEl.setAttribute("aria-hidden", "true");
        rightLoadingEl.innerHTML = '<div class="dms-right-loading-spinner"></div><div class="dms-right-loading-text">正在加载右侧栏…</div>';
        document.body.appendChild(rightLoadingEl);
      }
      return rightLoadingEl;
    }
    function showRightLoading() {
      const el = rightLoadingElRef();
      el.hidden = false;
      el.setAttribute("aria-hidden", "false");
    }
    function hideRightLoading() {
      if (rightLoadingEl !== null) { rightLoadingEl.hidden = true; rightLoadingEl.setAttribute("aria-hidden", "true"); }
    }
    function stopRightOpenWait(hideLoader) {
      if (rightOpenWaitTimer !== 0) { clearInterval(rightOpenWaitTimer); rightOpenWaitTimer = 0; }
      if (hideLoader === true) hideRightLoading();
    }
    function startRightOpenWait() {
      stopRightOpenWait(false);
      rightWaitFallbackTried = false;
      showRightLoading();
      // 内容未就绪时最多做一次宿主正常展开 fallback，然后等 tab/正文出现。
      if (!rightPanelHasTab()) {
        rightWaitFallbackTried = true;
        const expand = $("[data-sidebar-right-expand]");
        if (expand !== null) { rightFallbackOpen = true; clickHost(expand); }
      }
      // 任务34：不自动关闭；加载占位一直可见，直到内容就绪或用户主动关闭。
      rightOpenWaitTimer = setInterval(() => {
        if (!rightVisible) { stopRightOpenWait(true); return; }
        if (rightPanelContentReady()) { stopRightOpenWait(true); return; }
        if (!rightPanelHasTab() && !rightWaitFallbackTried) {
          rightWaitFallbackTried = true;
          const expand = rightExpandTriggerInHeader();
          if (expand !== null) { rightFallbackOpen = true; clickHost(expand); }
        }
      }, 120);
    }
    const clickHost = (el) => {
      if (el === null) return false;
      rightPreloadClick = true;
      try { el.click(); } catch (error) { /* host busy */ } finally { rightPreloadClick = false; }
      return true;
    };
    // 任务32：右栏 preload 每个 session 只尝试一次；sync() 永不触发宿主点击。
    // 流程：宿主 collapsed → 点一次 expand → 等真正出现 tab（空 pane 不算）→ 必要时
    // 点一次宿主 [data-dockkit-add-tab] → 有 tab 后立刻 toggle 回 collapsed。
    // 失败则也 toggle 回 collapsed（保证右上角 expand 按钮回来）并标记 fail；
    // 打开时不再展示空面板（由 openRight 的用户触发 fallback 处理）。
    function preloadRight() {
      if (!isPhone() || settingsPanel() !== null || rightVisible) return;
      if (rightPreloadState === "busy") return;
      const sid = rightSessionId();
      if (sid === "") return;
      if (rightPreloadAttempts.has(sid)) return;
      if (hostRightOpen()) {
        rightPreloadAttempts.add(sid);
        clickHost($("[data-sidebar-right-toggle]"));
        rightPreloadState = rightPanelHasTab() ? "ok" : "idle";
        return;
      }
      const expand = $("[data-sidebar-right-expand]");
      if (expand === null) return;
      const now = performance.now();
      if (now - lastRightPreloadAt < 2000) return;
      lastRightPreloadAt = now;
      rightPreloadAttempts.add(sid);
      rightPreloadState = "busy";
      document.documentElement.classList.add("dms-preload-right");
      clickHost(expand);
      const started = now;
      let addTried = false;
      let collapsed = false;
      const collapse = () => {
        if (collapsed) return;
        if (hostRightOpen()) {
          if (!rightPanelHasTab() && !addTried) {
            const addBtn = $("[data-dockkit-add-tab]");
            if (addBtn !== null) { addTried = true; clickHost(addBtn); }
          }
          if (rightPanelContentReady()) {
            collapsed = true;
            setTimeout(() => {
              clickHost($("[data-sidebar-right-toggle]"));
              rightPreloadState = "ok";
              document.documentElement.setAttribute("data-dms-right-preloaded", "1");
            }, 80);
            return;
          }
        }
        if (performance.now() - started > 2600) {
          collapsed = true;
          clickHost($("[data-sidebar-right-toggle]"));
          rightPreloadState = "fail";
          document.documentElement.setAttribute("data-dms-right-preload-failed", "1");
          return;
        }
        requestAnimationFrame(collapse);
      };
      requestAnimationFrame(collapse);
    }
    function repairLeftHost() {
      if (leftRepairTimer !== 0) { clearTimeout(leftRepairTimer); leftRepairTimer = 0; }
      if (!leftVisible) return;
      const root = document.documentElement;
      root.classList.remove("dms-left-hide");
      if (!hostLeftOpen()) {
        if (!rightVisible && !root.classList.contains("dms-right-open")) {
          sidebarExpandBusy = false;
          ensureSidebarMounted();
        }
      } else {
        // Keep the preload pin in place while the drawer is open: the combined
        // html.dms-preload-left.dms-left-open CSS already lifts it above the page,
        // and not toggling the class avoids a repaint/white flash on fast switches.
        root.classList.add("dms-preload-left");
      }
      leftRepairTimer = setTimeout(repairLeftHost, 350);
    }
    // openLeftVisual()/gesture frames write !important inline overrides onto the
    // host sidebar and center column. A closed drawer must not keep them: the
    // inline z-index:90 would beat html.dms-preload-left (z-index:0) and leave
    // the already-expanded host sidebar covering the page. The CSS slide-out
    // also needs the inline transition/transform gone to be able to animate.
    function clearDrawerInline() {
      const col = sidebarCol();
      if (col !== null) {
        col.style.removeProperty("animation");
        col.style.removeProperty("transition");
        col.style.removeProperty("transform");
        col.style.removeProperty("z-index");
        col.style.removeProperty("will-change");
      }
      const center = $('[class*="_centerCol"]');
      if (center !== null) {
        center.style.removeProperty("transform");
        center.style.removeProperty("opacity");
        center.style.removeProperty("transition");
        center.style.removeProperty("will-change");
      }
    }
    function openLeftVisual() {
      leftVisible = true;
      const root = document.documentElement;
      // Keep dms-preload-left: the host sidebar stays mounted and painted under
      // the page (P0 fix), so opening only needs to raise it above the page and
      // let the CSS push move centerCol. Removing preload here re-ran the host
      // slide-in animation and could show a white frame on fast drawer switches.
      root.classList.remove("dms-left-hide");
      root.classList.add("dms-left-open");
      const col = sidebarCol();
      if (col !== null) {
        col.style.setProperty("animation", "none", "important");
        col.style.setProperty("transition", "none", "important");
        col.style.setProperty("transform", "none", "important");
        col.style.setProperty("z-index", "90", "important");
      }
      repairLeftHost();
    }
    function closeLeftVisual(animated) {
      if (!leftVisible) return;
      leftVisible = false;
      if (leftRepairTimer !== 0) { clearTimeout(leftRepairTimer); leftRepairTimer = 0; }
      // Drop the inline overrides first so the CSS close transition/class can win
      // and the preloaded sidebar falls back under the page.
      clearDrawerInline();
      const root = document.documentElement;
      root.classList.remove("dms-left-open");
      if (animated) {
        root.classList.add("dms-left-hide");
        setTimeout(() => {
          if (!leftOpen()) {
            root.classList.remove("dms-left-hide");
            root.classList.add("dms-preload-left");
          }
        }, 260);
      } else {
        root.classList.add("dms-preload-left");
      }
    }
    function toggleLeft() {
      if (leftOpen()) closeLeftVisual(true);
      else openLeftVisual();
    }
    function openRight() {
      rightVisible = true;
      rightActivityAt = performance.now();
      rightFullIntent = false;
      document.documentElement.classList.add("dms-right-open");
      if (!rightPanelContentReady()) startRightOpenWait();
      else stopRightOpenWait(true);
    }
    function closeRight() {
      rightVisible = false;
      rightFullIntent = false;
      rightActivityAt = performance.now();
      stopRightOpenWait(true);
      const root = document.documentElement;
      root.classList.remove("dms-right-full");
      root.classList.remove("dms-right-open");
      if (rightFallbackOpen) {
        rightFallbackOpen = false;
        clickHost($("[data-sidebar-right-toggle]"));
      }
    }
    // Plugin-owned intent: only our [全屏] button may put the host panel into its
    // fullscreen layout. Everything else (edge swipe, back key, host re-render)
    // normalizes back to the 88vw sidebar state (用户 0.6.18 修正第一条).
    let rightFullIntent = false;
        function exitRightFullscreen(closeDrawer) {
      rightFullIntent = false;
      document.documentElement.classList.remove("dms-right-full");
      if (closeDrawer === true) closeRight();
    }
        function newSession() {
      const btn = $('[class*="_newSession"]');
      if (btn) btn.click();
    }

    function toggleRightFullscreen() {
      const root = document.documentElement;
      if (root.classList.contains("dms-right-full")) {
        rightFullIntent = false;
        root.classList.remove("dms-right-full");
      } else {
        rightFullIntent = true;
        rightVisible = true;
        root.classList.add("dms-right-open");
        root.classList.add("dms-right-full");
      }
      syncRightChrome();
    }
    // 宿主 chrome 的 [全屏] glyph 由宿主 fullscreen 状态决定；手机上 autoFullscreen
    // 恒真，glyph 会一直是“退出全屏”。插件按自己的 dms-right-full 状态替换 svg
    // （按钮仍然是宿主的，不自建按钮）。
    function syncRightChrome() {
      if (!isPhone()) return;
      const modeBtn = $("[data-sidebar-right-mode]");
      if (modeBtn === null) return;
      const full = document.documentElement.classList.contains("dms-right-full");
      const want = full ? ICONS.exitFull : ICONS.full;
      try {
        if (modeBtn.innerHTML !== want) modeBtn.innerHTML = want;
      } catch (error) { /* host busy */ }
      modeBtn.setAttribute("aria-label", full ? "退出全屏" : "进入全屏");
    }
    function rightExpandTriggerInHeader() {
      const header = document.querySelector('[class*="_centerCol"] header');
      if (header === null) return null;
      return header.querySelector("[data-sidebar-right-expand]") ||
        header.querySelector('[aria-label="打开右侧边栏"], [aria-label="展开右侧边栏"], [aria-label="Open right sidebar"], [aria-label="Expand right sidebar"], [aria-label*="右侧栏"], [aria-label*="右侧边栏"]');
    }
    function rightExpandTrigger(node) {
      if (!(node instanceof Element)) return null;
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
    function installRightInterceptors() {
      document.addEventListener("click", (event) => {
        if (rightPreloadClick) return; // programmatic preload clicks must reach the host
        if (!isPhone()) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target === null) return;
        const expanded = rightExpandTrigger(target);
        const modeBtn = target.closest("[data-sidebar-right-mode]");
        const toggle = target.closest("[data-sidebar-right-toggle]");
        if (expanded === null && modeBtn === null && toggle === null) {
          // 未命中：不 preventDefault，让宿主原生处理；若宿主真的把面板打开了，
          // 延迟接管为插件状态，避免 preload CSS 把面板藏起来造成“没反应”。
          if (target.closest("header") !== null) {
            setTimeout(() => {
              if (!rightVisible && hostRightOpen()) {
                rightVisible = true;
                rightActivityAt = performance.now();
                document.documentElement.classList.add("dms-right-open");
                showRightLoading();
                if (!rightPanelContentReady()) startRightOpenWait();
              }
            }, 250);
          }
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        if (expanded !== null) {
          // 任务34：先同步给出可见反馈（状态+class+加载占位），再做任何内容检查。
          rightVisible = true;
          rightActivityAt = performance.now();
          rightFullIntent = false;
          document.documentElement.classList.add("dms-right-open");
          showRightLoading();
          try { openRight(); } catch (error) { /* openRight 已给出基础反馈 */ }
          return;
        }
        try {
          if (toggle !== null) {
            // 宿主 [收起] = 关闭插件抽屉（全屏态先退全屏，FEATURES 语义）
            closeRight();
            return;
          }
          if (modeBtn !== null) {
            toggleRightFullscreen();
            return;
          }
          openRight();
        } catch (error) {
          // 保证点击永远不会“无反应”：至少打开抽屉/加载占位。
          rightVisible = true;
          document.documentElement.classList.add("dms-right-open");
          startRightOpenWait();
        }
      }, true);
    }
    function sessionActionsAnchor() {
      return $('header [aria-label="更多操作"], header [aria-label="More actions"], header [aria-haspopup="menu"][class*="_moreButton"]');
    }
    function hostViewTabs() {
      return $$('[data-conversation-tabs] [role="tab"]');
    }
    function hostViewTabLabel(tab) {
      return (tab.textContent || "").trim();
    }
    function closeSessionActionsMenu() {
      const anchor = sessionActionsAnchor();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      setTimeout(() => {
        if (anchor !== null && anchor.getAttribute("aria-expanded") === "true") {
          try { anchor.click(); } catch (error) { /* host busy */ }
        }
      }, 40);
    }
    function injectViewTabsIntoMenu(menu) {
      if (menu === null) return false;
      const menuText = menu.textContent || "";
      if (!/下载 Session 日志|Download session log/.test(menuText)) return false;
      const tabs = hostViewTabs().filter((tab) => /^(对话|轨迹|Chat|Trajectory)$/.test(hostViewTabLabel(tab)));
      if (tabs.length === 0) return false;
      const sample = menu.querySelector('[role="menuitem"]');
      if (sample === null) return false;
      const signature = tabs.map((tab) => hostViewTabLabel(tab) + (tab.getAttribute("aria-selected") === "true" ? "1" : "0")).join("|");
      const existing = menu.querySelectorAll("[data-dms-view-tab]");
      if (existing.length === tabs.length && menu.getAttribute("data-dms-vtab-sig") === signature) return true;
      for (const old of existing) old.remove();
      for (const tab of tabs) {
        const label = hostViewTabLabel(tab);
        const active = tab.getAttribute("aria-selected") === "true";
        const item = sample.cloneNode(true);
        item.setAttribute("data-dms-view-tab", label);
        item.setAttribute("role", "menuitem");
        item.removeAttribute("aria-disabled");
        item.removeAttribute("disabled");
        const svg = item.querySelector("svg");
        if (svg !== null) svg.remove();
        const spans = [...item.querySelectorAll("span")].filter((span) => (span.textContent || "").trim().length > 0);
        const labelEl = spans.length > 0 ? spans[spans.length - 1] : null;
        if (labelEl !== null) labelEl.textContent = (active ? "✓ " : "") + label;
        else item.textContent = (active ? "✓ " : "") + label;
        item.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          try { tab.click(); } catch (error) { /* host busy */ }
          closeSessionActionsMenu();
        });
        menu.appendChild(item);
      }
      menu.setAttribute("data-dms-vtab-sig", signature);
      document.documentElement.classList.add("dms-vtabs-menu");
      rightViewTabsFallback = false;
      rightViewTabsInjected = true;
      return true;
    }
    function scanViewTabsMenu() {
      for (const menu of $$('[role="menu"]')) {
        const isSessionMenu = /下载 Session 日志|Download session log/.test(menu.textContent || "");
        if (!isSessionMenu) continue;
        if (injectViewTabsIntoMenu(menu)) return;
        // 注入失败：立即恢复 header tab 常驻，不能让两个入口都消失；
        // 只有 tabs 确实存在时才把 fallback 固化为 sticky（否则下次对话页仍可尝试注入）。
        document.documentElement.classList.remove("dms-vtabs-menu");
        if (hostViewTabs().length > 0) rightViewTabsFallback = true;
      }
    }
    function installViewTabsMenu() {
      // 任务33：header 的「对话/轨迹」tab 行隐藏，移入宿主「...」菜单；注入失败则恢复常驻。
      document.documentElement.classList.add("dms-vtabs-menu");
      const schedule = () => {
        if (rightViewMenuRaf !== 0) return;
        rightViewMenuRaf = requestAnimationFrame(() => { rightViewMenuRaf = 0; scanViewTabsMenu(); });
      };
      document.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target === null || target.closest('[aria-haspopup="menu"]') === null) return;
        setTimeout(scanViewTabsMenu, 30);
      }, true);
      rightViewMenuObserver = new MutationObserver(schedule);
      rightViewMenuObserver.observe(document.body, { childList: true, subtree: true });
      // 安全回退：只有在"已进入对话页且有 tabs、但宿主根本没有「更多操作」按钮"时
      // 才恢复 header tabs 常驻（避免出现既无 tabs 又无菜单项的真空）；默认保持隐藏。
      setInterval(() => {
        if (rightViewTabsInjected || rightViewTabsFallback) return;
        if (hostViewTabs().length === 0) return;
        const header = $('[class*="_centerCol"] header');
        const conversation = header !== null && header.querySelector("[data-conversation-header-leading], [data-conversation-header-corner]") !== null;
        if (!conversation) return;
        if (sessionActionsAnchor() === null) {
          rightViewTabsFallback = true;
          document.documentElement.classList.remove("dms-vtabs-menu");
        }
      }, 2000);
    }
    function ensureTopButtons() {
      if (!isPhone()) return;
      const header = $('[class*="_centerCol"] header');
      if (header === null) return;
      const leading = header.querySelector("[data-conversation-header-leading]");
      if (leading !== null) {
        // 任务29：左上角统一为「三」汉堡；保留并修正一个 .dms-menu（旧版本/HMR 可能
        // 注入了克隆宿主图标的按钮），多余的删除，宿主的 leading 图标由 CSS 隐藏。
        const menus = leading.querySelectorAll(".dms-menu");
        let menu = menus.length > 0 ? menus[0] : null;
        for (let i = 1; i < menus.length; i++) menus[i].remove();
        if (menu === null) {
          menu = makeButton("menu", "打开侧边栏", () => toggleLeft());
          leading.appendChild(menu);
        }
        if (menu.getAttribute("aria-label") !== "打开侧边栏") menu.setAttribute("aria-label", "打开侧边栏");
      }
      const corner = header.querySelector("[data-conversation-header-corner]") ||
        header.querySelector('[class*="_headerCorner"]');
      if (corner !== null) {
        // 任务 28：右栏入口改用宿主自带的 [data-sidebar-right-expand] 图标，
        // 不再注入自建 .dms-panel；只清理旧版本可能残留的注入按钮（HMR）。
        for (const stale of corner.querySelectorAll(".dms-panel, .dms-plus")) stale.remove();
      }
    }

    const CHEVRON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    const GEAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.35.4.65.73.86"/></svg>';

    function panelActiveId() {
      const layout = ctxRef && ctxRef.layout;
      if (layout === undefined || layout === null) return null;
      try {
        const info = layout.panelInfo;
        const state = info && typeof info.get === "function" ? info.get() : (info && info.value);
        return state && state.activePanelId !== undefined ? state.activePanelId : null;
      } catch (error) {
        return null;
      }
    }

    function settingsBack() {
      const root = document.documentElement;
      if (root.classList.contains("dms-settings-section")) {
        root.classList.remove("dms-settings-section");
        root.classList.add("dms-settings-list");
        const title = $(".dms-settings-title-text");
        if (title !== null) title.textContent = "设置";
        return true;
      }
      const panel = settingsPanel();
      const close = panel === null ? null : panel.querySelector('[class*="_close"]');
      if (close !== null) { close.click(); return true; }
      return false;
    }

    function openSettingsSection(cell) {
      const root = document.documentElement;
      root.classList.remove("dms-settings-list");
      root.classList.add("dms-settings-section");
      const label = cell.querySelector('[class*="_navLabel"]');
      const title = $(".dms-settings-title-text");
      if (title !== null) title.textContent = label === null ? "设置" : label.textContent.trim();
      const options = settingsPanel() === null ? null : settingsPanel().querySelector('[class*="_options"]');
      if (options !== null) options.scrollTop = 0;
    }

    function settingsChrome() {
      let chrome = $(".dms-settings-chrome");
      if (chrome === null) {
        chrome = document.createElement("div");
        chrome.className = "dms-settings-chrome";
        const back = document.createElement("button");
        back.type = "button";
        back.className = "dms-settings-back";
        back.setAttribute("aria-label", "返回");
        back.innerHTML = CHEVRON_LEFT;
        back.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); settingsBack(); });
        const title = document.createElement("div");
        title.className = "dms-settings-title";
        title.innerHTML = GEAR_ICON + '<span class="dms-settings-title-text">设置</span>';
        chrome.appendChild(back);
        chrome.appendChild(title);
        document.body.appendChild(chrome);
      }
      return chrome;
    }

    function ensureSettings(panel) {
      settingsChrome();
      const root = document.documentElement;
      const section = panel.querySelector('[class*="_options"]');
      const sectionText = section === null ? "" : (section.innerText || "").slice(0, 120);
      const pluginPage = panel.querySelector('[class*="_market"], [data-dsh-market]') !== null || sectionText.indexOf("插件市场") >= 0;
      root.classList.toggle("dms-plugin-section", pluginPage);
      if (root.classList.contains("dms-settings-chrome-init") !== true) {
        root.classList.remove("dms-settings-section");
        root.classList.add("dms-settings-list");
        root.classList.add("dms-settings-chrome-init");
        const title = $(".dms-settings-title-text");
        if (title !== null) title.textContent = "设置";
      }
      if (panel.dataset.dmsNavBound !== "1") {
        panel.dataset.dmsNavBound = "1";
        panel.addEventListener("click", (e) => {
          const target = e.target instanceof Element ? e.target : null;
          const cell = target === null ? null : target.closest('[class*="_navCell"]');
          if (cell !== null) setTimeout(() => openSettingsSection(cell), 30);
        }, true);
      }
    }

    function installSettingsWatcher() {
      const root = document.documentElement;
      const apply = () => {
        const panel = settingsPanel();
        if (panel === null) {
          root.classList.remove("dms-settings-open", "dms-settings-list", "dms-settings-section", "dms-settings-chrome-init", "dms-plugin-section");
          return;
        }
        if (root.classList.contains("dms-settings-open")) return;
        settingsChrome();
        root.classList.add("dms-settings-open", "dms-settings-list", "dms-settings-chrome-init");
        root.classList.remove("dms-settings-section");
        const title = $(".dms-settings-title-text");
        if (title !== null) title.textContent = "设置";
        const options = panel.querySelector('[class*="_options"]');
        if (options !== null) options.scrollTop = 0;
      };
      new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
      apply();
    }

    function installBackStack() {
      const previous = window.__dshmBack;
      window.__dshmBack = function dshMobileShellBack() {
        if (settingsPanel() !== null) { if (settingsBack()) return true; }
        if (document.documentElement.classList.contains("dms-right-full")) { exitRightFullscreen(true); return true; }
        if (rightVisible) { closeRight(); return true; }
        if (leftOpen()) { toggleLeft(); return true; }
        const layout = ctxRef && ctxRef.layout;
        if (layout && typeof layout.selectPanel === "function" && $('[data-composer-card]') === null) {
          try { layout.selectPanel(null); return true; } catch (error) { /* fall through */ }
        }
        // Menus and dialogs close themselves through the host back handler.
        // Anything else on the main/conversation surface is handled by the
        // exit guard (first press shows a toast, second press backgrounds the app).
        if (typeof previous === "function" && document.querySelector('[role="dialog"], [role="menu"]') !== null) {
          return previous();
        }
        return false;
      };
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (rightVisible || leftOpen()) {
          e.preventDefault();
          window.__dshmBack();
        }
      }, true);
    }

    function installGestures() {
      let mode = null;
      let startX = 0, startY = 0, width = 0, locked = false;
      let lastX = 0, lastT = 0, velocity = 0, lastDx = 0;
      let samples = [];
      let activeEl = null, centerEl = null, springRaf = 0, drawerX = 0;
      const root = document.documentElement;
      const drawerWidth = () => Math.min(326, Math.round(window.innerWidth * 0.8));
      const sideOf = () => (mode === "open-left" || mode === "close-left" ? "left" : "right");
      const elFor = (side) => (side === "left" ? sidebarCol() : rightbarCol());
      const dragClassFor = (m) => m === "open-left" ? "dms-dragging-left" : m === "open-right" ? "dms-dragging-right" : m === "close-left" ? "dms-drag-close-left" : "dms-drag-close-right";
      const clearDragClasses = () => root.classList.remove("dms-dragging-left", "dms-dragging-right", "dms-drag-close-left", "dms-drag-close-right", "dms-gesture-arming", "dms-gesture-arming-right");
      let visualX = null;
      let lastFrameT = 0;
      const MAX_SPEED = 2300;
      const applyFrame = (side, targetX) => {
        const W = drawerWidth();
        const now = performance.now();
        const dt = Math.max(0.004, Math.min(0.05, lastFrameT === 0 ? 0.016 : (now - lastFrameT) / 1000));
        lastFrameT = now;
        if (visualX === null) visualX = targetX;
        const maxStep = Math.max(2, MAX_SPEED * dt);
        let x = targetX;
        if (x - visualX > maxStep) x = visualX + maxStep;
        else if (visualX - x > maxStep) x = visualX - maxStep;
        visualX = x;
        if (activeEl === null || !activeEl.isConnected) activeEl = elFor(side);
        if (activeEl !== null) {
          root.classList.remove("dms-gesture-arming", "dms-gesture-arming-right");
          activeEl.style.setProperty("animation", "none", "important");
          activeEl.style.setProperty("transition", "none", "important");
          activeEl.style.setProperty("transform", "translate3d(" + Math.round(x) + "px,0,0)", "important");
          activeEl.style.setProperty("will-change", "transform", "important");
        }
        if (centerEl === null) centerEl = $('[class*="_centerCol"]');
        if (centerEl !== null) {
          // Push the page in step with the drawer. HANDOVER §14 recorded a white
          // strip from pushing, but that was before the host sidebar was preloaded
          // (P0 fix): it is now painted under the page, so no blank area is exposed.
          const pageX = side === "left" ? Math.max(0, Math.min(W, W + x)) : Math.min(0, Math.max(-W, x - W));
          centerEl.style.setProperty("transition", "none", "important");
          centerEl.style.setProperty("transform", pageX === 0 ? "none" : "translate3d(" + Math.round(pageX) + "px,0,0)", "important");
          centerEl.style.setProperty("opacity", "1", "important");
        }
        drawerX = x;
      };
      const clearInline = () => {
        springAnimating = false;
        clearDragClasses();
        if (activeEl !== null) {
          activeEl.style.removeProperty("transform");
          activeEl.style.removeProperty("transition");
          activeEl.style.removeProperty("animation");
          activeEl.style.removeProperty("will-change");
          activeEl.style.removeProperty("z-index");
        }
        if (centerEl !== null) {
          centerEl.style.removeProperty("transform");
          centerEl.style.removeProperty("opacity");
          centerEl.style.removeProperty("transition");
          centerEl.style.removeProperty("will-change");
        }
        activeEl = null;
      };
      const inHorizontalScroller = (node) => {
        let el = node instanceof Element ? node : null;
        for (let depth = 0; el !== null && el !== document.body && depth < 8; depth++) {
          const style = window.getComputedStyle(el);
          if ((style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
          el = el.parentElement;
        }
        return false;
      };
      const springTo = (side, targetX, willClose, done) => {
        if (springRaf !== 0) cancelAnimationFrame(springRaf);
        gestureBusy = true;
        springAnimating = true;
        if (activeEl === null) activeEl = elFor(side);
        let x = drawerX;
        let v = 0;
        const stiffness = 1500;
        const damping = 0.9;
        const dragC = 2 * damping * Math.sqrt(stiffness);
        let last = performance.now();
        const step = (now) => {
          const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
          last = now;
          const accel = -stiffness * (x - targetX) - dragC * v;
          v += accel * dt;
          x += v * dt;
          applyFrame(side, x);
          if (Math.abs(x - targetX) > 0.5 || Math.abs(v) > 8) {
            springRaf = requestAnimationFrame(step);
          } else {
            springRaf = 0;
            if (willClose) {
              root.classList.remove("dms-left-open", "dms-right-open");
              clearInline();
              gestureBusy = false;
              springAnimating = false;
              if (typeof done === "function") done();
            } else {
              clearInline();
              gestureBusy = false;
              springAnimating = false;
              if (typeof done === "function") done();
            }
          }
        };
        springRaf = requestAnimationFrame(step);
      };

      document.addEventListener("touchstart", (e) => {
        if (!isPhone() || e.touches.length !== 1) return;
        if (gestureBusy || springRaf !== 0) return;
        clearInline();
        visualX = null;
        lastFrameT = 0;
        mode = null; locked = false; velocity = 0;
        if (settingsPanel() !== null) return;
        if (root.classList.contains("dms-attach-open") || root.classList.contains("dms-right-full")) return;
        if ($('[data-composer-card]') === null && !leftOpen() && !rightVisible) return;
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; lastX = startX; lastT = performance.now();
        samples = [{ x: startX, t: lastT }];
        width = window.innerWidth;
        const target = e.target instanceof Element ? e.target : document.elementFromPoint(t.clientX, t.clientY);
        // Plugin state, not the host's transient marker: the host can still report
        // data-sidebar-right-open for a frame after closeRight(), which used to
        // turn the next left-swipe into a no-op "close right" gesture.
        if (leftOpen()) {
          mode = "close-left";
        } else if (rightVisible) {
          mode = "close-right";
        } else {
          if (target && target.closest('[contenteditable], input, textarea, [role="textbox"], [role="dialog"], [data-composer-card] button')) return;
          if (target && inHorizontalScroller(target)) return;
          mode = "pending";
        }
      }, { passive: true, capture: true });

      document.addEventListener("touchmove", (e) => {
        if (mode === null || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const now = performance.now();
        lastDx = dx;
        if (now - lastT > 0) velocity = velocity * 0.6 + ((t.clientX - lastX) / (now - lastT)) * 0.4;
        lastX = t.clientX; lastT = now;
        samples.push({ x: t.clientX, t: now });
        while (samples.length > 2 && now - samples[0].t > 110) samples.shift();
        if (!locked) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { mode = null; return; }
          if (Math.abs(dx) <= LOCK) return;
          if (mode === "pending" && Math.abs(dx) <= Math.abs(dy) * 1.1) return;
          if (mode === "pending") {
            mode = dx > 0 ? "open-left" : "open-right";
            root.classList.add(dragClassFor(mode));
            const openSide = mode === "open-left" ? "left" : "right";
            if (openSide === "left") {
              root.classList.add("dms-gesture-arming");
              openLeftVisual();
              applyFrame("left", -drawerWidth());
            } else {
              root.classList.add("dms-gesture-arming-right");
              if (!rightVisible) openRight();
              applyFrame("right", drawerWidth());
            }
            let armTries = 0;
            const armPaint = () => {
              if (mode === null) return;
              const side = mode === "open-left" ? "left" : "right";
              const W = drawerWidth();
              const x = side === "left" ? Math.min(0, lastDx - W) : Math.max(0, W + lastDx);
              const el = elFor(side);
              if (el !== null && el.isConnected) {
                activeEl = el;
                applyFrame(side, x);
                return;
              }
              if (armTries++ < 120) requestAnimationFrame(armPaint);
            };
            requestAnimationFrame(armPaint);
          }
          locked = true;
          gestureBusy = true;
          if (mode === "open-left") visualX = -drawerWidth();
          else if (mode === "open-right") visualX = drawerWidth();
          else visualX = 0;
          lastFrameT = performance.now();
        }
        if (e.cancelable) e.preventDefault();
        const W = drawerWidth();
        if (mode === "open-left") applyFrame("left", Math.min(0, dx - W));
        else if (mode === "close-left") applyFrame("left", Math.min(0, dx));
        else if (mode === "open-right") applyFrame("right", Math.max(0, W + dx));
        else applyFrame("right", Math.max(0, dx));
      }, { passive: false, capture: true });

      const paint = (dx) => {
        const W = drawerWidth();
        const m = mode;
        if (m === "open-left") applyFrame("left", Math.min(0, dx - W));
        else if (m === "open-right") applyFrame("right", Math.max(0, W + dx));
        else if (m === "close-left") applyFrame("left", Math.min(0, dx));
        else if (m === "close-right") applyFrame("right", Math.max(0, dx));
      };

      const finish = (e) => {
        if (mode === null || !locked) { mode = null; locked = false; gestureBusy = false; clearInline(); return; }
        const t = e.changedTouches && e.changedTouches[0];
        const dx = t ? t.clientX - startX : 0;
        const m = mode;
        const side = m === "open-left" || m === "close-left" ? "left" : "right";
        const W = drawerWidth();
        const threshold = W * 0.38;
        const endT = performance.now();
        const recent = samples.filter((s) => endT - s.t <= 110);
        let stableVelocity = 0;
        if (recent.length >= 2) {
          const first = recent[0];
          const last = recent[recent.length - 1];
          if (last.t - first.t >= 8) stableVelocity = (last.x - first.x) / (last.t - first.t);
        }
        const fast = Math.abs(stableVelocity) > 0.08 && Math.abs(dx) >= 20;
        mode = null; locked = false;
        if (m === "open-left") {
          if (dx >= threshold || (fast && stableVelocity > 0)) { root.classList.add("dms-left-open", "dms-gesture-opened"); springTo("left", 0, false); }
          else springTo("left", -W, true, () => closeLeftVisual(false));
        } else if (m === "open-right") {
          if (-dx >= threshold || (fast && stableVelocity < 0)) { root.classList.add("dms-right-open"); springTo("right", 0, false); }
          else springTo("right", W, true, () => closeRight());
        } else if (m === "close-left") {
          if (-dx >= threshold || (fast && stableVelocity < 0)) springTo("left", -W, true, () => closeLeftVisual(false));
          else { root.classList.add("dms-left-open"); springTo("left", 0, false); }
        } else if (m === "close-right") {
          if (dx >= threshold || (fast && stableVelocity > 0)) springTo("right", W, true, () => closeRight());
          else { root.classList.add("dms-right-open"); springTo("right", 0, false); }
        } else {
          gestureBusy = false;
          clearInline();
        }
      };
      document.addEventListener("touchend", finish, { passive: true, capture: true });
      document.addEventListener("touchcancel", () => { mode = null; locked = false; gestureBusy = false; clearInline(); }, { passive: true, capture: true });
    }

    function showToast(text) {
      let el = $(".dms-toast");
      if (el === null) {
        el = document.createElement("div");
        el.className = "dms-toast";
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => el.classList.remove("show"), 1800);
    }

    function installExitGuard() {
      const base = window.__dshmBack;
      let lastAt = 0;
      window.__dshmBack = function dshMobileShellBackGuard() {
        const handled = typeof base === "function" ? base() : false;
        if (handled) return true;
        const now = Date.now();
        if (now - lastAt < 2000) { lastAt = 0; return false; }
        lastAt = now;
        showToast("再按一次退出");
        return true;
      };
    }

    function installKeyboard() {
      const vv = window.visualViewport;
      if (!vv) return;
      const apply = () => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        const shift = kb > 90 ? Math.round(kb) : 0;
        const root = document.documentElement;
        root.style.setProperty("--dms-kb", shift + "px");
        root.classList.toggle("dms-kb-open", shift > 0);
      };
      vv.addEventListener("resize", apply);
      vv.addEventListener("scroll", apply);
      window.addEventListener("orientationchange", () => setTimeout(apply, 260));
      setTimeout(apply, 400);
    }

    function normalizeSeparators(rootEl) {
      if (rootEl === null) return;
      try {
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
        let node = null;
        while ((node = walker.nextNode()) !== null) {
          const value = node.nodeValue;
          if (value && value.indexOf("·") >= 0) node.nodeValue = value.replace(/\s*·\s*/g, " ").trim();
        }
      } catch (error) { /* read-only DOM shims */ }
    }

    let autoWorkspaceTried = false;
    function maybeRestoreWorkspace() {
      if (!isPhone() || autoWorkspaceTried) return;
      const ui = ctxRef && ctxRef.uiWorkspace;
      const workspaces = ctxRef && ctxRef.workspaces;
      if (!ui || !workspaces || typeof workspaces.list?.getSnapshot !== "function") return;
      const snapshot = workspaces.list.getSnapshot();
      if (!snapshot || snapshot.phase !== "ready" || !Array.isArray(snapshot.items) || snapshot.items.length === 0) return;
      const placeholder = $("[data-composer-placeholder]");
      const text = placeholder === null ? "" : (placeholder.textContent || "").trim();
      const noWorkspace = text.indexOf("选择一个工作区开始") >= 0 || text.indexOf("Choose a workspace to start") >= 0;
      if (!noWorkspace) return;
      autoWorkspaceTried = true;
      const latest = snapshot.items.slice().sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""))[0];
      if (latest === undefined) return;
      setTimeout(() => {
        try {
          if (typeof ui.startSession === "function") ui.startSession(latest.workspaceId);
        } catch (error) { /* host may be busy; user can still pick manually */ }
      }, 350);
    }

    function sync() {
      const f = frame();
      if (f === null) return;
      f.setAttribute("data-dms-frame", "frame");
      maybeRestoreWorkspace();
      const root = document.documentElement;
      root.classList.toggle("dms-left-open", leftOpen());
      // The right drawer mirrors the left one: the host panel is preloaded and
      // stays mounted, so rightVisible is the single state source (no host-marker
      // reconciliation, no retry clicks).
      root.classList.toggle("dms-right-open", rightVisible);
      if (rightVisible && rightOpenWaitTimer !== 0 && rightPanelContentReady()) stopRightOpenWait(true);
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
      if (!rightViewTabsFallback) document.documentElement.classList.add("dms-vtabs-menu");
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
      if (isPhone() && !leftVisible && !rightVisible) forceMountSidebar();
    }

    function installDrawerAutoClose() {
      document.addEventListener("click", (e) => {
        if (!isPhone() || !leftOpen()) return;
        const target = e.target instanceof Element ? e.target : null;
        const col = sidebarCol();
        if (target === null || col === null || !col.contains(target)) return;
        const closeAfter = () => setTimeout(() => { if (leftOpen()) toggleLeft(); }, 60);
        if (target.closest('[class*="_panelRow"]') !== null || target.closest('[class*="_newSession"]') !== null) {
          closeAfter();
          return;
        }
        const row = target.closest('[class*="_sessionRow"]');
        if (row !== null) {
          if (target.closest("button, [role=menuitem], [aria-haspopup=menu]") === null) closeAfter();
          return;
        }
        if (target.closest('[class*="_settingsArea"]') !== null) closeAfter();
      }, true);
    }

    function installAttachSheet() {
      const root = document.documentElement;
      let sheet = null;
      let backdrop = null;
      let recentWrap = null;
      let recentStrip = null;
      let nativeSeq = 0;
      let nativeCaps = null;
      let nativeCapsPromise = null;
      const nativePending = new Map();
      let photoGesture = null;
      let photoPaint = null;
      let photoDragPoint = null;
      let photoAutoScrollRaf = 0;
      let photoLongPressTimer = 0;
      let suppressPhotoClick = false;
      let sheetMeasureDone = false;
      let photoSuppressTimer = 0;
      const nativeBridge = () => {
        const api = window.DSHNative;
        return api && typeof api.request === "function" ? api : null;
      };

      function nativeCall(method, params, timeoutMs) {
        const api = nativeBridge();
        if (api === null) return Promise.reject(new Error("native bridge unavailable"));
        return new Promise((resolve, reject) => {
          const id = "dms_" + (++nativeSeq);
          const timer = setTimeout(() => {
            nativePending.delete(id);
            reject(new Error("native bridge timeout: " + method));
          }, timeoutMs || 1500);
          nativePending.set(id, { resolve, reject, timer });
          try { api.request(JSON.stringify({ id, method, params: params || {} })); }
          catch (error) { clearTimeout(timer); nativePending.delete(id); reject(error); }
        });
      }
      window.__dshNativeResult = (id, payload) => {
        const entry = nativePending.get(id);
        if (!entry) return;
        nativePending.delete(id);
        clearTimeout(entry.timer);
        try { entry.resolve(typeof payload === "string" ? JSON.parse(payload) : payload); }
        catch (error) { entry.reject(error); }
      };

      function ensureUi() {
        if (backdrop === null) {
          backdrop = document.createElement("div");
          backdrop.className = "dms-attach-backdrop";
          backdrop.setAttribute("aria-hidden", "true");
          document.body.appendChild(backdrop);
        }
        if (sheet === null) {
          sheet = document.createElement("div");
          sheet.className = "dms-attach-sheet";
          sheet.setAttribute("role", "dialog");
          sheet.setAttribute("aria-label", "添加附件");
          sheet.innerHTML =
            '<div class="dms-attach-recent" hidden><div class="dms-attach-recent-title">最近照片</div><div class="dms-attach-recent-strip"></div></div>' +
            '<div class="dms-attach-actions">' +
              '<button type="button" class="dms-attach-action" data-kind="camera"><span class="dms-attach-ico">' + ICONS.camera + '</span><span>拍照</span></button>' +
              '<button type="button" class="dms-attach-action" data-kind="gallery"><span class="dms-attach-ico">' + ICONS.image + '</span><span>相册</span></button>' +
              '<button type="button" class="dms-attach-action" data-kind="files"><span class="dms-attach-ico">' + ICONS.file + '</span><span>文件</span></button>' +
            '</div>';
          document.body.appendChild(sheet);
          recentWrap = sheet.querySelector(".dms-attach-recent");
          recentStrip = sheet.querySelector(".dms-attach-recent-strip");
          const PHOTO_LONG_PRESS_MS = 500;
          const PHOTO_MOVE_SLOP = 6;
          const cancelPhotoLongPress = () => {
            if (photoLongPressTimer !== 0) { clearTimeout(photoLongPressTimer); photoLongPressTimer = 0; }
          };
          const endPhotoGesture = () => {
            cancelPhotoLongPress();
            const gesture = photoGesture;
            const painted = gesture !== null && gesture.mode === "paint";
            photoGesture = null;
            photoPaint = null;
            photoDragPoint = null;
            stopPhotoAutoScroll();
            if (painted) {
              // The tap that ends a paint session must not toggle a second time.
              suppressPhotoClick = true;
              if (photoSuppressTimer !== 0) clearTimeout(photoSuppressTimer);
              photoSuppressTimer = setTimeout(() => { photoSuppressTimer = 0; suppressPhotoClick = false; }, 420);
            }
          };
          // Android long-press on an image would raise the native context menu and
          // cancel the touch stream; the sheet owns this gesture instead.
          recentStrip.addEventListener("contextmenu", (event) => { event.preventDefault(); }, { passive: false });
          recentStrip.addEventListener("touchstart", (event) => {
            const cell = event.target instanceof Element ? event.target.closest(".dms-attach-photo") : null;
            if (cell === null || event.touches.length !== 1) return;
            const t = event.touches[0];
            cancelPhotoLongPress();
            suppressPhotoClick = false;
            photoGesture = { startX: t.clientX, startY: t.clientY, cell, mode: "pending" };
            photoPaint = null;
            photoDragPoint = null;
            stopPhotoAutoScroll();
            // Native overflow scrolling stays untouched until the long press wins:
            // no preventDefault and no scrollLeft writes here (EXCELLENT-CASES 案例1).
            photoLongPressTimer = setTimeout(() => {
              photoLongPressTimer = 0;
              const gesture = photoGesture;
              if (gesture === null || gesture.mode !== "pending") return;
              gesture.mode = "paint";
              photoPaint = { last: null };
              suppressPhotoClick = true;
              photoDragPoint = { x: gesture.startX, y: gesture.startY };
              photoDragTo(gesture.cell);
              startPhotoAutoScroll();
              try {
                if (navigator !== undefined && typeof navigator.vibrate === "function") navigator.vibrate(10);
              } catch (error) { /* vibration is optional */ }
            }, PHOTO_LONG_PRESS_MS);
          }, { passive: true });
          recentStrip.addEventListener("touchmove", (event) => {
            const gesture = photoGesture;
            if (gesture === null || event.touches.length !== 1) return;
            const t = event.touches[0];
            const dx = t.clientX - gesture.startX;
            const dy = t.clientY - gesture.startY;
            if (gesture.mode === "pending") {
              if (Math.abs(dx) <= PHOTO_MOVE_SLOP && Math.abs(dy) <= PHOTO_MOVE_SLOP) return;
              // Finger moved before the long press matured: hand the gesture back to
              // the browser's native horizontal scroller (0.6.13 behaviour).
              cancelPhotoLongPress();
              gesture.mode = "native";
              return;
            }
            if (gesture.mode !== "paint") return;
            // Paint mode owns the gesture now: prevent native scroll, toggle cells and
            // auto-scroll at the strip edges.
            if (event.cancelable) event.preventDefault();
            photoDragPoint = { x: t.clientX, y: t.clientY };
            photoDragTo(photoCellAtPoint(t.clientX, t.clientY));
            startPhotoAutoScroll();
          }, { passive: false });
          recentStrip.addEventListener("touchend", endPhotoGesture, { passive: true });
          recentStrip.addEventListener("touchcancel", endPhotoGesture, { passive: true });
          // Single tap = toggle this photo. One delegated listener avoids duplicated
          // per-cell handlers after every re-render.
          recentStrip.addEventListener("click", (event) => {
            const cell = event.target instanceof Element ? event.target.closest(".dms-attach-photo") : null;
            if (cell === null) return;
            if (suppressPhotoClick) { suppressPhotoClick = false; return; }
            togglePhoto(cell);
          });
          sheet.addEventListener("click", (event) => {
            const action = event.target instanceof Element ? event.target.closest("[data-kind]") : null;
            if (action !== null) {
              event.preventDefault();
              pickFromDevice(action.getAttribute("data-kind"));
            }
          });
        }
      }

      function makeInput(accept, capture, multiple) {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = multiple !== false;
        input.hidden = true;
        if (accept) input.accept = accept;
        if (capture) input.setAttribute("capture", capture);
        input.addEventListener("change", () => {
          const files = input.files === null ? [] : Array.from(input.files);
          input.value = "";
          input.remove();
          if (files.length > 0) intake(files);
        });
        document.body.appendChild(input);
        return input;
      }

      function loadNativeCaps() {
        if (nativeBridge() === null) return Promise.resolve(null);
        if (nativeCapsPromise !== null) return nativeCapsPromise;
        nativeCapsPromise = nativeCall("capabilities", {}, 1200).then((caps) => {
          nativeCaps = caps || null;
          return nativeCaps;
        }).catch(() => null);
        return nativeCapsPromise;
      }

      async function pickNative(kind) {
        const source = kind === "camera" ? "camera" : kind === "gallery" ? "gallery" : "files";
        const method = kind === "files" ? "pickFiles" : "pickImages";
        const params = kind === "files" ? { multiple: true, max: 20 } : { source, multiple: kind !== "camera", max: 20 };
        const reply = await nativeCall(method, params, 600000);
        const items = reply && Array.isArray(reply.files) ? reply.files : [];
        if (items.length === 0) {
          // 用户取消/没拍照：完全静默（用户 0.6.18 反馈）。真正失败由 pickFromDevice
          // 的 catch（调用失败/超时）提示。
          return true;
        }
        const files = [];
        for (const item of items) {
          if (!item || typeof item.url !== "string") continue;
          const response = await fetch(item.url);
          if (!response.ok) continue;
          const blob = await response.blob();
          files.push(new File([blob], item.name || (kind === "camera" ? "camera.jpg" : "file"), { type: item.mime || blob.type || "application/octet-stream" }));
        }
        if (files.length > 0) intake(files);
        return true;
      }

      function pickFromDevice(kind) {
        closeSheet();
        if (nativeBridge() === null) {
          fallbackPick(kind);
          return;
        }
        loadNativeCaps().then((caps) => {
          if (caps !== null && caps.pickers === true) {
            pickNative(kind).catch(() => {
              const label = kind === "camera" ? "相机" : kind === "gallery" ? "相册" : "文件选择器";
              showToast(label + "调用失败，改用系统选择器");
              fallbackPick(kind);
            });
          } else {
            fallbackPick(kind);
          }
        });
      }

      function fallbackPick(kind) {
        if (kind === "camera") makeInput("image/*", "camera", false).click();
        else if (kind === "gallery") makeInput("image/*", null, true).click();
        else makeInput("*/*", null, true).click();
      }

      const MAX_FILE = 1024 * 1024 * 1024;
      const MAX_TOTAL = 5 * 1024 * 1024 * 1024;

      function intake(files) {
        let total = 0;
        const accepted = [];
        for (const file of files) {
          if (file.size > MAX_FILE) { showToast("单个文件不能超过 1GB"); continue; }
          total += file.size;
          if (total > MAX_TOTAL) { showToast("单次附件总大小不能超过 5GB"); break; }
          accepted.push(file);
        }
        if (accepted.length === 0) return;
        const card = $('[data-composer-card]') || $('[data-composer-seat]') || $('[class*="_inputBar"]');
        if (card === null) { showToast("没有可用的输入框"); return; }
        const dt = new DataTransfer();
        for (const file of accepted) dt.items.add(file);
        const editor = card.querySelector('[contenteditable="true"], [role="textbox"], textarea') || card;
        let delivered = false;
        try {
          const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
          editor.dispatchEvent(paste);
          delivered = paste.defaultPrevented;
        } catch (error) { /* fall through to drop */ }
        if (!delivered) {
          try {
            const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
            card.dispatchEvent(drop);
            delivered = drop.defaultPrevented;
          } catch (error) { /* ignore */ }
        }
        if (!delivered) showToast("这块输入框暂不支持添加附件");
      }

      function composerAttachmentLabels() {
        const card = $('[data-composer-card]') || $('[data-composer-seat]') || $('[class*="_inputBar"]');
        if (card === null) return [];
        return $$('[class*="_remove"]', card).map((btn) => btn.getAttribute("aria-label") || "").filter((label) => label.length > 0);
      }
      function composerHasAttachment(name) {
        if (!name) return false;
        return composerAttachmentLabels().some((label) => label.indexOf(name) >= 0);
      }
      function composerRemoveByName(name) {
        if (!name) return false;
        const card = $('[data-composer-card]') || $('[data-composer-seat]') || $('[class*="_inputBar"]');
        if (card === null) return false;
        const matches = $$('[class*="_remove"]', card).filter((btn) => (btn.getAttribute("aria-label") || "").indexOf(name) >= 0);
        // Only remove when exactly one composer chip can be identified by file name;
        // otherwise keep the chip (removing the wrong attachment is worse).
        if (matches.length !== 1) return false;
        matches[0].click();
        return true;
      }
      function selectPhoto(cell) {
        if (cell.classList.contains("selected") || cell.dataset.dmsPending === "1") return;
        const name = cell.dataset.dmsName || "";
        if (name && composerHasAttachment(name)) {
          // Already an attachment in the composer (e.g. it survived a sheet close):
          // just show the check, never add a duplicate (用户 修正2).
          cell.classList.add("selected");
          return;
        }
        cell.dataset.dmsPending = "1";
        cell.classList.add("selected");
        void openRecent(cell.getAttribute("data-photo-id"), cell);
      }
      function deselectPhoto(cell) {
        if (!cell.classList.contains("selected")) return;
        cell.classList.remove("selected");
        const name = cell.dataset.dmsName || "";
        if (name && !composerRemoveByName(name) && photoPaint === null) {
          // Could not identify the matching chip safely: keep the attachment, only
          // uncheck the photo and tell the user (用户 修正2).
          showToast("未能在输入框找到该附件，请手动移除");
        }
      }
      function togglePhoto(cell) {
        if (cell.classList.contains("selected")) deselectPhoto(cell);
        else selectPhoto(cell);
      }
      function photoCellAtPoint(x, y) {
        if (recentStrip === null) return null;
        const rect = recentStrip.getBoundingClientRect();
        const cx = Math.min(Math.max(x, rect.left + 4), rect.right - 4);
        const cy = Math.min(Math.max(y, rect.top + 4), rect.bottom - 4);
        const el = document.elementFromPoint(cx, cy);
        return el instanceof Element ? el.closest(".dms-attach-photo") : null;
      }
      function photoDragTo(cell) {
        if (photoPaint === null || cell === null || cell === photoPaint.last) return;
        photoPaint.last = cell;
        // Each cell passed toggles its own current selection state (用户 0.6.15).
        togglePhoto(cell);
      }
      function stopPhotoAutoScroll() {
        if (photoAutoScrollRaf !== 0) { cancelAnimationFrame(photoAutoScrollRaf); photoAutoScrollRaf = 0; }
      }
      function startPhotoAutoScroll() {
        stopPhotoAutoScroll();
        if (photoPaint === null || photoDragPoint === null || recentStrip === null) return;
        const step = () => {
          photoAutoScrollRaf = 0;
          if (photoPaint === null || photoDragPoint === null || recentStrip === null) return;
          const rect = recentStrip.getBoundingClientRect();
          const edge = 44;
          let delta = 0;
          if (photoDragPoint.x < rect.left + edge) delta = -Math.max(5, (rect.left + edge - photoDragPoint.x) * 0.6);
          else if (photoDragPoint.x > rect.right - edge) delta = Math.max(5, (photoDragPoint.x - (rect.right - edge)) * 0.6);
          if (delta !== 0) {
            recentStrip.scrollLeft += delta;
            photoDragTo(photoCellAtPoint(photoDragPoint.x, photoDragPoint.y));
            photoAutoScrollRaf = requestAnimationFrame(step);
          }
        };
        photoAutoScrollRaf = requestAnimationFrame(step);
      }
      async function renderRecent() {
        if (recentWrap === null || recentStrip === null) return;
        const api = nativeBridge();
        if (api === null) { recentWrap.hidden = true; return; }
        // 任务35：照片条固定占位高度，异步结果只换内容不改变 sheet 高度。
        recentWrap.hidden = false;
        recentStrip.innerHTML = '<div class="dms-attach-loading">正在读取最近照片…</div>';
        try {
          const reply = await nativeCall("recentPhotos", { limit: 20 }, 1800);
          const photos = reply && Array.isArray(reply.photos) ? reply.photos : [];
          recentStrip.innerHTML = "";
          if (photos.length === 0) { recentStrip.innerHTML = '<div class="dms-attach-loading">暂无最近照片</div>'; return; }
          for (const photo of photos) {
            if (!photo || typeof photo.thumbDataUrl !== "string") continue;
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "dms-attach-photo";
            const img = document.createElement("img");
            img.src = photo.thumbDataUrl;
            img.alt = photo.name || "照片";
            img.loading = "lazy";
            cell.appendChild(img);
            const check = document.createElement("span");
            check.className = "dms-photo-check";
            check.innerHTML = ICONS.check;
            cell.appendChild(check);
            cell.setAttribute("data-photo-id", photo.id === undefined || photo.id === null ? "" : String(photo.id));
            if (typeof photo.name === "string" && photo.name.length > 0) {
              cell.dataset.dmsName = photo.name;
              if (composerHasAttachment(photo.name)) cell.classList.add("selected");
            }
            recentStrip.appendChild(cell);
          }
          if (recentStrip.childElementCount === 0) recentStrip.innerHTML = '<div class="dms-attach-loading">暂无最近照片</div>';
        } catch (error) {
          recentStrip.innerHTML = '<div class="dms-attach-loading">暂无最近照片</div>';
        }
      }

      async function openRecent(id, cell) {
        if (id === undefined || id === null) return;
        try {
          const reply = await nativeCall("openRecent", { id }, 3000);
          if (!reply || typeof reply.url !== "string") throw new Error("missing url");
          if (cell !== undefined && cell !== null && !cell.classList.contains("selected")) return;
          const response = await fetch(reply.url);
          if (!response.ok) throw new Error("fetch failed");
          const blob = await response.blob();
          const file = new File([blob], reply.name || "photo.jpg", { type: reply.mime || blob.type || "image/jpeg" });
          if (cell !== undefined && cell !== null) {
            cell.dataset.dmsPending = "0";
            cell.dataset.dmsName = file.name;
          }
          intake([file]);
          requestAnimationFrame(measureSheet);
        } catch (error) {
          if (cell !== undefined && cell !== null) {
            cell.classList.remove("selected");
            cell.dataset.dmsPending = "0";
          }
          showToast("读取照片失败，请重试");
        }
      }

      function measureSheet(force) {
        if (sheet === null) return;
        if (!root.classList.contains("dms-attach-open")) {
          root.style.setProperty("--dms-sheet-h", "0px");
          return;
        }
        if (sheetMeasureDone && force !== true) return;
        const height = sheet.getBoundingClientRect().height;
        const card = $('[data-composer-card]') || $('[data-composer-seat]');
        let shift = height;
        if (card !== null) {
          // --dms-sheet-h shifts the composer seat up; recover the un-shifted card
          // bottom and shift by exactly (sheet height - bottom inset) so the sheet's
          // top edge lands on the composer's bottom edge (用户 修正1 / 截图20).
          const current = parseFloat(window.getComputedStyle(root).getPropertyValue("--dms-sheet-h")) || 0;
          const naturalBottom = card.getBoundingClientRect().bottom + current;
          shift = height - Math.max(0, window.innerHeight - naturalBottom);
        }
        root.style.setProperty("--dms-sheet-h", Math.max(0, Math.round(shift)) + "px");
        sheetMeasureDone = true;
      }
      function openSheet() {
        ensureUi();
        const add = $('[data-composer-card] button[aria-haspopup="listbox"], [class*="_inputBar"] button[aria-haspopup="listbox"]');
        if (add !== null) add.setAttribute("data-dms-plus", "1");
        root.classList.add("dms-attach-open");
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
        // Keep the home greeter (logo + 探索未至之境) fully on screen: if the hero
        // area was scrolled, bring it back to the top before measuring (用户 图3).
        const hero = $('[class*="_centerCol"] [class*="_headline"]');
        if (hero !== null) {
          let scroller = hero.parentElement;
          for (let depth = 0; scroller !== null && depth < 6; depth++) {
            if (scroller.scrollHeight > scroller.clientHeight + 2) { scroller.scrollTop = 0; break; }
            scroller = scroller.parentElement;
          }
        }
        // 任务35：单次稳定测量。照片条从打开的第一帧就占固定高度（见 renderRecent），
        // 之后异步加载/空结果都不再改 --dms-sheet-h，composer 不会二次下沉。
        sheetMeasureDone = false;
        requestAnimationFrame(() => requestAnimationFrame(() => measureSheet()));
        loadNativeCaps();
        renderRecent();
      }
      function closeSheet(instant) {
        photoGesture = null;
        photoPaint = null;
        photoDragPoint = null;
        if (photoLongPressTimer !== 0) { clearTimeout(photoLongPressTimer); photoLongPressTimer = 0; }
        stopPhotoAutoScroll();
        suppressPhotoClick = false;
        if (photoSuppressTimer !== 0) { clearTimeout(photoSuppressTimer); photoSuppressTimer = 0; }
        root.classList.remove("dms-attach-open");
        if (instant === true) {
          // Keyboard is about to open: drop the sheet and its composer offset in the
          // same frame so the two layouts cannot overlap (用户 图6).
          root.classList.add("dms-sheet-instant");
          root.style.setProperty("--dms-sheet-h", "0px");
          setTimeout(() => { root.classList.remove("dms-sheet-instant"); }, 90);
        } else {
          root.style.setProperty("--dms-sheet-h", "0px");
        }
      }
      closeAttachForSession = (instant) => {
        if (document.documentElement.classList.contains("dms-attach-open")) closeSheet(instant === true);
      };
      window.addEventListener("resize", () => measureSheet(true));
      function toggleSheet() {
        if (root.classList.contains("dms-attach-open")) closeSheet();
        else openSheet();
      }

      document.addEventListener("click", (event) => {
        if (!isPhone()) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target === null) return;
        const add = target.closest('button[aria-haspopup="listbox"]');
        if (add === null) return;
        if (add.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]') === null) return;
        if (!/(^|[\s_-])add([\s_-]|$)/.test(add.className) && add.getAttribute("aria-label") !== "添加文件或调用指令") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleSheet();
      }, true);

      document.addEventListener("click", (event) => {
        if (!root.classList.contains("dms-attach-open")) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target === null) return;
        if (target.closest(".dms-attach-sheet") !== null) return;
        // Composer taps are handled by the mousedown guard: buttons keep the sheet
        // open (their host popovers render above it), the dialog area closes it.
        if (target.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]') !== null) return;
        // A host popover opened from a composer control must not tear the sheet down.
        if (target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null) return;
        closeSheet();
      }, true);

      document.addEventListener("mousedown", (event) => {
        if (!root.classList.contains("dms-attach-open")) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target === null) return;
        if (target.closest(".dms-attach-sheet") !== null) return;
        const composer = target.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]');
        if (composer === null) return;
        if (target.closest('button[aria-haspopup="listbox"]') !== null) {
          // The "+" toggles on click (our handler); just stop the host keepFocus
          // handler from refocusing the editor, which would raise the keyboard.
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (target.closest('button, [role="button"], [aria-haspopup], a, input, select') !== null) {
          // Composer controls (shield / database / DSH / PTC / x) must stay usable
          // while the sheet is open (用户 修正3): only swallow the host keepFocus
          // handler, never close the sheet here. The "+" click handler toggles it.
          event.preventDefault();
          event.stopPropagation();
          return;
        } else {
          // Tapping the dialog/composer (0.6.15): close the sheet first, then focus
          // the input so the keyboard opens with no sheet layout left to overlap.
          closeSheet(true);
          const editor = composer.querySelector('[contenteditable="true"], [role="textbox"], textarea');
          if (editor !== null && typeof editor.focus === "function") {
            try { editor.focus(); } catch (error) { /* host busy */ }
          }
        }
      }, true);

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && root.classList.contains("dms-attach-open")) {
          event.preventDefault();
          closeSheet();
        }
      }, true);

      const originalBack = window.__dshmBack;
      window.__dshmBack = function dshMobileShellBack() {
        if (root.classList.contains("dms-attach-open")) { closeSheet(); return true; }
        return typeof originalBack === "function" ? originalBack() : false;
      };
    }

    function installLongPress() {
      let timer = 0;
      let startX = 0, startY = 0;
      let node = null;
      const cancel = () => { if (timer !== 0) { clearTimeout(timer); timer = 0; } };

      const activate = (target, cx, cy) => {
        if (!(target instanceof Element)) return;
        const session = target.closest('[class*="_sessionRow"]');
        if (session !== null) {
          const overflow = session.querySelector('[class*="_sessionOverflowButton"]') ||
            session.querySelector('[class*="_rowActions"] button');
          if (overflow !== null) { overflow.click(); return; }
        }
        const row = target.closest('li, [class*="_row"], [class*="_entry"], [class*="_card"]');
        if (row !== null) {
          const hidden = row.querySelector('[class*="_rowActions"] button, [class*="_actions"] button, [class*="_overflow"], button[aria-haspopup="menu"]');
          if (hidden !== null) { hidden.click(); return; }
        }
        const msg = target.closest('[class*="_message"]');
        if (msg !== null) {
          msg.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        }
      };

      document.addEventListener("touchstart", (e) => {
        if (!isPhone() || e.touches.length !== 1) return;
        cancel();
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
        node = e.target instanceof Element ? e.target : null;
        if (node === null) return;
        timer = setTimeout(() => {
          timer = 0;
          activate(node, startX, startY);
        }, 500);
      }, { passive: true, capture: true });

      document.addEventListener("touchmove", (e) => {
        if (timer === 0 || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cancel();
      }, { passive: true, capture: true });

      document.addEventListener("touchend", cancel, { passive: true, capture: true });
      document.addEventListener("touchcancel", cancel, { passive: true, capture: true });
    }

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
      if (!force && lastPointerInEditor && performance.now() - lastPointerAt < 900) return;
      try { active.blur(); } catch (error) { /* host busy */ }
    }
    function handleSessionSwitch() {
      // 任务29：切换会话后不聚焦 composer、不弹键盘；弹层立即关闭。
      if (typeof closeAttachForSession === "function") closeAttachForSession(true);
      blurHostEditor(true);
      setTimeout(() => blurHostEditor(false), 80);
      setTimeout(() => blurHostEditor(false), 320);
      setTimeout(() => preloadRight(), 900);
    }
    let sessionFastUntil = 0;
    let sessionFastRaf = 0;
    function fastSessionWatch() {
      sessionFastRaf = 0;
      const key = conversationSessionKey();
      if (key !== sessionKeyPrev) {
        sessionKeyPrev = key;
        sessionFastUntil = 0;
        handleSessionSwitch();
        return;
      }
      if (performance.now() > sessionFastUntil) return;
      sessionFastRaf = requestAnimationFrame(fastSessionWatch);
    }
    function installSessionWatcher() {
      sessionKeyPrev = conversationSessionKey();
      const startFastWatch = () => {
        sessionFastUntil = performance.now() + 1500;
        if (sessionFastRaf === 0) sessionFastRaf = requestAnimationFrame(fastSessionWatch);
      };
      const pointer = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        lastPointerAt = performance.now();
        lastPointerInEditor = target !== null && target.closest('[contenteditable="true"], [role="textbox"], textarea, input, [data-composer-card], [data-composer-seat], [class*="_inputBar"]') !== null;
        if (target !== null && target.closest('[class*="_sessionRow"]') !== null) startFastWatch();
      };
      document.addEventListener("touchstart", pointer, { passive: true, capture: true });
      document.addEventListener("pointerdown", pointer, { passive: true, capture: true });
      const timer = setInterval(() => {
        if (DEBUG_OFF.has("session-watch")) return;
        const key = conversationSessionKey();
        if (key === sessionKeyPrev) return;
        sessionKeyPrev = key;
        handleSessionSwitch();
      }, 120);
      if (timer && typeof timer.unref === "function") timer.unref();
    }

    function installObserver() {
      // A low-frequency reconciler instead of a full-tree MutationObserver:
      // the host re-renders the frame on every layout transition, and a
      // mutation-driven sync fed those renders back into another round of
      // DOM work. 400 ms is invisible for chrome state and cannot loop.
      const timer = setInterval(() => { if (!DEBUG_OFF.has("observer-sync")) sync(); }, 400);
      if (timer && typeof timer.unref === "function") timer.unref();
      return { disconnect: () => clearInterval(timer) };
    }

    function installDebug() {
      const q = new URLSearchParams(location.search);
      if (!q.has("dms-debug")) return;
      const badge = document.createElement("div");
      badge.textContent = "dsh-mobile-shell";
      badge.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#426efe;color:#fff;font:11px/1 monospace;padding:4px 6px;border-radius:6px;opacity:.85";
      document.body.appendChild(badge);
    }

    function apply(ctx) {
      ctxRef = ctx;
      const start = () => {
        const off = new Set((new URLSearchParams(location.search).get("dms-off") || "").split(","));
        DEBUG_OFF = off;
        if (!off.has("styles")) styleOnce();
        scrimOnce();
        ensureTopButtons();
        installBackStack();
        installExitGuard();
        installGestures();
        installRightInterceptors();
        installViewTabsMenu();
        installKeyboard();
        installSettingsWatcher();
        installAttachSheet();
        installSessionWatcher();
        if (!off.has("autoclose")) installDrawerAutoClose();
        if (!off.has("longpress")) installLongPress();
        if (!off.has("observer")) installObserver();
        installDebug();
        sync();
        setTimeout(() => preloadRight(), 800);
        const wanted = new URLSearchParams(location.search).get("dms");
        if (wanted === "left" && !leftOpen()) setTimeout(() => toggleLeft(), 600);
        if (wanted === "right" && !rightVisible) setTimeout(() => openRight(), 900);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
      ctx.effect(() => () => {
        for (const tag of $$('style[data-dsh-mobile-shell="styles"]')) tag.remove();
        for (const el of $$(".dms-scrim")) el.remove();
        for (const el of $$(".dms-attach-sheet, .dms-attach-backdrop, .dms-right-loading")) el.remove();
      }, "dsh-mobile-shell: teardown");
    }

    exports.apply = apply;
    exports.inject = ["layout", "uiWorkspace", "workspaces"];
    return module.exports;
  }
});
