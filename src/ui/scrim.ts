// dsh-mobile-shell: scrim (backdrop) creation and teardown.
//
// The scrim is shared by both drawers; clicking it closes the right drawer
// first, otherwise the left one. It is created at most once per install.
import { $, $$ } from '../core/dom.js'
import { state } from '../core/state.js'
import { closeRight } from '../features/right-drawer.js'
import { leftOpen, toggleLeft } from '../features/left-drawer.js'

function installScrim(): () => void {
  let el = $<HTMLElement>('.dms-scrim')
  const onClick = (): void => {
    if (state.rightVisible) {
      closeRight()
    } else if (leftOpen()) {
      toggleLeft()
    }
  }
  if (el === null) {
    el = document.createElement('div')
    el.className = 'dms-scrim'
    el.setAttribute('aria-hidden', 'true')
    el.addEventListener('click', onClick)
    document.body.appendChild(el)
  }
  return () => {
    el.removeEventListener('click', onClick)
    // Keep the legacy teardown shape: remove every scrim node, including a
    // stale one left by an interrupted instance.
    for (const node of $$('.dms-scrim')) {
      node.remove()
    }
  }
}

export { installScrim }
