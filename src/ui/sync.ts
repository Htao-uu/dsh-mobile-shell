// dsh-mobile-shell: global UI reconciliation.
//
// One idempotent pass that mirrors shell state onto the host DOM. Callers:
// startup (first paint) and features/observer.ts (debounced after mutations).
import { state } from '../core/state.js'
import {
  $,
  $$,
  frame,
  isPhone,
  normalizeSeparators,
  settingsPanel,
} from '../core/dom.js'
import { forceMountSidebar, repairLeftHost, leftOpen } from '../features/left-drawer.js'
import { syncRightChrome, unlockRightPanel } from '../features/right-drawer.js'
import { ensureSettings } from '../features/settings.js'

function syncUI(): void {
  const f = frame()
  if (f === null) {
    return
  }
  f.setAttribute('data-dms-frame', 'frame')
  const root = document.documentElement
  root.classList.toggle('dms-left-open', leftOpen())
  // The right drawer mirrors the left one: the host panel is preloaded and
  // stays mounted, so state.rightVisible is the single state source (no host-marker
  // reconciliation, no retry clicks).
  root.classList.toggle('dms-right-open', state.rightVisible)
  // Also hide a loading cover that timed out and whose content appeared later;
  // the observer runs syncUI() after host DOM mutations.
  if (state.rightVisible) {
    unlockRightPanel()
  }
  const panel = settingsPanel()
  root.classList.toggle('dms-settings-open', panel !== null)
  if (panel !== null) {
    ensureSettings(panel)
  } else {
    root.classList.remove('dms-settings-list')
    root.classList.remove('dms-settings-section')
    root.classList.remove('dms-settings-chrome-init')
    root.classList.remove('dms-plugin-section')
    if (!leftOpen()) {
      root.classList.remove('dms-gesture-opened')
    }
  }
  if (!state.rightViewTabsFallback) {
    document.documentElement.classList.add('dms-vtabs-menu')
  }
  for (const header of $$('[class*="_centerCol"] header')) {
    const conversation =
      header.querySelector(
        '[data-conversation-header-leading], [data-conversation-header-corner]',
      ) !== null
    header.classList.toggle('dms-topbar', conversation)
  }
  const dock = $('[data-composer-dock], [class*="_composerDock"], [data-composer-stats]')
  if (dock !== null) {
    normalizeSeparators(dock)
  }
  for (const extra of $$('[class*="_statusLine"], [class*="_sessionStats"]')) {
    normalizeSeparators(extra)
  }
  const hero = $('[class*="_composerHero"]')
  root.classList.toggle('dms-hero-home', hero !== null && panel === null)
  // Fullscreen is plugin-state only (host chrome [全屏] toggles dms-right-full).
  syncRightChrome()
  if (isPhone()) {
    if (state.leftVisible) {
      repairLeftHost()
    } else if (!state.rightVisible) {
      forceMountSidebar()
    }
  }
}

export { syncUI }
