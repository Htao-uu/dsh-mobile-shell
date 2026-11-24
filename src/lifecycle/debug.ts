// dsh-mobile-shell: URL debug switches (?dms-off=styles,observer,...).
import { state } from '../core/state.js'

function initDebug(): void {
  const raw = new URLSearchParams(location.search).get('dms-off') || ''
  state.DEBUG_OFF = new Set<string>(raw.split(',').filter((item) => item !== ''))
}

export { initDebug }
