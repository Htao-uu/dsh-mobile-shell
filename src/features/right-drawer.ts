// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from '../core/state.js'
import { ICONS } from '../core/constants.js'
import { $, $$, isPhone, settingsPanel } from '../core/dom.js'
import { emit } from '../core/events.js'

// A preload collapse loop and an explicit user open share the same host panel.
// openRight() invalidates the loop generation so a late preload timeout cannot
// toggle the host shut under an already-open drawer.
let preloadGeneration = 0

/**
 * The host button and icon state this plugin painted last. `innerHTML` is a
 * serialized comparison: assigning an SVG string and reading it back is not
 * guaranteed to be byte-identical, so comparing against it re-wrote the icon
 * on every reconcile and made the rightbar MutationObserver schedule another
 * reconcile forever. Track the node plus the semantic state instead.
 */
let appliedRightChrome: { button: HTMLElement; full: boolean } | null = null

function rightDebugEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has('dms-gesture-debug')
  } catch (error) {
    return false
  }
}
function rlog(...args: unknown[]): void {
  if (!rightDebugEnabled()) {
    return
  }
  try {
    const line =
      '[dshm-right] ' +
      Math.round(performance.now()) +
      ' ' +
      args.map((arg) => String(arg)).join(' ')
    const win = window
    win.__dshmRightLog = win.__dshmRightLog || []
    win.__dshmRightLog.push(line)
    if (win.__dshmRightLog.length > 120) {
      win.__dshmRightLog.shift()
    }
    console.log(line)
  } catch (error) {
    // debug only
  }
}

function rightPanelEl(): HTMLElement | null {
  return $('[data-sidebar-right-session]:not([hidden])') || $('[data-sidebar-right-session]')
}

function rightSessionId(): string {
  // The controller names the on-screen Session before React renders it; the
  // DOM attribute remains as a fallback while the right panel is mounted.
  const mounted = state.mountedSession
  if (mounted !== undefined) {
    return mounted
  }
  const panel = rightPanelEl()
  return panel === null ? '' : panel.getAttribute('data-sidebar-right-session') || ''
}

function rightPanelHasTab(): boolean {
  const panel = rightPanelEl()
  return (
    panel !== null && panel.querySelector('[data-dockkit-tab], [data-sidebar-right-tab]') !== null
  )
}

function rightTabBodyEl(): HTMLElement | null {
  const panel = rightPanelEl()
  return panel === null
    ? null
    : panel.querySelector<HTMLElement>('[class*="_tabBody"], [data-dockkit-tab-body]')
}

function rightPanelContentReady(): boolean {
  const panel = rightPanelEl()
  if (panel === null) {
    return false
  }
  if (panel.querySelector('[data-dockkit-tab], [data-sidebar-right-tab]') === null) {
    return false
  }
  const body = rightTabBodyEl()
  if (body === null) {
    return false
  }
  const text = (body.textContent || '').replace(/\s+/g, '')
  if (text.length > 2) {
    return true
  }
  return (
    body.querySelector(
      "button, [class*='_entry'], [class*='_guide'], img, svg, input, textarea, iframe, canvas, video, [contenteditable='true']",
    ) !== null
  )
}

const clickHost = (el: HTMLElement | null): boolean => {
  if (el === null) {
    return false
  }
  state.rightPreloadClick = true
  try {
    el.click()
  } catch (error) {
    // host busy
  } finally {
    state.rightPreloadClick = false
  }
  return true
}

function preloadRight(): void {
  if (!isPhone() || settingsPanel() !== null || state.rightVisible) {
    return
  }
  if (state.rightPreloadState === 'busy') {
    return
  }
  const sid = rightSessionId()
  if (sid === '') {
    return
  }
  if (state.rightPreloadAttempts.has(sid)) {
    return
  }
  if (hostRightOpen()) {
    state.rightPreloadAttempts.add(sid)
    clickHost($('[data-sidebar-right-toggle]'))
    state.rightPreloadState = rightPanelHasTab() ? 'ok' : 'idle'
    return
  }
  const expand = $('[data-sidebar-right-expand]')
  if (expand === null) {
    return
  }
  const now = performance.now()
  if (now - state.lastRightPreloadAt < 2000) {
    return
  }
  state.lastRightPreloadAt = now
  state.rightPreloadAttempts.add(sid)
  state.rightPreloadState = 'busy'
  const generation = ++preloadGeneration
  document.documentElement.classList.add('dms-preload-right')
  clickHost(expand)
  const started = now
  let addTried = false
  let collapsed = false
  const collapse = (): void => {
    if (collapsed) {
      return
    }
    if (generation !== preloadGeneration || state.rightVisible) {
      // User opened the drawer (or a newer preload started): stop without
      // touching the host state, otherwise the timeout would close it.
      collapsed = true
      return
    }
    if (hostRightOpen()) {
      if (!rightPanelHasTab() && !addTried) {
        const addBtn = $('[data-dockkit-add-tab]')
        if (addBtn !== null) {
          addTried = true
          clickHost(addBtn)
        }
      }
      if (rightPanelContentReady()) {
        collapsed = true
        setTimeout(() => {
          if (generation !== preloadGeneration || state.rightVisible) {
            return
          }
          clickHost($('[data-sidebar-right-toggle]'))
          state.rightPreloadState = 'ok'
          document.documentElement.setAttribute('data-dms-right-preloaded', '1')
        }, 80)
        return
      }
    }
    if (performance.now() - started > 2600) {
      if (generation !== preloadGeneration || state.rightVisible) {
        collapsed = true
        return
      }
      collapsed = true
      clickHost($('[data-sidebar-right-toggle]'))
      state.rightPreloadState = 'fail'
      document.documentElement.setAttribute('data-dms-right-preload-failed', '1')
      return
    }
    requestAnimationFrame(collapse)
  }
  requestAnimationFrame(collapse)
}

