// dsh-mobile-shell: 触摸事件识别（touchstart/move/end/cancel）。
import type { GestureContext, GestureListener } from './state.js'
import type { GestureMode, GestureTouchEvent, Side } from './types.js'
import {
  applyFrame,
  armReady,
  cancelGesture,
  clearInline,
  dragClassFor,
  drawerWidth,
  springTo,
  startArm,
  stopArm,
} from './animation.js'

/** 触点是否位于一个可横向滚动的容器内；是的话不抢手势。 */
function inHorizontalScroller(node: Element | null): boolean {
  // 当前向上遍历的元素。
  let element: Element | null = node instanceof Element ? node : null
  for (let ancestorDepth = 0; element !== null && element !== document.body && ancestorDepth < 8; ancestorDepth++) {
    // 当前元素的 computed style。
    const computedStyle = window.getComputedStyle(element)
    if (
      (computedStyle.overflowX === 'auto' || computedStyle.overflowX === 'scroll') &&
      element.scrollWidth > element.clientWidth + 2
    ) {
      return true
    }
    element = element.parentElement
  }
  return false
}

/** touchstart：判断是否开始一次抽屉手势。 */
function onTouchStart(gestureContext: GestureContext, event: GestureTouchEvent): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (!gestureContext.deps.isPhone() || event.touches.length !== 1) {
    return
  }
  if (gestureContext.deps.core.gestureBusy || gestureState.springRaf !== 0) {
    return
  }
  gestureState.gestureSeq += 1
  gestureState.gestureWidth = window.innerWidth
  gestureState.touchSuppressClick = false
  stopArm(gestureContext)
  gestureState.pendingSettle = null
  // clearInline 已把位移起算基准清空，这里不再重复重置。
  clearInline(gestureContext)
  gestureState.mode = null
  gestureState.locked = false
  gestureState.velocity = 0
  if (gestureContext.deps.settingsPanel() !== null) {
    return
  }
  if (
    gestureContext.deps.root.classList.contains('dms-attach-open') ||
    gestureContext.deps.root.classList.contains('dms-right-full')
  ) {
    return
  }
  if (
    gestureContext.deps.query('[data-composer-card]') === null &&
    !gestureContext.deps.leftOpen() &&
    !gestureContext.deps.core.rightVisible
  ) {
    return
  }
  // 第一个触点。
  const touchPoint = event.touches[0]
  gestureState.startX = touchPoint.clientX
  gestureState.startY = touchPoint.clientY
  gestureState.lastX = gestureState.startX
  gestureState.lastT = performance.now()
  gestureState.samples = [{ positionX: gestureState.startX, capturedAt: gestureState.lastT }]
  gestureState.width = window.innerWidth
  // 事件目标元素；没有元素目标时用坐标反查。
  const eventTarget =
    event.target instanceof Element
      ? event.target
      : document.elementFromPoint(touchPoint.clientX, touchPoint.clientY)
  // 这里读插件状态，不读宿主临时标记：closeRight() 后宿主可能还会短暂保留
  // data-sidebar-right-open，导致下一次左滑被误判成“关闭右栏”。
  if (gestureContext.deps.leftOpen()) {
    gestureState.mode = 'close-left'
  } else if (gestureContext.deps.core.rightVisible) {
    gestureState.mode = 'close-right'
  } else {
    if (
      eventTarget &&
      eventTarget.closest(
        '[contenteditable], input, textarea, [role="textbox"], [role="dialog"], [data-composer-card] button',
      )
    ) {
      return
    }
    if (eventTarget && inHorizontalScroller(eventTarget)) {
      return
    }
    gestureState.mode = 'pending'
  }
  gestureContext.deps.log(
    'touch-start',
    'mode=' + gestureState.mode,
    'x=' + Math.round(gestureState.startX),
  )
}

