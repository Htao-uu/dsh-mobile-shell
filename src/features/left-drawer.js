// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { $, $$, frame, hostLeftOpen, isPhone, settingsPanel, sidebarCol } from "../core/dom.js";

// ---------------------------------------------------------------------------
// Left drawer host-state coordinator
//
// The host sidebar is a React-controlled grid track. "Expanded" is an async
// render, not a synchronous setter: after layout.toggleSidebar() the
// data-sidebar-collapsed attribute appears/disappears only on the next React
// commit. The old code treated toggleSidebar() as an idempotent "ensure open":
// repairLeftHost() cleared sidebarExpandBusy and the 350 ms repair timer could
// fire a second toggle while the first commit was still in flight, which is
// exactly what makes the drawer start late and then jump/stutter.
//
// One request is allowed in flight; the host state is the completion signal;
// no caller may toggle again until that request settles or times out.
let mountRequest = null;
let mountSeq = 0;
let lastMountFailureAt = -1;
const MOUNT_TIMEOUT_MS = 1500;

const gestureDebug = () => {
  try { return new URLSearchParams(location.search).has("dms-gesture-debug"); } catch (error) { return false; }
};
const dlog = (...args) => {
  if (!gestureDebug()) return;
  try {
    const line = "[dshm-drawer] " + Math.round(performance.now()) + " " + args.map((arg) => String(arg)).join(" ");
    const win = window;
    win.__dshmDrawerLog = win.__dshmDrawerLog || [];
    win.__dshmDrawerLog.push(line);
    if (win.__dshmDrawerLog.length > 120) win.__dshmDrawerLog.shift();
    console.log(line);
  } catch (error) { /* debug only */ }
};

const hostMounted = () => hostLeftOpen();

function finishMount(ok) {
  const request = mountRequest;
  if (request === null) return;
  mountRequest = null;
  state.sidebarExpandBusy = false;
  state.sidebarMountState = ok ? "mounted" : "failed";
  if (!ok) lastMountFailureAt = performance.now();
  dlog("mount-" + (ok ? "ready" : "timeout"), "reason=" + request.reason, "ms=" + Math.round(performance.now() - request.startedAt));
}

function requestMount(reason) {
  if (!isPhone()) return false;
  if (state.rightVisible || document.documentElement.classList.contains("dms-right-open")) return false;
  const root = document.documentElement;
  root.classList.add("dms-preload-left");
  if (hostMounted()) {
    state.sidebarExpandBusy = false;
    state.sidebarMountState = "mounted";
    return true;
  }
  // Single flight: never toggle again until the host commit is observed or the
  // request times out. This is what prevents the double-open/close oscillation.
  if (mountRequest !== null) return false;
  // -1 = never failed; without this sentinel the very first request in the
  // first 500 ms of page life would be skipped by the cooldown check.
  if (lastMountFailureAt >= 0 && performance.now() - lastMountFailureAt < 500) return false;
  mountRequest = { seq: ++mountSeq, startedAt: performance.now(), reason: reason || "ensure" };
  state.sidebarExpandBusy = true;
  state.sidebarMountState = "requesting";
  dlog("mount-request", "reason=" + mountRequest.reason, "seq=" + mountRequest.seq);
  const layout = state.ctxRef && state.ctxRef.layout;
  if (layout && typeof layout.toggleSidebar === "function") layout.toggleSidebar();
  else {
    const col = sidebarCol();
    const btn = col ? col.querySelector('[class*="_toggle"]') : null;
    if (btn) btn.click();
  }
  const deadline = mountRequest.startedAt + MOUNT_TIMEOUT_MS;
  const waitForHost = () => {
    const request = mountRequest;
    if (request === null || request.seq !== mountSeq) return;
    if (hostMounted()) {
      finishMount(true);
      return;
    }
    if (performance.now() > deadline) {
      finishMount(false);
      return;
    }
    requestAnimationFrame(waitForHost);
  };
  requestAnimationFrame(waitForHost);
  return false;
}

function ensureSidebarMounted() {
  return requestMount("ensure");
}

