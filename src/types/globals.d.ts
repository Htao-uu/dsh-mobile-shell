// Page globals owned by dsh-mobile-shell and by the optional Android bridge.
import type { NativeBridge } from './native-bridge'

declare global {
  interface Window {
    /** Back-navigation chain shared by back-stack, exit-guard and attach-sheet. */
    __dshmBack?: (() => boolean) | undefined
    /** Debug log ring buffers enabled by ?dms-gesture-debug. */
    __dshmDrawerLog?: string[]
    __dshmRightLog?: string[]
    __dshmGestureLog?: string[]
    /** Android WebView bridge; absent on desktop browsers and plain WSA pages. */
    DSHNative?: NativeBridge
    /** Android → Web callback: result frames arrive here as JSON strings (or values). */
    __dshNativeResult?: (id: string, payload: unknown) => void
  }
}

export {}
