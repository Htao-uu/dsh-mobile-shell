// dsh-mobile-shell: 拖动帧更新、弹簧回弹、宿主绘制等待和内联样式清理。
import type { GestureContext } from './state.js'
import type { GestureMode, PendingSettle, Side } from './types.js'

/** 拖动过程中单帧允许的最大位移速度（px/s），避免宿主卡顿后瞬移。 */
const MAXIMUM_SPEED = 2300

// 整个手势期间缓存视口宽度：写 transform 后再读 window.innerWidth 会强制
// 布局，之前“滑到一半卡住”的卡顿主要来自这里。公式必须和 tokens.css 的
// --dms-drawer-w（80vw）保持一致，否则页面推移和抽屉宽度会对不上。
function drawerWidth(gestureContext: GestureContext): number {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  return Math.round((gestureState.gestureWidth || window.innerWidth) * 0.8)
}

/** 按方向取左栏或右栏元素。 */
function elFor(gestureContext: GestureContext, side: Side): HTMLElement | null {
  return side === 'left' ? gestureContext.deps.sidebarCol() : gestureContext.deps.rightbarCol()
}

/** 取宿主主框架元素，并在 DOM 更换后刷新缓存。 */
function hostFrame(gestureContext: GestureContext): HTMLElement | null {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (gestureState.cachedFrame === null || !gestureState.cachedFrame.isConnected) {
    gestureState.cachedFrame = gestureContext.deps.frame()
  }
  return gestureState.cachedFrame
}

/** 宿主左栏是否已经展开绘制。 */
function leftHostOpen(gestureContext: GestureContext): boolean {
  // 宿主主框架元素。
  const hostFrameElement = hostFrame(gestureContext)
  return hostFrameElement !== null && !hostFrameElement.hasAttribute('data-sidebar-collapsed')
}

// 这里不调用 getClientRects/getComputedStyle：这些布局读取会在每一帧强制
// 同步布局。宿主状态本身就是“可以开始画”的信号，随后 CSS 会应用可见状态。
function armReady(gestureContext: GestureContext, side: Side): boolean {
  return side === 'left'
    ? leftHostOpen(gestureContext)
    : gestureContext.deps.rightbarCol() !== null
}

/** 停止等待宿主绘制抽屉的轮询。 */
function stopArm(gestureContext: GestureContext): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (gestureState.armRaf !== 0) {
    cancelAnimationFrame(gestureState.armRaf)
    gestureState.armRaf = 0
  }
  gestureState.armSide = null
}

/** 按手势模式取拖动时挂到 html 上的类名。 */
function dragClassFor(gestureMode: GestureMode): string {
  return gestureMode === 'open-left'
    ? 'dms-dragging-left'
    : gestureMode === 'open-right'
      ? 'dms-dragging-right'
      : gestureMode === 'close-left'
        ? 'dms-drag-close-left'
        : 'dms-drag-close-right'
}

/** 清掉所有拖动/等待相关的类名。 */
function clearDragClasses(gestureContext: GestureContext): void {
  gestureContext.deps.root.classList.remove(
    'dms-dragging-left',
    'dms-dragging-right',
    'dms-drag-close-left',
    'dms-drag-close-right',
    'dms-gesture-arming',
    'dms-gesture-arming-right',
  )
}

