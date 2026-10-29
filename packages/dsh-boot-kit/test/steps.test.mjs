import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { patchUserLayer, reconcile, verify, writePnpmFlags } from '../lib/steps.mjs'
import { planFor } from '../lib/specs.mjs'

function makeProfile() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-boot-kit-'))
  const paths = {
    profileDir: root,
    manifestPath: path.join(root, 'package.json'),
    workspaceYamlPath: path.join(root, 'pnpm-workspace.yaml'),
    userPatchPath: path.join(root, 'cordis.patch.yml'),
    nodeModules: path.join(root, 'node_modules'),
  }
  writeFileSync(
    paths.manifestPath,
    `${JSON.stringify(
      {
        name: 'dsh-profile-test',
        private: true,
        dependencies: { 'dsh-skin-boot-sync': '1.0.0', '@linxin666/dsh-pet': '0.4.12' },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(paths.workspaceYamlPath, 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  mkdirSync(paths.nodeModules, { recursive: true })
  return { root, paths }
}

/** Drop a package that declares a bundle patch into the fake profile. */
function fakePackage(paths, name, patchBody) {
  const dir = path.join(paths.nodeModules, ...name.split('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2)}\n`,
  )
  writeFileSync(path.join(dir, 'cordis.patch.yml'), patchBody)
}

function makeCtx(paths, plan) {
  const notes = []
  return {
    paths,
    plan,
    notes,
    dryRun: false,
    log: (m) => notes.push(m),
    warn: (m) => notes.push(`warn: ${m}`),
    backup: () => null,
    write: (file, text) => writeFileSync(file, text),
    writeJson: (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`),
  }
}

const bundlePatch = (id) => `- insert:\n    - id: ${id}\n      name: ${id}\n`
const readManifest = (paths) => JSON.parse(readFileSync(paths.manifestPath, 'utf8'))

test('reconcile registers an installed bundle that was never listed, once', () => {
  const { paths } = makeProfile()
  fakePackage(paths, 'dsh-skin-boot-sync', bundlePatch('dsh-skin-boot-sync'))
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))

  const first = reconcile(ctx)
  assert.equal(first.changed, true)
  assert.deepEqual(readManifest(paths).dsh.profile.bundles, [
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
    'dsh-skin-boot-sync',
  ])

  const second = reconcile(ctx)
  assert.equal(second.changed, false, 'a second run must not duplicate the row')
  assert.equal(readManifest(paths).dsh.profile.bundles.filter((n) => n === 'dsh-skin-boot-sync').length, 1)
})

test('reconcile never registers a package that is not on disk', () => {
  const { paths } = makeProfile()
  writeFileSync(
    paths.manifestPath,
    `${JSON.stringify({ dependencies: { ghost: '1.0.0' }, dsh: { profile: { bundles: [] } } })}\n`,
  )
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))
  assert.equal(reconcile(ctx).changed, false)
  assert.deepEqual(readManifest(paths).dsh.profile.bundles, [])
})

test('patchUserLayer only switches off rows whose package is installed', () => {
  const { paths } = makeProfile()
  fakePackage(paths, '@linxin666/dsh-pet', bundlePatch('web-ui-pet'))
  // dsh-whale-widget is NOT installed, so its row must not be written.
  const ctx = makeCtx(paths, planFor({ tier: 'full' }))

  const outcome = patchUserLayer(ctx, ctx.plan)
  assert.equal(outcome.changed, true)
  const text = readFileSync(paths.userPatchPath, 'utf8')
  assert.match(text, /- id: web-ui-pet\n {2}disabled: true/)
  assert.doesNotMatch(text, /- id: dsh-whale-widget/, 'no row for an id nothing inserts')
})

test('patchUserLayer is idempotent', () => {
  const { paths } = makeProfile()
  fakePackage(paths, '@linxin666/dsh-pet', bundlePatch('web-ui-pet'))
  const ctx = makeCtx(paths, planFor({ tier: 'full' }))
  patchUserLayer(ctx, ctx.plan)
  const before = readFileSync(paths.userPatchPath, 'utf8')
  assert.equal(patchUserLayer(ctx, ctx.plan).changed, false)
  assert.equal(readFileSync(paths.userPatchPath, 'utf8'), before)
})

test('writePnpmFlags adds strictDepBuilds once', () => {
  const { paths } = makeProfile()
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))
  assert.equal(writePnpmFlags(ctx).changed, true)
  const text = readFileSync(paths.workspaceYamlPath, 'utf8')
  assert.match(text, /^strictDepBuilds: false$/m)
  assert.match(text, /nodeLinker: hoisted/, 'existing settings survive')
  assert.equal(writePnpmFlags(ctx).changed, false)
})

test('verify passes on a consistent profile', () => {
  const { paths } = makeProfile()
  fakePackage(paths, 'dsh-skin-boot-sync', bundlePatch('dsh-skin-boot-sync'))
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))
  reconcile(ctx)
  const { errors } = verify(ctx)
  assert.deepEqual(errors, [])
})

test('verify catches an installed-but-unregistered plugin', () => {
  const { paths } = makeProfile()
  fakePackage(paths, 'dsh-skin-boot-sync', bundlePatch('dsh-skin-boot-sync'))
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))
  const { errors } = verify(ctx)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /missing from dsh\.profile\.bundles/)
})

test('verify catches a planned plugin that never got installed', () => {
  const { paths } = makeProfile()
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))
  const { errors } = verify(ctx)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /planned but not installed/)
})

test('verify accepts rows a dry run only planned', () => {
  const { paths } = makeProfile()
  fakePackage(paths, 'dsh-skin-boot-sync', bundlePatch('dsh-skin-boot-sync'))
  const ctx = makeCtx(paths, planFor({ tier: 'minimal' }))
  ctx.dryRun = true

  const planned = reconcile(ctx) // returns what it would add, writes nothing
  assert.equal(planned.added.length, 1)
  assert.match(readFileSync(paths.manifestPath, 'utf8'), /"bundles": \[/, 'dry run must not write')

  assert.equal(verify(ctx).errors.length, 1, 'without the assumption the row really is missing')
  assert.deepEqual(verify(ctx, { assumeAdded: planned.added }).errors, [])
})

test('verify does not fail a dry run over packages it never installed', () => {
  const { paths } = makeProfile()
  const ctx = makeCtx(paths, planFor({ tier: 'full' }))
  ctx.dryRun = true
  const { errors } = verify(ctx)
  assert.deepEqual(errors, [], 'a dry run installs nothing by design')
})
