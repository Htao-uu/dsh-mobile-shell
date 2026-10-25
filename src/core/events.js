// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
const listeners = new Map();
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => { const set = listeners.get(event); if (set !== undefined) set.delete(handler); };
}
export function emit(event, ...args) {
  const set = listeners.get(event);
  if (set === undefined) return;
  for (const handler of [...set]) { try { handler(...args); } catch (error) { /* isolated listener */ } }
}