/** 把抽屉和页面推移到指定位置；带单帧最大速度限制。 */
function applyFrame(gestureContext: GestureContext, side: Side, targetX: number): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  // 抽屉宽度由 80vw 计算，和 CSS 保持同一来源。
  const drawerSpan = drawerWidth(gestureContext)
  // 本帧时间，用于计算与上一帧的间隔(毫秒)。
  const currentTime = performance.now()
  // 距上一帧的秒数，限制在 4ms~50ms 之间。
  const deltaSeconds = Math.max(
    0.004,
    Math.min(0.05, gestureState.lastFrameT === 0 ? 0.016 : (currentTime - gestureState.lastFrameT) / 1000),
  )
  gestureState.lastFrameT = currentTime
  if (gestureState.visualX === null) {
    gestureState.visualX = targetX
  }
  // 本帧允许的最大位移（px）。
  const maximumStep = Math.max(2, MAXIMUM_SPEED * deltaSeconds)
  // 平滑后的本帧目标位置（px）。
  let nextPosition = targetX
  if (nextPosition - gestureState.visualX > maximumStep) {
    nextPosition = gestureState.visualX + maximumStep
  } else if (gestureState.visualX - nextPosition > maximumStep) {
    nextPosition = gestureState.visualX - maximumStep
  }
  gestureState.visualX = nextPosition
  // 同步记录“已经画到哪”，后续弹簧/回调读取时不会拿到上一帧的值。
  gestureState.drawerX = nextPosition
  // 本帧抽屉位移取整后作为左右两侧共用的数字基准，避免两边各自舍入产生半像素差。
  const drawerOffset = Math.round(nextPosition)
  // 当前正在拖动的抽屉元素。
  let activeElement = gestureState.activeEl
  if (activeElement === null || !activeElement.isConnected) {
    activeElement = elFor(gestureContext, side)
    gestureState.activeEl = activeElement
  }
  if (activeElement !== null) {
    gestureContext.deps.root.classList.remove('dms-gesture-arming', 'dms-gesture-arming-right')
    activeElement.style.setProperty('animation', 'none', 'important')
    activeElement.style.setProperty('transition', 'none', 'important')
    activeElement.style.setProperty(
      'transform',
      'translate3d(' + drawerOffset + 'px,0,0)',
      'important',
    )
    activeElement.style.setProperty('will-change', 'transform', 'important')
  }
  // 页面中心列元素。
  let centerElement = gestureState.centerEl
  if (centerElement === null) {
    centerElement = gestureContext.deps.query('[class*="_centerCol"]')
    gestureState.centerEl = centerElement
  }
  if (centerElement !== null) {
    // 页面跟随抽屉同步推移。HANDOVER §14 记录过推移产生的白边，但那是宿主
    // 左栏预加载（P0 修复）之前；现在左栏始终画在页面下方，不会露白。
    // 页面位移必须由同一个 drawerOffset 推算：左栏是 drawerSpan + offset，
    // 右栏是 offset - drawerSpan；两侧不会再出现一帧的舍入差。
    const pageOffsetX =
      side === 'left'
        ? Math.max(0, Math.min(drawerSpan, Math.round(drawerSpan + drawerOffset)))
        : Math.min(0, Math.max(-drawerSpan, Math.round(drawerOffset - drawerSpan)))
    centerElement.style.setProperty('transition', 'none', 'important')
    centerElement.style.setProperty(
      'transform',
      pageOffsetX === 0 ? 'none' : 'translate3d(' + pageOffsetX + 'px,0,0)',
      'important',
    )
    centerElement.style.setProperty('opacity', '1', 'important')
  }
}

/** 清掉手势写在元素上的内联样式和状态标记。 */
function clearInline(gestureContext: GestureContext): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  gestureContext.deps.core.springAnimating = false
  clearDragClasses(gestureContext)
  // 当前活动的抽屉元素。
  const activeElement = gestureState.activeEl
  if (activeElement !== null) {
    activeElement.style.removeProperty('transform')
    activeElement.style.removeProperty('transition')
    activeElement.style.removeProperty('animation')
    activeElement.style.removeProperty('will-change')
    activeElement.style.removeProperty('z-index')
  }
  // 当前推移的页面中心列元素。
  const centerElement = gestureState.centerEl
  if (centerElement !== null) {
    centerElement.style.removeProperty('transform')
    centerElement.style.removeProperty('opacity')
    centerElement.style.removeProperty('transition')
  }
  gestureState.activeEl = null
  // 清掉起算基准，下一段位移从新的目标位置重新开始。
  gestureState.visualX = null
  gestureState.lastFrameT = 0
}

