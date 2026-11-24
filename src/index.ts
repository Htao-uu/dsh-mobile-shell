// dsh-mobile-shell: plugin entry point only. Startup and teardown live in
// lifecycle/startup.ts; the individual features own their own resources.
import type { Context } from '@deepseek-ai/cordis'
import { startPlugin } from './lifecycle/startup.js'

const INJECT: string[] = ['layout', 'uiWorkspace', 'workspaces', 'slots']

function apply(ctx: Context): void {
  // Keep the original ordering: startup runs synchronously first (or arms the
  // DOMContentLoaded listener), then the teardown effect is registered.
  const dispose = startPlugin(ctx)
  ctx.effect(() => dispose, 'dsh-mobile-shell: teardown')
}

export { apply, INJECT }
