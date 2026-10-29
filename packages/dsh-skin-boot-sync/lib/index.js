/**
 * dsh-skin-boot-sync — host half.
 *
 * Intentionally empty. This plugin has no server-side behaviour: it needs a
 * loader row only so that its `dsh.client` half is assembled into the web
 * bundle. A no-op host half cannot fail at boot, which is the point.
 */
function apply(_ctx) {}

export { apply }
