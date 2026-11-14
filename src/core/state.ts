// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
//
// 全局可变状态总线：所有模块共享同一份 state，避免左右栏/手势/菜单各自维护副本。
import type { Context } from '@deepseek-ai/cordis'

/** 左栏宿主挂载阶段。 */
export type SidebarMountState = 'idle' | 'requesting' | 'mounted' | 'failed'

/** 右栏预加载状态。 */
export type RightPreloadState = 'idle' | 'busy' | 'ok' | 'fail' | 'cancelled'

/** 插件运行期共享状态；每个字段的语义见下方逐项注释。 */
export interface ShellState {
  /** 左栏可见状态：左抽屉的单一状态源，sync() 据此切 dms-left-open，手势/返回键/自动关闭都读它。 */
  leftVisible: boolean
  /** 右栏可见状态：右抽屉的单一状态源，sync() 据此切 dms-right-open；打开/关闭/返回键/顶栏都依赖它。 */
  rightVisible: boolean
  /** 左栏宿主挂载忙标记：向宿主发出展开/toggle 请求期间为 true，防止重复点击再次 toggle 宿主。 */
  sidebarExpandBusy: boolean
  /** 左栏宿主挂载阶段：idle/requesting/mounted/failed；预挂载、失败判定和手势 arm 等待都读它。 */
  sidebarMountState: SidebarMountState
  /** 预加载点击放行标记：preloadRight 程序化点击宿主按钮时置 true，让 topbar 拦截器不要吞掉这次点击。 */
  rightPreloadClick: boolean
  /** 右栏预加载状态：idle/请求中(busy)/成功(ok)/失败(fail)/取消(cancelled)；控制 preloadRight 是否重入。 */
  rightPreloadState: RightPreloadState
  /** 已尝试预加载过的会话 ID 集合：同一 session 只尝试一次，避免反复切换宿主右栏。 */
  rightPreloadAttempts: Set<string>
  /** 监听宿主菜单 DOM 的 MutationObserver 句柄：菜单节点变化时重新扫描并注入 tab 项，销毁时必须 disconnect。 */
  rightViewMenuObserver: MutationObserver | null
  /** 菜单扫描的 requestAnimationFrame 句柄：合并同一帧内的多次 DOM 变化，避免重复扫描。 */
  rightViewMenuRaf: number
  /** 可选回退开关：为 true 时 sync() 不再强制隐藏 header tabs（原代码读取未声明字段，undefined 即为 false）。 */
  rightViewTabsFallback?: boolean
  /** 右栏预加载节流时间戳：距上次预加载不足 2000ms 时直接跳过，避免频繁点击宿主 expand。 */
  lastRightPreloadAt: number
  /** 上一个会话 key：定期 watcher / rAF 快速 watcher 用它判断是否切换了会话。 */
  sessionKeyPrev: string
  /** 最近一次指针是否落在编辑器/输入区内：blurHostEditor 用来判断是否要保留宿主输入焦点。 */
  lastPointerInEditor: boolean
  /** 最近一次指针时间戳：与 lastPointerInEditor 配合，900ms 内不强制抢焦点。 */
  lastPointerAt: number
  /** Cordis 插件上下文引用：back-stack/settings/left-drawer 通过它访问 layout 面板状态和返回逻辑。 */
  ctxRef: Context | null
  /** 手势忙碌锁：一次手势/spring 未结束时阻止新的 touch 手势进入，避免叠加动画和状态错乱。 */
  gestureBusy: boolean
  /** 弹簧动画进行中标记：起始/结束/清理时同步；用于调试和防止手势与 spring 冲突。 */
  springAnimating: boolean
  /** 调试关闭集合：解析 URL 的 ?dms-off=styles,observer,... 后保存，对应模块据此跳过安装。 */
  DEBUG_OFF: Set<string>
  /** 会话快速观察截止时间戳：指针/切换会话后 1500ms 内用 rAF 高频检查 session key。 */
  sessionFastUntil: number
  /** 会话快速观察的 rAF 句柄：避免重复启动快速检查循环，销毁时取消。 */
  sessionFastRaf: number
}

export const state: ShellState = {
  leftVisible: false,
  rightVisible: false,
  sidebarExpandBusy: false,
  sidebarMountState: 'idle',
  rightPreloadClick: false,
  rightPreloadState: 'idle',
  rightPreloadAttempts: new Set<string>(),
  rightViewMenuObserver: null,
  rightViewMenuRaf: 0,
  lastRightPreloadAt: 0,
  sessionKeyPrev: '',
  lastPointerInEditor: false,
  lastPointerAt: 0,
  ctxRef: null,
  gestureBusy: false,
  springAnimating: false,
  DEBUG_OFF: new Set<string>(),
  sessionFastUntil: 0,
  sessionFastRaf: 0,
}
