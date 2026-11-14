// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { ICONS, MEDIA } from './constants.js'
import type { ButtonIconKind } from './constants.js'

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

const isPhone = (): boolean => window.matchMedia(MEDIA).matches

const frame = (): HTMLElement | null => $('[class*="_frame"]')

const sidebarCol = (): HTMLElement | null => $('[class*="_sidebarCol"]')

const rightbarCol = (): HTMLElement | null => $('[class*="_rightbarCol"]')

const settingsPanel = (): HTMLElement | null => $('[data-shortcut-modal="settings"]')

const hostLeftOpen = (): boolean => {
  const f = frame()
  return f !== null && !f.hasAttribute('data-sidebar-collapsed')
}

function cloneIcon(selector: string): string {
  const host = $(selector)
  const svg = host === null ? null : host.querySelector('svg')
  return svg === null ? '' : svg.outerHTML
}

function iconFor(kind: ButtonIconKind): string {
  // 任务29：左上角永远用我们的「三」汉堡图标，不克隆宿主 expand/panel 的方框图标
  if (kind === 'menu') {
    return ICONS.menu
  }
  if (kind === 'plus') {
    return cloneIcon('[class*="_sidebarCol"] [class*="_newSession"]') || ICONS.plus
  }
  if (kind === 'panel') {
    return cloneIcon('[data-sidebar-right-expand]') || ICONS.panel
  }
  return ''
}

function makeButton(kind: ButtonIconKind, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'dms-iconbtn dms-' + kind
  b.setAttribute('aria-label', label)
  b.innerHTML = iconFor(kind)
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick()
  })
  return b
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
  frame,
  sidebarCol,
  rightbarCol,
  settingsPanel,
  hostLeftOpen,
  cloneIcon,
  iconFor,
  makeButton,
  showToast,
  normalizeSeparators,
}
