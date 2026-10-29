/**
 * What the kit installs, per tier, and what it turns off afterwards.
 *
 * Third-party packages are referenced, never vendored: see NOTICE. Skins are
 * not referenced at all — the user installs those from the DSH skin center.
 */

/** The DSH build this kit was developed and tested against. */
export const TESTED_DSH = '0.2.1-rc.3'
/** Refuse to run below this. */
export const MIN_DSH = '0.2.1-rc.3'

export const SKIN_BOOT_SYNC = {
  name: 'dsh-skin-boot-sync',
  version: '1.0.0',
  repo: 'MrKgg3250/dsh-boot-kit',
  /**
   * The plugin ships as a GitHub Release tarball, not on npm: the author's
   * region cannot reach the npm publish endpoint, and `dsh plugin add <url>`
   * needs nothing from the registry anyway (the package is zero-dependency).
   * Version-pinned for the same reason as STARTUP_SCREEN.
   */
  url: 'https://github.com/MrKgg3250/dsh-boot-kit/releases/download/v1.0.0/dsh-skin-boot-sync-1.0.0.tgz',
}

/**
 * Not on npm — GitHub Releases only. Pinned, because the tarball is fetched at
 * install time and an unpinned URL would make installs irreproducible.
 */
export const STARTUP_SCREEN = {
  name: 'dsh-startup-screen',
  version: '1.2.0',
  repo: '6shenhonghong9/dsh-startup-screen',
  asset: 'dsh-startup-screen-1.2.0.tgz',
  url: 'https://github.com/6shenhonghong9/dsh-startup-screen/releases/download/v1.2.0/dsh-startup-screen-1.2.0.tgz',
}

export const WEB_ALL = '@linxin666/dsh-web-all'

/** Installed only on request; disabled by default, because it nags. */
export const WHALE_WIDGET = 'dsh-whale-widget'

/**
 * Rows this kit switches off, and why. Applied only when the owning package is
 * actually installed — writing a `disabled: true` row for an id that no layer
 * inserts is how a profile ends up with a row nothing owns.
 */
export const DEFAULT_DISABLES = [
  {
    id: 'web-ui-pet',
    pkg: '@linxin666/dsh-pet',
    why: 'desktop pet parked in the bottom-right corner',
  },
  {
    id: 'dsh-whale-widget',
    pkg: WHALE_WIDGET,
    why: 'floating balance widget, and a "balance is low" bubble on every start',
  },
]

export const TIERS = ['minimal', 'boot', 'full']

/** Where the kit's own plugin can come from; see planFor. */
export const SOURCES = ['release', 'npm', 'local']

/**
 * Where the kit's own plugin comes from.
 *
 * 'release' is the default because the author cannot publish to npm from their
 * region — and clients do not need the registry for it either: the tarball is
 * zero-dependency, so `dsh plugin add <url>` works with no npm access at all.
 * 'npm' stays available for when that changes.
 *
 * @param {object} options
 * @param {'minimal'|'boot'|'full'} options.tier
 * @param {'release'|'npm'|'local'} options.source  how to resolve our own plugin
 * @param {string} [options.repoRoot]      required when source === 'local'
 * @param {boolean} [options.withWidget]
 */
export function planFor({ tier, source = 'release', repoRoot, withWidget = false }) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier: ${tier}`)
  // Silently falling back on a typo ("nmp") would route the plugin through the
  // wrong channel; fail loudly instead.
  if (!SOURCES.includes(source)) throw new Error(`unknown source: ${source}`)

  const npm = []
  const github = []
  const local = []
  const release = []

  if (source === 'local') {
    local.push(`${repoRoot.replace(/\\/g, '/')}/packages/dsh-skin-boot-sync`)
  } else if (source === 'npm') {
    npm.push(SKIN_BOOT_SYNC.name)
  } else {
    release.push(SKIN_BOOT_SYNC.url)
  }

  if (tier === 'boot' || tier === 'full') github.push(STARTUP_SCREEN)
  if (tier === 'full') npm.push(WEB_ALL)
  if (withWidget) npm.push(WHALE_WIDGET)

  return {
    tier,
    source,
    npm,
    github,
    local,
    release,
    disables: DEFAULT_DISABLES,
  }
}
