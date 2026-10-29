/**
 * The seven steps. Each one is idempotent: running the whole pipeline twice on
 * the same profile must produce no further changes, and must never leave a row
 * behind that nothing owns.
 */
import path from 'node:path'
import crypto from 'node:crypto'
import { writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs'

import {
  appendDisableRow,
  collectEntryIds,
  ensureStrictDepBuildsFalse,
  missingBundleRows,
  readBundles,
  removeBundleRows,
  removeDisableRow,
} from './manifests.mjs'
import {
  inspectPackage,
  readJson,
  readText,
  runCapture,
  writeJson,
  writeText,
} from './context.mjs'
import { SKIN_BOOT_SYNC, STARTUP_SCREEN } from './specs.mjs'

export class KitError extends Error {
  constructor(code, message, hint) {
    super(message)
    this.code = code
    this.hint = hint
  }
}

/** Names this plan is responsible for. */
export function plannedNames(plan) {
  const names = new Set([SKIN_BOOT_SYNC.name])
  if (plan.npm.includes('@linxin666/dsh-web-all')) names.add('@linxin666/dsh-web-all')
  if (plan.npm.includes('dsh-whale-widget')) names.add('dsh-whale-widget')
  if (plan.github.length > 0) names.add(STARTUP_SCREEN.name)
  return [...names]
}

// ── 1. preflight ────────────────────────────────────────────────────────────
export async function preflight(ctx) {
  const { paths } = ctx
  const report = { ok: true, notes: [] }

  if (!existsSync(paths.manifestPath)) {
    throw new KitError(
      'E_NO_PROFILE',
      `no profile manifest at ${paths.manifestPath}`,
      'Open DeepSeek Harness once so it initializes its profile, then quit it and retry. Use --profile to pick another profile.',
    )
  }

  if (ctx.desktopRunning === true && !ctx.force) {
    throw new KitError(
      'E_PROFILE_LOCK',
      'DeepSeek Harness is running',
      'The desktop app owns its profile package.json. Fully quit it, then retry. Pass --force to install anyway (the app may overwrite the manifest on exit).',
    )
  }
  if (ctx.desktopRunning === true) report.notes.push('desktop app is running — installing anyway (--force)')

  if (ctx.dshVersion === null) {
    report.notes.push('could not determine the DSH version; continuing')
  } else if (ctx.versionTooOld) {
    throw new KitError(
      'E_DSH_VERSION',
      `DSH ${ctx.dshVersion} is older than the required ${ctx.minDsh}`,
      'Upgrade DeepSeek Harness first. The skin and startup plugins used here both require it.',
    )
  }

  return report
}

// ── 2. pnpm flags ───────────────────────────────────────────────────────────
export function writePnpmFlags(ctx) {
  const file = ctx.paths.workspaceYamlPath
  const before = readText(file, '')
  const result = ensureStrictDepBuildsFalse(before)

  if (result.conflict) {
    ctx.warn(
      'strictDepBuilds is explicitly true in pnpm-workspace.yaml. ' +
        'The install will fail on unapproved build scripts. Set it to false to continue.',
    )
    return { changed: false }
  }
  if (!result.changed) return { changed: false }

  ctx.write(file, result.text)
  return { changed: true, note: 'strictDepBuilds: false' }
}

// ── 3. install ──────────────────────────────────────────────────────────────
/**
 * `fetch` with retries.
 *
 * The GitHub release host is reachable but flaky from China: a HEAD 200 one
 * minute, an ETIMEDOUT the next. pnpm retries its own downloads; this covers
 * the tarball the CLI fetches itself, which would otherwise fail the whole
 * install on one bad connection.
 */
async function fetchWithRetry(url, attempts, warn) {
  let last = 'unknown error'
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' })
      if (response.ok) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error && error.message ? error.message : String(error)
    }
    if (attempt < attempts) {
      const waitMs = attempt * 5000
      warn(`download failed (${last}); retrying in ${waitMs / 1000}s ...`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
  return { ok: false, statusText: last }
}

function sha256File(file) {
  try {
    return crypto.createHash('sha256').update(readFileSync(file)).digest('hex')
  } catch {
    return ''
  }
}

/**
 * Download a release tarball, verify it, cache it.
 *
 * Every download is sha256-checked against a pin in specs.mjs — a tampered or
 * truncated mirror must not reach the profile — and the cache is checked too:
 * a previously cached file that no longer matches (a partial write, a bad
 * manual copy) is re-downloaded instead of installed.
 */
async function downloadTarball(ctx, asset) {
  const target = path.join(ctx.paths.pluginsDir, asset.name)
  if (existsSync(target)) {
    if (sha256File(target) === asset.sha256) {
      ctx.log(`${asset.name} already present, sha256 ok`)
      return target
    }
    ctx.warn(`cached ${asset.name} has a bad sha256 — re-downloading`)
  }
  if (ctx.dryRun) {
    ctx.log(`[dry-run] would download ${asset.url}`)
    return target
  }

  const response = await fetchWithRetry(asset.url, 3, ctx.warn)
  if (!response.ok) {
    throw new KitError(
      'E_GITHUB_DOWNLOAD',
      `GET ${asset.url} -> ${response.statusText} (3 attempts)`,
      'Download that tarball by hand, put it in the plugins directory, and rerun.',
    )
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const actual = crypto.createHash('sha256').update(buffer).digest('hex')
  if (actual !== asset.sha256) {
    throw new KitError(
      'E_TARBALL_HASH',
      `${asset.name}: sha256 mismatch`,
      `expected ${asset.sha256}\nactual   ${actual}\nThe download was corrupted or tampered with; do not install it.`,
    )
  }
  ctx.writeBinary(target, buffer)
  ctx.log(`downloaded ${asset.name} (${Math.round(buffer.length / 1024)} KB, sha256 ok)`)
  return target
}

export function downloadStartup(ctx, plan) {
  if (plan.github.length === 0) return Promise.resolve(null)
  return downloadTarball(ctx, STARTUP_SCREEN)
}

export function downloadPlugin(ctx, plan) {
  if (plan.release.length === 0) return Promise.resolve(null)
  return downloadTarball(ctx, SKIN_BOOT_SYNC)
}

export async function install(ctx, plan, { pluginTarball, startupTarball } = {}) {
  // The plugin is downloaded and sha256-checked by downloadPlugin first, then
  // installed from the local file; the startup tarball likewise. pnpm never
  // fetches an unverified URL.
  const specs = []
  if (pluginTarball) specs.push(pluginTarball)
  specs.push(...plan.npm, ...plan.local)
  if (startupTarball) specs.push(startupTarball)
  if (specs.length === 0) return { changed: false }

  const args = ['plugin', '--profile', ctx.paths.profile, 'add', ...specs]
  if (ctx.dryRun) {
    ctx.log(`[dry-run] ${ctx.cli} ${args.join(' ')}`)
    return { changed: true, note: 'planned' }
  }

  const first = await ctx.run(ctx.cli, args)
  if (first.ok) {
    ctx.log(`installed: ${specs.length} package(s)`)
    return { changed: true }
  }

  const output = `${first.stdout}\n${first.stderr}`
  if (/ERR_PNPM_IGNORED_BUILDS|approve-builds/i.test(output)) {
    // The flags step should have prevented this. If the user's file said
    // `strictDepBuilds: true`, step 2 reported it; retry once in case the write
    // landed between the check and the install.
    ctx.warn('pnpm rejected unapproved build scripts — rewriting the pnpm flags and retrying once')
    const rewritten = ensureStrictDepBuildsFalse(readText(ctx.paths.workspaceYamlPath, ''))
    ctx.write(ctx.paths.workspaceYamlPath, rewritten.text)
    const retry = await ctx.run(ctx.cli, args)
    if (retry.ok) {
      ctx.log('installed on retry')
      return { changed: true, note: 'retried after build-script error' }
    }
    throw new KitError(
      'E_BUILD_SCRIPTS',
      'pnpm still refuses the build scripts',
      'Run `pnpm approve-builds` in the profile directory, then rerun this installer.',
    )
  }

  if (/ERR_PNPM_NO_MATCHING_VERSION|404 Not Found|ETARGET/i.test(output)) {
    throw new KitError('E_PACKAGE_NOT_FOUND', 'a package could not be resolved', output.trim().split('\n').slice(-6).join('\n'))
  }

  throw new KitError('E_INSTALL_FAILED', 'dsh plugin add failed', output.trim().split('\n').slice(-8).join('\n'))
}

// ── 4. reconcile ────────────────────────────────────────────────────────────
export function reconcile(ctx) {
  const manifest = readJson(ctx.paths.manifestPath, null)
  if (!manifest) throw new KitError('E_NO_PROFILE', 'profile package.json is unreadable')

  // Only the packages this run is responsible for. Enabling every dependency
  // that happens to ship a bundle patch would switch on plugins the user never
  // asked for.
  const missing = missingBundleRows(manifest, plannedNames(ctx.plan), (name) =>
    inspectPackage(ctx.paths.nodeModules, name),
  )
  if (missing.length === 0) {
    ctx.log('bundle list already consistent')
    return { changed: false }
  }

  if (!manifest.dsh) manifest.dsh = {}
  if (!manifest.dsh.profile) manifest.dsh.profile = {}
  const bundles = readBundles(manifest)
  const next = bundles.concat(missing)
  manifest.dsh.profile.bundles = next

  if (ctx.dryRun) {
    ctx.log(`[dry-run] would register in dsh.profile.bundles: ${missing.join(', ')}`)
    return { changed: true, note: missing.join(', '), added: missing }
  }
  ctx.backup(ctx.paths.manifestPath)
  ctx.writeJson(ctx.paths.manifestPath, manifest)
  ctx.log(`registered in dsh.profile.bundles: ${missing.join(', ')}`)
  return { changed: true, note: missing.join(', '), added: missing }
}

// ── 5. patch user layer ─────────────────────────────────────────────────────
export function patchUserLayer(ctx, plan) {
  const file = ctx.paths.userPatchPath
  let text = readText(file, '')
  const applied = []

  for (const row of plan.disables) {
    // Only switch off a row whose owning package is actually installed: a
    // `disabled` row for an id nothing inserts is noise the loader has to own.
    if (!inspectPackage(ctx.paths.nodeModules, row.pkg)) continue
    const result = appendDisableRow(text, row.id)
    if (result.changed) applied.push(row.id)
    text = result.text
  }

  if (applied.length === 0) {
    ctx.log('user layer already carries the opt-outs')
    return { changed: false }
  }
  if (ctx.dryRun) {
    ctx.log(`[dry-run] would disable: ${applied.join(', ')}`)
    return { changed: true, note: applied.join(', ') }
  }
  ctx.backup(file)
  ctx.write(file, text)
  for (const id of applied) ctx.log(`disabled: ${id}`)
  return { changed: true, note: applied.join(', ') }
}

// ── 6. verify ───────────────────────────────────────────────────────────────
/**
 * @param ctx
 * @param {object} [options]
 * @param {string[]} [options.assumeAdded] bundle rows a dry run decided it would
 *   add but deliberately did not write. Passing them keeps a dry run from
 *   failing verification on changes it chose not to make.
 */
export function verify(ctx, options = {}) {
  const errors = []
  const warnings = []
  const manifest = readJson(ctx.paths.manifestPath, null)
  const assumed = new Set(options.assumeAdded || [])
  const bundles = [...new Set([...readBundles(manifest), ...assumed])]
  const names = plannedNames(ctx.plan)

  for (const name of names) {
    const info = inspectPackage(ctx.paths.nodeModules, name)
    if (!info) {
      // Nothing is installed on purpose during a dry run. In a real run a
      // planned package that is absent means the install step did not really
      // succeed, which is exactly what this check is for.
      if (!ctx.dryRun) errors.push(`${name} is planned but not installed — the install step did not complete`)
      continue
    }
    if (!bundles.includes(name)) {
      errors.push(`${name} is installed but missing from dsh.profile.bundles — it will not load`)
      continue
    }
    if (info.hasBundlePatch && !existsSync(path.join(info.dir, ...info.patchRel.split('/')))) {
      errors.push(`${name} declares dsh.bundle.patch but ${info.patchRel} is missing`)
    }
  }

  // Duplicate loader entry ids across layers make the next boot fail outright.
  const sources = []
  for (const name of bundles) {
    const info = inspectPackage(ctx.paths.nodeModules, name)
    if (!info || !info.hasBundlePatch) continue
    const patchFile = path.join(info.dir, ...info.patchRel.split('/'))
    sources.push({ name, text: readText(patchFile, '') })
  }
  sources.push({ name: '<user layer>', text: readText(ctx.paths.userPatchPath, '') })

  const { duplicates } = collectEntryIds(sources)
  for (const hit of duplicates) {
    warnings.push(`loader id "${hit.id}" is inserted by more than one layer: ${hit.owners.join(', ')}`)
  }

  return { errors, warnings }
}

// ── 7. report ───────────────────────────────────────────────────────────────
export function report(ctx, outcomes) {
  const lines = []
  lines.push('')
  lines.push('  done.')
  for (const key of Object.keys(outcomes)) {
    const value = outcomes[key]
    if (value && value.changed) lines.push(`    ~ ${key}: ${value.note || 'updated'}`)
    else lines.push(`    · ${key}: unchanged`)
  }
  lines.push('')
  lines.push('  Now fully quit DeepSeek Harness and open it again.')
  lines.push('  Plugins are assembled at boot; a page refresh will not do it.')
  lines.push('')
  lines.push('  What to expect:')
  lines.push(`    · profile ${ctx.paths.profile} at ${ctx.paths.profileDir}`)
  lines.push('    · the startup animation plays, then the skin backdrop starts on frame 1')
  if (ctx.plan.disables.length > 0) {
    lines.push('    · opt-outs are in cordis.patch.yml — delete those rows to undo them')
  }
  lines.push('')
  ctx.log(lines.join('\n'))
}

/** Copy a file next to itself before an edit, so a mistake is one copy away. */
export function backup(file) {
  if (!existsSync(file)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = `${file}.bak-${stamp}`
  copyFileSync(file, target)
  return target
}

export function writeBinary(ctx, file, buffer) {
  if (ctx.dryRun) return
  writeFileSync(file, buffer)
}

// ── revert ──────────────────────────────────────────────────────────────────
//
// The inverse of install, done by intent rather than by restoring a backup: a
// backup may predate the user's own edits, and reverting onto it would silently
// discard them. Every step here removes exactly what this kit added.

export function revertBundles(ctx) {
  const manifest = readJson(ctx.paths.manifestPath, null)
  if (!manifest) throw new KitError('E_NO_PROFILE', 'profile package.json is unreadable')

  const removed = removeBundleRows(manifest, plannedNames(ctx.plan))
  if (removed.length === 0) return { changed: false }

  if (ctx.dryRun) {
    ctx.log(`[dry-run] would unregister: ${removed.join(', ')}`)
    return { changed: true, note: removed.join(', ') }
  }
  ctx.backup(ctx.paths.manifestPath)
  ctx.writeJson(ctx.paths.manifestPath, manifest)
  ctx.log(`unregistered: ${removed.join(', ')}`)
  return { changed: true, note: removed.join(', ') }
}

export function revertUserLayer(ctx, plan) {
  const file = ctx.paths.userPatchPath
  let text = readText(file, '')
  const reverted = []

  for (const row of plan.disables) {
    const result = removeDisableRow(text, row.id)
    if (result.removed) reverted.push(row.id)
    text = result.text
  }

  if (reverted.length === 0) return { changed: false }
  if (ctx.dryRun) {
    ctx.log(`[dry-run] would re-enable: ${reverted.join(', ')}`)
    return { changed: true, note: reverted.join(', ') }
  }
  ctx.backup(file)
  ctx.write(file, text)
  ctx.log(`re-enabled: ${reverted.join(', ')}`)
  return { changed: true, note: reverted.join(', ') }
}

export async function uninstall(ctx, plan) {
  const names = plannedNames(ctx.plan).filter((name) => inspectPackage(ctx.paths.nodeModules, name))
  if (names.length === 0) return { changed: false }

  const args = ['plugin', '--profile', ctx.paths.profile, 'remove', ...names]
  if (ctx.dryRun) {
    ctx.log(`[dry-run] ${ctx.cli} ${args.join(' ')}`)
    return { changed: true, note: names.join(', ') }
  }

  const result = await ctx.run(ctx.cli, args)
  if (!result.ok) {
    throw new KitError(
      'E_UNINSTALL_FAILED',
      'dsh plugin remove failed',
      `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-8).join('\n'),
    )
  }
  ctx.log(`removed: ${names.join(', ')}`)
  return { changed: true, note: names.join(', ') }
}

export function revertReport(ctx, outcomes) {
  const lines = ['', '  done.', '']
  for (const key of Object.keys(outcomes)) {
    const value = outcomes[key]
    lines.push(value && value.changed ? `    ~ ${key}: ${value.note || 'reverted'}` : `    · ${key}: nothing to revert`)
  }
  lines.push('')
  lines.push('  Not touched by a revert:')
  lines.push('    · your skins (skin center) and any plugin settings you changed by hand')
  lines.push('    · the *.bak-<timestamp> copies this kit left next to the files it edited')
  lines.push('')
  lines.push('  Fully quit DeepSeek Harness and open it again to finish.')
  lines.push('')
  ctx.log(lines.join('\n'))
}

export { writeText }
