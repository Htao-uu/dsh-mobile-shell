// dsh-mobile-shell: startup coordination and teardown.
//
// Owns the install order, the DOMContentLoaded hand-off, and the disposer
// list. Feature modules own the resources they create; this module only
// collects their disposers and runs them in reverse order.
import type { Context } from '@deepseek-ai/cordis'
import { state } from '../core/state.js'
import { $$, syncPhoneClass, watchPhone } from '../core/dom.js'
import { removeStyles, styleOnce } from '../core/style.js'
import { initDebug } from './debug.js'
import { installScrim } from '../ui/scrim.js'
import { syncUI } from '../ui/sync.js'
import { installPreload } from '../features/preload.js'
import { installTopbarSlots } from '../features/topbar-slots.js'
import { installBackStack, installExitGuard } from '../features/back-stack.js'
import { installGestures, installDrawerAutoClose } from '../features/gesture/index.js'
import { installRightInterceptors } from '../features/topbar.js'
import { installViewTabsMenu } from '../features/view-tabs.js'
import { installKeyboard } from '../features/keyboard.js'
import { installSettingsSlot } from '../features/settings-slot.js'
import { installAttachSheet } from '../features/attach-sheet.js'
import { installSessionWatcher } from '../features/session-watch.js'
import { installLongPress } from '../features/long-press.js'
import { installObserver } from '../features/observer.js'

function startPlugin(ctx: Context): () => void {
  state.ctxRef = ctx
  const disposers: Array<() => void> = []
  let started = false
  const collect = (dispose: unknown): void => {
    if (typeof dispose === 'function') {
      disposers.push(dispose as () => void)
    }
  }

  const start = (): void => {
    if (started) {
      return
    }
    started = true
    initDebug()
    // CSS and JS share this one switch; set it before styleOnce() so the first
    // paint already has the right tokens.
    syncPhoneClass()
    collect(() => document.documentElement.classList.remove('dms-phone'))
    collect(watchPhone(syncUI))
    const off = state.DEBUG_OFF
    if (!off.has('styles')) {
      styleOnce()
    }
    collect(installScrim())
    collect(installTopbarSlots(ctx))
    collect(installBackStack())
    collect(installExitGuard())
    collect(installGestures())
    collect(installRightInterceptors())
    collect(installViewTabsMenu())
    collect(installKeyboard())
    collect(installSettingsSlot(ctx))
    collect(installAttachSheet())
    collect(installSessionWatcher(ctx))
    if (!off.has('autoclose')) {
      collect(installDrawerAutoClose())
    }
    if (!off.has('longpress')) {
      collect(installLongPress())
    }
    if (!off.has('observer')) {
      collect(installObserver(syncUI))
    }
    syncUI()
    collect(installPreload())
  }

  if (document.readyState === 'loading') {
    const onReady = (): void => start()
    document.addEventListener('DOMContentLoaded', onReady, { once: true })
    disposers.push(() => document.removeEventListener('DOMContentLoaded', onReady))
  } else {
    start()
  }

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      try {
        disposers[index]()
      } catch (error) {
        // isolated dispose
      }
    }
    removeStyles()
    // If teardown happens before DOMContentLoaded, installScrim() never ran;
    // keep the old unconditional scrim sweep for that case.
    if (!started) {
      for (const el of $$('.dms-scrim')) {
        el.remove()
      }
    }
  }
}

export { startPlugin }
