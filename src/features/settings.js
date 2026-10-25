// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, $$, settingsPanel } from "../core/dom.js";
import { CHEVRON_LEFT, GEAR_ICON } from "../core/constants.js";

function panelActiveId() {
  const layout = state.ctxRef && state.ctxRef.layout;
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
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  apply();

  return () => observer.disconnect();
}

export { panelActiveId, settingsBack, openSettingsSection, settingsChrome, ensureSettings, installSettingsWatcher };
