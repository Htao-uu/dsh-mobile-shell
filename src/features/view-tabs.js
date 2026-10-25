// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, $$ } from "../core/dom.js";

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
  state.rightViewTabsFallback = false;
  state.rightViewTabsInjected = true;
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
    if (hostViewTabs().length > 0) state.rightViewTabsFallback = true;
  }
}

function installViewTabsMenu() {
  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  // 任务33：header 的「对话/轨迹」tab 行隐藏，移入宿主「...」菜单；注入失败则恢复常驻。
  document.documentElement.classList.add("dms-vtabs-menu");
  const schedule = () => {
    if (state.rightViewMenuRaf !== 0) return;
    state.rightViewMenuRaf = requestAnimationFrame(() => { state.rightViewMenuRaf = 0; scanViewTabsMenu(); });
  };
  listen(document, "click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null || target.closest('[aria-haspopup="menu"]') === null) return;
    setTimeout(scanViewTabsMenu, 30);
  }, true);
  state.rightViewMenuObserver = new MutationObserver(schedule);
  state.rightViewMenuObserver.observe(document.body, { childList: true, subtree: true });
  disposers.push(() => { if (state.rightViewMenuObserver !== null) state.rightViewMenuObserver.disconnect(); });
  // 安全回退：只有在"已进入对话页且有 tabs、但宿主根本没有「更多操作」按钮"时
  // 才恢复 header tabs 常驻（避免出现既无 tabs 又无菜单项的真空）；默认保持隐藏。
  const fallbackTimer = setInterval(() => {
    if (state.rightViewTabsInjected || state.rightViewTabsFallback) return;
    if (hostViewTabs().length === 0) return;
    const header = $('[class*="_centerCol"] header');
    const conversation = header !== null && header.querySelector("[data-conversation-header-leading], [data-conversation-header-corner]") !== null;
    if (!conversation) return;
    if (sessionActionsAnchor() === null) {
      state.rightViewTabsFallback = true;
      document.documentElement.classList.remove("dms-vtabs-menu");
    }
  }, 2000);
  disposers.push(() => clearInterval(fallbackTimer));
  disposers.push(() => { if (state.rightViewMenuRaf !== 0) cancelAnimationFrame(state.rightViewMenuRaf); });
  return () => { for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index](); };
}

export { sessionActionsAnchor, hostViewTabs, hostViewTabLabel, closeSessionActionsMenu, injectViewTabsIntoMenu, scanViewTabsMenu, installViewTabsMenu };
