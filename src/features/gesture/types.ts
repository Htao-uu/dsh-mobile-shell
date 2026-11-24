// dsh-mobile-shell: 手势模块共用的类型定义。

/** 抽屉方向：左栏或右栏。 */
export type Side = 'left' | 'right'

/** 手势状态机的模式；pending 表示方向尚未判定。 */
export type GestureMode = 'pending' | 'open-left' | 'open-right' | 'close-left' | 'close-right'

/** 带时间戳的横向位置采样，用于松手时的速度判断。 */
export interface TimedSample {
  /** 采样点的视口横坐标（px）。 */
  positionX: number
  /** 采样点的时间戳（performance.now()，ms）。 */
  capturedAt: number
}

/** 宿主抽屉还没绘制出来时暂存的松手结果。 */
export interface PendingSettle {
  /** 产生该结果的手势序号，用来丢弃过期结果。 */
  sequence: number
  /** 松手时的手势模式。 */
  mode: GestureMode
  /** 从触摸起点算起的横向位移（px）。 */
  deltaX: number
  /** 是否满足快速滑动条件。 */
  fast: boolean
  /** 最近采样窗口内的稳定速度（px/ms）。 */
  stableVelocity: number
  /** 当时的抽屉宽度（px）。 */
  drawerWidth: number
  /** 打开/关闭判定阈值（px）。 */
  threshold: number
}

/** TouchEvent 与鼠标合成触摸共用的最小触点形状。 */
export interface TouchPoint {
  /** 触点相对视口左边的横坐标（px）。 */
  clientX: number
  /** 触点相对视口顶部的纵坐标（px）。 */
  clientY: number
}

/** 手势状态机只读取的触摸事件字段。 */
export interface GestureTouchEvent {
  /** 事件目标元素。 */
  readonly target: EventTarget | null
  /** 当前仍按在屏幕上的触点集合。 */
  readonly touches: ArrayLike<TouchPoint>
  /** 本次事件发生变化的触点集合。 */
  readonly changedTouches: ArrayLike<TouchPoint>
  /** 事件是否可以被 preventDefault 取消。 */
  readonly cancelable: boolean
  /** 阻止浏览器默认行为（滚动/点击等）。 */
  preventDefault(): void
}
