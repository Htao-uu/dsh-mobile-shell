// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { $, $$, isPhone } from '../core/dom.js'

function installLongPress(): () => void {
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
  let timer = 0
  let startX = 0
  let startY = 0
  let node: Element | null = null
  const cancel = (): void => {
    if (timer !== 0) {
      clearTimeout(timer)
      timer = 0
    }
  }

  const activate = (target: Element, cx: number, cy: number): void => {
    if (!(target instanceof Element)) {
      return
    }
    const session = target.closest('[class*="_sessionRow"]')
    if (session !== null) {
      const overflow =
        session.querySelector<HTMLElement>('[class*="_sessionOverflowButton"]') ||
        session.querySelector<HTMLElement>('[class*="_rowActions"] button')
      if (overflow !== null) {
        overflow.click()
        return
      }
    }
    /*
    const row = target.closest(
      'li, [class*="_row"], [class*="_entry"], [class*="_card"]',
    )
    if (row !== null) {
      const hidden = row.querySelector(
        '[class*="_rowActions"] button, [class*="_actions"] button, [class*="_overflow"], button[aria-haspopup="menu"]',
      )
      if (hidden !== null) {
        hidden.click()
        return
      }
    }
    */
    const msg = target.closest('[class*="_message"]')
    if (msg !== null) {
      msg.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
        }),
      )
    }
  }

  listen(
    document,
    'touchstart',
    (e: TouchEvent) => {
      if (!isPhone() || e.touches.length !== 1) {
        return
      }
      cancel()
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      node = e.target instanceof Element ? e.target : null
      if (node === null) {
        return
      }
      timer = setTimeout(() => {
        timer = 0
        if (node !== null) {
          activate(node, startX, startY)
        }
      }, 500)
    },
    { passive: true, capture: true },
  )

  listen(
    document,
    'touchmove',
    (e: TouchEvent) => {
      if (timer === 0 || e.touches.length !== 1) {
        return
      }
      const t = e.touches[0]
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
        cancel()
      }
    },
    { passive: true, capture: true },
  )

  listen(document, 'touchend', cancel, { passive: true, capture: true })
  listen(document, 'touchcancel', cancel, { passive: true, capture: true })

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      disposers[index]()
    }
  }
}

export { installLongPress }
