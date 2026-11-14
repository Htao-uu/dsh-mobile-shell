// Type declarations for the Android WebView bridge documented in
// docs/ANDROID-BRIDGE.md and implemented by Android's DshNativeBridge.java.
// The bridge is optional: when window.DSHNative is absent the attach sheet
// hides "最近照片" and falls back to <input type=file>.

/** One request frame: window.DSHNative.request(JSON.stringify({ id, method, params })). */
export interface NativeRequest {
  /** Caller-generated id; the native side must echo it back unchanged. */
  id: string
  /** Method name; see NativeMethod. */
  method: NativeMethod
  /** Method parameters; {} when the method takes none. */
  params: Record<string, unknown>
}

/** Android → Web callback installed by the attach sheet as window.__dshNativeResult. */
export interface NativeBridge {
  /** Queue one request; must return immediately (the native side replies asynchronously). */
  request(payload: string): void
}

/** capabilities reply (ANDROID-BRIDGE.md §3.1). */
export interface NativeCapabilities {
  ok?: boolean
  version?: number
  recentPhotos?: boolean
  pickers?: boolean
  resumableUpload?: boolean
  error?: NativeError
}

/** Failure envelope shared by all methods (ANDROID-BRIDGE.md §2). */
export interface NativeError {
  code?: string
  message?: string
}

/** One recent photo returned by recentPhotos (ANDROID-BRIDGE.md §3.2). */
export interface NativePhoto {
  id?: string | number
  thumbDataUrl?: string
  width?: number
  height?: number
  takenAt?: number
  mime?: string
  name?: string
}

/** recentPhotos reply. */
export interface RecentPhotosReply {
  ok?: boolean
  photos?: NativePhoto[]
  error?: NativeError
}

/** openRecent reply: a loopback content URL the WebView fetches as a Blob. */
export interface OpenRecentReply {
  ok?: boolean
  url?: string
  name?: string
  mime?: string
  size?: number
  error?: NativeError
}

/** One picked file/photo returned by pickImages or pickFiles (ANDROID-BRIDGE.md §3.4). */
export interface NativePickedFile {
  url?: string
  name?: string
  mime?: string
  size?: number
}

/** pickImages / pickFiles reply. */
export interface PickFilesReply {
  ok?: boolean
  files?: NativePickedFile[]
  error?: NativeError
}

/** Method names implemented by DshNativeBridge.java. */
export type NativeMethod =
  | 'capabilities'
  | 'recentPhotos'
  | 'openRecent'
  | 'pickImages'
  | 'pickFiles'

/** Reply type per method, used to type nativeCall() without casting at call sites. */
export interface NativeReplyByMethod {
  capabilities: NativeCapabilities
  recentPhotos: RecentPhotosReply
  openRecent: OpenRecentReply
  pickImages: PickFilesReply
  pickFiles: PickFilesReply
}
