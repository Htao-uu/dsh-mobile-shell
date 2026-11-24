// dsh-mobile-shell: 点击宿主左栏行之后自动关闭左抽屉。
import type { GestureContext } from './state.js'

/** 安装左抽屉自动关闭监听；返回卸载函数。 */
function installDrawerAutoClose(gestureContext: GestureContext): () => void {
  // 本模块注册的监听器卸载函数。
  const disposers: Array<() => void> = []
  // 注册监听并记录对应的卸载函数。
  const listen = (
    target: EventTarget,
    eventType: string,
    handler: (listenerEvent: never) => void,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    target.addEventListener(eventType, handler as EventListener, options)
    disposers.push(() => target.removeEventListener(eventType, handler as EventListener, options))
  }
  listen(
    document,
    'click',
    (listenerEvent) => {
      // 当前的鼠标点击事件。
      const mouseEvent = listenerEvent as unknown as MouseEvent
      if (!gestureContext.deps.isPhone() || !gestureContext.deps.leftOpen()) {
        return
      }
      // 点击目标元素。
      const eventTarget = mouseEvent.target instanceof Element ? mouseEvent.target : null
      // 宿主左栏元素。
      const sidebarElement = gestureContext.deps.sidebarCol()
      if (eventTarget === null || sidebarElement === null || !sidebarElement.contains(eventTarget)) {
        return
      }
      // 延迟 60ms 关闭左抽屉，给宿主的点击处理留出时间。
      const closeAfter = (): ReturnType<typeof setTimeout> =>
        setTimeout(() => {
          if (gestureContext.deps.leftOpen()) {
            gestureContext.deps.toggleLeft()
          }
        }, 60)
      if (
        eventTarget.closest('[class*="_panelRow"]') !== null ||
        eventTarget.closest('[class*="_newSession"]') !== null
      ) {
        closeAfter()
        return
      }
      // 命中的会话行元素。
      const sessionRow = eventTarget.closest('[class*="_sessionRow"]')
      if (sessionRow !== null) {
        if (eventTarget.closest('button, [role=menuitem], [aria-haspopup=menu]') === null) {
          closeAfter()
        }
        return
      }
      if (eventTarget.closest('[class*="_settingsArea"]') !== null) {
        closeAfter()
      }
    },
    true,
  )

  return () => {
    for (let disposerIndex = disposers.length - 1; disposerIndex >= 0; disposerIndex -= 1) {
      disposers[disposerIndex]()
    }
  }
}

export { installDrawerAutoClose }
