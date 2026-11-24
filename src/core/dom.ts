// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { MEDIA } from './constants.js'

/**
 * querySelector with the root/label conventions the plugin uses everywhere.
 * T defaults to HTMLElement because the plugin only queries host chrome.
 */
const $ = <T extends Element = HTMLElement>(sel: string, root?: ParentNode | null): T | null =>
  (root || document).querySelector<T>(sel)

/** querySelectorAll counterpart; always returns a mutable array. */
const $$ = <T extends Element = HTMLElement>(sel: string, root?: ParentNode | null): T[] => [
  ...(root || document).querySelectorAll<T>(sel),
]

/**
 * One MediaQueryList for the lifetime of the bundle. matchMedia() returns a new
 * object per call, and isPhone() sits in gesture/scroll paths, so keep it here.
 */
const phoneQuery: MediaQueryList | null =
  typeof window === 'undefined' ? null : window.matchMedia(MEDIA)

/**
 * Testing escape hatch, read once at load: `?dms-force=1` or
 * `localStorage.dms-force = '1'`. The URL wins, so `?dms-force=0` can
 * override a stored flag for one run without clearing it.
 */
const FORCE_PHONE = ((): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    const flag = new URLSearchParams(window.location.search).get('dms-force')
    if (flag !== null) {
      return flag === '1' || flag === 'true'
    }
    return window.localStorage.getItem('dms-force') === '1'
  } catch (error) {
    return false
  }
})()

const isPhone = (): boolean => FORCE_PHONE || phoneQuery?.matches === true

/** Keep the CSS switch (`html.dms-phone`) in step with isPhone(). */
const syncPhoneClass = (): void => {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.classList.toggle('dms-phone', isPhone())
}

/** Re-apply the class and reconcile the host when the breakpoint changes. */
const watchPhone = (onChange: () => void): (() => void) => {
  const query = phoneQuery
  if (query === null) {
    return () => {}
  }
  const handler = (): void => {
    syncPhoneClass()
    onChange()
  }
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler)
    return () => query.removeEventListener('change', handler)
  }
  query.addListener(handler)
  return () => query.removeListener(handler)
}

const frame = (): HTMLElement | null => $('[class*="_frame"]')

const sidebarCol = (): HTMLElement | null => $('[class*="_sidebarCol"]')

const rightbarCol = (): HTMLElement | null => $('[class*="_rightbarCol"]')

const settingsPanel = (): HTMLElement | null => $('[data-shortcut-modal="settings"]')

const hostLeftOpen = (): boolean => {
  const f = frame()
  return f !== null && !f.hasAttribute('data-sidebar-collapsed')
}

interface ShowToast {
  (text: string): void
  /** Pending hide timer, shared across calls (same field the JS source stored on the function). */
  timer?: ReturnType<typeof setTimeout>
}

const showToast: ShowToast = (text: string): void => {
  let el = $('.dms-toast')
  if (el === null) {
    el = document.createElement('div')
    el.className = 'dms-toast'
    document.body.appendChild(el)
  }
  el.textContent = text
  el.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => el.classList.remove('show'), 1800)
}

function normalizeSeparators(rootEl: Element | null): void {
  if (rootEl === null) {
    return
  }
  try {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
    let node: Node | null = null
    while ((node = walker.nextNode()) !== null) {
      const value = node.nodeValue
      if (value && value.indexOf('·') >= 0) {
        node.nodeValue = value.replace(/\s*·\s*/g, ' ').trim()
      }
    }
  } catch (error) {
    // read-only DOM shims
  }
}

export {
  $,
  $$,
  isPhone,
  syncPhoneClass,
  watchPhone,
  frame,
  sidebarCol,
  rightbarCol,
  settingsPanel,
  hostLeftOpen,
  showToast,
  normalizeSeparators,
}
