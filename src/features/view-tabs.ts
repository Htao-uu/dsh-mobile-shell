// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from '../core/state.js'
import { $, $$ } from '../core/dom.js'
import { ICONS } from '../core/constants.js'

function sessionActionsAnchor(): HTMLElement | null {
  return $<HTMLElement>(
    'header [aria-label="更多操作"], header [aria-label="More actions"], header [aria-haspopup="menu"][class*="_moreButton"]',
  )
}

function closeSessionActionsMenu(): void {
  const anchor = sessionActionsAnchor()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  setTimeout(() => {
    if (anchor !== null && anchor.getAttribute('aria-expanded') === 'true') {
      try {
        anchor.click()
      } catch (error) {
        // host busy
      }
    }
  }, 40)
}

// 插入宿主「更多操作」菜单的对话/轨迹 tab 项；注入失败则恢复 header tabs 常驻。
function injectViewTabsIntoMenu(menu: Element | null): boolean {
  if (menu === null) {
    return false
  }

  // 收集宿主的对话/轨迹 tab 项
  const tabs = $$('[data-conversation-tabs] [role="tab"]').filter((tab) =>
    /^(对话|轨迹|Chat|Trajectory)$/.test(tab.textContent ?? ''),
  )
  if (tabs.length === 0) {
    return false
  }

  // 找到菜单选项
  const sample = menu.querySelector<HTMLElement>('[role="menuitem"]')
  if (sample === null) {
    return false
  }
  // 状态签名+防止重复注入：菜单项数量、标签文本、选中状态
  const signature = tabs
    .map(
      (tab) => (tab.textContent ?? '') + (tab.getAttribute('aria-selected') === 'true' ? '1' : '0'),
    )
    .join('|')
  const existing = menu.querySelectorAll('[data-dms-view-tab]')
  if (existing.length === 1 && menu.getAttribute('data-dms-vtab-sig') === signature) {
    return true
  }
  for (const old of existing) {
    old.remove()
  }

  // 二合一切换
  const tab_texts = tabs.map((tab) => tab.textContent ?? '')
  const item = sample.cloneNode(true) as HTMLElement
  item.setAttribute('data-dms-view-tab', tab_texts.join('|'))
  item.setAttribute('role', 'menuitem')
  item.removeAttribute('aria-disabled')
  item.removeAttribute('disabled')
  const svg = item.querySelector('svg')
  if (svg !== null) {
    svg.outerHTML = ICONS.switch
  }
  // 过滤完成后，选择有文字的 span
  const first_active = tabs[0].getAttribute('aria-selected') === 'true'
  const spans = [...item.querySelectorAll('span')].filter(
    (span) => (span.textContent || '').trim().length > 0,
  )
  const labelEl = spans.length > 0 ? spans[spans.length - 1] : null
  if (labelEl !== null) {
    if (first_active) {
      labelEl.textContent = tab_texts[1]
    } else {
      labelEl.textContent = tab_texts[0]
    }
  }
  item.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      tabs[first_active ? 1 : 0].click()
    } catch (error) {
      console.error('切换视图失败：', error)
    }
    closeSessionActionsMenu()
  })
  menu.appendChild(item)

  menu.setAttribute('data-dms-vtab-sig', signature)
  document.documentElement.classList.add('dms-vtabs-menu')
  return true
}

// 精准定位宿主「更多操作」菜单后，注入对话/轨迹 tab 项；注入失败则恢复 header tabs 常驻。
function scanViewTabsMenu(): void {
  const goal_menu = $('header [class*="titleRow"]')
  const menu = $('[role="menu"]', goal_menu)
  if (menu === null) {
    return
  }
  if (injectViewTabsIntoMenu(menu)) {
    return
  }
  // 注入失败：立即恢复 header tab 常驻，不能让两个入口都消失；
  // 只有 tabs 确实存在时才把 fallback 固化为 sticky（否则下次对话页仍可尝试注入）。
  document.documentElement.classList.remove('dms-vtabs-menu')
}

function installViewTabsMenu(): () => void {
  const disposers: Array<() => void> = []
  const listen = (
    target: EventTarget,
    type: string,
    handler: (event: never) => void,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, handler as EventListener, options)
    disposers.push(() => target.removeEventListener(type, handler as EventListener, options))
  }

  // header 的「对话/轨迹」tab 行隐藏，移入宿主「...」菜单；注入失败则恢复常驻。
  document.documentElement.classList.add('dms-vtabs-menu')
  const schedule = (): void => {
    if (state.rightViewMenuRaf !== 0) {
      return
    }
    state.rightViewMenuRaf = requestAnimationFrame(() => {
      state.rightViewMenuRaf = 0
      scanViewTabsMenu()
    })
  }
  listen(
    document,
    'click',
    (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target === null || target.closest('[aria-haspopup="menu"]') === null) {
        return
      }
      setTimeout(scanViewTabsMenu, 30)
    },
    true,
  )
  state.rightViewMenuObserver = new MutationObserver(schedule)
  state.rightViewMenuObserver.observe(document.body, { childList: true, subtree: true })
  disposers.push(() => {
    if (state.rightViewMenuObserver !== null) {
      state.rightViewMenuObserver.disconnect()
    }
  })
  // 安全回退：只有在"已进入对话页且有 tabs、但宿主根本没有「更多操作」按钮"时
  // 才恢复 header tabs 常驻（避免出现既无 tabs 又无菜单项的真空）；默认保持隐藏。
  disposers.push(() => {
    if (state.rightViewMenuRaf !== 0) {
      cancelAnimationFrame(state.rightViewMenuRaf)
    }
  })
  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      disposers[index]()
    }
  }
}

export {
  sessionActionsAnchor,
  closeSessionActionsMenu,
  injectViewTabsIntoMenu,
  installViewTabsMenu,
}