/** touchmove：判定方向、锁定手势并逐帧推移。 */
function onTouchMove(gestureContext: GestureContext, event: GestureTouchEvent): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (gestureState.mode === null || event.touches.length !== 1) {
    return
  }
  // 本次事件携带的第一个触点。
  const touchPoint = event.touches[0]
  // 相对起点的横向位移（px）。
  const deltaX = touchPoint.clientX - gestureState.startX
  // 相对起点的纵向位移（px）。
  const deltaY = touchPoint.clientY - gestureState.startY
  // 本帧时间，用于计算与上一帧的间隔。
  const currentTime = performance.now()
  gestureState.lastDx = deltaX
  if (currentTime - gestureState.lastT > 0) {
    gestureState.velocity =
      gestureState.velocity * 0.6 +
      ((touchPoint.clientX - gestureState.lastX) / (currentTime - gestureState.lastT)) * 0.4
  }
  gestureState.lastX = touchPoint.clientX
  gestureState.lastT = currentTime
  gestureState.samples.push({ positionX: touchPoint.clientX, capturedAt: currentTime })
  while (gestureState.samples.length > 2 && currentTime - gestureState.samples[0].capturedAt > 110) {
    gestureState.samples.shift()
  }
  if (!gestureState.locked) {
    if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
      gestureState.mode = null
      return
    }
    if (Math.abs(deltaX) <= gestureContext.deps.lock) {
      return
    }
    if (gestureState.mode === 'pending' && Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) {
      return
    }
    if (gestureState.mode === 'pending') {
      // 根据滑动方向确定新的手势模式。
      const nextMode: GestureMode = deltaX > 0 ? 'open-left' : 'open-right'
      gestureState.mode = nextMode
      gestureContext.deps.root.classList.add(dragClassFor(nextMode))
      // 即将打开的抽屉方向。
      const openSide: Side = nextMode === 'open-left' ? 'left' : 'right'
      if (openSide === 'left') {
        gestureContext.deps.root.classList.add('dms-gesture-arming')
        // 尽早请求宿主挂载左栏；挂载协调器是单飞的，不会重复 toggle。
        gestureContext.deps.ensureSidebarMounted()
        gestureContext.deps.openLeftVisual(true)
      } else {
        gestureContext.deps.root.classList.add('dms-gesture-arming-right')
        if (!gestureContext.deps.core.rightVisible) {
          gestureContext.deps.openRight()
        }
      }
      gestureContext.deps.log('recognized', nextMode, 'dx=' + Math.round(deltaX))
      startArm(gestureContext, openSide)
    }
    gestureState.locked = true
    gestureContext.deps.core.gestureBusy = true
    if (gestureState.mode === 'open-left') {
      gestureState.visualX = -drawerWidth(gestureContext)
    } else if (gestureState.mode === 'open-right') {
      gestureState.visualX = drawerWidth(gestureContext)
    } else {
      gestureState.visualX = 0
    }
    gestureState.lastFrameT = performance.now()
  }
  if (event.cancelable) {
    event.preventDefault()
  }
  // 抽屉宽度由 80vw 计算，和 CSS 保持同一来源。
  const drawerSpan = drawerWidth(gestureContext)
  if (gestureState.mode === 'open-left') {
    applyFrame(gestureContext, 'left', Math.min(0, deltaX - drawerSpan))
  } else if (gestureState.mode === 'close-left') {
    applyFrame(gestureContext, 'left', Math.min(0, deltaX))
  } else if (gestureState.mode === 'open-right') {
    applyFrame(gestureContext, 'right', Math.max(0, drawerSpan + deltaX))
  } else {
    applyFrame(gestureContext, 'right', Math.max(0, deltaX))
  }
}

