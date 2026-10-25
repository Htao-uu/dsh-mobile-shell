#!/usr/bin/env node
/**
 * Build the single-file browser bundle DSH serves from lib/client.js.
 *
 * Source layout: src/loader.js is the entry, src/index.js assembles the plugin,
 * src/features/** implement behaviour and src/styles/** are plain CSS files.
 * esbuild inlines each CSS file through the text loader (loader '.css': 'text')
 * and emits exactly one IIFE file - the DSH client only fetches one file per
 * plugin, so there must never be a side-car .css/.js chunk.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const entry = join(root, 'src', 'loader.js')
const outfile = join(root, 'lib', 'client.js')

const options = {
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  write: false,
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  globalName: 'DMS',
  banner: { js: "window.__ModuleLoader__.load({\n  id: \"dsh-mobile-shell\",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n" },
  footer: { js: "    exports.apply = DMS.apply;\n    exports.inject = DMS.INJECT.slice();\n    return module.exports;\n  }\n});\n" },
  logLevel: 'silent',
}

/** Run the esbuild CLI with inherited stdio (works in sandboxes that block the service pipes). */
async function buildWithCli() {
  const require = createRequire(import.meta.url)
  const platformPkg = '@esbuild/' + process.platform + '-' + process.arch
  let bin
  try {
    const pkgPath = require.resolve(platformPkg + '/package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    bin = join(dirname(pkgPath), process.platform === 'win32' ? 'esbuild.exe' : join('bin', 'esbuild'))
    if (pkg.version === undefined) throw new Error('bad platform package')
  } catch (error) {
    bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild')
  }
  await mkdir(join(root, 'lib'), { recursive: true })
  const args = [
    entry,
    '--bundle',
    '--format=iife',
    '--target=es2020',
    '--global-name=DMS',
    '--banner:js=' + "window.__ModuleLoader__.load({\n  id: \"dsh-mobile-shell\",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n",
    '--footer:js=' + "    exports.apply = DMS.apply;\n    exports.inject = DMS.INJECT.slice();\n    return module.exports;\n  }\n});\n",
    '--minify=false',
    '--loader:.css=text',
    '--define:process.env.NODE_ENV="production"',
    '--log-level=warning',
    '--outfile=' + outfile,
  ]
  const result = spawnSync(bin, args, { stdio: 'inherit', cwd: root })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error('esbuild CLI failed with exit code ' + result.status)
  return readFile(outfile, 'utf8')
}

let client
try {
  const { build } = await import('esbuild')
  const result = await build(options)
  client = result.outputFiles[0].text
} catch (error) {
  const message = String(error && error.message ? error.message : error)
  if (!/spawn EPERM|spawn .*EPERM/i.test(message)) throw error
  console.log('esbuild service unavailable (' + message + '); falling back to the bundled CLI')
  client = await buildWithCli()
}

await mkdir(join(root, 'lib'), { recursive: true })
await writeFile(outfile, client, 'utf8')
console.log('built lib/client.js:', Buffer.byteLength(client), 'bytes')
