// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import type { Context } from '@deepseek-ai/cordis'
import { state } from '../core/state.js'
import { emit } from '../core/events.js'
import { preloadRight } from '../features/right-drawer.js'

// Session switching used to be polled from the host DOM: a 120ms interval read
// [data-conversation-session], and a 1500ms rAF burst covered the window around
// a session-row tap. DSH publishes the same fact as an observable on
// ctx.sidebarRight.mounted: the Session shown in the main column, updated before
// React renders the selection. Subscribe to that source instead, and keep only
// the pointer tracking that decides whether a blur would steal a fresh tap.

const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

function later(fn: () => void, ms: number): void {
  const id = setTimeout(() => {
    pendingTimers.delete(id)
    fn()
  }, ms)
  pendingTimers.add(id)
}

function clearPendingTimers(): void {
  for (const id of pendingTimers) {
    clearTimeout(id)
  }
  pendingTimers.clear()
}

function isEditorTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) {
    return false
  }
  if (el.closest('[data-composer-input]') !== null) {
    return true
  }
  return el.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]') !== null
}

function blurHostEditor(force: boolean): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) {
    return
  }
  if (!isEditorTarget(active)) {
    return
  }
  // A blur we caused ourselves 80/320ms later must not steal a focus the user
  // just placed in the composer deliberately.
  if (!force && state.lastPointerInEditor && performance.now() - state.lastPointerAt < 900) {
    return
  }
  try {
    active.blur()
  } catch (error) {
    // host busy
  }
}

function handleSessionSwitch(): void {
  // 任务29：切换会话后不聚焦 composer、不弹键盘；弹层立即关闭。
  emit('session-switch')
  blurHostEditor(true)
  later(() => blurHostEditor(false), 80)
  later(() => blurHostEditor(false), 320)
  later(() => preloadRight(), 900)
}

function installSessionWatcher(ctx: Context): () => void {
  let off: (() => void) | null = null

  // Pointer tracking stays: it answers "did the user just tap the composer?"
  // for the 80/320ms blur follow-ups. It reads the event target only.
  ctx.effect(() => {
    const pointer = (event: Event): void => {
      const target = event.target instanceof Element ? event.target : null
      state.lastPointerAt = performance.now()
      state.lastPointerInEditor =
        target !== null &&
        target.closest(
          '[contenteditable="true"], [role="textbox"], textarea, input, [data-composer-card], [data-composer-seat], [class*="_inputBar"]',
        ) !== null
    }
    document.addEventListener('touchstart', pointer, { passive: true, capture: true })
    document.addEventListener('pointerdown', pointer, { passive: true, capture: true })
    return () => {
      document.removeEventListener('touchstart', pointer, true)
      document.removeEventListener('pointerdown', pointer, true)
    }
  }, 'dsh-mobile-shell: session pointer tracking')

  // Dynamic injection: the plugin keeps working if ui-sidebar-right is absent
  // (the child fiber simply waits), and re-subscribes if that service reloads.
  ctx.inject(['sidebarRight'], (child) => {
    const source = child.sidebarRight.mounted
    let previous = source.getSnapshot()
    state.mountedSession = previous
    off = source.subscribe(() => {
      const next = source.getSnapshot()
      state.mountedSession = next
      if (next === previous || state.DEBUG_OFF.has('session-watch')) {
        return
      }
      previous = next
      handleSessionSwitch()
    })
    child.effect(() => () => {
      if (off !== null) {
        off()
        off = null
      }
      state.mountedSession = undefined
      clearPendingTimers()
    }, 'dsh-mobile-shell: session-watch')
  })

  return () => {
    if (off !== null) {
      off()
      off = null
    }
    clearPendingTimers()
  }
}

export { isEditorTarget, blurHostEditor, handleSessionSwitch, installSessionWatcher }
