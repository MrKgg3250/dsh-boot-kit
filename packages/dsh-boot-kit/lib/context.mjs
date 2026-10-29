/**
 * Locating the profile, the DSH CLI, and whatever is currently running.
 *
 * Nothing here writes. Every path is resolved once at startup so the steps can
 * stay free of environment lookups.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function resolvePaths({ dshHome, profile }) {
  const home = dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const name = profile || process.env.DSH_PROFILE || 'desktop'
  const profileDir = path.join(home, 'profiles', name)
  return {
    dshHome: home,
    profile: name,
    profileDir,
    manifestPath: path.join(profileDir, 'package.json'),
    workspaceYamlPath: path.join(profileDir, 'pnpm-workspace.yaml'),
    userPatchPath: path.join(profileDir, 'cordis.patch.yml'),
    pluginsDir: path.join(home, 'plugins'),
    nodeModules: path.join(profileDir, 'node_modules'),
  }
}

export function readJson(file, fallback = null) {
  try {
    const text = readText(file, '')
    if (!text) return fallback
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/**
 * Read as UTF-8 and drop a byte-order mark.
 *
 * JSON.parse rejects a leading U+FEFF outright, and editors on Windows add one
 * by accident (`Set-Content -Encoding utf8` does it every time). A profile whose
 * package.json was ever re-saved that way would otherwise be reported as
 * unreadable and the installer would refuse to run.
 */
export function readText(file, fallback = '') {
  try {
    return readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return fallback
  }
}

export function writeText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
}

export function writeJson(file, value) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** Does this installed package declare a bundle patch? */
export function inspectPackage(nodeModules, name) {
  const dir = path.join(nodeModules, ...name.split('/'))
  const manifest = readJson(path.join(dir, 'package.json'), null)
  if (!manifest) return null
  const patch = manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch
  return { dir, manifest, hasBundlePatch: Boolean(patch), patchRel: patch || null }
}

/**
 * Run a command and capture its output.
 *
 * `shell: true` on Windows: the `dsh` entry point is `dsh.cmd`, which is not
 * executable without a shell. Arguments are quoted by hand for the same reason.
 */
export function runCapture(command, args = [], options = {}) {
  const isWin = process.platform === 'win32'
  const quote = (value) => (isWin && /\s/.test(value) ? `"${value}"` : value)
  const line = [command, ...args].map(quote).join(' ')
  return new Promise((resolve) => {
    execFile(
      line,
      { shell: true, windowsHide: true, encoding: 'utf8', timeout: options.timeoutMs || 240000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout: stdout || '',
          stderr: stderr || '',
        })
      },
    )
  })
}

export async function detectDshVersion(cli) {
  const result = await runCapture(cli, ['--version'], { timeoutMs: 30000 })
  const text = `${result.stdout}\n${result.stderr}`
  const match = text.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/)
  return match ? match[1] : null
}

/**
 * Is the desktop app holding the profile? Only detectable on Windows, where the
 * app is a known image name. Returns null when we cannot tell, and the caller
 * says so rather than pretending to know.
 */
export async function detectDesktopApp() {
  if (process.platform !== 'win32') return null
  const result = await runCapture('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/NH'], { timeoutMs: 15000 })
  if (!result.ok) return null
  return /DeepSeek Harness\.exe/i.test(result.stdout)
}

export function exists(file) {
  return existsSync(file)
}
