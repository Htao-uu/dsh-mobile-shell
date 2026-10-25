// dsh-mobile-shell: bundle entry. build.mjs wraps this module in the DSH
// __ModuleLoader__ shell (banner + footer) and sets globalName=DMS, so the
// shipped lib/client.js starts with window.__ModuleLoader__.load({ ... }).
export { apply, INJECT } from "./index.js";
