// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)

/** Events exchanged between feature modules (no DOM CustomEvent involved). */
export interface ShellEventMap {
  /** The conversation session changed; listeners close transient surfaces. */
  'session-switch': []
  /** A drawer is closing; gestures cancel any in-flight spring/inline transform. */
  'drawer-close': [side: 'left' | 'right']
}

/** Stored handlers are erased to the smallest callable shape and cast back on dispatch. */
type AnyHandler = (...args: never[]) => void

const listeners = new Map<keyof ShellEventMap, Set<AnyHandler>>()

export function on<K extends keyof ShellEventMap>(
  event: K,
  handler: (...args: ShellEventMap[K]) => void,
): () => void {
  let set = listeners.get(event)
  if (set === undefined) {
    set = new Set<AnyHandler>()
    listeners.set(event, set)
  }
  const guarded = handler as AnyHandler
  set.add(guarded)
  return () => {
    const current = listeners.get(event)
    if (current !== undefined) {
      current.delete(guarded)
    }
  }
}

export function emit<K extends keyof ShellEventMap>(event: K, ...args: ShellEventMap[K]): void {
  const set = listeners.get(event)
  if (set === undefined) {
    return
  }
  for (const handler of [...set]) {
    try {
      const dispatch = handler as (...handlerArgs: ShellEventMap[K]) => void
      dispatch(...args)
    } catch (error) {
      // isolated listener
    }
  }
}
