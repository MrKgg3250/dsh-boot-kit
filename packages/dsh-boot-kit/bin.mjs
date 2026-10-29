#!/usr/bin/env node
/**
 * dsh-boot-kit — install the startup animation, the skin backdrop sync, and the
 * opinionated opt-outs into a DeepSeek Harness profile.
 *
 * The point of this CLI is not convenience: it is that a plugin cannot repair its
 * own installation. `dsh plugin add` reports success while leaving a package
 * unregistered whenever pnpm exits non-zero, and it only reconciles the bundle
 * list for dependencies it added in that same run. Both cases are handled here,
 * explicitly, every time.
 */
import process from 'node:process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  detectDesktopApp,
  detectDshVersion,
  readJson,
  readText,
  resolvePaths,
  runCapture,
  writeJson,
  writeText,
} from './lib/context.mjs'
import { compareVersions } from './lib/manifests.mjs'
import { MIN_DSH, TESTED_DSH, TIERS, planFor } from './lib/specs.mjs'
import {
  KitError,
  backup,
  downloadStartup,
  install,
  patchUserLayer,
  preflight,
  reconcile,
  report,
  verify,
  writeBinary,
  writePnpmFlags,
} from './lib/steps.mjs'

const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

const HELP = `
dsh-boot-kit ${VERSION}

  Install the startup animation + skin backdrop sync into a DSH profile.

Usage
  dsh-boot-kit [options]

Options
  --tier <name>        minimal | boot | full          (default: full)
                         minimal  only dsh-skin-boot-sync
                         boot     + dsh-startup-screen
                         full     + @linxin666/dsh-web-all, pet switched off
  --profile <name>     profile to install into        (default: $DSH_PROFILE or desktop)
  --dsh <path>         the dsh entry point            (default: $DSH_CLI or "dsh" on PATH)
  --dsh-home <path>    DSH home                       (default: $DSH_HOME or ~/.dsh)
  --source <npm|local> where dsh-skin-boot-sync comes from (default: npm)
  --repo-root <path>   repository root, required with --source local
  --with-widget        also install dsh-whale-widget (it stays switched off)
  --dry-run            print what would change, write nothing, run no installs
  --force              install even while the desktop app is running
  -h, --help           this text
  -v, --version        version

Exit codes
  0 done · 1 failed · 2 bad usage
`

function parseArgs(argv) {
  const opts = {
    tier: 'full',
    profile: undefined,
    dshHome: undefined,
    cli: process.env.DSH_CLI || 'dsh',
    source: 'npm',
    repoRoot: undefined,
    withWidget: false,
    dryRun: false,
    force: false,
    help: false,
    version: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('-')) throw new KitError('E_USAGE', `${arg} needs a value`)
      i += 1
      return value
    }
    switch (arg) {
      case '--tier': opts.tier = next(); break
      case '--profile': opts.profile = next(); break
      case '--dsh': opts.cli = next(); break
      case '--dsh-home': opts.dshHome = next(); break
      case '--source': opts.source = next(); break
      case '--repo-root': opts.repoRoot = next(); break
      case '--with-widget': opts.withWidget = true; break
      case '--dry-run': opts.dryRun = true; break
      case '--force': opts.force = true; break
      case '-h': case '--help': opts.help = true; break
      case '-v': case '--version': opts.version = true; break
      default: throw new KitError('E_USAGE', `unknown option: ${arg}`)
    }
  }
  if (!TIERS.includes(opts.tier)) throw new KitError('E_USAGE', `--tier must be one of ${TIERS.join('|')}`)
  if (!['npm', 'local'].includes(opts.source)) throw new KitError('E_USAGE', '--source must be npm or local')
  if (opts.source === 'local' && !opts.repoRoot) throw new KitError('E_USAGE', '--source local needs --repo-root')
  return opts
}

async function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (error) {
    console.error(`\n  ${error.message}\n`)
    console.error(HELP)
    return 2
  }
  if (opts.help) { console.log(HELP); return 0 }
  if (opts.version) { console.log(VERSION); return 0 }

  const paths = resolvePaths({ dshHome: opts.dshHome, profile: opts.profile })
  const plan = planFor({
    tier: opts.tier,
    source: opts.source,
    repoRoot: opts.repoRoot ? path.resolve(opts.repoRoot) : undefined,
    withWidget: opts.withWidget,
  })

  const say = (message) => console.log(message)
  const warn = (message) => console.warn(`  ! ${message}`)

  say('')
  say(`  dsh-boot-kit ${VERSION}${opts.dryRun ? '  (dry run — nothing will be written)' : ''}`)
  say(`  profile  ${paths.profile}   ${paths.profileDir}`)
  say(`  tier     ${plan.tier}  (${[...plan.npm, ...plan.local, ...plan.github.map((g) => `${g.name}@${g.version}`)].join(', ')})`)
  say('')

  const desktopRunning = await detectDesktopApp()
  const dshVersion = await detectDshVersion(opts.cli)
  const versionTooOld = dshVersion ? compareVersions(dshVersion, MIN_DSH) < 0 : false

  if (dshVersion && dshVersion !== TESTED_DSH) {
    warn(`DSH ${dshVersion} — this kit was tested on ${TESTED_DSH}; the anchors it relies on are not public API`)
  }

  const ctx = {
    paths,
    plan,
    cli: opts.cli,
    dryRun: opts.dryRun,
    force: opts.force,
    desktopRunning,
    dshVersion,
    minDsh: MIN_DSH,
    versionTooOld,
    log: say,
    warn,
    write(file, text) {
      if (opts.dryRun) { say(`  [dry-run] write ${path.basename(file)}`); return }
      writeText(file, text)
    },
    writeJson(file, value) {
      if (opts.dryRun) { say(`  [dry-run] write ${path.basename(file)}`); return }
      writeJson(file, value)
    },
    writeBinary(file, buffer) {
      if (opts.dryRun) { say(`  [dry-run] write ${path.basename(file)}`); return }
      writeBinary(ctx, file, buffer)
    },
    backup(file) {
      if (opts.dryRun) return null
      const target = backup(file)
      if (target) say(`  backup ${path.basename(target)}`)
      return target
    },
    run: (command, args) => runCapture(command, args),
  }

  const outcomes = {}
  try {
    say('  1/7 preflight')
    const pre = await preflight(ctx)
    for (const note of pre.notes) warn(note)

    say('  2/7 pnpm flags')
    outcomes.pnpmFlags = writePnpmFlags(ctx)

    say('  3/7 install')
    const startupTarball = await downloadStartup(ctx, plan)
    outcomes.install = await install(ctx, plan, startupTarball)

    say('  4/7 reconcile dsh.profile.bundles')
    outcomes.reconcile = reconcile(ctx)

    say('  5/7 opt-out rows')
    outcomes.patch = patchUserLayer(ctx, plan)

    say('  6/7 verify')
    const { errors, warnings } = verify(ctx, {
      assumeAdded: (outcomes.reconcile && outcomes.reconcile.added) || [],
    })
    for (const item of warnings) warn(item)
    if (errors.length > 0) {
      throw new KitError('E_VERIFY', errors.join('\n    '), 'The profile is not bootable as written. Fix the above before restarting.')
    }

    say('  7/7 report')
    report(ctx, outcomes)
    return 0
  } catch (error) {
    if (error instanceof KitError) {
      console.error(`\n  ${error.code}: ${error.message}\n`)
      if (error.hint) console.error(`  ${error.hint.replace(/\n/g, '\n  ')}\n`)
      return 1
    }
    console.error('\n  unexpected failure:', error && error.stack ? error.stack : error, '\n')
    return 1
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code))
