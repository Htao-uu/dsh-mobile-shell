#!/usr/bin/env node
/**
 * Build the single-file browser bundle DSH serves from lib/client.js.
 *
 * The DSH client loader only fetches one file per plugin, so the stylesheet is
 * embedded as a JSON string literal. Keeping it in src/styles.css makes the CSS
 * editable and reviewable; this script is the only build step.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const template = await readFile(join(root, 'src', 'client.js.tpl'), 'utf8')
const css = await readFile(join(root, 'src', 'styles.css'), 'utf8')
if (!template.includes('__CSS_JSON__')) throw new Error('client.js.tpl is missing the __CSS_JSON__ placeholder')
const client = template.replace('__CSS_JSON__', JSON.stringify(css))
await writeFile(join(root, 'lib', 'client.js'), client, 'utf8')
console.log('built lib/client.js:', client.length, 'bytes')
