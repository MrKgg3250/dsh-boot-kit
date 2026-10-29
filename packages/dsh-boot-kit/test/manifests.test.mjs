import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendDisableRow,
  collectEntryIds,
  compareVersions,
  ensureStrictDepBuildsFalse,
  hasRowFor,
  missingBundleRows,
} from '../lib/manifests.mjs'

const manifest = (bundles, dependencies) => ({
  dependencies,
  dsh: { profile: { bundles } },
})

test('missingBundleRows finds installed bundles that were never registered', () => {
  const installed = {
    '@linxin666/dsh-web-all': { hasBundlePatch: true },
    'dsh-startup-screen': { hasBundlePatch: true },
  }
  const missing = missingBundleRows(
    manifest(['@deepseek-ai/dsh-base', 'dshmarket'], {
      '@linxin666/dsh-web-all': '^0.4.12',
      'dsh-startup-screen': 'file:./x.tgz',
    }),
    ['dsh-skin-boot-sync', '@linxin666/dsh-web-all', 'dsh-startup-screen'],
    (name) => installed[name] || null,
  )
  assert.deepEqual(missing, ['@linxin666/dsh-web-all', 'dsh-startup-screen'])
})

test('missingBundleRows ignores names it was not asked about', () => {
  // Real case: dsh-qoder-connect ships a bundle patch but no profile lists it.
  // Enabling it would be a change nobody asked for.
  const missing = missingBundleRows(
    manifest([], { 'dsh-qoder-connect': '^0.2.11' }),
    ['dsh-skin-boot-sync'],
    (name) => ({ hasBundlePatch: name !== 'dsh-skin-boot-sync' }),
  )
  assert.deepEqual(missing, [])
})

test('missingBundleRows skips packages already registered or absent from disk', () => {
  const missing = missingBundleRows(
    manifest(['dsh-startup-screen'], {
      'dsh-startup-screen': '1.2.0',
      'not-installed': '1.0.0',
    }),
    ['dsh-startup-screen', 'not-installed'],
    (name) => (name === 'dsh-startup-screen' ? { hasBundlePatch: true } : null),
  )
  assert.deepEqual(missing, [], 'a missing row must never be invented for an absent package')
})

test('appendDisableRow appends once and is idempotent', () => {
  const first = appendDisableRow('- id: ui-chat\n  name: x\n', 'web-ui-pet')
  assert.equal(first.changed, true)
  assert.ok(hasRowFor(first.text, 'web-ui-pet'))
  assert.match(first.text, /- id: web-ui-pet\n {2}disabled: true/)

  const second = appendDisableRow(first.text, 'web-ui-pet')
  assert.equal(second.changed, false)
  assert.equal(second.text, first.text, 'a rerun must not add a second row')
})

test('appendDisableRow detects an existing row in any indentation', () => {
  const text = '  - id: web-ui-pet\n    disabled: false\n'
  const result = appendDisableRow(text, 'web-ui-pet')
  assert.equal(result.changed, false)
  assert.equal(result.text, text, 'the user may have their own opinion already')
})

test('appendDisableRow keeps the file parseable when there is no trailing newline', () => {
  const result = appendDisableRow('- id: a', 'b')
  assert.equal(result.changed, true)
  assert.ok(result.text.startsWith('- id: a\n'), 'missing newline must not glue rows together')
})

test('ensureStrictDepBuildsFalse adds the setting when absent', () => {
  const result = ensureStrictDepBuildsFalse('packages:\n  - .\n')
  assert.equal(result.changed, true)
  assert.match(result.text, /^strictDepBuilds: false$/m)
  assert.ok(result.text.startsWith('packages:\n  - .\n'), 'existing content is preserved')
})

test('ensureStrictDepBuildsFalse leaves an explicit false alone', () => {
  const result = ensureStrictDepBuildsFalse('strictDepBuilds: false\n')
  assert.equal(result.changed, false)
})

test('ensureStrictDepBuildsFalse reports an explicit true instead of overriding it', () => {
  const result = ensureStrictDepBuildsFalse('strictDepBuilds: true\n')
  assert.equal(result.changed, false)
  assert.equal(result.conflict, true)
  assert.match(result.text, /strictDepBuilds: true/, 'never silently flip a user setting')
})

test('collectEntryIds finds a cross-layer collision', () => {
  const { duplicates } = collectEntryIds([
    { name: 'web-all', text: '- insert:\n    - id: web-ui-pet\n      name: x\n' },
    { name: 'mine', text: '- insert:\n    - id: web-ui-pet\n      name: y\n' },
  ])
  assert.equal(duplicates.length, 1)
  assert.equal(duplicates[0].id, 'web-ui-pet')
  assert.deepEqual(duplicates[0].owners, ['web-all', 'mine'])
})

test('collectEntryIds ignores a repeat inside one layer (insert + config rows)', () => {
  const { duplicates } = collectEntryIds([
    { name: 'web-all', text: '- insert:\n    - id: web-ui-ssh\n      name: a\n\n- id: web-ui-ssh\n  disabled: true\n' },
  ])
  assert.deepEqual(duplicates, [])
})

test('collectEntryIds does not mistake an override row for an insert', () => {
  // The user layer disables a row that a bundle inserted. That is the normal
  // shape of every profile that has ever turned a plugin off, and it must not
  // read as a collision.
  const { duplicates, ids } = collectEntryIds([
    { name: '@linxin666/dsh-web-all', text: '- insert:\n    - id: web-ui-pet\n      name: x\n' },
    { name: '<user layer>', text: '# disabled by hand\n- id: web-ui-pet\n  disabled: true\n' },
  ])
  assert.deepEqual(duplicates, [])
  assert.deepEqual(ids.map((entry) => entry.id), ['web-ui-pet'])
})

test('collectEntryIds still reports two layers inserting the same id', () => {
  const { duplicates } = collectEntryIds([
    { name: 'mine', text: '- insert:\n    - id: dsh-skin-boot-sync\n      name: a\n' },
    { name: 'theirs', text: '- insert:\n    - id: dsh-skin-boot-sync\n      name: b\n' },
  ])
  assert.equal(duplicates.length, 1)
  assert.deepEqual(duplicates[0].owners, ['mine', 'theirs'])
})

test('compareVersions orders prereleases below the release', () => {
  assert.equal(compareVersions('0.2.1-rc.3', '0.2.1-rc.2'), 1)
  assert.equal(compareVersions('0.2.1-rc.2', '0.2.1-rc.3'), -1)
  assert.equal(compareVersions('0.2.1', '0.2.1-rc.3'), 1)
  assert.equal(compareVersions('0.2.0', '0.2.1-rc.3'), -1)
  assert.equal(compareVersions('0.2.1-rc.3', '0.2.1-rc.3'), 0)
})
