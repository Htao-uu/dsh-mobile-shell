// dsh-mobile-shell: 鼠标拖动支持，复用触摸手势的状态机。
import type { GestureContext, GestureListener } from './state.js'
import type { GestureTouchEvent, TouchPoint } from './types.js'
import { cancelGesture } from './animation.js'
import { finish, onTouchMove, onTouchStart } from './touch.js'

/** 把 PointerEvent 的坐标转成触摸点形状。 */
function toTouchPoint(event: PointerEvent): TouchPoint {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
  }
}

/** 把鼠标事件包装成手势状态机认识的合成触摸事件。 */
function createSyntheticTouch(
  gestureContext: GestureContext,
  event: PointerEvent,
): GestureTouchEvent {
  return {
    target: event.target,
    touches: [toTouchPoint(event)],
    changedTouches: [toTouchPoint(event)],
    cancelable: event.cancelable,
    preventDefault: () => {
      // 拖动锁定前不要取消普通点击：触摸走真实事件路径，但鼠标 pointerdown
      // 后如果没有移动，必须让宿主按钮的 React onClick 正常触发。
      if (gestureContext.state.locked) {
        event.preventDefault()
      }
    },
  }
}

/** 注册鼠标/触控板 PointerEvent，并复用触摸手势的识别逻辑。 */
function installPointer(gestureContext: GestureContext, listen: GestureListener): void {
  // 跨帧共享状态，本函数会直接改写它。
  const gestureState = gestureContext.state
  // 鼠标按下：把指针事件交给触摸状态机，但暂不捕获/取消。
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.button !== 0) {
      return
    }
    gestureState.mouseSuppressClick = false
    onTouchStart(gestureContext, createSyntheticTouch(gestureContext, event))
    gestureState.mouseActive = gestureState.mode !== null
    gestureState.mouseCaptured = false
    // 这里故意不 preventDefault，也不 setPointerCapture：在 pointerdown 时
    // 捕获指针会把 pointerup 和 click 重定向到 <html>，宿主左栏/顶栏按钮的
    // React onClick 就永远收不到——也就是“触屏正常、鼠标失效”的根因。只有
    // 真正锁定拖动后才捕获；普通点击不会走这条路径。
  }
  // 鼠标移动：只有手势锁定后才捕获指针并阻止默认行为。
  const onPointerMove = (event: PointerEvent): void => {
    if (!gestureState.mouseActive || event.pointerType === 'touch') {
      return
    }
    onTouchMove(gestureContext, createSyntheticTouch(gestureContext, event))
    if (!gestureState.locked) {
      return
    }
    gestureState.mouseSuppressClick = true
    if (!gestureState.mouseCaptured) {
      try {
        document.documentElement.setPointerCapture(event.pointerId)
        gestureState.mouseCaptured = true
      } catch (error) {
        // 宿主可能拒绝指针捕获
      }
    }
    if (event.cancelable) {
      event.preventDefault()
    }
  }
  // 鼠标抬起：结束手势，并在真正拖动过时抑制随后的 click。
  const onPointerEnd = (event: PointerEvent): void => {
    if (!gestureState.mouseActive || event.pointerType === 'touch') {
      return
    }
    // 本次鼠标操作是否真的拖动过。
    const wasDragged = gestureState.locked
    gestureState.mouseActive = false
    if (gestureState.mouseCaptured) {
      try {
        document.documentElement.releasePointerCapture(event.pointerId)
      } catch (error) {
        // 宿主可能拒绝释放指针捕获
      }
      gestureState.mouseCaptured = false
    }
    finish(gestureContext, createSyntheticTouch(gestureContext, event))
    if (wasDragged) {
      gestureState.mouseSuppressClick = true
      setTimeout(() => {
        gestureState.mouseSuppressClick = false
      }, 180)
    }
  }
  // 鼠标取消：释放捕获并取消当前手势。
  const onPointerCancel = (event: PointerEvent): void => {
    if (!gestureState.mouseActive || event.pointerType === 'touch') {
      return
    }
    gestureState.mouseActive = false
    if (gestureState.mouseCaptured) {
      try {
        document.documentElement.releasePointerCapture(event.pointerId)
      } catch (error) {
        // 宿主可能拒绝释放指针捕获
      }
      gestureState.mouseCaptured = false
    }
    cancelGesture(gestureContext)
  }
  // 拖动结束后吞掉一次 click，避免误触宿主按钮。
  const onClickSuppress = (event: MouseEvent): void => {
    if (!gestureState.mouseSuppressClick && !gestureState.touchSuppressClick) {
      return
    }
    gestureState.mouseSuppressClick = false
    gestureState.touchSuppressClick = false
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation()
    }
  }
  listen(document, 'pointerdown', (listenerEvent) => onPointerDown(listenerEvent as unknown as PointerEvent), {
    capture: true,
  })
  listen(document, 'pointermove', (listenerEvent) => onPointerMove(listenerEvent as unknown as PointerEvent), {
    capture: true,
    passive: false,
  })
  listen(document, 'pointerup', (listenerEvent) => onPointerEnd(listenerEvent as unknown as PointerEvent), {
    capture: true,
  })
  listen(document, 'pointercancel', (listenerEvent) => onPointerCancel(listenerEvent as unknown as PointerEvent), {
    capture: true,
  })
  listen(document, 'click', (listenerEvent) => onClickSuppress(listenerEvent as unknown as MouseEvent), {
    capture: true,
  })
}

export { installPointer }
