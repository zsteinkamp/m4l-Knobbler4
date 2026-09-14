// Background prefetch: walk the parts of a large set that are NOT on screen,
// reading their state directly (no observers), and hand it to the app in small
// batches so a scroll paints from a warm cache instead of waiting for a
// /mixerView or /clipView round trip.
//
// This file holds only the scheduling and ordering, shared by k4-multiMixer and
// k4-clipView. It has no LiveAPI in it, so the policy is unit-testable.
//
// COST MODEL — the thing to protect is Live's main thread. LiveAPI reads run
// there (not on the audio thread), so an unbounded sweep would not drop audio
// but WOULD make Live's UI and Max's scheduler sluggish. Three bounds:
//
//   1. A pass runs in slices of at most SLICE_MS, then yields GAP_MS to the
//      scheduler. The deadline is checked after every unit (one strip, one clip
//      slot), so a slice overshoots by at most one unit. While a pass is running
//      it can hold at most SLICE_MS / (SLICE_MS + GAP_MS) of the thread.
//   2. Full passes happen only when the app's cache is known to be invalid: on
//      connect/refresh and on a track or scene structure change.
//   3. Repeat passes (which pick up changes made off-screen, e.g. from a Push)
//      wait IDLE_FACTOR times the previous pass's measured busy time, and never
//      less than MIN_IDLE_MS. The long-run average is therefore at most
//      1 / (1 + IDLE_FACTOR) of one thread REGARDLESS OF SET SIZE — a bigger set
//      simply re-sweeps less often. They also stop when the app stops pinging.
//
// Every pass records its own busy time; /debug/prefetch reports it, so the cost
// is a measured number for a real set rather than an estimate.

export const CAPABILITY_PREFETCH = 'pre'

export const SLICE_MS = 4
export const GAP_MS = 20
export const MIN_IDLE_MS = 5000
export const IDLE_FACTOR = 20
// Batches are sent at most this often. Each batch costs the app a commit (the
// clip grid re-serializes the whole matrix per message), so fewer, larger
// batches are cheaper there than a stream of tiny ones.
export const FLUSH_MS = 250

// All of [0, n), with the window [lo, hi) first and then alternating outward
// (right, left, right, …) — so the strips a scroll is most likely to reveal next
// are read first. A window outside the list (e.g. -1 before a page has ever
// opened) degrades to plain ascending order.
export function nearestFirst(n: number, lo: number, hi: number): number[] {
  const out: number[] = []
  if (n <= 0) return out
  const start = Math.min(Math.max(lo, 0), n)
  const end = Math.min(Math.max(hi, start), n)
  for (let i = start; i < end; i++) out.push(i)
  let right = end
  let left = start - 1
  while (right < n || left >= 0) {
    if (right < n) out.push(right++)
    if (left >= 0) out.push(left--)
  }
  return out
}

// Idle time before the next repeat pass, given how long the last one worked.
export function idleAfter(busyMs: number): number {
  return Math.max(MIN_IDLE_MS, busyMs * IDLE_FACTOR)
}

export type SweepStats = {
  passes: number // passes completed since load
  lastBusyMs: number // time spent inside step() during the last full pass
  lastWallMs: number // wall-clock time the last pass took, gaps included
  lastUnits: number // units read by the last pass
  lastSent: number // units that had changed and were sent
  lastIdleMs: number // idle scheduled after the last pass
}

export type SweepHooks = {
  // Prepare a pass. Return false to skip it (e.g. the app can't use prefetch).
  begin(): boolean
  // Do ONE unit of work. Return 1 if a unit was read, 0 if it was skipped
  // cheaply (e.g. already on screen), or -1 when the pass is finished.
  step(): number
  // Called at the end of every slice; `done` on the final one.
  flush(done: boolean): void
  // After a pass: schedule another one?
  repeat(): boolean
}

export type Sweep = {
  // Start a pass now, abandoning any pass in progress.
  start(): void
  stop(): void
  stats: SweepStats
  // Count a unit that was sent (for stats); called from the module's step.
  noteSent(): void
}

// `schedule` is injected so the policy can be tested without Max's Task.
export function createSweep(
  hooks: SweepHooks,
  schedule: (fn: () => void, ms: number) => { cancel(): void }
): Sweep {
  const stats: SweepStats = {
    passes: 0,
    lastBusyMs: 0,
    lastWallMs: 0,
    lastUnits: 0,
    lastSent: 0,
    lastIdleMs: 0,
  }
  let pending: { cancel(): void } = null
  let fresh = true
  let passStart = 0
  let busy = 0
  let units = 0
  let sent = 0

  function next(ms: number) {
    pending = schedule(tick, ms)
  }

  function tick() {
    pending = null
    if (fresh) {
      fresh = false
      if (!hooks.begin()) {
        // Declined — typically because the app's capabilities haven't reached
        // us yet: the connect refresh can run before the handshake that carries
        // them. Check again later rather than never, while an app is there.
        if (hooks.repeat()) {
          fresh = true
          next(MIN_IDLE_MS)
        }
        return
      }
      passStart = Date.now()
      busy = 0
      units = 0
      sent = 0
    }
    const t0 = Date.now()
    const deadline = t0 + SLICE_MS
    let done = false
    do {
      const r = hooks.step()
      if (r < 0) {
        done = true
        break
      }
      units += r
    } while (Date.now() < deadline)
    busy += Date.now() - t0
    hooks.flush(done)
    if (!done) {
      next(GAP_MS)
      return
    }
    stats.passes++
    stats.lastBusyMs = busy
    stats.lastWallMs = Date.now() - passStart
    stats.lastUnits = units
    stats.lastSent = sent
    stats.lastIdleMs = 0
    if (hooks.repeat()) {
      stats.lastIdleMs = idleAfter(busy)
      fresh = true
      next(stats.lastIdleMs)
    }
  }

  return {
    stats,
    start() {
      if (pending) pending.cancel()
      fresh = true
      next(0)
    },
    stop() {
      if (pending) pending.cancel()
      pending = null
    },
    noteSent() {
      sent++
    },
  }
}

// Max's Task, wrapped to the shape createSweep wants. One Task per sweep,
// re-scheduled rather than re-created.
export function maxScheduler(): (
  fn: () => void,
  ms: number
) => { cancel(): void } {
  let task: MaxTask = null
  let current: () => void = null
  const handle = {
    cancel() {
      if (task) task.cancel()
    },
  }
  return function (fn: () => void, ms: number) {
    current = fn
    if (!task) {
      task = new Task(function () {
        current()
      }) as MaxTask
    }
    task.cancel()
    task.schedule(ms)
    return handle
  }
}