function forceMountSidebar() {
  if (!isPhone() || state.leftVisible || state.rightVisible) return;
  document.documentElement.classList.add("dms-preload-left");
  if (hostMounted()) return;
  requestMount("sync");
}

function preloadSidebar() {
  if (!isPhone() || state.leftVisible || state.rightVisible || settingsPanel() !== null) return;
  if (hostMounted()) return;
  const root = document.documentElement;
  root.classList.add("dms-preload-left");
  requestMount("preload");
}

// Called by sync() whenever the drawer is open, and once from openLeftVisual().
// It is intentionally not a recursive timer: a periodic 350 ms loop used to
// clear sidebarExpandBusy and re-toggle the host while the previous toggle was
// still committing. Mount completion is observed by requestMount(); sync() and
// the MutationObserver cover later host re-renders.
function repairLeftHost() {
  if (state.leftRepairTimer !== 0) { clearTimeout(state.leftRepairTimer); state.leftRepairTimer = 0; }
  if (!state.leftVisible) return;
  const root = document.documentElement;
  root.classList.remove("dms-left-hide");
  root.classList.add("dms-preload-left");
  if (!hostMounted() && !state.rightVisible && !root.classList.contains("dms-right-open")) {
    requestMount("repair");
  }
}

function clearDrawerInline() {
  const col = sidebarCol();
  if (col !== null) {
    col.style.removeProperty("animation");
    col.style.removeProperty("transition");
    col.style.removeProperty("transform");
    col.style.removeProperty("z-index");
    col.style.removeProperty("will-change");
  }
  const center = $('[class*="_centerCol"]');
  if (center !== null) {
    center.style.removeProperty("transform");
    center.style.removeProperty("opacity");
    center.style.removeProperty("transition");
    center.style.removeProperty("will-change");
  }
}

function openLeftVisual(fromGesture) {
  state.leftVisible = true;
  const leftCol = sidebarCol();
  if (leftCol !== null) leftCol.style.removeProperty("display");
  const root = document.documentElement;
  // Keep dms-preload-left: the host sidebar stays mounted and painted under
  // the page (P0 fix), so opening only needs to raise it above the page and
  // let the CSS push move centerCol. Removing preload here re-ran the host
  // slide-in animation and could show a white frame on fast drawer switches.
  root.classList.remove("dms-left-hide");
  root.classList.add("dms-left-open");
  if (!hostMounted()) requestMount("open");
  const col = sidebarCol();
  if (col !== null) {
    col.style.setProperty("animation", "none", "important");
    col.style.setProperty("transition", "none", "important");
    // A gesture owns the first real position: keep the just-mounted drawer
    // off-screen until arm's first frame writes the finger position, otherwise
    // the host commit would flash the fully-open state for one paint.
    col.style.setProperty("transform", fromGesture ? "translate3d(calc(-1 * var(--dms-drawer-w)),0,0)" : "none", "important");
    col.style.setProperty("z-index", "90", "important");
  }
  dlog("open-visual", "hostMounted=" + hostMounted());
  repairLeftHost();
}

function closeLeftVisual(animated) {
  if (!state.leftVisible) return;
  state.leftVisible = false;
  dlog("close-visual", "animated=" + animated);
  if (state.leftRepairTimer !== 0) { clearTimeout(state.leftRepairTimer); state.leftRepairTimer = 0; }
  // Drop the inline overrides first so the CSS close transition/class can win
  // and the preloaded sidebar falls back under the page.
  clearDrawerInline();
  const root = document.documentElement;
  root.classList.remove("dms-left-open");
  if (animated) {
    root.classList.add("dms-left-hide");
    setTimeout(() => {
      if (!leftOpen()) {
        root.classList.remove("dms-left-hide");
        root.classList.add("dms-preload-left");
      }
    }, 260);
  } else {
    root.classList.add("dms-preload-left");
  }
}

function toggleLeft() {
  if (leftOpen()) closeLeftVisual(true);
  else openLeftVisual();
}

function leftOpen() {
  return state.leftVisible;
}

export { ensureSidebarMounted, forceMountSidebar, preloadSidebar, repairLeftHost, clearDrawerInline, openLeftVisual, closeLeftVisual, toggleLeft, leftOpen };
