import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readJson, readText } from '../lib/context.mjs'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'dsh-boot-kit-ctx-'))

test('readJson tolerates a UTF-8 BOM', () => {
  // `Set-Content -Encoding utf8` on Windows PowerShell writes a BOM, and
  // JSON.parse rejects one. A profile re-saved by hand must still be installable.
  const file = path.join(tmp(), 'package.json')
  writeFileSync(file, `\uFEFF${JSON.stringify({ name: 'dsh-profile-demo' })}`)
  assert.deepEqual(readJson(file), { name: 'dsh-profile-demo' })
})

test('readText strips the BOM so YAML parses', () => {
  const file = path.join(tmp(), 'cordis.patch.yml')
  writeFileSync(file, '\uFEFF- id: a\n  disabled: true\n')
  assert.ok(!readText(file).startsWith('\uFEFF'), 'a leading BOM must not survive')
})

test('readJson falls back on missing or invalid files', () => {
  assert.equal(readJson(path.join(tmp(), 'nope.json'), null), null)
  const bad = path.join(tmp(), 'bad.json')
  writeFileSync(bad, '{ not json')
  assert.equal(readJson(bad, 'fallback'), 'fallback')
})
