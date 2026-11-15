// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from '../core/state.js'
import { isPhone } from '../core/dom.js'
import {
  closeRight,
  openRight,
  rightExpandTrigger,
  toggleRightFullscreen,
} from '../features/right-drawer.js'

// Header buttons are registered through the official Slots (topbar-slots.ts).
// What remains here is the click ownership inside the right panel and the
// host's own expand/toggle controls: the plugin drawer is not the host panel,
// so those clicks still need single, explicit routing.
function installRightInterceptors(): () => void {
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
  listen(
    document,
    'click',
    (event: MouseEvent) => {
      // Programmatic preload clicks must reach the host.
      if (state.rightPreloadClick) {
        return
      }
      if (!isPhone()) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (target === null) {
        return
      }
      // Check the panel chrome before the generic expand matcher: the host's
      // collapse button has an aria-label containing "右侧边栏", so the broad
      // label fallback used to misclassify it as "expand" and reopen instead of
      // closing.
      const ownRight = target.closest('.dms-right-menu')
      if (ownRight !== null) {
        event.preventDefault()
        event.stopPropagation()
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation()
        }
        openRight()
        return
      }
      const toggle = target.closest('[data-sidebar-right-toggle]')
      const modeBtn = target.closest('[data-sidebar-right-mode]')
      const expanded = toggle === null && modeBtn === null ? rightExpandTrigger(target) : null
      if (expanded === null && modeBtn === null && toggle === null) {
        // Any other header click (left hamburger, person, "...", title) must be
        // left entirely to the host. A previous deferred "did the host open the
        // right panel?" fallback fired for EVERY header click and made the left
        // button open the right drawer ~250 ms later.
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (toggle !== null) {
        // 宿主 [收起] = 关闭插件抽屉（全屏态先退全屏，FEATURES 语义）
        closeRight()
        return
      }
      if (modeBtn !== null) {
        toggleRightFullscreen()
        return
      }
      if (expanded !== null) {
        state.rightVisible = true
        document.documentElement.classList.add('dms-right-open')
        try {
          openRight()
        } catch (error) {
          // openRight 已给出基础反馈
        }
        return
      }
      try {
        openRight()
      } catch (error) {
        // 保证点击永远不会“无反应”：至少打开抽屉。
        state.rightVisible = true
        document.documentElement.classList.add('dms-right-open')
      }
    },
    true,
  )

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      disposers[index]()
    }
  }
}

export { installRightInterceptors }
