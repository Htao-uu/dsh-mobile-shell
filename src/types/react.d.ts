// Minimal React surface used by this plugin's Slot components. The host
// provides the real React module; esbuild keeps the import external.
declare module 'react' {
  export type ReactNode = unknown

  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown

  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void
}
