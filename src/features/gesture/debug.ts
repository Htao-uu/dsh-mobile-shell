// dsh-mobile-shell: 手势调试开关与环形日志缓冲。

/** 只有 URL 带 ?dms-gesture-debug 时才输出手势日志。 */
const debugGesture = (): boolean => {
  try {
    return new URLSearchParams(location.search).has('dms-gesture-debug')
  } catch (error) {
    return false
  }
}

/** 输出一行手势日志，同时写入 window.__dshmGestureLog 供现场排查。 */
const dlog = (...logArguments: unknown[]): void => {
  if (!debugGesture()) {
    return
  }
  try {
    // 日志行格式：[dshm-gesture] 时间戳 参数...
    const logLine =
      '[dshm-gesture] ' +
      Math.round(performance.now()) +
      ' ' +
      logArguments.map((argument) => String(argument)).join(' ')
    // 调试窗口对象；挂在 window 上供测试脚本读取。
    const debugWindow = window
    debugWindow.__dshmGestureLog = debugWindow.__dshmGestureLog || []
    debugWindow.__dshmGestureLog.push(logLine)
    if (debugWindow.__dshmGestureLog.length > 120) {
      debugWindow.__dshmGestureLog.shift()
    }
    console.log(logLine)
  } catch (error) {
    // 调试输出失败不影响手势功能
  }
}

export { debugGesture, dlog }
