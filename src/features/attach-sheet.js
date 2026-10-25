// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { state } from "../core/state.js";
import { ICONS } from "../core/constants.js";
import { $, $$, frame, isPhone, showToast } from "../core/dom.js";
import { on } from "../core/events.js";

function installAttachSheet() {

  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  const root = document.documentElement;
  let sheet = null;
  let backdrop = null;
  let recentWrap = null;
  let recentStrip = null;
  let nativeSeq = 0;
  let nativeCaps = null;
  let nativeCapsPromise = null;
  const nativePending = new Map();
  let photoGesture = null;
  let photoPaint = null;
  let photoDragPoint = null;
  let photoAutoScrollRaf = 0;
  let photoLongPressTimer = 0;
  let suppressPhotoClick = false;
  let sheetMeasureDone = false;
  let photoSuppressTimer = 0;
  const nativeBridge = () => {
    const api = window.DSHNative;
    return api && typeof api.request === "function" ? api : null;
  };

  function nativeCall(method, params, timeoutMs) {
    const api = nativeBridge();
    if (api === null) return Promise.reject(new Error("native bridge unavailable"));
    return new Promise((resolve, reject) => {
      const id = "dms_" + (++nativeSeq);
      const timer = setTimeout(() => {
        nativePending.delete(id);
        reject(new Error("native bridge timeout: " + method));
      }, timeoutMs || 1500);
      nativePending.set(id, { resolve, reject, timer });
      try { api.request(JSON.stringify({ id, method, params: params || {} })); }
      catch (error) { clearTimeout(timer); nativePending.delete(id); reject(error); }
    });
  }
  window.__dshNativeResult = (id, payload) => {
    const entry = nativePending.get(id);
    if (!entry) return;
    nativePending.delete(id);
    clearTimeout(entry.timer);
    try { entry.resolve(typeof payload === "string" ? JSON.parse(payload) : payload); }
    catch (error) { entry.reject(error); }
  };

  function ensureUi() {
    if (backdrop === null) {
      backdrop = document.createElement("div");
      backdrop.className = "dms-attach-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.appendChild(backdrop);
    }
    if (sheet === null) {
      sheet = document.createElement("div");
      sheet.className = "dms-attach-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-label", "添加附件");
      sheet.innerHTML =
        '<div class="dms-attach-recent" hidden><div class="dms-attach-recent-title">最近照片</div><div class="dms-attach-recent-strip"></div></div>' +
        '<div class="dms-attach-actions">' +
          '<button type="button" class="dms-attach-action" data-kind="camera"><span class="dms-attach-ico">' + ICONS.camera + '</span><span>拍照</span></button>' +
          '<button type="button" class="dms-attach-action" data-kind="gallery"><span class="dms-attach-ico">' + ICONS.image + '</span><span>相册</span></button>' +
          '<button type="button" class="dms-attach-action" data-kind="files"><span class="dms-attach-ico">' + ICONS.file + '</span><span>文件</span></button>' +
        '</div>';
      document.body.appendChild(sheet);
      recentWrap = sheet.querySelector(".dms-attach-recent");
      recentStrip = sheet.querySelector(".dms-attach-recent-strip");
      const PHOTO_LONG_PRESS_MS = 500;
      const PHOTO_MOVE_SLOP = 6;
      const cancelPhotoLongPress = () => {
        if (photoLongPressTimer !== 0) { clearTimeout(photoLongPressTimer); photoLongPressTimer = 0; }
      };
      const endPhotoGesture = () => {
        cancelPhotoLongPress();
        const gesture = photoGesture;
        const painted = gesture !== null && gesture.mode === "paint";
        photoGesture = null;
        photoPaint = null;
        photoDragPoint = null;
        stopPhotoAutoScroll();
        if (painted) {
          // The tap that ends a paint session must not toggle a second time.
          suppressPhotoClick = true;
          if (photoSuppressTimer !== 0) clearTimeout(photoSuppressTimer);
          photoSuppressTimer = setTimeout(() => { photoSuppressTimer = 0; suppressPhotoClick = false; }, 420);
        }
      };
      // Android long-press on an image would raise the native context menu and
      // cancel the touch stream; the sheet owns this gesture instead.
      recentStrip.addEventListener("contextmenu", (event) => { event.preventDefault(); }, { passive: false });
      recentStrip.addEventListener("touchstart", (event) => {
        const cell = event.target instanceof Element ? event.target.closest(".dms-attach-photo") : null;
        if (cell === null || event.touches.length !== 1) return;
        const t = event.touches[0];
        cancelPhotoLongPress();
        suppressPhotoClick = false;
        photoGesture = { startX: t.clientX, startY: t.clientY, cell, mode: "pending" };
        photoPaint = null;
        photoDragPoint = null;
        stopPhotoAutoScroll();
        // Native overflow scrolling stays untouched until the long press wins:
        // no preventDefault and no scrollLeft writes here (EXCELLENT-CASES 案例1).
        photoLongPressTimer = setTimeout(() => {
          photoLongPressTimer = 0;
          const gesture = photoGesture;
          if (gesture === null || gesture.mode !== "pending") return;
          gesture.mode = "paint";
          photoPaint = { last: null };
          suppressPhotoClick = true;
          photoDragPoint = { x: gesture.startX, y: gesture.startY };
          photoDragTo(gesture.cell);
          startPhotoAutoScroll();
          try {
            if (navigator !== undefined && typeof navigator.vibrate === "function") navigator.vibrate(10);
          } catch (error) { /* vibration is optional */ }
        }, PHOTO_LONG_PRESS_MS);
      }, { passive: true });
      recentStrip.addEventListener("touchmove", (event) => {
        const gesture = photoGesture;
        if (gesture === null || event.touches.length !== 1) return;
        const t = event.touches[0];
        const dx = t.clientX - gesture.startX;
        const dy = t.clientY - gesture.startY;
        if (gesture.mode === "pending") {
          if (Math.abs(dx) <= PHOTO_MOVE_SLOP && Math.abs(dy) <= PHOTO_MOVE_SLOP) return;
          // Finger moved before the long press matured: hand the gesture back to
          // the browser's native horizontal scroller (0.6.13 behaviour).
          cancelPhotoLongPress();
          gesture.mode = "native";
          return;
        }
        if (gesture.mode !== "paint") return;
        // Paint mode owns the gesture now: prevent native scroll, toggle cells and
        // auto-scroll at the strip edges.
        if (event.cancelable) event.preventDefault();
        photoDragPoint = { x: t.clientX, y: t.clientY };
        photoDragTo(photoCellAtPoint(t.clientX, t.clientY));
        startPhotoAutoScroll();
      }, { passive: false });
      recentStrip.addEventListener("touchend", endPhotoGesture, { passive: true });
      recentStrip.addEventListener("touchcancel", endPhotoGesture, { passive: true });
      // Desktop mouse/trackpad drag-to-scroll for the recent-photos strip.
      // Native overflow-x scrolling does not respond to mouse dragging, which
      // makes the strip feel dead in the PC test frame. Touch pointers are
      // ignored here so the 0.6.13 native touch scrolling stays untouched.
      let stripMouseDrag = null;
      recentStrip.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        const cell = event.target instanceof Element ? event.target.closest(".dms-attach-photo") : null;
        if (cell === null) return;
        stripMouseDrag = { startX: event.clientX, scrollLeft: recentStrip.scrollLeft, moved: false };
        try { recentStrip.setPointerCapture(event.pointerId); } catch (error) { /* host may refuse */ }
      });
      recentStrip.addEventListener("pointermove", (event) => {
        const drag = stripMouseDrag;
        if (drag === null || event.pointerType === "touch") return;
        const dx = event.clientX - drag.startX;
        if (!drag.moved && Math.abs(dx) <= PHOTO_MOVE_SLOP) return;
        drag.moved = true;
        recentStrip.scrollLeft = drag.scrollLeft - dx;
        if (event.cancelable) event.preventDefault();
      }, { passive: false });
      const endStripMouseDrag = (event) => {
        if (stripMouseDrag === null) return;
        if (stripMouseDrag.moved) {
          suppressPhotoClick = true;
          if (photoSuppressTimer !== 0) clearTimeout(photoSuppressTimer);
          photoSuppressTimer = setTimeout(() => { photoSuppressTimer = 0; suppressPhotoClick = false; }, 420);
        }
        stripMouseDrag = null;
        try { recentStrip.releasePointerCapture(event.pointerId); } catch (error) { /* host may refuse */ }
      };
      recentStrip.addEventListener("pointerup", endStripMouseDrag);
      recentStrip.addEventListener("pointercancel", endStripMouseDrag);
      // Single tap = toggle this photo. One delegated listener avoids duplicated
      // per-cell handlers after every re-render.
      recentStrip.addEventListener("click", (event) => {
        const cell = event.target instanceof Element ? event.target.closest(".dms-attach-photo") : null;
        if (cell === null) return;
        if (suppressPhotoClick) { suppressPhotoClick = false; return; }
        togglePhoto(cell);
      });
      sheet.addEventListener("click", (event) => {
        const action = event.target instanceof Element ? event.target.closest("[data-kind]") : null;
        if (action !== null) {
          event.preventDefault();
          pickFromDevice(action.getAttribute("data-kind"));
        }
      });
    }
  }

  function makeInput(accept, capture, multiple) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple !== false;
    input.hidden = true;
    if (accept) input.accept = accept;
    if (capture) input.setAttribute("capture", capture);
    input.addEventListener("change", () => {
      const files = input.files === null ? [] : Array.from(input.files);
      input.value = "";
      input.remove();
      if (files.length > 0) intake(files);
    });
    document.body.appendChild(input);
    return input;
  }

  function loadNativeCaps() {
    if (nativeBridge() === null) return Promise.resolve(null);
    if (nativeCapsPromise !== null) return nativeCapsPromise;
    nativeCapsPromise = nativeCall("capabilities", {}, 1200).then((caps) => {
      nativeCaps = caps || null;
      return nativeCaps;
    }).catch(() => null);
    return nativeCapsPromise;
  }

  async function pickNative(kind) {
    const source = kind === "camera" ? "camera" : kind === "gallery" ? "gallery" : "files";
    const method = kind === "files" ? "pickFiles" : "pickImages";
    const params = kind === "files" ? { multiple: true, max: 20 } : { source, multiple: kind !== "camera", max: 20 };
    const reply = await nativeCall(method, params, 600000);
    const items = reply && Array.isArray(reply.files) ? reply.files : [];
    if (items.length === 0) {
      // 用户取消/没拍照：完全静默（用户 0.6.18 反馈）。真正失败由 pickFromDevice
      // 的 catch（调用失败/超时）提示。
      return true;
    }
    const files = [];
    for (const item of items) {
      if (!item || typeof item.url !== "string") continue;
      const response = await fetch(item.url);
      if (!response.ok) continue;
      const blob = await response.blob();
      files.push(new File([blob], item.name || (kind === "camera" ? "camera.jpg" : "file"), { type: item.mime || blob.type || "application/octet-stream" }));
    }
    if (files.length > 0) intake(files);
    return true;
  }

  function pickFromDevice(kind) {
    closeSheet();
    if (nativeBridge() === null) {
      fallbackPick(kind);
      return;
    }
    loadNativeCaps().then((caps) => {
      if (caps !== null && caps.pickers === true) {
        pickNative(kind).catch(() => {
          const label = kind === "camera" ? "相机" : kind === "gallery" ? "相册" : "文件选择器";
          showToast(label + "调用失败，改用系统选择器");
          fallbackPick(kind);
        });
      } else {
        fallbackPick(kind);
      }
    });
  }

  function fallbackPick(kind) {
    if (kind === "camera") makeInput("image/*", "camera", false).click();
    else if (kind === "gallery") makeInput("image/*", null, true).click();
    else makeInput("*/*", null, true).click();
  }

  const MAX_FILE = 1024 * 1024 * 1024;
  const MAX_TOTAL = 5 * 1024 * 1024 * 1024;

  function intake(files) {
    let total = 0;
    const accepted = [];
    for (const file of files) {
      if (file.size > MAX_FILE) { showToast("单个文件不能超过 1GB"); continue; }
      total += file.size;
      if (total > MAX_TOTAL) { showToast("单次附件总大小不能超过 5GB"); break; }
      accepted.push(file);
    }
    if (accepted.length === 0) return;
    const card = $('[data-composer-card]') || $('[data-composer-seat]') || $('[class*="_inputBar"]');
    if (card === null) { showToast("没有可用的输入框"); return; }
    const dt = new DataTransfer();
    for (const file of accepted) dt.items.add(file);
    const editor = card.querySelector('[contenteditable="true"], [role="textbox"], textarea') || card;
    let delivered = false;
    try {
      const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      editor.dispatchEvent(paste);
      delivered = paste.defaultPrevented;
    } catch (error) { /* fall through to drop */ }
    if (!delivered) {
      try {
        const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
        card.dispatchEvent(drop);
        delivered = drop.defaultPrevented;
      } catch (error) { /* ignore */ }
    }
    if (!delivered) showToast("这块输入框暂不支持添加附件");
  }

  function composerAttachmentLabels() {
    const card = $('[data-composer-card]') || $('[data-composer-seat]') || $('[class*="_inputBar"]');
    if (card === null) return [];
    return $$('[class*="_remove"]', card).map((btn) => btn.getAttribute("aria-label") || "").filter((label) => label.length > 0);
  }
  function composerHasAttachment(name) {
    if (!name) return false;
    return composerAttachmentLabels().some((label) => label.indexOf(name) >= 0);
  }
  function composerRemoveByName(name) {
    if (!name) return false;
    const card = $('[data-composer-card]') || $('[data-composer-seat]') || $('[class*="_inputBar"]');
    if (card === null) return false;
    const matches = $$('[class*="_remove"]', card).filter((btn) => (btn.getAttribute("aria-label") || "").indexOf(name) >= 0);
    // Only remove when exactly one composer chip can be identified by file name;
    // otherwise keep the chip (removing the wrong attachment is worse).
    if (matches.length !== 1) return false;
    matches[0].click();
    return true;
  }
  function selectPhoto(cell) {
    if (cell.classList.contains("selected") || cell.dataset.dmsPending === "1") return;
    const name = cell.dataset.dmsName || "";
    if (name && composerHasAttachment(name)) {
      // Already an attachment in the composer (e.g. it survived a sheet close):
      // just show the check, never add a duplicate (用户 修正2).
      cell.classList.add("selected");
      return;
    }
    cell.dataset.dmsPending = "1";
    cell.classList.add("selected");
    void openRecent(cell.getAttribute("data-photo-id"), cell);
  }
  function deselectPhoto(cell) {
    if (!cell.classList.contains("selected")) return;
    cell.classList.remove("selected");
    const name = cell.dataset.dmsName || "";
    if (name && !composerRemoveByName(name) && photoPaint === null) {
      // Could not identify the matching chip safely: keep the attachment, only
      // uncheck the photo and tell the user (用户 修正2).
      showToast("未能在输入框找到该附件，请手动移除");
    }
  }
  function togglePhoto(cell) {
    if (cell.classList.contains("selected")) deselectPhoto(cell);
    else selectPhoto(cell);
  }
  function photoCellAtPoint(x, y) {
    if (recentStrip === null) return null;
    const rect = recentStrip.getBoundingClientRect();
    const cx = Math.min(Math.max(x, rect.left + 4), rect.right - 4);
    const cy = Math.min(Math.max(y, rect.top + 4), rect.bottom - 4);
    const el = document.elementFromPoint(cx, cy);
    return el instanceof Element ? el.closest(".dms-attach-photo") : null;
  }
  function photoDragTo(cell) {
    if (photoPaint === null || cell === null || cell === photoPaint.last) return;
    photoPaint.last = cell;
    // Each cell passed toggles its own current selection state (用户 0.6.15).
    togglePhoto(cell);
  }
  function stopPhotoAutoScroll() {
    if (photoAutoScrollRaf !== 0) { cancelAnimationFrame(photoAutoScrollRaf); photoAutoScrollRaf = 0; }
  }
  function startPhotoAutoScroll() {
    stopPhotoAutoScroll();
    if (photoPaint === null || photoDragPoint === null || recentStrip === null) return;
    const step = () => {
      photoAutoScrollRaf = 0;
      if (photoPaint === null || photoDragPoint === null || recentStrip === null) return;
      const rect = recentStrip.getBoundingClientRect();
      const edge = 44;
      let delta = 0;
      if (photoDragPoint.x < rect.left + edge) delta = -Math.max(5, (rect.left + edge - photoDragPoint.x) * 0.6);
      else if (photoDragPoint.x > rect.right - edge) delta = Math.max(5, (photoDragPoint.x - (rect.right - edge)) * 0.6);
      if (delta !== 0) {
        recentStrip.scrollLeft += delta;
        photoDragTo(photoCellAtPoint(photoDragPoint.x, photoDragPoint.y));
        photoAutoScrollRaf = requestAnimationFrame(step);
      }
    };
    photoAutoScrollRaf = requestAnimationFrame(step);
  }
  async function renderRecent() {
    if (recentWrap === null || recentStrip === null) return;
    const api = nativeBridge();
    if (api === null) { recentWrap.hidden = true; return; }
    // 任务35：照片条固定占位高度，异步结果只换内容不改变 sheet 高度。
    recentWrap.hidden = false;
    recentStrip.innerHTML = '<div class="dms-attach-loading">正在读取最近照片…</div>';
    try {
      const reply = await nativeCall("recentPhotos", { limit: 20 }, 1800);
      const photos = reply && Array.isArray(reply.photos) ? reply.photos : [];
      recentStrip.innerHTML = "";
      if (photos.length === 0) { recentStrip.innerHTML = '<div class="dms-attach-loading">暂无最近照片</div>'; return; }
      for (const photo of photos) {
        if (!photo || typeof photo.thumbDataUrl !== "string") continue;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "dms-attach-photo";
        const img = document.createElement("img");
        img.src = photo.thumbDataUrl;
        img.alt = photo.name || "照片";
        img.loading = "lazy";
        cell.appendChild(img);
        const check = document.createElement("span");
        check.className = "dms-photo-check";
        check.innerHTML = ICONS.check;
        cell.appendChild(check);
        cell.setAttribute("data-photo-id", photo.id === undefined || photo.id === null ? "" : String(photo.id));
        if (typeof photo.name === "string" && photo.name.length > 0) {
          cell.dataset.dmsName = photo.name;
          if (composerHasAttachment(photo.name)) cell.classList.add("selected");
        }
        recentStrip.appendChild(cell);
      }
      if (recentStrip.childElementCount === 0) recentStrip.innerHTML = '<div class="dms-attach-loading">暂无最近照片</div>';
    } catch (error) {
      recentStrip.innerHTML = '<div class="dms-attach-loading">暂无最近照片</div>';
    }
  }

  async function openRecent(id, cell) {
    if (id === undefined || id === null) return;
    try {
      const reply = await nativeCall("openRecent", { id }, 3000);
      if (!reply || typeof reply.url !== "string") throw new Error("missing url");
      if (cell !== undefined && cell !== null && !cell.classList.contains("selected")) return;
      const response = await fetch(reply.url);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const file = new File([blob], reply.name || "photo.jpg", { type: reply.mime || blob.type || "image/jpeg" });
      if (cell !== undefined && cell !== null) {
        cell.dataset.dmsPending = "0";
        cell.dataset.dmsName = file.name;
      }
      intake([file]);
      requestAnimationFrame(measureSheet);
    } catch (error) {
      if (cell !== undefined && cell !== null) {
        cell.classList.remove("selected");
        cell.dataset.dmsPending = "0";
      }
      showToast("读取照片失败，请重试");
    }
  }

  function measureSheet(force) {
    if (sheet === null) return;
    if (!root.classList.contains("dms-attach-open")) {
      root.style.setProperty("--dms-sheet-h", "0px");
      return;
    }
    if (sheetMeasureDone && force !== true) return;
    const height = sheet.getBoundingClientRect().height;
    const card = $('[data-composer-card]') || $('[data-composer-seat]');
    let shift = height;
    if (card !== null) {
      // --dms-sheet-h shifts the composer seat up; recover the un-shifted card
      // bottom and shift by exactly (sheet height - bottom inset) so the sheet's
      // top edge lands on the composer's bottom edge (用户 修正1 / 截图20).
      const current = parseFloat(window.getComputedStyle(root).getPropertyValue("--dms-sheet-h")) || 0;
      const naturalBottom = card.getBoundingClientRect().bottom + current;
      shift = height - Math.max(0, window.innerHeight - naturalBottom);
    }
    root.style.setProperty("--dms-sheet-h", Math.max(0, Math.round(shift)) + "px");
    sheetMeasureDone = true;
  }
  function openSheet() {
    ensureUi();
    const add = $('[data-composer-card] button[aria-haspopup="listbox"], [class*="_inputBar"] button[aria-haspopup="listbox"]');
    if (add !== null) add.setAttribute("data-dms-plus", "1");
    root.classList.add("dms-attach-open");
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    // Keep the home greeter (logo + 探索未至之境) fully on screen: if the hero
    // area was scrolled, bring it back to the top before measuring (用户 图3).
    const hero = $('[class*="_centerCol"] [class*="_headline"]');
    if (hero !== null) {
      let scroller = hero.parentElement;
      for (let depth = 0; scroller !== null && depth < 6; depth++) {
        if (scroller.scrollHeight > scroller.clientHeight + 2) { scroller.scrollTop = 0; break; }
        scroller = scroller.parentElement;
      }
    }
    // 任务35：单次稳定测量。照片条从打开的第一帧就占固定高度（见 renderRecent），
    // 之后异步加载/空结果都不再改 --dms-sheet-h，composer 不会二次下沉。
    sheetMeasureDone = false;
    requestAnimationFrame(() => requestAnimationFrame(() => measureSheet()));
    loadNativeCaps();
    renderRecent();
  }
  function closeSheet(instant) {
    photoGesture = null;
    photoPaint = null;
    photoDragPoint = null;
    if (photoLongPressTimer !== 0) { clearTimeout(photoLongPressTimer); photoLongPressTimer = 0; }
    stopPhotoAutoScroll();
    suppressPhotoClick = false;
    if (photoSuppressTimer !== 0) { clearTimeout(photoSuppressTimer); photoSuppressTimer = 0; }
    root.classList.remove("dms-attach-open");
    if (instant === true) {
      // Keyboard is about to open: drop the sheet and its composer offset in the
      // same frame so the two layouts cannot overlap (用户 图6).
      root.classList.add("dms-sheet-instant");
      root.style.setProperty("--dms-sheet-h", "0px");
      setTimeout(() => { root.classList.remove("dms-sheet-instant"); }, 90);
    } else {
      root.style.setProperty("--dms-sheet-h", "0px");
    }
  }
  const offSession = on("session-switch", () => {
    if (root.classList.contains("dms-attach-open")) closeSheet(true);
  });
  listen(window, "resize", () => measureSheet(true));
  function toggleSheet() {
    if (root.classList.contains("dms-attach-open")) closeSheet();
    else openSheet();
  }

  listen(document, "click", (event) => {
    if (!isPhone()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    const add = target.closest('button[aria-haspopup="listbox"]');
    if (add === null) return;
    if (add.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]') === null) return;
    if (!/(^|[\s_-])add([\s_-]|$)/.test(add.className) && add.getAttribute("aria-label") !== "添加文件或调用指令") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleSheet();
  }, true);

  listen(document, "click", (event) => {
    if (!root.classList.contains("dms-attach-open")) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (target.closest(".dms-attach-sheet") !== null) return;
    // Composer taps are handled by the mousedown guard: buttons keep the sheet
    // open (their host popovers render above it), the dialog area closes it.
    if (target.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]') !== null) return;
    // A host popover opened from a composer control must not tear the sheet down.
    if (target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null) return;
    closeSheet();
  }, true);

  listen(document, "mousedown", (event) => {
    if (!root.classList.contains("dms-attach-open")) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (target.closest(".dms-attach-sheet") !== null) return;
    const composer = target.closest('[data-composer-card], [data-composer-seat], [class*="_inputBar"]');
    if (composer === null) return;
    if (target.closest('button[aria-haspopup="listbox"]') !== null) {
      // The "+" toggles on click (our handler); just stop the host keepFocus
      // handler from refocusing the editor, which would raise the keyboard.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target.closest('button, [role="button"], [aria-haspopup], a, input, select') !== null) {
      // Composer controls (shield / database / DSH / PTC / x) must stay usable
      // while the sheet is open (用户 修正3): only swallow the host keepFocus
      // handler, never close the sheet here. The "+" click handler toggles it.
      event.preventDefault();
      event.stopPropagation();
      return;
    } else {
      // Tapping the dialog/composer (0.6.15): close the sheet first, then focus
      // the input so the keyboard opens with no sheet layout left to overlap.
      closeSheet(true);
      const editor = composer.querySelector('[contenteditable="true"], [role="textbox"], textarea');
      if (editor !== null && typeof editor.focus === "function") {
        try { editor.focus(); } catch (error) { /* host busy */ }
      }
    }
  }, true);

  listen(document, "keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("dms-attach-open")) {
      event.preventDefault();
      closeSheet();
    }
  }, true);

  const originalBack = window.__dshmBack;
  const attachBack = function dshMobileShellBack() {
    if (root.classList.contains("dms-attach-open")) { closeSheet(); return true; }
    return typeof originalBack === "function" ? originalBack() : false;
  };
  window.__dshmBack = attachBack;

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
    if (window.__dshmBack === attachBack) window.__dshmBack = originalBack;
    if (typeof offSession === "function") offSession();
  };
}

export { installAttachSheet };
