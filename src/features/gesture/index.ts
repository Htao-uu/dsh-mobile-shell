// dsh-mobile-shell: 手势模块入口。创建唯一的 GestureContext，安装触摸/鼠标
// 监听并统一卸载；自动关闭也从这里暴露，保持原有对外接口不变。
import { LOCK } from '../../core/constants.js'
import { $, frame, isPhone, rightbarCol, settingsPanel, sidebarCol } from '../../core/dom.js'
import { on } from '../../core/events.js'
import { state } from '../../core/state.js'
import {
  closeLeftVisual,
  ensureSidebarMounted,
  leftOpen,
  openLeftVisual,
  toggleLeft,
} from '../left-drawer.js'
import { closeRight, openRight } from '../right-drawer.js'
import { clearInline, hardResetGesture } from './animation.js'
import { dlog } from './debug.js'
import { installPointer } from './pointer.js'
import {
  createGestureContext,
  type GestureContext,
  type GestureDeps,
  type GestureListener,
} from './state.js'
import { installTouch } from './touch.js'
import { installDrawerAutoClose as installAutoClose } from './auto-close.js'

/** 把插件全局状态、DOM 查询和左右抽屉操作组装成手势依赖。 */
function createDeps(): GestureDeps {
  return {
    root: document.documentElement,
    core: state,
    lock: LOCK,
    isPhone,
    query: <ElementType extends Element = HTMLElement>(
      selector: string,
    ): ElementType | null => $(selector),
    frame,
    sidebarCol,
    rightbarCol,
    settingsPanel,
    closeLeftVisual,
    ensureSidebarMounted,
    leftOpen,
    openLeftVisual,
    toggleLeft,
    closeRight,
    openRight,
    log: dlog,
  }
}

/** 新建一份独立的手势上下文。 */
function createContext(): GestureContext {
  return createGestureContext(createDeps())
}

/** 安装手势模块；返回的卸载函数会按注册逆序移除所有监听。 */
function installGestures(): () => void {
  // 本次安装的手势上下文。
  const gestureContext = createContext()
  // 本次安装注册的监听器卸载函数。
  const disposers: Array<() => void> = []
  // 注册监听并把对应的卸载函数收集起来。
  const listen: GestureListener = (target, eventType, handler, options) => {
    target.addEventListener(eventType, handler as EventListener, options)
    disposers.push(() => target.removeEventListener(eventType, handler as EventListener, options))
  }
  installTouch(gestureContext, listen)
  installPointer(gestureContext, listen)
  // 宿主关闭抽屉时取消仍在进行的手势动画。
  const offDrawerClose = on('drawer-close', () => hardResetGesture(gestureContext))

  return () => {
    offDrawerClose()
    for (let disposerIndex = disposers.length - 1; disposerIndex >= 0; disposerIndex -= 1) {
      disposers[disposerIndex]()
    }
    try {
      clearInline(gestureContext)
    } catch (error) {
      // 宿主正忙时允许清理失败
    }
  }
}

/** 安装左抽屉自动关闭；单独创建上下文，因为它不参与触摸手势状态。 */
function installDrawerAutoClose(): () => void {
  return installAutoClose(createContext())
}

export { installGestures, installDrawerAutoClose }