/** touchend：根据位移和速度决定打开还是回弹。 */
function finish(gestureContext: GestureContext, event: GestureTouchEvent): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  if (gestureState.mode === null || !gestureState.locked) {
    gestureState.mode = null
    gestureState.locked = false
    gestureContext.deps.core.gestureBusy = false
    clearInline(gestureContext)
    return
  }
  // 松手时的触点。
  const releasePoint = event.changedTouches && event.changedTouches[0]
  // 从起点到松手位置的横向位移（px）。
  const deltaX = releasePoint ? releasePoint.clientX - gestureState.startX : 0
  // 松手时的手势模式。
  const gestureMode = gestureState.mode
  // 结果所属的抽屉方向。
  const side: Side = gestureMode === 'open-left' || gestureMode === 'close-left' ? 'left' : 'right'
  // 抽屉宽度由 80vw 计算，和 CSS 保持同一来源。
  const drawerSpan = drawerWidth(gestureContext)
  // 打开/关闭判定阈值（px）。
  const threshold = drawerSpan * 0.38
  // 松手时间戳（ms）。
  const endTime = performance.now()
  // 最近 110ms 内的采样。
  const recentSamples = gestureState.samples.filter(
    (sample) => endTime - sample.capturedAt <= 110,
  )
  // 最近采样窗口内的稳定速度（px/ms）。
  let stableVelocity = 0
  if (recentSamples.length >= 2) {
    // 窗口内最早的采样。
    const firstSample = recentSamples[0]
    // 窗口内最晚的采样。
    const lastSample = recentSamples[recentSamples.length - 1]
    if (lastSample.capturedAt - firstSample.capturedAt >= 8) {
      stableVelocity =
        (lastSample.positionX - firstSample.positionX) /
        (lastSample.capturedAt - firstSample.capturedAt)
    }
  }
  // 是否满足快速滑动条件。
  const fastRelease = Math.abs(stableVelocity) > 0.08 && Math.abs(deltaX) >= 20
  if (!armReady(gestureContext, side)) {
    // 宿主仍在提交抽屉：先记住松手决定，等 startArm() 在可绘制时应用。
    // 这里绝不能弹回/清理，否则最终目标会丢失。
    gestureState.pendingSettle = {
      sequence: gestureState.gestureSeq,
      mode: gestureMode,
      deltaX,
      fast: fastRelease,
      stableVelocity,
      drawerWidth: drawerSpan,
      threshold,
    }
    gestureState.mode = null
    gestureState.locked = false
    gestureState.touchSuppressClick = true
    setTimeout(() => {
      gestureState.touchSuppressClick = false
    }, 80)
    gestureContext.deps.log(
      'release-waiting-host',
      gestureMode,
      'dx=' + Math.round(deltaX),
      'fast=' + fastRelease,
    )
    startArm(gestureContext, side)
    return
  }
  if (gestureState.locked) {
    gestureState.touchSuppressClick = true
    setTimeout(() => {
      gestureState.touchSuppressClick = false
    }, 80)
  }
  gestureState.mode = null
  gestureState.locked = false
  gestureContext.deps.log(
    'finish',
    gestureMode,
    'dx=' + Math.round(deltaX),
    'fast=' + fastRelease,
  )
  if (gestureMode === 'open-left') {
    if (deltaX >= threshold || (fastRelease && stableVelocity > 0)) {
      gestureContext.deps.root.classList.add('dms-left-open', 'dms-gesture-opened')
      springTo(gestureContext, 'left', 0, false)
    } else {
      springTo(gestureContext, 'left', -drawerSpan, true, () =>
        gestureContext.deps.closeLeftVisual(false),
      )
    }
  } else if (gestureMode === 'open-right') {
    if (-deltaX >= threshold || (fastRelease && stableVelocity < 0)) {
      gestureContext.deps.root.classList.add('dms-right-open')
      springTo(gestureContext, 'right', 0, false)
    } else {
      springTo(gestureContext, 'right', drawerSpan, true, () =>
        gestureContext.deps.closeRight(),
      )
    }
  } else if (gestureMode === 'close-left') {
    if (-deltaX >= threshold || (fastRelease && stableVelocity < 0)) {
      springTo(gestureContext, 'left', -drawerSpan, true, () =>
        gestureContext.deps.closeLeftVisual(false),
      )
    } else {
      gestureContext.deps.root.classList.add('dms-left-open')
      springTo(gestureContext, 'left', 0, false)
    }
  } else if (gestureMode === 'close-right') {
    if (deltaX >= threshold || (fastRelease && stableVelocity > 0)) {
      springTo(gestureContext, 'right', drawerSpan, true, () =>
        gestureContext.deps.closeRight(),
      )
    } else {
      gestureContext.deps.root.classList.add('dms-right-open')
      springTo(gestureContext, 'right', 0, false)
    }
  } else {
    gestureContext.deps.core.gestureBusy = false
    clearInline(gestureContext)
  }
}

/** 注册触摸监听；disposer 由 index.ts 收集。 */
function installTouch(gestureContext: GestureContext, listen: GestureListener): void {
  listen(
    document,
    'touchstart',
    (listenerEvent) =>
      onTouchStart(gestureContext, listenerEvent as unknown as GestureTouchEvent),
    { passive: true, capture: true },
  )
  listen(
    document,
    'touchmove',
    (listenerEvent) =>
      onTouchMove(gestureContext, listenerEvent as unknown as GestureTouchEvent),
    { passive: false, capture: true },
  )
  listen(
    document,
    'touchend',
    (listenerEvent) => finish(gestureContext, listenerEvent as unknown as GestureTouchEvent),
    { passive: true, capture: true },
  )
  listen(document, 'touchcancel', () => cancelGesture(gestureContext), {
    passive: true,
    capture: true,
  })
}

export { finish, installTouch, onTouchMove, onTouchStart }