/** 从当前位置弹到目标位置；willClose 时弹完会移除打开类名。 */
function springTo(
  gestureContext: GestureContext,
  side: Side,
  targetX: number,
  willClose: boolean,
  onFinished?: () => void,
): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (gestureState.springRaf !== 0) {
    cancelAnimationFrame(gestureState.springRaf)
  }
  gestureContext.deps.log(
    'spring-start',
    side,
    'target=' + Math.round(targetX),
    'close=' + willClose,
  )
  gestureContext.deps.core.gestureBusy = true
  gestureContext.deps.core.springAnimating = true
  if (gestureState.activeEl === null) {
    gestureState.activeEl = elFor(gestureContext, side)
  }
  // 弹簧当前位置（px）。
  let springPosition = gestureState.drawerX
  // 弹簧当前速度（px/s）。
  let springVelocity = 0
  // 弹簧刚度系数。
  const stiffness = 1500
  // 阻尼比例。
  const damping = 0.9
  // 阻尼力系数。
  const dragCoefficient = 2 * damping * Math.sqrt(stiffness)
  // 上一帧时间戳（ms）。
  let previousTimestamp = performance.now()
  // 弹簧动画的逐帧推进函数。
  const step = (frameTime: number): void => {
    // 距上一帧的秒数，限制在 1ms~34ms 之间。
    const deltaSeconds = Math.min(0.034, Math.max(0.001, (frameTime - previousTimestamp) / 1000))
    previousTimestamp = frameTime
    // 弹簧加速度（px/s²）。
    const acceleration = -stiffness * (springPosition - targetX) - dragCoefficient * springVelocity
    springVelocity += acceleration * deltaSeconds
    springPosition += springVelocity * deltaSeconds
    applyFrame(gestureContext, side, springPosition)
    if (Math.abs(springPosition - targetX) > 0.15 || Math.abs(springVelocity) > 4) {
      gestureState.springRaf = requestAnimationFrame(step)
    } else {
      gestureState.springRaf = 0
      gestureContext.deps.log('spring-end', side, 'close=' + willClose)
      // 不强行把 springPosition 拍到 targetX：最后 <0.15px 的减速也由弹簧自己
      // 走完；收尾仍使用 applyFrame 的同一套取整基准。
      if (willClose) {
        gestureContext.deps.root.classList.remove('dms-left-open', 'dms-right-open')
      }
      // 先让抽屉层把状态/类名切到位，再撤掉手势内联样式。
      if (typeof onFinished === 'function') {
        onFinished()
      }
      clearInline(gestureContext)
      gestureContext.deps.core.gestureBusy = false
    }
  }
  gestureState.springRaf = requestAnimationFrame(step)
}

// 有界地等待宿主真正把抽屉画出来。旧 armPaint() 把“存在但 display:none”的
// 左栏当成就绪，结果移动写到了不可见元素上，抽屉随后才突然弹出。这个循环只在
// 元素可见、手势序号变化或超时时结束。
function startArm(gestureContext: GestureContext, side: Side): void {
  stopArm(gestureContext)
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  // 本次手势序号；变化说明已经开始了新手势。
  const gestureSequence = gestureState.gestureSeq
  // 等待开始时间（ms）。
  const startedAt = performance.now()
  // 最晚等待时间（ms）。
  const deadline = startedAt + 2200
  // 宿主挂载重试次数。
  let mountRetries = 0
  // 上一次尝试挂载的时间（ms）。
  let lastMountAttempt = startedAt
  gestureState.armSide = side
  // 等待宿主抽屉可绘制的轮询函数。
  const tick = (): void => {
    if (gestureSequence !== gestureState.gestureSeq) {
      return
    }
    if (armReady(gestureContext, side)) {
      // 已经就绪的抽屉元素。
      const armElement = elFor(gestureContext, side)
      gestureState.armRaf = 0
      gestureState.armSide = null
      if (gestureState.mode !== null) {
        gestureState.activeEl = armElement
        gestureState.visualX = null
        gestureState.lastFrameT = 0
        // 抽屉宽度由 80vw 计算，和 CSS 保持同一来源。
        const drawerSpan = drawerWidth(gestureContext)
        // 首帧应到达的位置（px）。
        const targetPosition =
          side === 'left'
            ? Math.min(0, gestureState.lastDx - drawerSpan)
            : Math.max(0, drawerSpan + gestureState.lastDx)
        applyFrame(gestureContext, side, targetPosition)
        gestureContext.deps.log(
          'first-frame',
          side,
          'target=' + Math.round(targetPosition),
          'dx=' + Math.round(gestureState.lastDx),
        )
        return
      }
      // 等待绘制的松手结果。
      const pendingSettle = gestureState.pendingSettle
      if (pendingSettle !== null && pendingSettle.sequence === gestureSequence) {
        gestureState.pendingSettle = null
        runSettle(gestureContext, pendingSettle, true)
      }
      return
    }
    // 本帧时间，用于计算与上一帧的间隔。
    const currentTime = performance.now()
    // 上一次挂载请求超时后，本次手势最多再重试两次（requestMount 自身
    // 仍保持单飞和冷却）。
    if (
      !gestureContext.deps.core.sidebarExpandBusy &&
      mountRetries < 2 &&
      currentTime - lastMountAttempt > 350
    ) {
      mountRetries += 1
      lastMountAttempt = currentTime
      gestureContext.deps.ensureSidebarMounted()
      gestureContext.deps.log('arm-mount-retry', side, 'n=' + mountRetries)
    }
    if (currentTime > deadline) {
      gestureState.armRaf = 0
      gestureState.armSide = null
      gestureContext.deps.log('arm-timeout', side)
      // 等待绘制的松手结果。
      const pendingSettle = gestureState.pendingSettle
      if (pendingSettle !== null && pendingSettle.sequence === gestureSequence) {
        gestureState.pendingSettle = null
        runSettle(gestureContext, pendingSettle, false)
      }
      return
    }
    gestureState.armRaf = requestAnimationFrame(tick)
  }
  gestureState.armRaf = requestAnimationFrame(tick)
}

