// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { $, $$, isPhone } from "../core/dom.js";

function installLongPress() {

  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  let timer = 0;
  let startX = 0, startY = 0;
  let node = null;
  const cancel = () => { if (timer !== 0) { clearTimeout(timer); timer = 0; } };

  const activate = (target, cx, cy) => {
    if (!(target instanceof Element)) return;
    const session = target.closest('[class*="_sessionRow"]');
    if (session !== null) {
      const overflow = session.querySelector('[class*="_sessionOverflowButton"]') ||
        session.querySelector('[class*="_rowActions"] button');
      if (overflow !== null) { overflow.click(); return; }
    }
    /*
    const row = target.closest('li, [class*="_row"], [class*="_entry"], [class*="_card"]');
    if (row !== null) {
      const hidden = row.querySelector('[class*="_rowActions"] button, [class*="_actions"] button, [class*="_overflow"], button[aria-haspopup="menu"]');
      if (hidden !== null) { hidden.click(); return; }
    }
    */
    const msg = target.closest('[class*="_message"]');
    if (msg !== null) {
      msg.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
    }
  };

  listen(document, "touchstart", (e) => {
    if (!isPhone() || e.touches.length !== 1) return;
    cancel();
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    node = e.target instanceof Element ? e.target : null;
    if (node === null) return;
    timer = setTimeout(() => {
      timer = 0;
      activate(node, startX, startY);
    }, 500);
  }, { passive: true, capture: true });

  listen(document, "touchmove", (e) => {
    if (timer === 0 || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cancel();
  }, { passive: true, capture: true });

  listen(document, "touchend", cancel, { passive: true, capture: true });
  listen(document, "touchcancel", cancel, { passive: true, capture: true });

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
  };
}

export { installLongPress };
