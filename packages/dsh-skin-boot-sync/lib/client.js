/**
 * dsh-skin-boot-sync — browser half.
 *
 * The problem: a skin's `backgroundMedia` is rendered by the skin center as a
 * `<video autoplay loop muted>`. It starts playing the moment the page loads,
 * while the startup animation still covers the app for several seconds (and,
 * when the startup screen is interactive, for as long as the user takes to
 * confirm). By the time the curtain lifts the clip is already mid-loop, so it
 * looks like the wallpaper never started.
 *
 * The fix: when the curtain lifts, rewind the background video to frame 0 and
 * keep playing. That is the same visible result as clicking "try on" in the
 * skin center, which gets it for free by rebuilding the media element.
 *
 * Two things this file must NOT do:
 *
 *  1. Decide "is there a startup animation?" inside apply(). The client bundle
 *     and `/dsh-startup/splash.js` have no defined load order — measured on
 *     DSH 0.2.1-rc.3 the bundle ran *before* the splash node existed, so an
 *     apply-time check silently disabled the whole plugin. Observe instead:
 *     wait until the splash is seen, then wait until it goes away.
 *  2. Touch anything when no splash ever appears. A normal page reload then
 *     behaves exactly as it did before this plugin was installed.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skin-boot-sync',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    /** Splash overlay node id, owned by dsh-startup-screen. */
    var SPLASH_ID = 'dsh-startup-root'
    /** Dispatched on window right after that node is removed. */
    var DONE_EVENT = 'dsh-startup:done'
    /** Decoration layer the skin center paints background media into. */
    var BG_VIDEO = '[data-dsh-skin-layer="background"] video'
    /** How long to keep looking for a splash before concluding there is none. */
    var DISCOVERY_MS = 60000
    /** Re-check window after the curtain, for seeks that were ignored. */
    var RETRY_MS = 400

    /**
     * Background videos. Prefers the skin layer's structural marker; falls back
     * to "src points at the skin-center asset route", so a renamed layer
     * attribute degrades instead of silently doing nothing.
     */
    function backgroundVideos() {
      var strict = []
      try { strict = Array.prototype.slice.call(document.querySelectorAll(BG_VIDEO)) } catch (e) {}
      if (strict.length > 0) return strict

      var all = []
      try { all = Array.prototype.slice.call(document.querySelectorAll('video')) } catch (e) {}
      return all.filter(function (video) {
        var src = ''
        try { src = video.currentSrc || video.src || '' } catch (e) {}
        return src.indexOf('/skin-center/') !== -1
      })
    }

    /** Rewind to frame 0 and keep playing. Never lets a failure escape. */
    function rewind(force) {
      var videos = backgroundVideos()
      for (var i = 0; i < videos.length; i++) {
        var video = videos[i]
        try {
          if (force || video.currentTime > 0) video.currentTime = 0
        } catch (e) { /* metadata not ready yet; playback starts at 0 anyway */ }
        try {
          var playing = video.play()
          if (playing && typeof playing.then === 'function') {
            playing.then(null, function () { /* autoplay refused */ })
          }
        } catch (e) { /* noop */ }
      }
      return videos.length
    }

    function apply(_ctx) {
      var seenSplash = false
      var finished = false
      var pollTimer = null

      function isSplashUp() {
        try { return !!document.getElementById(SPLASH_ID) } catch (e) { return false }
      }

      function cleanup() {
        if (pollTimer) { window.clearTimeout(pollTimer); pollTimer = null }
        window.removeEventListener(DONE_EVENT, finish)
      }

      function finish() {
        if (finished) return
        finished = true
        cleanup()
        rewind(true)
        // If the element was not ready at curtain time the seek can be dropped
        // on the floor. Look once more, and only rewind when it really did not
        // take — a second jump back would be visible.
        window.setTimeout(function () {
          var videos = backgroundVideos()
          for (var i = 0; i < videos.length; i++) {
            var t = NaN
            try { t = videos[i].currentTime } catch (e) { continue }
            if (t > 1) { rewind(true); return }
          }
        }, RETRY_MS)
      }

      window.addEventListener(DONE_EVENT, finish)

      // Observe the overlay: its appearance means "there is a startup animation
      // this time", its disappearance is the reveal. If it never shows up, this
      // plugin stays completely out of the way.
      var startedAt = Date.now()
      function poll() {
        pollTimer = null
        if (finished) return
        if (isSplashUp()) {
          seenSplash = true
        } else if (seenSplash) {
          finish()
          return
        } else if (Date.now() - startedAt > DISCOVERY_MS) {
          cleanup()
          return
        }
        pollTimer = window.setTimeout(poll, 100)
      }
      poll()
    }

    exports.inject = []
    exports.apply = apply
    return module.exports
  }
})
