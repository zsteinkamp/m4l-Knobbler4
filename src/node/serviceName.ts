// Pure helpers for k4-advertise, split out so they can be unit-tested without
// a D-Bus connection or the Node for Max runtime.

// DNS-SD instance names are at most 63 bytes (RFC 6763 §4.1.1).
const MAX_NAME_BYTES = 63

// Same shape as the desktop device's [zero.announce] name
// (`sprintf name "%s - Knobbler4 Device :%s"` fed by [gestalt]), so a Push
// lists in the app exactly like a computer does. The app keys its rows on a
// name containing "Knobbler", so that part must survive any truncation: only
// the host is shortened.
export function serviceName(host: string, port: number): string {
  const suffix = ` - Knobbler4 Device :${port}`
  let h = host.trim() || 'Push'
  while (h.length > 1 && Buffer.byteLength(h + suffix) > MAX_NAME_BYTES) {
    h = h.slice(0, -1)
  }
  return h + suffix
}

// A port from a Max message: an integer in 1..65535, else null.
export function parsePort(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n)) return null
  return n >= 1 && n <= 65535 ? n : null
}