// The host keeps its collapsed tab pane marked [inert] (and aria-hidden) even
// while the plugin shows the panel with CSS. Inert subtrees are excluded from
// hit testing, so visually-open buttons are dead until the host expands. We
// unlock exactly the inert nodes inside the current right session while the
// drawer is open and restore them when it closes. This is the actual root
// cause of "看起来打开了，但按钮点不动" (confirmed via WebView DevTools).
let unlockedInert: Element[] = []
let restoreLeftToken = 0

function hideLeftSidebar(): void {
  const col = document.querySelector<HTMLElement>('[class*="_sidebarCol"]')
  if (col !== null) {
    col.style.setProperty('display', 'none', 'important')
  }
}

// Restore the preloaded left sidebar only after the pushed page has fully
// covered it again. Event-driven: transitionend plus a rAF check for
// reduced-motion/instant cases; no fixed timeout.
function restoreLeftAfterShift(): void {
  const token = ++restoreLeftToken
  const col = document.querySelector<HTMLElement>('[class*="_sidebarCol"]')
  const center = document.querySelector<HTMLElement>('[class*="_centerCol"]')
  const finish = (): void => {
    if (token !== restoreLeftToken) {
      return
    }
    if (state.rightVisible) {
      return
    }
    if (col !== null) {
      col.style.removeProperty('display')
    }
  }
  if (col === null || center === null) {
    finish()
    return
  }
  center.addEventListener(
    'transitionend',
    (event) => {
      if (event.target === center && event.propertyName === 'transform') {
        finish()
      }
    },
    { once: true },
  )
  const check = (): void => {
    if (token !== restoreLeftToken) {
      return
    }
    if (state.rightVisible) {
      return
    }
    const transform = window.getComputedStyle(center).transform
    if (transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)') {
      finish()
      return
    }
    requestAnimationFrame(check)
  }
  requestAnimationFrame(check)
}

function unlockRightPanel(): void {
  const session = document.querySelector('[data-sidebar-right-session]')
  if (session === null) {
    return
  }
  const nodes: Element[] = []
  if (session.hasAttribute('inert')) {
    nodes.push(session)
  }
  const panel = session.closest('[data-sidebar-right-panel]')
  if (panel !== null && panel.hasAttribute('inert')) {
    nodes.push(panel)
  }
  const inertNodes = session.querySelectorAll('[inert]')
  for (const el of inertNodes) {
    nodes.push(el)
  }
  for (const el of nodes) {
    if (unlockedInert.indexOf(el) < 0) {
      unlockedInert.push(el)
    }
    el.removeAttribute('inert')
  }
}

function lockRightPanel(): void {
  for (const el of unlockedInert) {
    if (el.isConnected && !el.hasAttribute('inert')) {
      el.setAttribute('inert', '')
    }
  }
  unlockedInert = []
}

function openRight(): void {
  state.rightVisible = true
  // A user open cancels the background preload: its 2.6s timeout must not
  // toggle the host panel shut after this point.
  preloadGeneration += 1
  if (state.rightPreloadState === 'busy') {
    state.rightPreloadState = 'cancelled'
  }
  // Drop the preload gate when the panel becomes interactive; the open rules
  // below (and the width override in right-drawer.css) keep it laid out.
  restoreLeftToken += 1
  hideLeftSidebar()
  document.documentElement.classList.remove('dms-preload-right')
  document.documentElement.classList.add('dms-right-open')
  unlockRightPanel()
  rlog('open', 'preloaded=' + document.documentElement.hasAttribute('data-dms-right-preloaded'))
}

function closeRight(): void {
  state.rightVisible = false
  // Let the gesture layer cancel any in-flight spring/inline transform before
  // the close classes run; otherwise the page can stay pushed and reveal the
  // preloaded left sidebar.
  emit('drawer-close', 'right')
  lockRightPanel()
  const root = document.documentElement
  root.removeAttribute('data-dms-right-wait-timeout')
  root.classList.remove('dms-right-full')
  root.classList.remove('dms-right-open')
  root.classList.add('dms-preload-right')
  restoreLeftAfterShift()
}

