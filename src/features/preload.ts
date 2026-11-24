// dsh-mobile-shell: bounded startup preloading for both drawers.
//
// Owns every timer it creates; installPreload() returns a disposer that
// clears all of them.
import { state } from '../core/state.js'
import { hostLeftOpen, isPhone } from '../core/dom.js'
import { forceMountSidebar, leftOpen, toggleLeft } from '../features/left-drawer.js'
import { openRight, preloadRight } from '../features/right-drawer.js'

function installPreload(): () => void {
  // Bounded startup preload: the host sidebar is toggled open once and kept
  // mounted under the page. Retry only while the mount request is in flight
  // (sidebarExpandBusy) — never re-toggle a host that is already committing.
  let leftPreloadTries = 0
  let leftPreloadTimer = 0
  const ensureLeftPreload = (): void => {
    leftPreloadTimer = 0
    if (!isPhone() || state.leftVisible || state.rightVisible) {
      return
    }
    if (hostLeftOpen()) {
      return
    }
    if (state.sidebarMountState === 'failed') {
      return
    }
    if (state.sidebarExpandBusy) {
      if (leftPreloadTries++ < 40) {
        leftPreloadTimer = setTimeout(ensureLeftPreload, 150)
      }
      return
    }
    forceMountSidebar()
    if (leftPreloadTries++ < 8) {
      leftPreloadTimer = setTimeout(ensureLeftPreload, 200)
    }
  }
  leftPreloadTimer = setTimeout(ensureLeftPreload, 120)

  const rightPreloadTimer = setTimeout(() => preloadRight(), 800)

  const wanted = new URLSearchParams(location.search).get('dms')
  let leftOpenTimer = 0
  let rightOpenTimer = 0
  if (wanted === 'left' && !leftOpen()) {
    leftOpenTimer = setTimeout(() => toggleLeft(), 600)
  }
  if (wanted === 'right' && !state.rightVisible) {
    rightOpenTimer = setTimeout(() => openRight(), 900)
  }

  return () => {
    if (leftPreloadTimer !== 0) {
      clearTimeout(leftPreloadTimer)
    }
    clearTimeout(rightPreloadTimer)
    if (leftOpenTimer !== 0) {
      clearTimeout(leftOpenTimer)
    }
    if (rightOpenTimer !== 0) {
      clearTimeout(rightOpenTimer)
    }
  }
}

export { installPreload }
