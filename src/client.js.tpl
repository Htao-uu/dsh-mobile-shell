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
    const LOCK = 10;

    const ICONS = {
      menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
      plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      panel: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/></svg>'
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
    let sidebarExpandBusy = false;
    let sidebarExpandTimer = 0;
    let rightActivityAt = 0;
    let leftRepairTimer = 0;
    const leftOpen = () => leftVisible;
    const rightOpen = () => $("[data-sidebar-right-open]") !== null;
    const rightToggle = () => $("[data-sidebar-right-toggle]");
    const rightExpand = () => $("[data-sidebar-right-expand]");

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
          if (rightOpen()) closeRight();
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
      if (kind === "menu") return cloneIcon("[data-sidebar-right-expand]") || ICONS.menu;
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
      if (rightOpen() || document.documentElement.classList.contains("dms-right-open")) return;
      if (performance.now() - rightActivityAt < 450) {
        if (sidebarExpandTimer === 0) {
          sidebarExpandTimer = setTimeout(() => { sidebarExpandTimer = 0; ensureSidebarMounted(); }, 480);
        }
        return;
      }
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
    function repairLeftHost() {
      if (leftRepairTimer !== 0) { clearTimeout(leftRepairTimer); leftRepairTimer = 0; }
      if (!leftVisible) return;
      const root = document.documentElement;
      root.classList.remove("dms-left-hide");
      if (!hostLeftOpen()) {
        if (!rightOpen() && !root.classList.contains("dms-right-open") && performance.now() - rightActivityAt > 450) {
          sidebarExpandBusy = false;
          ensureSidebarMounted();
        }
      } else {
        root.classList.remove("dms-preload-left");
      }
      leftRepairTimer = setTimeout(repairLeftHost, 350);
    }
    function openLeftVisual() {
      leftVisible = true;
      const root = document.documentElement;
      root.classList.remove("dms-preload-left", "dms-left-hide");
      root.classList.add("dms-left-open");
      ensureSidebarMounted();
      repairLeftHost();
    }
    function closeLeftVisual(animated) {
      leftVisible = false;
      if (leftRepairTimer !== 0) { clearTimeout(leftRepairTimer); leftRepairTimer = 0; }
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
      rightActivityAt = performance.now();
      document.documentElement.classList.add("dms-right-open");
      const btn = rightExpand();
      if (btn) btn.click();
    }
    function closeRight() {
      rightActivityAt = performance.now();
      document.documentElement.classList.remove("dms-right-open");
      const btn = rightToggle();
      if (btn) btn.click();
    }
    function newSession() {
      const btn = $('[class*="_newSession"]');
      if (btn) btn.click();
    }

    function ensureTopButtons() {
      if (!isPhone()) return;
      const header = $('[class*="_centerCol"] header');
      if (header === null) return;
      const leading = header.querySelector("[data-conversation-header-leading]");
      if (leading !== null && leading.querySelector(".dms-menu") === null) {
        leading.appendChild(makeButton("menu", "打开侧边栏", () => toggleLeft()));
      }
      const corner = header.querySelector("[data-conversation-header-corner]");
      if (corner !== null) {
        if (corner.querySelector(".dms-panel") === null) {
          corner.insertBefore(makeButton("panel", "打开右侧边栏", () => {
            if (rightOpen()) closeRight(); else openRight();
          }), corner.firstChild);
        }
        if (corner.querySelector(".dms-plus") === null) {
          corner.appendChild(makeButton("plus", "新建会话", () => newSession()));
        }
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
        if (rightOpen()) { closeRight(); return true; }
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
        if (rightOpen() || leftOpen()) {
          e.preventDefault();
          window.__dshmBack();
        }
      }, true);
    }

    function installGestures() {
      let mode = null;
      let startX = 0, startY = 0, width = 0, locked = false;
      let lastX = 0, lastT = 0, velocity = 0, lastDx = 0;
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
        }
        if (centerEl === null) centerEl = $('[class*="_centerCol"]');
        if (centerEl !== null) {
          const shift = side === "left" ? W + x : x - W;
          const progress = Math.max(0, Math.min(1, Math.abs(shift) / W));
          centerEl.style.setProperty("transition", "none", "important");
          centerEl.style.setProperty("transform", "translate3d(" + Math.round(shift) + "px,0,0)", "important");
          centerEl.style.setProperty("opacity", String(1 - 0.7 * progress), "important");
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
        }
        if (centerEl !== null) {
          centerEl.style.removeProperty("transform");
          centerEl.style.removeProperty("opacity");
          centerEl.style.removeProperty("transition");
        }
        activeEl = null;
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
        if ($('[data-composer-card]') === null && !leftOpen() && !rightOpen()) return;
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; lastX = startX; lastT = performance.now();
        width = window.innerWidth;
        const target = e.target instanceof Element ? e.target : document.elementFromPoint(t.clientX, t.clientY);
        if (leftOpen()) {
          mode = "close-left";
        } else if (rightOpen()) {
          mode = "close-right";
        } else {
          if (target && target.closest('[contenteditable], input, textarea, [role="textbox"], [role="dialog"]')) return;
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
        if (now - lastT > 0) velocity = (t.clientX - lastX) / (now - lastT);
        lastX = t.clientX; lastT = now;
        if (!locked) {
          if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { mode = null; return; }
          if (Math.abs(dx) <= LOCK) return;
          if (mode === "pending") {
            mode = dx > 0 ? "open-left" : "open-right";
            const openSide = mode === "open-left" ? "left" : "right";
            if (openSide === "left") {
              root.classList.add("dms-gesture-arming");
              openLeftVisual();
            } else {
              root.classList.add("dms-gesture-arming-right");
              if (!rightOpen()) openRight();
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
          root.classList.add(dragClassFor(mode));
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
        const threshold = W * 0.5;
        const fast = Math.abs(velocity) > 0.125;
        mode = null; locked = false;
        if (m === "open-left") {
          if (dx >= threshold || (fast && velocity > 0)) { root.classList.add("dms-left-open", "dms-gesture-opened"); springTo("left", 0, false); }
          else springTo("left", -W, true, () => closeLeftVisual(false));
        } else if (m === "open-right") {
          if (-dx >= threshold || (fast && velocity < 0)) { root.classList.add("dms-right-open"); springTo("right", 0, false); }
          else springTo("right", W, true, () => { if (rightOpen()) closeRight(); });
        } else if (m === "close-left") {
          if (-dx >= threshold || (fast && velocity < 0)) springTo("left", -W, true, () => closeLeftVisual(false));
          else { root.classList.add("dms-left-open"); springTo("left", 0, false); }
        } else if (m === "close-right") {
          if (dx >= threshold || (fast && velocity > 0)) springTo("right", W, true, () => { if (rightOpen()) closeRight(); });
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

    function sync() {
      const f = frame();
      if (f === null) return;
      f.setAttribute("data-dms-frame", "frame");
      const root = document.documentElement;
      root.classList.toggle("dms-left-open", leftOpen());
      root.classList.toggle("dms-right-open", rightOpen());
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
      const nativePending = new Map();

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
          backdrop.addEventListener("click", () => closeSheet());
          document.body.appendChild(backdrop);
        }
        if (sheet === null) {
          sheet = document.createElement("div");
          sheet.className = "dms-attach-sheet";
          sheet.setAttribute("role", "dialog");
          sheet.setAttribute("aria-label", "添加附件");
          sheet.innerHTML =
            '<div class="dms-attach-handle"></div>' +
            '<div class="dms-attach-recent" hidden><div class="dms-attach-recent-title">最近照片</div><div class="dms-attach-recent-strip"></div></div>' +
            '<div class="dms-attach-actions">' +
              '<button type="button" class="dms-attach-action" data-kind="camera"><span class="dms-attach-ico">' + ICONS.camera + '</span><span>拍照</span></button>' +
              '<button type="button" class="dms-attach-action" data-kind="gallery"><span class="dms-attach-ico">' + ICONS.image + '</span><span>相册</span></button>' +
              '<button type="button" class="dms-attach-action" data-kind="files"><span class="dms-attach-ico">' + ICONS.file + '</span><span>文件</span></button>' +
            '</div>';
          document.body.appendChild(sheet);
          recentWrap = sheet.querySelector(".dms-attach-recent");
          recentStrip = sheet.querySelector(".dms-attach-recent-strip");
          sheet.addEventListener("click", (event) => {
            const action = event.target instanceof Element ? event.target.closest("[data-kind]") : null;
            if (action !== null) {
              event.preventDefault();
              pickFromDevice(action.getAttribute("data-kind"));
            }
          });
        }
      }

      function makeInput(accept, capture) {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
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

      function pickFromDevice(kind) {
        if (kind === "camera") makeInput("image/*", "environment").click();
        else if (kind === "gallery") makeInput("image/*").click();
        else makeInput("").click();
        closeSheet();
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

      async function renderRecent() {
        if (recentWrap === null || recentStrip === null) return;
        const api = nativeBridge();
        if (api === null) { recentWrap.hidden = true; return; }
        recentWrap.hidden = false;
        recentStrip.innerHTML = '<div class="dms-attach-loading">正在读取最近照片…</div>';
        try {
          const reply = await nativeCall("recentPhotos", { limit: 20 }, 1800);
          const photos = reply && Array.isArray(reply.photos) ? reply.photos : [];
          recentStrip.innerHTML = "";
          if (photos.length === 0) { recentWrap.hidden = true; return; }
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
            cell.addEventListener("click", () => openRecent(photo.id));
            recentStrip.appendChild(cell);
          }
          if (recentStrip.childElementCount === 0) recentWrap.hidden = true;
        } catch (error) {
          recentWrap.hidden = true;
        }
      }

      async function openRecent(id) {
        if (id === undefined || id === null) return;
        try {
          const reply = await nativeCall("openRecent", { id }, 3000);
          if (!reply || typeof reply.url !== "string") throw new Error("missing url");
          const response = await fetch(reply.url);
          if (!response.ok) throw new Error("fetch failed");
          const blob = await response.blob();
          const file = new File([blob], reply.name || "photo.jpg", { type: reply.mime || blob.type || "image/jpeg" });
          intake([file]);
          closeSheet();
        } catch (error) {
          showToast("读取照片失败，请重试");
        }
      }

      function openSheet() {
        ensureUi();
        const add = $('[data-composer-card] button[aria-haspopup="listbox"], [class*="_inputBar"] button[aria-haspopup="listbox"]');
        if (add !== null) add.setAttribute("data-dms-plus", "1");
        root.classList.add("dms-attach-open");
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
        renderRecent();
      }
      function closeSheet() {
        root.classList.remove("dms-attach-open");
      }
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
        if (target !== null && (target.closest(".dms-attach-sheet") !== null || target.closest('button[aria-haspopup="listbox"]') !== null)) return;
        closeSheet();
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
        installKeyboard();
        installSettingsWatcher();
        installAttachSheet();
        if (!off.has("autoclose")) installDrawerAutoClose();
        if (!off.has("longpress")) installLongPress();
        if (!off.has("observer")) installObserver();
        installDebug();
        sync();
        const wanted = new URLSearchParams(location.search).get("dms");
        if (wanted === "left" && !leftOpen()) setTimeout(() => toggleLeft(), 600);
        if (wanted === "right" && !rightOpen()) setTimeout(() => openRight(), 900);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
      ctx.effect(() => () => {
        for (const tag of $$('style[data-dsh-mobile-shell="styles"]')) tag.remove();
        for (const el of $$(".dms-scrim")) el.remove();
        for (const el of $$(".dms-attach-sheet, .dms-attach-backdrop")) el.remove();
      }, "dsh-mobile-shell: teardown");
    }

    exports.apply = apply;
    exports.inject = ["layout"];
    return module.exports;
  }
});
