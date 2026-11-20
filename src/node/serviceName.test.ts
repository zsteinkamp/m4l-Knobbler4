import { describe, expect, it } from 'vitest'
import { parsePort, serviceName } from './serviceName'

describe('serviceName', () => {
  it('matches the desktop device name format', () => {
    expect(serviceName('push', 2346)).toBe('push - Knobbler4 Device :2346')
  })

  it('falls back to Push for an empty host', () => {
    expect(serviceName('  ', 2346)).toBe('Push - Knobbler4 Device :2346')
  })

  it('truncates the host, never the Knobbler part, to fit 63 bytes', () => {
    const name = serviceName('x'.repeat(100), 65535)
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63)
    expect(name.endsWith(' - Knobbler4 Device :65535')).toBe(true)
  })
})

describe('parsePort', () => {
  it('accepts integers and numeric strings in range', () => {
    expect(parsePort(2346)).toBe(2346)
    expect(parsePort('2399')).toBe(2399)
  })

  it('rejects anything else', () => {
    expect(parsePort(0)).toBeNull()
    expect(parsePort(65536)).toBeNull()
    expect(parsePort(23.5)).toBeNull()
    expect(parsePort('abc')).toBeNull()
    expect(parsePort(undefined)).toBeNull()
  })
})
