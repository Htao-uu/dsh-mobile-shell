// Types copied from the DSH checkout this plugin targets:
//   E:\DSH_WORKSPACE\DeepseekHarness\deepseek-harness
//
// - LayoutService mirrors the used subset of ILayout from
//   packages/client/ui-layout/src/client/service.ts (ctx.layout).
// - ObservableSnapshot mirrors packages/client/store/src/contract.ts, which is
//   the shape behind HostObservable in packages/client/ui-slots/src/renderer.ts.
//
// MainPanelId is Branded<'MainPanelId'> in DSH (packages/client/ui-layout);
// this standalone package has no dependency on @deepseek-ai/dsh-brand, so the
// brand is modelled as string here. Only null is ever passed by this plugin.
import type {} from '@deepseek-ai/cordis'

/** Selected central panel; null displays the current Conversation. */
export type MainPanelId = string

/** Root-scoped navigation state exposed to panel-aware components. */
export interface PanelInfo {
  /** Selected global panel; null displays the current Conversation. */
  readonly activePanelId: MainPanelId | null
}

/** Minimal observable snapshot source shared by controllers, stores, and render adapters. */
export interface ObservableSnapshot<T> {
  /** Read the cached snapshot reference. */
  getSnapshot(): T
  /** Subscribe to snapshot invalidation. */
  subscribe(fn: () => void): () => void
}

/** Panel navigation and geometry actions exposed through ctx.layout. */
export interface LayoutService {
  /** Selected central panel from the same root store used by `usePanelInfo`. */
  readonly panelInfo: ObservableSnapshot<PanelInfo>
  /**
   * Select a global central panel without changing the current Session.
   * @param panelId - registered main key, or null to show the Conversation.
   * @throws if the selected main key is not registered; preserves the current selection.
   */
  selectPanel(panelId: MainPanelId | null): void
  /**
   * Start an asynchronous navigation, superseding any earlier pending navigation.
   * @returns a signal aborted by the next navigation or layout disposal; check it before committing UI state.
   */
  beginNavigation(): AbortSignal
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /**
   * Report the right panel's presentation without changing its expanded state.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void
}

// Same augmentation DSH's ui-layout package applies for ctx.layout
// (packages/client/ui-layout/src/client/index.ts). The plugin lists "layout"
// in INJECT, so Cordis only calls apply() once that service is provided.
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside the layout plugin. */
    layout: LayoutService
  }
}
