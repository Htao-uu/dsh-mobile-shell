// dsh-mobile-shell: 一个 GestureContext 持有手势模块的全部可变状态和外部依赖；
// 这个文件只定义数据结构，不直接操作 DOM。
import type { ShellState } from '../../core/state.js'
import type { GestureMode, PendingSettle, Side, TimedSample } from './types.js'

/** 插件全局状态中手势会读写的那一部分。 */
export type GestureCoreState = Pick<
  ShellState,
  'gestureBusy' | 'springAnimating' | 'sidebarExpandBusy' | 'rightVisible'
>

/** 注册一个监听器；disposer 列表由 index.ts 统一持有。 */
export type GestureListener = (
  /** 监听目标。 */
  target: EventTarget,
  /** 事件名。 */
  eventType: string,
  /** 事件处理器；调用方负责把 Event 转成具体事件类型。 */
  handler: (listenerEvent: never) => void,
  /** addEventListener 的选项。 */
  options?: boolean | AddEventListenerOptions,
) => void

/** 手势模块读取或调用的全部外部能力。 */
export interface GestureDeps {
  /** 插件根元素（document.documentElement）。 */
  root: HTMLElement
  /** 插件全局状态中手势会修改的字段。 */
  core: GestureCoreState
  /** 判定“开始拖动”的最小横向位移（px）。 */
  lock: number
  /** 当前是否处于手机壳层模式。 */
  isPhone(): boolean
  /** 按选择器查询元素。 */
  query<ElementType extends Element = HTMLElement>(selector: string): ElementType | null
  /** 查询宿主主框架元素。 */
  frame(): HTMLElement | null
  /** 查询宿主左栏元素。 */
  sidebarCol(): HTMLElement | null
  /** 查询宿主右栏元素。 */
  rightbarCol(): HTMLElement | null
  /** 查询宿主设置面板元素。 */
  settingsPanel(): HTMLElement | null
  /** 关闭左抽屉（是否播动画）。 */
  closeLeftVisual(animated: boolean): void
  /** 请求宿主挂载/展开左栏。 */
  ensureSidebarMounted(): void
  /** 左抽屉当前是否可见。 */
  leftOpen(): boolean
  /** 以手势方式打开左抽屉。 */
  openLeftVisual(fromGesture?: boolean): void
  /** 切换左抽屉状态。 */
  toggleLeft(): void
  /** 关闭右抽屉。 */
  closeRight(): void
  /** 打开右抽屉。 */
  openRight(): void
  /** 输出手势调试日志。 */
  log(...logArguments: unknown[]): void
}

/** animation、touch、pointer 共享的可变运行状态。 */
export interface GestureState {
  /** 当前手势模式；null 表示没有活动手势。 */
  mode: GestureMode | null
  /** 触摸起点的横坐标（px）。 */
  startX: number
  /** 触摸起点的纵坐标（px）。 */
  startY: number
  /** 手势开始时的视口宽度（px）。 */
  width: number
  /** 是否已经判定为拖动并锁定手势。 */
  locked: boolean
  /** 上一次移动采样点的横坐标（px）。 */
  lastX: number
  /** 上一次移动采样的时间戳（ms）。 */
  lastT: number
  /** 平滑后的横向速度（px/ms）。 */
  velocity: number
  /** 最近一次移动的横向位移（px）。 */
  lastDx: number
  /** 最近 110ms 内的位置采样。 */
  samples: TimedSample[]
  /** 当前正在拖动的抽屉元素。 */
  activeEl: HTMLElement | null
  /** 当前正在推移的页面中心列元素。 */
  centerEl: HTMLElement | null
  /** 弹簧动画的 requestAnimationFrame 句柄。 */
  springRaf: number
  /** 最近的抽屉横向位置（px）。 */
  drawerX: number
  /** 手势序号；用于丢弃宿主挂载等待期间的过期结果。 */
  gestureSeq: number
  /** 本次手势缓存的视口宽度（px），避免反复触发布局。 */
  gestureWidth: number
  /** 缓存的主框架元素。 */
  cachedFrame: HTMLElement | null
  /** 等待宿主绘制抽屉的 requestAnimationFrame 句柄。 */
  armRaf: number
  /** 正在等待绘制的抽屉方向。 */
  armSide: Side | null
  /** 宿主尚未绘制完成时暂存的松手结果。 */
  pendingSettle: PendingSettle | null
  /** 下一次 click 是否需要被手势抑制。 */
  touchSuppressClick: boolean
  /** 平滑后的可视位置（px）；null 表示需要重新起算。 */
  visualX: number | null
  /** 上一帧的时间戳（ms），用于限制单帧位移。 */
  lastFrameT: number
  /** 鼠标手势是否处于活动状态。 */
  mouseActive: boolean
  /** 鼠标是否已经捕获指针。 */
  mouseCaptured: boolean
  /** 鼠标拖动后是否抑制随后的 click。 */
  mouseSuppressClick: boolean
}

/** index.ts 创建并传给所有子模块的统一上下文。 */
export interface GestureContext {
  /** 共享的可变手势状态。 */
  state: GestureState
  /** 外部依赖集合。 */
  deps: GestureDeps
}

/** 用给定的外部依赖创建一份手势上下文。 */
function createGestureContext(
  /** 外部依赖集合。 */
  deps: GestureDeps,
): GestureContext {
  // 初始化所有可变字段；每个字段的语义见 GestureState 的注释。
  return {
    deps,
    state: {
      mode: null,
      startX: 0,
      startY: 0,
      width: 0,
      locked: false,
      lastX: 0,
      lastT: 0,
      velocity: 0,
      lastDx: 0,
      samples: [],
      activeEl: null,
      centerEl: null,
      springRaf: 0,
      drawerX: 0,
      gestureSeq: 0,
      gestureWidth: 0,
      cachedFrame: null,
      armRaf: 0,
      armSide: null,
      pendingSettle: null,
      touchSuppressClick: false,
      visualX: null,
      lastFrameT: 0,
      mouseActive: false,
      mouseCaptured: false,
      mouseSuppressClick: false,
    },
  }
}

export { createGestureContext }
