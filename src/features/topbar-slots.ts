// dsh-mobile-shell: official Slot registration for the header buttons.
//
// The old topbar appended buttons to host containers and repaired them with two
// MutationObservers. The header now declares conversation.header.leading (root,
// single) and conversation.session.header.utilities (session, list); React owns
// both seats, so the buttons survive re-renders without observation.
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { ICONS } from '../core/constants.js'
import { ensureSidebarMounted, toggleLeft } from './left-drawer.js'
import { openRight } from './right-drawer.js'

function menuButton(): unknown {
  return createElement('button', {
    type: 'button',
    className: 'dms-iconbtn dms-menu',
    'aria-label': '打开侧边栏',
    onPointerDown: () => {
      ensureSidebarMounted()
    },
    onClick: (event: { preventDefault(): void; stopPropagation(): void }) => {
      event.preventDefault()
      event.stopPropagation()
      toggleLeft()
    },
    dangerouslySetInnerHTML: { __html: ICONS.menu },
  })
}

function rightButton(): unknown {
  return createElement('button', {
    type: 'button',
    className: 'dms-iconbtn dms-panel dms-right-menu',
    'aria-label': '打开右侧栏',
    onClick: (event: { preventDefault(): void; stopPropagation(): void }) => {
      event.preventDefault()
      event.stopPropagation()
      openRight()
    },
    dangerouslySetInnerHTML: { __html: ICONS.panel },
  })
}

function installTopbarSlots(ctx: Context): () => void {
  const disposers: Array<() => void> = [
    ctx.slots.inject('conversation.header.leading', () =>
      ctx.slots.register({ name: 'conversation.header.leading' }, menuButton),
    ),
    ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'dms-right', order: 100 },
        rightButton,
      ),
    ),
  ]
  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      disposers[index]()
    }
  }
}

export { installTopbarSlots, menuButton, rightButton }
