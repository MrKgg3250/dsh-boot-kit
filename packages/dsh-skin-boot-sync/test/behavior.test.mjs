// Behavioural tests for the browser half, without a browser and without jsdom.
//
// The module under test only touches: getElementById, querySelectorAll,
// addEventListener/removeEventListener, window.setTimeout/clearTimeout,
// Date.now, and video.currentTime / video.play. All of those are stubbed, and
// time is driven by a manual clock so the reveal sequence is deterministic.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function makeClock() {
  let now = 0
  let seq = 1
  const timers = []
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = seq++
      timers.push({ id, at: now + (ms || 0), fn })
      return id
    },
    clearTimeout(id) {
      const i = timers.findIndex((t) => t.id === id)
      if (i !== -1) timers.splice(i, 1)
    },
    advance(ms) {
      const target = now + ms
      for (;;) {
        let due = null
        for (const t of timers) {
          if (t.at <= target && (!due || t.at < due.at || (t.at === due.at && t.id < due.id))) due = t
        }
        if (!due) break
        now = due.at
        timers.splice(timers.indexOf(due), 1)
        due.fn()
      }
      now = target
    },
    pending: () => timers.length,
  }
}

function makeVideo(opts = {}) {
  let t = opts.at || 0
  let ignoreSeeks = opts.ignoreSeeks || 0
  const video = {
    played: 0,
    src: opts.src || 'http://127.0.0.1:56487/api/skin-center/v2/skins/whale-fantasy/assets/x.mp4',
    play() { this.played += 1; return Promise.resolve() },
  }
  Object.defineProperty(video, 'currentTime', {
    get() { return t },
    set(v) {
      // Simulates a seek dropped because the element was not ready yet.
      if (ignoreSeeks > 0) { ignoreSeeks -= 1; return }
      t = v
    },
  })
  return video
}

function boot(opts = {}) {
  const clock = makeClock()
  const state = {
    splash: !!opts.splashAtStart,
    layerSelectorWorks: opts.layerSelectorWorks !== false,
  }
  const videos = opts.videos || []
  const listeners = new Map()

  const win = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || []
      const i = arr.indexOf(fn)
      if (i !== -1) arr.splice(i, 1)
    },
    dispatch(type) {
      ;(listeners.get(type) || []).slice().forEach((fn) => fn({ type }))
    },
  }

  const document = {
    getElementById: (id) => (id === 'dsh-startup-root' && state.splash ? { id } : null),
    querySelectorAll(sel) {
      if (sel === '[data-dsh-skin-layer="background"] video') {
        return state.layerSelectorWorks ? videos : []
      }
      if (sel === 'video') return videos
      return []
    },
  }

  win.__ModuleLoader__ = {
    load(spec) {
      const exported = spec.factory(() => ({}))
      win.__pluginId = spec.id
      if (typeof exported.apply === 'function') exported.apply({})
    },
  }

  const context = vm.createContext({
    window: win,
    document,
    Date: { now: () => clock.now() },
    Promise,
    Array,
    console,
  })
  vm.runInContext(SRC, context)
  return { clock, state, videos, win }
}

test('registers under its own loader id', () => {
  const env = boot({ splashAtStart: true })
  assert.equal(env.win.__pluginId, 'dsh-skin-boot-sync')
})

test('rewinds when the bundle runs BEFORE the splash exists (the v1 bug)', () => {
  const env = boot({ splashAtStart: false, videos: [makeVideo({ at: 8.4 })] })
  assert.equal(env.videos[0].currentTime, 8.4)

  env.state.splash = true
  env.clock.advance(200)
  assert.equal(env.videos[0].currentTime, 8.4, 'covered window must not be touched')

  env.state.splash = false
  env.clock.advance(150)
  assert.equal(env.videos[0].currentTime, 0)
  assert.equal(env.videos[0].played, 1)
})

test('rewinds when the reveal event fires', () => {
  const env = boot({ splashAtStart: true, videos: [makeVideo({ at: 13.2 })] })
  env.win.dispatch('dsh-startup:done')
  assert.equal(env.videos[0].currentTime, 0)
  assert.equal(env.videos[0].played, 1)
})

test('stays out of the way when no splash ever appears', () => {
  const env = boot({ splashAtStart: false, videos: [makeVideo({ at: 7.7 })] })
  env.clock.advance(120000)
  assert.equal(env.videos[0].currentTime, 7.7)
  assert.equal(env.videos[0].played, 0)
  assert.equal(env.clock.pending(), 0, 'poller must stop itself')
})

test('duplicate reveal events are idempotent', () => {
  const env = boot({ splashAtStart: true, videos: [makeVideo({ at: 3.3 })] })
  env.win.dispatch('dsh-startup:done')
  env.clock.advance(1000)
  const played = env.videos[0].played
  env.win.dispatch('dsh-startup:done')
  assert.equal(env.videos[0].played, played)
})

test('a dropped first seek is retried once', () => {
  const env = boot({ splashAtStart: true, videos: [makeVideo({ at: 21.5, ignoreSeeks: 1 })] })
  env.win.dispatch('dsh-startup:done')
  assert.equal(env.videos[0].currentTime, 21.5, 'precondition: seek was dropped')
  env.clock.advance(500)
  assert.equal(env.videos[0].currentTime, 0)
})

test('falls back to the asset route when the layer marker is missing', () => {
  const env = boot({
    splashAtStart: true,
    layerSelectorWorks: false,
    videos: [makeVideo({ at: 11 })],
  })
  env.win.dispatch('dsh-startup:done')
  assert.equal(env.videos[0].currentTime, 0)
})

test('no background video at reveal time is not an error', () => {
  const env = boot({ splashAtStart: true, videos: [] })
  assert.doesNotThrow(() => {
    env.win.dispatch('dsh-startup:done')
    env.clock.advance(1000)
  })
})