/** 正向位移是否达到提交阈值（打开左栏 / 关闭右栏）。 */
function shouldCommitPositive(
  deltaX: number,
  threshold: number,
  fastRelease: boolean,
  stableVelocity: number,
): boolean {
  return deltaX >= threshold || (fastRelease && stableVelocity > 0)
}

/** 负向位移是否达到提交阈值（打开右栏 / 关闭左栏）。 */
function shouldCommitNegative(
  deltaX: number,
  threshold: number,
  fastRelease: boolean,
  stableVelocity: number,
): boolean {
  return -deltaX >= threshold || (fastRelease && stableVelocity < 0)
}

// 手指已经松开，但宿主抽屉还没绘制出来。先把最终决定存起来，等抽屉可绘制时
// 再应用；新的 touchstart 会增加 gestureSeq，从而丢弃这个过期结果。
function runSettle(
  gestureContext: GestureContext,
  pendingSettle: PendingSettle,
  paintable: boolean,
): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  // 松手时的手势模式。
  const gestureMode = pendingSettle.mode
  // 松手时的横向位移（px）。
  const deltaX = pendingSettle.deltaX
  // 打开/关闭判定阈值（px）。
  const threshold = pendingSettle.threshold
  // 当时的抽屉宽度（px）。
  const drawerSpan = pendingSettle.drawerWidth
  // 是否满足快速滑动条件。
  const fastRelease = pendingSettle.fast
  // 最近采样窗口内的稳定速度（px/ms）。
  const stableVelocity = pendingSettle.stableVelocity
  // 结果所属的抽屉方向。
  const side: Side = gestureMode === 'open-left' || gestureMode === 'close-left' ? 'left' : 'right'
  gestureContext.deps.log(
    'settle-pending',
    gestureMode,
    'dx=' + Math.round(deltaX),
    'fast=' + fastRelease,
    'paintable=' + paintable,
  )
  // 宿主始终无法绘制时的兜底提交逻辑。
  const finalizeWithoutPaint = (): void => {
    // 宿主在限定时间内始终没绘制出来：直接提交最终状态，保证之后的宿主挂载
    // 落在动画的正确一侧。
    if (gestureMode === 'open-left') {
      if (shouldCommitPositive(deltaX, threshold, fastRelease, stableVelocity)) {
        gestureContext.deps.root.classList.add('dms-left-open', 'dms-gesture-opened')
      } else {
        gestureContext.deps.closeLeftVisual(false)
      }
    } else if (gestureMode === 'open-right') {
      if (shouldCommitNegative(deltaX, threshold, fastRelease, stableVelocity)) {
        gestureContext.deps.root.classList.add('dms-right-open')
      } else {
        gestureContext.deps.closeRight()
      }
    } else if (gestureMode === 'close-left') {
      if (shouldCommitNegative(deltaX, threshold, fastRelease, stableVelocity)) {
        gestureContext.deps.closeLeftVisual(false)
      } else {
        gestureContext.deps.root.classList.add('dms-left-open')
      }
    } else if (gestureMode === 'close-right') {
      if (shouldCommitPositive(deltaX, threshold, fastRelease, stableVelocity)) {
        gestureContext.deps.closeRight()
      } else {
        gestureContext.deps.root.classList.add('dms-right-open')
      }
    }
    // 这个兜底分支只改类名/关闭状态，没有需要等下一帧的新 transform。
    // 同步清理内联样式，避免延后的 rAF 清掉下一轮手势刚写入的样式。
    clearInline(gestureContext)
    // 立即释放忙碌锁，避免下一轮触摸被无谓挡住。
    gestureContext.deps.core.gestureBusy = false
  }
  if (!paintable) {
    finalizeWithoutPaint()
    return
  }
  if (!armReady(gestureContext, side)) {
    finalizeWithoutPaint()
    return
  }
  // 已经可以绘制的抽屉元素。
  const armElement = elFor(gestureContext, side)
  // 从松手位置继续弹，而不是直接跳最终帧再清内联样式（后者会让延迟出现的
  // 抽屉“跳”到位）。
  const releaseStartX =
    gestureMode === 'open-left'
      ? Math.min(0, deltaX - drawerSpan)
      : gestureMode === 'open-right'
        ? Math.max(0, drawerSpan + deltaX)
        : gestureMode === 'close-left'
          ? Math.min(0, deltaX)
          : Math.max(0, deltaX)
  gestureState.activeEl = armElement
  gestureState.visualX = null
  gestureState.lastFrameT = 0
  applyFrame(gestureContext, side, releaseStartX)
  gestureContext.deps.log(
    'settle-pending-continue',
    gestureMode,
    'start=' + Math.round(releaseStartX),
  )
  if (gestureMode === 'open-left') {
    if (shouldCommitPositive(deltaX, threshold, fastRelease, stableVelocity)) {
      gestureContext.deps.root.classList.add('dms-left-open', 'dms-gesture-opened')
      springTo(gestureContext, 'left', 0, false)
    } else {
      springTo(gestureContext, 'left', -drawerSpan, true, () =>
        gestureContext.deps.closeLeftVisual(false),
      )
    }
    return
  }
  if (gestureMode === 'open-right') {
    if (shouldCommitNegative(deltaX, threshold, fastRelease, stableVelocity)) {
      gestureContext.deps.root.classList.add('dms-right-open')
      springTo(gestureContext, 'right', 0, false)
    } else {
      springTo(gestureContext, 'right', drawerSpan, true, () =>
        gestureContext.deps.closeRight(),
      )
    }
    return
  }
  if (gestureMode === 'close-left') {
    if (shouldCommitNegative(deltaX, threshold, fastRelease, stableVelocity)) {
      springTo(gestureContext, 'left', -drawerSpan, true, () =>
        gestureContext.deps.closeLeftVisual(false),
      )
    } else {
      gestureContext.deps.root.classList.add('dms-left-open')
      springTo(gestureContext, 'left', 0, false)
    }
    return
  }
  if (gestureMode === 'close-right') {
    if (shouldCommitPositive(deltaX, threshold, fastRelease, stableVelocity)) {
      springTo(gestureContext, 'right', drawerSpan, true, () =>
        gestureContext.deps.closeRight(),
      )
    } else {
      gestureContext.deps.root.classList.add('dms-right-open')
      springTo(gestureContext, 'right', 0, false)
    }
  }
}

/** 取消当前手势并清理所有临时状态。 */
function cancelGesture(gestureContext: GestureContext): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  gestureState.mode = null
  gestureState.locked = false
  gestureState.pendingSettle = null
  stopArm(gestureContext)
  gestureContext.deps.core.gestureBusy = false
  clearInline(gestureContext)
}

// 宿主顶栏/返回栈可能在弹簧动画进行中关闭抽屉。先取消动画并清掉内联
// transform，再让关闭类名生效，否则页面可能保持推移状态并露出预加载的左栏。
function hardResetGesture(gestureContext: GestureContext): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (gestureState.springRaf !== 0) {
    cancelAnimationFrame(gestureState.springRaf)
    gestureState.springRaf = 0
  }
  stopArm(gestureContext)
  gestureState.pendingSettle = null
  gestureState.mode = null
  gestureState.locked = false
  gestureContext.deps.core.gestureBusy = false
  gestureContext.deps.core.springAnimating = false
  clearInline(gestureContext)
}

export {
  applyFrame,
  armReady,
  cancelGesture,
  clearInline,
  dragClassFor,
  drawerWidth,
  hardResetGesture,
  springTo,
  startArm,
  stopArm,
}
