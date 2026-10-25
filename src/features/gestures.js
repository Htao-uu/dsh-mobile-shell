// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { LOCK } from "../core/constants.js";
import { $, $$, frame, isPhone, rightbarCol, settingsPanel, sidebarCol } from "../core/dom.js";
import { closeLeftVisual, ensureSidebarMounted, leftOpen, openLeftVisual, toggleLeft } from "../features/left-drawer.js";
import { closeRight, openRight } from "../features/right-drawer.js";
import { on } from "../core/events.js";

function installGestures() {

  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  let mode = null;
  let startX = 0, startY = 0, width = 0, locked = false;
  let lastX = 0, lastT = 0, velocity = 0, lastDx = 0;
  let samples = [];
  let activeEl = null, centerEl = null, springRaf = 0, drawerX = 0;
  let gestureSeq = 0;
  let gestureWidth = 0;
  let cachedFrame = null;
  let armRaf = 0;
  let armSide = null;
  let pendingSettle = null;
  let touchSuppressClick = false;
  const root = document.documentElement;
  const debugGesture = () => {
    try { return new URLSearchParams(location.search).has("dms-gesture-debug"); } catch (error) { return false; }
  };
  const dlog = (...args) => {
    if (!debugGesture()) return;
    try {
      const line = "[dshm-gesture] " + Math.round(performance.now()) + " " + args.map((arg) => String(arg)).join(" ");
      const win = window;
      win.__dshmGestureLog = win.__dshmGestureLog || [];
      win.__dshmGestureLog.push(line);
      if (win.__dshmGestureLog.length > 120) win.__dshmGestureLog.shift();
      console.log(line);
    } catch (error) { /* debug only */ }
  };
  // Cache the viewport width for the whole gesture: reading window.innerWidth
  // after writing transforms forces a synchronous layout of the (large)
  // conversation page and was the main source of the "opens halfway then
  // stalls" jank.
  const drawerWidth = () => Math.min(326, Math.round((gestureWidth || window.innerWidth) * 0.8));
  const elFor = (side) => (side === "left" ? sidebarCol() : rightbarCol());
  const hostFrame = () => {
    if (cachedFrame === null || !cachedFrame.isConnected) cachedFrame = frame();
    return cachedFrame;
  };
  const leftHostOpen = () => {
    const host = hostFrame();
    return host !== null && !host.hasAttribute("data-sidebar-collapsed");
  };
  // No getClientRects/getComputedStyle here: those layout reads also forced a
  // synchronous layout every animation frame. Host state is the readiness
  // signal; CSS applies the visible state after that attribute flips.
  const armReady = (side) => (side === "left" ? leftHostOpen() : rightbarCol() !== null);
  const stopArm = () => {
    if (armRaf !== 0) { cancelAnimationFrame(armRaf); armRaf = 0; }
    armSide = null;
  };
  const dragClassFor = (m) => m === "open-left" ? "dms-dragging-left" : m === "open-right" ? "dms-dragging-right" : m === "close-left" ? "dms-drag-close-left" : "dms-drag-close-right";
  const clearDragClasses = () => root.classList.remove("dms-dragging-left", "dms-dragging-right", "dms-drag-close-left", "dms-drag-close-right", "dms-gesture-arming", "dms-gesture-arming-right");
  let visualX = null;
  let lastFrameT = 0;
  const MAX_SPEED = 2300;
  const applyFrame = (side, targetX) => {
    const W = drawerWidth();
    const now = performance.now();
    const dt = Math.max(0.004, Math.min(0.05, lastFrameT === 0 ? 0.016 : (now - lastFrameT) / 1000));
    lastFrameT = now;
    if (visualX === null) visualX = targetX;
    const maxStep = Math.max(2, MAX_SPEED * dt);
    let x = targetX;
    if (x - visualX > maxStep) x = visualX + maxStep;
    else if (visualX - x > maxStep) x = visualX - maxStep;
    visualX = x;
    if (activeEl === null || !activeEl.isConnected) activeEl = elFor(side);
    if (activeEl !== null) {
      root.classList.remove("dms-gesture-arming", "dms-gesture-arming-right");
      activeEl.style.setProperty("animation", "none", "important");
      activeEl.style.setProperty("transition", "none", "important");
      activeEl.style.setProperty("transform", "translate3d(" + Math.round(x) + "px,0,0)", "important");
      activeEl.style.setProperty("will-change", "transform", "important");
    }
    if (centerEl === null) centerEl = $('[class*="_centerCol"]');
    if (centerEl !== null) {
      // Push the page in step with the drawer. HANDOVER §14 recorded a white
      // strip from pushing, but that was before the host sidebar was preloaded
      // (P0 fix): it is now painted under the page, so no blank area is exposed.
      const pageX = side === "left" ? Math.max(0, Math.min(W, W + x)) : Math.min(0, Math.max(-W, x - W));
      centerEl.style.setProperty("transition", "none", "important");
      centerEl.style.setProperty("transform", pageX === 0 ? "none" : "translate3d(" + Math.round(pageX) + "px,0,0)", "important");
      centerEl.style.setProperty("opacity", "1", "important");
    }
    drawerX = x;
  };
  const clearInline = () => {
    state.springAnimating = false;
    clearDragClasses();
    if (activeEl !== null) {
      activeEl.style.removeProperty("transform");
      activeEl.style.removeProperty("transition");
      activeEl.style.removeProperty("animation");
      activeEl.style.removeProperty("will-change");
      activeEl.style.removeProperty("z-index");
    }
    if (centerEl !== null) {
      centerEl.style.removeProperty("transform");
      centerEl.style.removeProperty("opacity");
      centerEl.style.removeProperty("transition");
      centerEl.style.removeProperty("will-change");
    }
    activeEl = null;
  };
  const inHorizontalScroller = (node) => {
    let el = node instanceof Element ? node : null;
    for (let depth = 0; el !== null && el !== document.body && depth < 8; depth++) {
      const style = window.getComputedStyle(el);
      if ((style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
      el = el.parentElement;
    }
    return false;
  };
  const springTo = (side, targetX, willClose, done) => {
    if (springRaf !== 0) cancelAnimationFrame(springRaf);
    dlog("spring-start", side, "target=" + Math.round(targetX), "close=" + willClose);
    state.gestureBusy = true;
    state.springAnimating = true;
    if (activeEl === null) activeEl = elFor(side);
    let x = drawerX;
    let v = 0;
    const stiffness = 1500;
    const damping = 0.9;
    const dragC = 2 * damping * Math.sqrt(stiffness);
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
      last = now;
      const accel = -stiffness * (x - targetX) - dragC * v;
      v += accel * dt;
      x += v * dt;
      applyFrame(side, x);
      if (Math.abs(x - targetX) > 0.5 || Math.abs(v) > 8) {
        springRaf = requestAnimationFrame(step);
      } else {
        springRaf = 0;
        dlog("spring-end", side, "close=" + willClose);
        if (willClose) {
          root.classList.remove("dms-left-open", "dms-right-open");
          clearInline();
          state.gestureBusy = false;
          state.springAnimating = false;
          if (typeof done === "function") done();
        } else {
          clearInline();
          state.gestureBusy = false;
          state.springAnimating = false;
          if (typeof done === "function") done();
        }
      }
    };
    springRaf = requestAnimationFrame(step);
  };

  // Wait (bounded) until the host has actually painted the drawer. The old
  // armPaint() treated an existing-but-display:none sidebar as ready, while the
  // host was still committing the expand; movement then went to an invisible
  // element and the drawer popped in later. This loop only ends when the
  // element is visible, the gesture generation changes, or the timeout fires.
  function startArm(side) {
    stopArm();
    const seq = gestureSeq;
    const began = performance.now();
    const deadline = began + 2200;
    let mountRetries = 0;
    let lastMountTry = began;
    armSide = side;
    const tick = () => {
      if (seq !== gestureSeq) return;
      if (armReady(side)) {
        const el = elFor(side);
        armRaf = 0;
        armSide = null;
        if (mode !== null) {
          activeEl = el;
          visualX = null;
          lastFrameT = 0;
          const W = drawerWidth();
          const target = side === "left" ? Math.min(0, lastDx - W) : Math.max(0, W + lastDx);
          applyFrame(side, target);
          dlog("first-frame", side, "target=" + Math.round(target), "dx=" + Math.round(lastDx));
          return;
        }
        const settle = pendingSettle;
        if (settle !== null && settle.seq === seq) {
          pendingSettle = null;
          runSettle(settle, true);
        }
        return;
      }
      const now = performance.now();
      // If a previous mount request already timed out, retry at most twice
      // during this gesture (requestMount keeps single-flight + cooldown).
      if (!state.sidebarExpandBusy && mountRetries < 2 && now - lastMountTry > 350) {
        mountRetries += 1;
        lastMountTry = now;
        ensureSidebarMounted();
        dlog("arm-mount-retry", side, "n=" + mountRetries);
      }
      if (now > deadline) {
        armRaf = 0;
        armSide = null;
        dlog("arm-timeout", side);
        const settle = pendingSettle;
        if (settle !== null && settle.seq === seq) {
          pendingSettle = null;
          runSettle(settle, false);
        }
        return;
      }
      armRaf = requestAnimationFrame(tick);
    };
    armRaf = requestAnimationFrame(tick);
  }

  // The finger was released before the host drawer became visible. Keep the
  // final decision here and apply it once the drawer is paintable; a new
  // touchstart bumps gestureSeq and discards this stale intent.
  function runSettle(settle, paintable) {
    const m = settle.m;
    const dx = settle.dx;
    const threshold = settle.threshold;
    const W = settle.W;
    const fast = settle.fast;
    const stableVelocity = settle.stableVelocity;
    const side = m === "open-left" || m === "close-left" ? "left" : "right";
    dlog("settle-pending", m, "dx=" + Math.round(dx), "fast=" + fast, "paintable=" + paintable);
    const finalizeWithoutPaint = () => {
      // Host never became paintable within the bounded wait: commit the final
      // state so a later host mount lands on the right side of the animation.
      if (m === "open-left") {
        if (dx >= threshold || (fast && stableVelocity > 0)) root.classList.add("dms-left-open", "dms-gesture-opened");
        else closeLeftVisual(false);
      } else if (m === "open-right") {
        if (-dx >= threshold || (fast && stableVelocity < 0)) root.classList.add("dms-right-open");
        else closeRight();
      } else if (m === "close-left") {
        if (-dx >= threshold || (fast && stableVelocity < 0)) closeLeftVisual(false);
        else root.classList.add("dms-left-open");
      } else if (m === "close-right") {
        if (dx >= threshold || (fast && stableVelocity > 0)) closeRight();
        else root.classList.add("dms-right-open");
      }
      requestAnimationFrame(() => { clearInline(); state.gestureBusy = false; });
    };
    if (!paintable) {
      finalizeWithoutPaint();
      return;
    }
    if (!armReady(side)) {
      finalizeWithoutPaint();
      return;
    }
    const el = elFor(side);
    // Continue from the finger-release position with the same spring used by the
    // normal finish path, instead of applying the final frame directly and then
    // clearing inline styles (which made the delayed drawer "jump" into place).
    const startX = m === "open-left" ? Math.min(0, dx - W)
      : m === "open-right" ? Math.max(0, W + dx)
      : m === "close-left" ? Math.min(0, dx)
      : Math.max(0, dx);
    activeEl = el;
    visualX = null;
    lastFrameT = 0;
    applyFrame(side, startX);
    dlog("settle-pending-continue", m, "start=" + Math.round(startX));
    if (m === "open-left") {
      if (dx >= threshold || (fast && stableVelocity > 0)) {
        root.classList.add("dms-left-open", "dms-gesture-opened");
        springTo("left", 0, false);
      } else {
        springTo("left", -W, true, () => closeLeftVisual(false));
      }
      return;
    }
    if (m === "open-right") {
      if (-dx >= threshold || (fast && stableVelocity < 0)) {
        root.classList.add("dms-right-open");
        springTo("right", 0, false);
      } else {
        springTo("right", W, true, () => closeRight());
      }
      return;
    }
    if (m === "close-left") {
      if (-dx >= threshold || (fast && stableVelocity < 0)) springTo("left", -W, true, () => closeLeftVisual(false));
      else { root.classList.add("dms-left-open"); springTo("left", 0, false); }
      return;
    }
    if (m === "close-right") {
      if (dx >= threshold || (fast && stableVelocity > 0)) springTo("right", W, true, () => closeRight());
      else { root.classList.add("dms-right-open"); springTo("right", 0, false); }
    }
  }

  const cancelGesture = () => {
    mode = null;
    locked = false;
    pendingSettle = null;
    stopArm();
    state.gestureBusy = false;
    clearInline();
  };

  const onTouchStart = (e) => {
    if (!isPhone() || e.touches.length !== 1) return;
    if (state.gestureBusy || springRaf !== 0) return;
    gestureSeq += 1;
    gestureWidth = window.innerWidth;
    touchSuppressClick = false;
    stopArm();
    pendingSettle = null;
    clearInline();
    visualX = null;
    lastFrameT = 0;
    mode = null; locked = false; velocity = 0;
    if (settingsPanel() !== null) return;
    if (root.classList.contains("dms-attach-open") || root.classList.contains("dms-right-full")) return;
    if ($('[data-composer-card]') === null && !leftOpen() && !state.rightVisible) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; lastX = startX; lastT = performance.now();
    samples = [{ x: startX, t: lastT }];
    width = window.innerWidth;
    const target = e.target instanceof Element ? e.target : document.elementFromPoint(t.clientX, t.clientY);
    // Plugin state, not the host's transient marker: the host can still report
    // data-sidebar-right-open for a frame after closeRight(), which used to
    // turn the next left-swipe into a no-op "close right" gesture.
    if (leftOpen()) {
      mode = "close-left";
    } else if (state.rightVisible) {
      mode = "close-right";
    } else {
      if (target && target.closest('[contenteditable], input, textarea, [role="textbox"], [role="dialog"], [data-composer-card] button')) return;
      if (target && inHorizontalScroller(target)) return;
      mode = "pending";
    }
    dlog("touch-start", "mode=" + mode, "x=" + Math.round(startX));
  };
  listen(document, "touchstart", onTouchStart, { passive: true, capture: true });

  const onTouchMove = (e) => {
    if (mode === null || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const now = performance.now();
    lastDx = dx;
    if (now - lastT > 0) velocity = velocity * 0.6 + ((t.clientX - lastX) / (now - lastT)) * 0.4;
    lastX = t.clientX; lastT = now;
    samples.push({ x: t.clientX, t: now });
    while (samples.length > 2 && now - samples[0].t > 110) samples.shift();
    if (!locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { mode = null; return; }
      if (Math.abs(dx) <= LOCK) return;
      if (mode === "pending" && Math.abs(dx) <= Math.abs(dy) * 1.1) return;
      if (mode === "pending") {
        mode = dx > 0 ? "open-left" : "open-right";
        root.classList.add(dragClassFor(mode));
        const openSide = mode === "open-left" ? "left" : "right";
        if (openSide === "left") {
          root.classList.add("dms-gesture-arming");
          // Ask the host for the drawer as early as possible; the mount
          // coordinator is single-flight, so this cannot double-toggle it.
          ensureSidebarMounted();
          openLeftVisual(true);
        } else {
          root.classList.add("dms-gesture-arming-right");
          if (!state.rightVisible) openRight();
        }
        dlog("recognized", mode, "dx=" + Math.round(dx));
        startArm(openSide);
      }
      locked = true;
      state.gestureBusy = true;
      if (mode === "open-left") visualX = -drawerWidth();
      else if (mode === "open-right") visualX = drawerWidth();
      else visualX = 0;
      lastFrameT = performance.now();
    }
    if (e.cancelable) e.preventDefault();
    const W = drawerWidth();
    if (mode === "open-left") applyFrame("left", Math.min(0, dx - W));
    else if (mode === "close-left") applyFrame("left", Math.min(0, dx));
    else if (mode === "open-right") applyFrame("right", Math.max(0, W + dx));
    else applyFrame("right", Math.max(0, dx));
  };
  listen(document, "touchmove", onTouchMove, { passive: false, capture: true });

  const paint = (dx) => {
    const W = drawerWidth();
    const m = mode;
    if (m === "open-left") applyFrame("left", Math.min(0, dx - W));
    else if (m === "open-right") applyFrame("right", Math.max(0, W + dx));
    else if (m === "close-left") applyFrame("left", Math.min(0, dx));
    else if (m === "close-right") applyFrame("right", Math.max(0, dx));
  };

  const finish = (e) => {
    if (mode === null || !locked) { mode = null; locked = false; state.gestureBusy = false; clearInline(); return; }
    const t = e.changedTouches && e.changedTouches[0];
    const dx = t ? t.clientX - startX : 0;
    const m = mode;
    const side = m === "open-left" || m === "close-left" ? "left" : "right";
    const W = drawerWidth();
    const threshold = W * 0.38;
    const endT = performance.now();
    const recent = samples.filter((s) => endT - s.t <= 110);
    let stableVelocity = 0;
    if (recent.length >= 2) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      if (last.t - first.t >= 8) stableVelocity = (last.x - first.x) / (last.t - first.t);
    }
    const fast = Math.abs(stableVelocity) > 0.08 && Math.abs(dx) >= 20;
    if (!armReady(side)) {
      // Host is still committing the drawer: remember the release decision and
      // let startArm() apply it as soon as the element is paintable. Never
      // spring/clear here, otherwise the final target is lost.
      pendingSettle = { seq: gestureSeq, m, dx, fast, stableVelocity, W, threshold };
      mode = null;
      locked = false;
      touchSuppressClick = true;
      setTimeout(() => { touchSuppressClick = false; }, 80);
      dlog("release-waiting-host", m, "dx=" + Math.round(dx), "fast=" + fast);
      startArm(side);
      return;
    }
    if (locked) {
      touchSuppressClick = true;
      setTimeout(() => { touchSuppressClick = false; }, 80);
    }
    mode = null; locked = false;
    dlog("finish", m, "dx=" + Math.round(dx), "fast=" + fast);
    if (m === "open-left") {
      if (dx >= threshold || (fast && stableVelocity > 0)) { root.classList.add("dms-left-open", "dms-gesture-opened"); springTo("left", 0, false); }
      else springTo("left", -W, true, () => closeLeftVisual(false));
    } else if (m === "open-right") {
      if (-dx >= threshold || (fast && stableVelocity < 0)) { root.classList.add("dms-right-open"); springTo("right", 0, false); }
      else springTo("right", W, true, () => closeRight());
    } else if (m === "close-left") {
      if (-dx >= threshold || (fast && stableVelocity < 0)) springTo("left", -W, true, () => closeLeftVisual(false));
      else { root.classList.add("dms-left-open"); springTo("left", 0, false); }
    } else if (m === "close-right") {
      if (dx >= threshold || (fast && stableVelocity > 0)) springTo("right", W, true, () => closeRight());
      else { root.classList.add("dms-right-open"); springTo("right", 0, false); }
    } else {
      state.gestureBusy = false;
      clearInline();
    }
  };
  listen(document, "touchend", finish, { passive: true, capture: true });
  listen(document, "touchcancel", cancelGesture, { passive: true, capture: true });

  // Desktop mouse drag support for the local test environment (and touch pads).
  // Touch/pen pointer events are skipped because the native touch handlers above
  // already own them; only a primary mouse button drives the same gesture state
  // machine. This keeps phone behaviour byte-for-byte on the existing path.
  let mouseActive = false;
  let mouseStarted = false;
  let mouseSuppressClick = false;
  const pointOf = (event) => ({ clientX: event.clientX, clientY: event.clientY });
  const fakeTouch = (event) => ({
    target: event.target,
    touches: [pointOf(event)],
    changedTouches: [pointOf(event)],
    cancelable: event.cancelable,
    preventDefault: () => event.preventDefault(),
  });
  const onPointerDown = (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    mouseSuppressClick = false;
    onTouchStart(fakeTouch(event));
    mouseActive = mode !== null;
    mouseStarted = mouseActive;
    if (mouseActive) {
      // Keep receiving moves/up even if the pointer leaves the iframe.
      try { document.documentElement.setPointerCapture(event.pointerId); } catch (error) { /* host may refuse */ }
      if (event.cancelable) event.preventDefault();
    }
  };
  const onPointerMove = (event) => {
    if (!mouseActive || event.pointerType === "touch") return;
    onTouchMove(fakeTouch(event));
    if (mode !== null && locked) mouseSuppressClick = true;
    if (event.cancelable) event.preventDefault();
  };
  const onPointerEnd = (event) => {
    if (!mouseActive || event.pointerType === "touch") return;
    mouseActive = false;
    try { document.documentElement.releasePointerCapture(event.pointerId); } catch (error) { /* host may refuse */ }
    finish(fakeTouch(event));
    if (mouseStarted) {
      mouseStarted = false;
      mouseSuppressClick = true;
      setTimeout(() => { mouseSuppressClick = false; }, 180);
    }
  };
  const onPointerCancel = (event) => {
    if (!mouseActive || event.pointerType === "touch") return;
    mouseActive = false;
    mouseStarted = false;
    try { document.documentElement.releasePointerCapture(event.pointerId); } catch (error) { /* host may refuse */ }
    cancelGesture();
  };
  const onClickSuppress = (event) => {
    if (!mouseSuppressClick && !touchSuppressClick) return;
    mouseSuppressClick = false;
    touchSuppressClick = false;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  };
  listen(document, "pointerdown", onPointerDown, { capture: true });
  listen(document, "pointermove", onPointerMove, { capture: true, passive: false });
  listen(document, "pointerup", onPointerEnd, { capture: true });
  listen(document, "pointercancel", onPointerCancel, { capture: true });
  listen(document, "click", onClickSuppress, { capture: true });

  // A drawer close from the host chrome / back stack may happen while a gesture
  // spring is still running. Cancel that animation and clear the inline
  // transforms before the close classes are applied, otherwise the page can
  // stay pushed and expose the preloaded left sidebar underneath.
  const hardResetGesture = () => {
    if (springRaf !== 0) { cancelAnimationFrame(springRaf); springRaf = 0; }
    stopArm();
    pendingSettle = null;
    mode = null;
    locked = false;
    state.gestureBusy = false;
    state.springAnimating = false;
    clearInline();
  };
  const offDrawerClose = on("drawer-close", hardResetGesture);

  return () => {
    offDrawerClose();
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
    try { clearInline(); } catch (error) { /* host busy */ }
  };
}

function installDrawerAutoClose() {

  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  listen(document, "click", (e) => {
    if (!isPhone() || !leftOpen()) return;
    const target = e.target instanceof Element ? e.target : null;
    const col = sidebarCol();
    if (target === null || col === null || !col.contains(target)) return;
    const closeAfter = () => setTimeout(() => { if (leftOpen()) toggleLeft(); }, 60);
    if (target.closest('[class*="_panelRow"]') !== null || target.closest('[class*="_newSession"]') !== null) {
      closeAfter();
      return;
    }
    const row = target.closest('[class*="_sessionRow"]');
    if (row !== null) {
      if (target.closest("button, [role=menuitem], [aria-haspopup=menu]") === null) closeAfter();
      return;
    }
    if (target.closest('[class*="_settingsArea"]') !== null) closeAfter();
  }, true);

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
  };
}

export { installGestures, installDrawerAutoClose };
