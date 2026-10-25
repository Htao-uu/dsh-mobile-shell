// dsh-mobile-shell: split source (built into lib/client.js by scripts/build.mjs)
import { $, $$ } from "../core/dom.js";

function installKeyboard() {
  const disposers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const shift = kb > 90 ? Math.round(kb) : 0;
    const root = document.documentElement;
    root.style.setProperty("--dms-kb", shift + "px");
    root.classList.toggle("dms-kb-open", shift > 0);
  };
  listen(vv, "resize", apply);
  listen(vv, "scroll", apply);
  listen(window, "orientationchange", () => setTimeout(apply, 260));
  const bootTimer = setTimeout(apply, 400);
  disposers.push(() => clearTimeout(bootTimer));

  return () => { for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index](); };
}

export { installKeyboard };
