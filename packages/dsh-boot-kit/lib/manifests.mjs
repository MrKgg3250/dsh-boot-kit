/**
 * Pure manifest helpers: no filesystem, no child processes.
 *
 * Everything here is exercised by test/manifests.test.mjs, because these are the
 * operations that can corrupt a profile: rewriting the bundle list, and editing
 * YAML that the DSH loader will parse on the next boot.
 */

export function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function readBundles(manifest) {
  const list = manifest && manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles
  return Array.isArray(list) ? list : []
}

export function readDependencies(manifest) {
  return (manifest && manifest.dependencies) || {}
}

/**
 * Packages from `names` that declare a bundle patch but are absent from
 * `dsh.profile.bundles`.
 *
 * The name list is explicit on purpose. Scanning every dependency instead would
 * also pick up packages a user deliberately installed without enabling (a real
 * case: `dsh-qoder-connect` ships a bundle patch but is not in any profile's
 * bundle list) — and silently switching a plugin on is not a repair, it is a
 * different bug.
 *
 * A package that is not on disk is never returned: adding a bundle row for a
 * package that cannot be resolved makes the next boot fail outright.
 *
 * @param manifest parsed profile package.json
 * @param {string[]} names packages this installer is responsible for
 * @param resolvePackage (name) => { hasBundlePatch: boolean } | null
 */
export function missingBundleRows(manifest, names, resolvePackage) {
  const bundles = new Set(readBundles(manifest))
  const missing = []
  for (const name of names || []) {
    if (bundles.has(name)) continue
    let info = null
    try {
      info = resolvePackage(name)
    } catch {
      info = null
    }
    if (info && info.hasBundlePatch) missing.push(name)
  }
  return missing
}

/**
 * Append a `- id: X` / `disabled: true` row to a patch file, unless a row for
 * that id already exists anywhere in the file.
 *
 * Append-only on purpose: the user layer is a file a human also edits, and a
 * full YAML round-trip would reformat their comments away.
 */
export function appendDisableRow(text, id) {
  const body = typeof text === 'string' ? text : ''
  if (hasRowFor(body, id)) return { text: body, changed: false }
  const needsNewline = body.length > 0 && !body.endsWith('\n')
  const block = `${needsNewline ? '\n' : ''}\n# Disabled by dsh-boot-kit (delete these two lines to restore).\n- id: ${id}\n  disabled: true\n`
  return { text: body + block, changed: true }
}

export function hasRowFor(text, id) {
  return new RegExp(`^\\s*-\\s*id:\\s*${escapeRegExp(id)}\\s*$`, 'm').test(String(text || ''))
}

/**
 * Make sure `strictDepBuilds` is not left at pnpm 11's default (true), which
 * turns "unapproved dependency build script" into a hard error. Without this the
 * install exits non-zero and the bundle reconcile never runs.
 *
 * Never flips an explicit `true` to `false`: that is the user's choice, and the
 * caller reports it as a warning instead.
 */
