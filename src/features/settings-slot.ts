// dsh-mobile-shell: settings open/close signal from an official Slot.
//
// settings.action is a root list rendered only while the settings panel exists.
// A null component in that seat is a mount/unmount signal, replacing the body
// MutationObserver that used to watch [data-shortcut-modal="settings"].
import { useEffect } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { ensureSettings } from './settings.js'

function settingsSeat(): null {
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>('[data-shortcut-modal="settings"]')
    if (panel !== null) {
      ensureSettings(panel)
    }
    const root = document.documentElement
    root.classList.add('dms-settings-open')
    if (!root.classList.contains('dms-settings-chrome-init')) {
      root.classList.remove('dms-settings-section')
      root.classList.add('dms-settings-list')
      root.classList.add('dms-settings-chrome-init')
    }
    const title = document.querySelector<HTMLElement>('.dms-settings-title-text')
    if (title !== null) {
      title.textContent = '设置'
    }
    const options = panel === null ? null : panel.querySelector<HTMLElement>('[class*="_options"]')
    if (options !== null) {
      options.scrollTop = 0
    }
    return () => {
      root.classList.remove(
        'dms-settings-open',
        'dms-settings-list',
        'dms-settings-section',
        'dms-settings-chrome-init',
        'dms-plugin-section',
      )
    }
  }, [])
  return null
}

function installSettingsSlot(ctx: Context): () => void {
  return ctx.slots.inject('settings.action', () =>
    ctx.slots.register({ name: 'settings.action', id: 'dms-settings-seat' }, settingsSeat),
  )
}

export { installSettingsSlot, settingsSeat }