function toggleRightFullscreen(): void {
  const root = document.documentElement
  if (root.classList.contains('dms-right-full')) {
    root.classList.remove('dms-right-full')
  } else {
    state.rightVisible = true
    root.classList.remove('dms-preload-right')
    root.classList.add('dms-right-open')
    root.classList.add('dms-right-full')
    unlockRightPanel()
  }
  syncRightChrome()
}

function syncRightChrome(): void {
  if (!isPhone()) {
    return
  }
  const modeBtn = $('[data-sidebar-right-mode]')
  if (modeBtn === null) {
    appliedRightChrome = null
    return
  }
  const full = document.documentElement.classList.contains('dms-right-full')
  const stateKey = full ? 'full' : 'window'
  // The host React tree may replace the button, but within one button node the
  // icon/label only depend on `full`. The marker lives on the SVG this plugin
  // painted: it is absent after a host re-render, so the icon is repaired once
  // without re-reading innerHTML (whose serialization is not a stable equality).
  if (
    appliedRightChrome !== null &&
    appliedRightChrome.button === modeBtn &&
    appliedRightChrome.full === full &&
    modeBtn.querySelector(`[data-dms-right-chrome="${stateKey}"]`) !== null
  ) {
    return
  }
  const want = full ? ICONS.exitFull : ICONS.full
  try {
    if (modeBtn.innerHTML !== want) {
      modeBtn.innerHTML = want
    }
    const icon = modeBtn.firstElementChild
    if (icon !== null) {
      icon.setAttribute('data-dms-right-chrome', stateKey)
    }
    const label = full ? '退出全屏' : '进入全屏'
    if (modeBtn.getAttribute('aria-label') !== label) {
      modeBtn.setAttribute('aria-label', label)
    }
    appliedRightChrome = { button: modeBtn, full }
  } catch (error) {
    // A host re-render may detach the button between lookup and write. Do not
    // cache a half-applied state; the next reconcile will retry on the new node.
    appliedRightChrome = null
  }
}

const hostRightOpen = (): boolean =>
  $('[data-sidebar-right-session]:not([hidden]) [data-sidebar-right-open]') !== null

const rightOpen = (): boolean => $('[data-sidebar-right-open]') !== null

function rightExpandTriggerInHeader(): Element | null {
  const header = document.querySelector('[class*="_centerCol"] header')
  if (header === null) {
    return null
  }
  return (
    header.querySelector('[data-sidebar-right-expand]') ||
    header.querySelector(
      '[aria-label="打开右侧边栏"], [aria-label="展开右侧边栏"], [aria-label="Open right sidebar"], [aria-label="Expand right sidebar"], [aria-label*="右侧栏"], [aria-label*="右侧边栏"]',
    )
  )
}

function rightExpandTrigger(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) {
    return null
  }
  // Anything inside the right panel is panel UI, never the header expand
  // trigger. The host's collapse button aria-label contains "右侧边栏" and used
  // to be classified as "expand" by the label fallback below.
  if (node.closest('[data-sidebar-right-session]') !== null) {
    return null
  }
  const direct = node.closest('[data-sidebar-right-expand]')
  if (direct !== null) {
    return direct
  }
  const labelled = node.closest(
    '[aria-label="打开右侧边栏"], [aria-label="展开右侧边栏"], [aria-label="Open right sidebar"], [aria-label="Expand right sidebar"], [aria-label*="右侧栏"], [aria-label*="右侧边栏"]',
  )
  if (labelled !== null) {
    return labelled
  }
  // 兼容宿主把按钮包在 wrapper 里 / 自定义 data-* 的情况：只在 header 内向上找 4 层。
  const header = node.closest('header')
  if (header === null) {
    return null
  }
  let el: Element | null = node
  for (let depth = 0; el !== null && el !== header && depth < 5; depth++, el = el.parentElement) {
    const cls = typeof el.className === 'string' ? el.className : ''
    if (
      (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') &&
      /expand|sidebar-right/i.test(cls + ' ' + (el.getAttribute('data-sidebar-right-expand') || ''))
    ) {
      return el
    }
  }
  return null
}

function exitRightFullscreen(closeDrawer?: boolean): void {
  document.documentElement.classList.remove('dms-right-full')
  if (closeDrawer === true) {
    closeRight()
  }
}

export {
  rightPanelEl,
  rightSessionId,
  rightPanelHasTab,
  rightTabBodyEl,
  rightPanelContentReady,
  clickHost,
  preloadRight,
  openRight,
  closeRight,
  toggleRightFullscreen,
  syncRightChrome,
  hostRightOpen,
  rightOpen,
  rightExpandTriggerInHeader,
  rightExpandTrigger,
  exitRightFullscreen,
  unlockRightPanel,
  lockRightPanel,
}
