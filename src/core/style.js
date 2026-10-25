// dsh-mobile-shell: CSS layers are joined in an explicit order (tokens first, desktop last).
import tokens from "../styles/tokens.css";
import frame from "../styles/frame.css";
import leftDrawer from "../styles/left-drawer.css";
import rightDrawer from "../styles/right-drawer.css";
import rightDrawerLoading from "../styles/right-drawer-loading.css";
import scrim from "../styles/scrim.css";
import topbar from "../styles/topbar.css";
import hero from "../styles/hero.css";
import composer from "../styles/composer.css";
import composerStats from "../styles/composer-stats.css";
import settings from "../styles/settings.css";
import toast from "../styles/toast.css";
import gestures from "../styles/gestures.css";
import attachSheet from "../styles/attach-sheet.css";
import keyboard from "../styles/keyboard.css";
import desktop from "../styles/desktop.css";

const CSS = [tokens, frame, leftDrawer, rightDrawer, rightDrawerLoading, scrim, topbar, hero, composer, composerStats, settings, toast, gestures, attachSheet, keyboard, desktop].join("");


function styleOnce() {
  let tag = document.querySelector('style[data-dsh-mobile-shell="styles"]');
  if (tag === null) {
    tag = document.createElement("style");
    tag.dataset.dshMobileShell = "styles";
    tag.dataset.plugin = "dsh-mobile-shell";
    document.head.appendChild(tag);
  }
  if (tag.textContent !== CSS) tag.textContent = CSS;
  return tag;
}



export { CSS, styleOnce };
