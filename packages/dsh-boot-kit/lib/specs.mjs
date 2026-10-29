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

/**
 * @param {object} options
 * @param {'minimal'|'boot'|'full'} options.tier
 * @param {'npm'|'local'} options.source   how to resolve our own plugin
 * @param {string} [options.repoRoot]      required when source === 'local'
 * @param {boolean} [options.withWidget]
 */
export function planFor({ tier, source = 'npm', repoRoot, withWidget = false }) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier: ${tier}`)

  const npm = []
  const github = []
  const local = []

  const pluginSpec =
    source === 'local'
      ? `${repoRoot.replace(/\\/g, '/')}/packages/dsh-skin-boot-sync`
      : SKIN_BOOT_SYNC.name
  if (source === 'local') local.push(pluginSpec)
  else npm.push(pluginSpec)

  if (tier === 'boot' || tier === 'full') github.push(STARTUP_SCREEN)
  if (tier === 'full') npm.push(WEB_ALL)
  if (withWidget) npm.push(WHALE_WIDGET)

  return {
    tier,
    source,
    npm,
    github,
    local,
    disables: DEFAULT_DISABLES,
  }
}