export function ensureStrictDepBuildsFalse(text) {
  const body = typeof text === 'string' ? text : ''
  const existing = body.match(/^\s*strictDepBuilds\s*:\s*(\S+)\s*$/m)
  if (existing) {
    const value = existing[1].replace(/['"]/g, '').toLowerCase()
    if (value === 'false') return { text: body, changed: false, value: 'false' }
    return { text: body, changed: false, value: 'true', conflict: true }
  }
  const comment =
    '# pnpm 11 defaults strictDepBuilds to true, which makes an unapproved\n' +
    '# dependency build script a hard error. @linxin666/dsh-web-all pulls in\n' +
    '# native-build packages (ssh2 / cpu-features / cloudflared) that we do not\n' +
    '# build on purpose; without this the install aborts and the profile bundle\n' +
    '# list is never reconciled. See docs/pitfalls.md.\n'
  const needsNewline = body.length > 0 && !body.endsWith('\n')
  return {
    text: body + (needsNewline ? '\n' : '') + '\n' + comment + 'strictDepBuilds: false\n',
    changed: true,
    value: 'false',
  }
}

/**
 * Collect the loader entry ids a set of patch files *insert*, and report ids
 * inserted by more than one layer. Two layers inserting the same id leaves the
 * loader unable to start, with an error naming neither plugin.
 *
 * Only rows inside an `insert:` list count. A top-level `- id: X` row is an
 * override (config, `disabled: true`) and legitimately repeats an id that some
 * bundle already inserted — counting those would flag every profile that has
 * ever disabled a plugin, which is most of them.
 *
 * @param sources [{ name: string, text: string }]
 */
export function collectEntryIds(sources) {
  const owners = new Map()
  for (const source of sources || []) {
    const seen = new Set()
    let inInsert = false
    for (const line of String(source.text || '').split(/\r?\n/)) {
      const topLevel = /^-\s*(.*)$/.exec(line)
      if (topLevel) {
        inInsert = /^insert\s*:/.test(topLevel[1].trim())
        continue
      }
      if (!inInsert) continue
      const match = /^\s+-\s*id:\s*([A-Za-z0-9._@/-]+)\s*$/.exec(line)
      if (!match) continue
      const id = match[1]
      if (seen.has(id)) continue
      seen.add(id)
      if (!owners.has(id)) owners.set(id, [])
      owners.get(id).push(source.name)
    }
  }
  const ids = []
  const duplicates = []
  for (const [id, list] of owners) {
    ids.push({ id, owners: list })
    if (list.length > 1) duplicates.push({ id, owners: list })
  }
  return { ids, duplicates }
}

/** Minimal prerelease-aware semver compare, enough for `0.2.1-rc.3` shapes. */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ''] = String(v).trim().split('-', 2)
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
    const preNums = pre ? pre.split('.').map((p) => Number.parseInt(p, 10)) : []
    return { nums, pre, preNums }
  }
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const diff = (left.nums[i] || 0) - (right.nums[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  // A released version outranks any prerelease of the same core.
  if (left.pre === '' && right.pre !== '') return 1
  if (right.pre === '' && left.pre !== '') return -1
  if (left.pre === right.pre) return 0
  for (let i = 0; i < Math.max(left.preNums.length, right.preNums.length); i += 1) {
    const l = Number.isInteger(left.preNums[i]) ? left.preNums[i] : -1
    const r = Number.isInteger(right.preNums[i]) ? right.preNums[i] : -1
    if (l !== r) return l > r ? 1 : -1
  }
  return 0
}

/** Comment this installer writes in front of every row it disables. */
export const DISABLE_MARKER = '# Disabled by dsh-boot-kit'

/**
 * Drop `names` from `dsh.profile.bundles`, in place, and report what was there.
 *
 * Only the rows handed in are touched: other bundles may have been added by the
 * user or another installer, and a revert must not take them with it.
 */
export function removeBundleRows(manifest, names) {
  const wanted = new Set(names || [])
  const current = readBundles(manifest)
  const removed = current.filter((name) => wanted.has(name))
  if (removed.length > 0) {
    manifest.dsh.profile.bundles = current.filter((name) => !wanted.has(name))
  }
  return removed
}

/**
 * Remove the three lines (marker, `- id:`, `disabled: true`) this installer
 * wrote for one id.
 *
 * Contiguous match only. The row was written as one block, so if the user has
 * since moved or re-indented it, leaving it alone is the safe answer — the
 * caller reports "not found" instead of guessing at their file.
 */
export function removeDisableRow(text, id) {
  const lines = String(text || '').split('\n')
  const out = []
  let removed = false
  const rowPattern = new RegExp(`^-\\s*id:\\s*${escapeRegExp(id)}\\s*$`)
  for (let i = 0; i < lines.length; i += 1) {
    const isMarker = lines[i].trim().startsWith(DISABLE_MARKER)
    const isRow = lines[i + 1] !== undefined && rowPattern.test(lines[i + 1].trim())
    const isEnabled = lines[i + 2] !== undefined && /^\s+disabled:\s*true\s*$/.test(lines[i + 2])
    if (isMarker && isRow && isEnabled) {
      i += 2
      removed = true
      continue
    }
    out.push(lines[i])
  }
  return { text: out.join('\n'), removed }
}
