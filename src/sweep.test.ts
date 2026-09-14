import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  createSweep,
  GAP_MS,
  idleAfter,
  IDLE_FACTOR,
  MIN_IDLE_MS,
  nearestFirst,
  SLICE_MS,
  SweepHooks,
} from './sweep'
import {
  clipCellState,
  CLIP_ARMED,
  CLIP_EMPTY,
  CLIP_PLAYING,
  CLIP_RECORD_TRIGGERED,
  CLIP_RECORDING,
  CLIP_STOPPED,
  CLIP_TRIGGERED,
  NO_SLOT,
} from './clipState'

describe('nearestFirst', () => {
  it('covers every index exactly once', () => {
    for (const [n, lo, hi] of [
      [0, 0, 0],
      [1, 0, 1],
      [10, 3, 6],
      [10, 0, 10],
      [10, 8, 20],
      [10, -1, -1],
    ]) {
      const got = nearestFirst(n, lo, hi)
      expect([...got].sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, i) => i)
      )
    }
  })

  it('puts the window first, then alternates outward starting right', () => {
    expect(nearestFirst(10, 4, 6)).toEqual([4, 5, 6, 3, 7, 2, 8, 1, 9, 0])
  })

  it('keeps going on one side once the other is exhausted', () => {
    expect(nearestFirst(6, 0, 2)).toEqual([0, 1, 2, 3, 4, 5])
    expect(nearestFirst(6, 4, 6)).toEqual([4, 5, 3, 2, 1, 0])
  })

  it('degrades to ascending order before any window exists', () => {
    expect(nearestFirst(4, -1, -1)).toEqual([0, 1, 2, 3])
  })
})

describe('idleAfter', () => {
  it('never re-sweeps sooner than the floor', () => {
    expect(idleAfter(0)).toBe(MIN_IDLE_MS)
    expect(idleAfter(1)).toBe(MIN_IDLE_MS)
  })

  it('bounds the long-run duty cycle whatever the pass costs', () => {
    // The guarantee that makes the sweep safe on a huge set: however long a
    // pass works, the idle after it is at least IDLE_FACTOR times longer.
    for (const busy of [50, 400, 3000, 60000]) {
      const duty = busy / (busy + idleAfter(busy))
      expect(duty).toBeLessThanOrEqual(1 / (1 + IDLE_FACTOR) + 1e-9)
    }
  })
})

// A controllable clock + scheduler, so slicing can be asserted exactly.
function harness() {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const queue: { fn: () => void; at: number; cancelled: boolean }[] = []
  const schedule = (fn: () => void, ms: number) => {
    const job = { fn, at: now + ms, cancelled: false }
    queue.push(job)
    return {
      cancel() {
        job.cancelled = true
      },
    }
  }
  return {
    schedule,
    advance(ms: number) {
      now += ms
    },
    // Run the next live job, moving the clock to its time.
    runNext(): number | null {
      queue.sort((a, b) => a.at - b.at)
      while (queue.length) {
        const job = queue.shift()
        if (job.cancelled) continue
        const delay = job.at - now
        now = Math.max(now, job.at)
        job.fn()
        return delay
      }
      return null
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createSweep', () => {
  function counterHooks(
    h: ReturnType<typeof harness>,
    units: number,
    unitMs: number
  ) {
    let left = 0
    const flushes: boolean[] = []
    const hooks: SweepHooks = {
      begin: () => {
        left = units
        return true
      },
      step: () => {
        if (left === 0) return -1
        left--
        h.advance(unitMs)
        return 1
      },
      flush: (done) => flushes.push(done),
      repeat: () => false,
    }
    return { hooks, flushes }
  }

  it('yields after each slice and never works longer than one unit past it', () => {
    const h = harness()
    const { hooks, flushes } = counterHooks(h, 10, 1)
    const sweep = createSweep(hooks, h.schedule)
    sweep.start()
    h.runNext()
    // 1ms units against a SLICE_MS deadline: exactly SLICE_MS units per slice.
    expect(flushes).toEqual([false])
    const gap = h.runNext()
    expect(gap).toBe(GAP_MS)
    while (h.runNext() !== null);
    expect(flushes[flushes.length - 1]).toBe(true)
    expect(sweep.stats.lastUnits).toBe(10)
    expect(sweep.stats.lastBusyMs).toBe(10)
    expect(flushes.length).toBe(Math.ceil(10 / SLICE_MS))
  })

  it('does nothing when begin declines and no app is there', () => {
    const h = harness()
    const step = vi.fn(() => -1)
    const sweep = createSweep(
      { begin: () => false, step, flush: () => {}, repeat: () => false },
      h.schedule
    )
    sweep.start()
    h.runNext()
    expect(step).not.toHaveBeenCalled()
    expect(h.runNext()).toBeNull()
  })

  it('retries a declined pass while an app is there', () => {
    // The connect refresh can run before the handshake that carries the app's
    // capabilities; a pass declined then must not be abandoned for good.
    const h = harness()
    let capable = false
    const step = vi.fn(() => -1)
    const sweep = createSweep(
      { begin: () => capable, step, flush: () => {}, repeat: () => true },
      h.schedule
    )
    sweep.start()
    h.runNext()
    expect(step).not.toHaveBeenCalled()
    capable = true
    expect(h.runNext()).toBe(MIN_IDLE_MS)
    expect(step).toHaveBeenCalled()
  })

  it('schedules the repeat pass after an idle proportional to the busy time', () => {
    const h = harness()
    const { hooks } = counterHooks(h, 3, 2)
    let begins = 0
    const sweep = createSweep(
      {
        ...hooks,
        begin: () => {
          begins++
          return hooks.begin()
        },
        repeat: () => begins < 2,
      },
      h.schedule
    )
    sweep.start()
    while (sweep.stats.passes === 0) h.runNext()
    expect(sweep.stats.lastIdleMs).toBe(idleAfter(6))
    expect(h.runNext()).toBe(idleAfter(6))
    expect(begins).toBe(2)
  })

  it('start() abandons a pass in progress and begins a fresh one', () => {
    const h = harness()
    const { hooks } = counterHooks(h, 100, 1)
    const begin = vi.fn(hooks.begin)
    const sweep = createSweep({ ...hooks, begin }, h.schedule)
    sweep.start()
    h.runNext()
    sweep.start()
    h.runNext()
    expect(begin).toHaveBeenCalledTimes(2)
  })
})

describe('clipCellState', () => {
  const row = 3

  it('empty slots', () => {
    expect(clipCellState(false, false, row, NO_SLOT, NO_SLOT, false)).toBe(
      CLIP_EMPTY
    )
    expect(clipCellState(false, false, row, NO_SLOT, NO_SLOT, true)).toBe(
      CLIP_ARMED
    )
    expect(clipCellState(false, false, row, NO_SLOT, row, true)).toBe(
      CLIP_RECORD_TRIGGERED
    )
  })

  it('slots with a clip', () => {
    expect(clipCellState(true, false, row, NO_SLOT, NO_SLOT, false)).toBe(
      CLIP_STOPPED
    )
    expect(clipCellState(true, false, row, row, NO_SLOT, false)).toBe(
      CLIP_PLAYING
    )
    expect(clipCellState(true, false, row, row, row, false)).toBe(
      CLIP_TRIGGERED
    )
    expect(clipCellState(true, true, row, row, row, false)).toBe(CLIP_RECORDING)
  })

  it('a pending stop (-2) never marks a row as fired', () => {
    expect(clipCellState(true, false, row, row, -2, false)).toBe(CLIP_PLAYING)
  })
})
