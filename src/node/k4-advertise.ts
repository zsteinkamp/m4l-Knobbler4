// Bonjour advertisement for Push 3 Standalone, run by [node.script].
//
// The desktop device announces itself with the zero.* externals, which don't
// exist on the Push, so the app's discovery list never showed one. The Push
// does run avahi-daemon, and avahi's D-Bus API lets ANY user publish a service
// (its policy denies only SetHostName), so Live's unprivileged `ableton` user
// can do from here what it can't do by writing /etc/avahi/services (root-owned).
//
// An avahi entry group belongs to the D-Bus connection that created it, and
// avahi withdraws it when that connection closes. This process lives exactly
// as long as the device, so the advertisement does too: unload the device or
// switch sets and the Push leaves the app's list with no cleanup code here.
//
// Messages in (the same `port N` the desktop device's [zero.announce] gets):
//   port <n>   publish, or re-publish on a new port
//
// Built by `yarn build:node` into Project/k4-advertise.js (one bundled file, so
// the frozen device needs no node_modules). Outside Max (e.g. over SSH on the
// Push) it runs standalone: `node k4-advertise.js <port>`.

import * as os from 'os'
import * as dbus from 'dbus-next'
import { parsePort, serviceName } from './serviceName'

type MaxApi = {
  addHandler: (msg: string, fn: (...args: unknown[]) => void) => void
  post: (...args: unknown[]) => void
  outlet: (...args: unknown[]) => Promise<void>
}

let maxApi: MaxApi | null = null
try {
  // Provided by Node for Max at runtime; absent when run standalone.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  maxApi = require('max-api')
} catch (_) {
  maxApi = null
}

const log = (...args: unknown[]) =>
  maxApi ? maxApi.post('k4-advertise:', ...args) : console.log(...args)

const AVAHI = 'org.freedesktop.Avahi'
const IF_UNSPEC = -1
const PROTO_UNSPEC = -1
const SERVICE_TYPE = '_osc._udp'

// org.freedesktop.Avahi.EntryGroup states
const GROUP_ESTABLISHED = 2
const GROUP_COLLISION = 3
const GROUP_FAILURE = 4

const COLLISION_ERROR = 'org.freedesktop.Avahi.CollisionError'
// Bounds the rename loop; real collisions need one or two.
const MAX_RENAMES = 10

let port: number | null = null
// Set when avahi reports a name collision (another Push with the same host
// name on the LAN); cleared on a port change, which changes the name anyway.
let alternativeName: string | null = null
let bus: dbus.MessageBus | null = null
let server: dbus.ClientInterface | null = null
let group: dbus.ClientInterface | null = null

// Every D-Bus operation goes through one queue: a burst of port messages, a
// collision and an avahi restart can otherwise interleave Reset/AddService/
// Commit on the same group.
let queue: Promise<void> = Promise.resolve()
function schedule(fn: () => Promise<void>) {
  queue = queue.then(fn).catch((e: Error) => log('error:', e && e.message))
}

function currentName(): string {
  return alternativeName || serviceName(os.hostname(), port as number)
}

async function connect(): Promise<boolean> {
  if (server) return true
  if (!bus) {
    try {
      bus = dbus.systemBus()
    } catch (e) {
      log('no system D-Bus, not advertising:', (e as Error).message)
      return false
    }
    // Without a listener a missing socket (macOS, Windows) throws out of the
    // process. Log it once and stay idle: there is nothing to advertise to.
    bus.on('error', (e: Error) => {
      log('system D-Bus unavailable, not advertising:', e.message)
      bus = null
      server = null
      group = null
    })
    const dbusObj = await bus.getProxyObject(
      'org.freedesktop.DBus',
      '/org/freedesktop/DBus'
    )
    const dbusIface = dbusObj.getInterface('org.freedesktop.DBus')
    // avahi-daemon restarted: our group died with the old daemon.
    dbusIface.on(
      'NameOwnerChanged',
      (name: string, _old: string, owner: string) => {
        if (name !== AVAHI) return
        server = null
        group = null
        if (owner) {
          log('avahi restarted, re-publishing')
          schedule(publish)
        }
      }
    )
  }
  try {
    const serverObj = await bus.getProxyObject(AVAHI, '/')
    server = serverObj.getInterface('org.freedesktop.Avahi.Server')
    return true
  } catch (e) {
    // avahi isn't running yet; NameOwnerChanged will call us when it is.
    log('avahi not available yet:', (e as Error).message)
    return false
  }
}

async function publish(): Promise<void> {
  if (port == null) return
  if (!(await connect())) return
  if (!group) {
    const path: string = await server.EntryGroupNew()
    const groupObj = await bus.getProxyObject(AVAHI, path)
    const g = groupObj.getInterface('org.freedesktop.Avahi.EntryGroup')
    g.on('StateChanged', (state: number, error: string) => {
      if (g !== group) return
      if (state === GROUP_ESTABLISHED) {
        log(`advertising "${currentName()}" (${SERVICE_TYPE} port ${port})`)
      } else if (state === GROUP_COLLISION) {
        // Another host on the LAN already has this name.
        schedule(async () => {
          await rename()
          await publish()
        })
      } else if (state === GROUP_FAILURE) {
        log('avahi failed to publish:', error)
      }
    })
    group = g
  } else {
    await group.Reset()
  }
  // A clash with a name already registered on THIS daemon (verified on the
  // Push: a static /etc/avahi/services entry of the same name) is not a
  // StateChanged collision: AddService itself fails with CollisionError.
  for (let attempt = 0; ; attempt++) {
    try {
      // AddService(interface, protocol, flags, name, type, domain, host, port, txt)
      await group.AddService(
        IF_UNSPEC,
        PROTO_UNSPEC,
        0,
        currentName(),
        SERVICE_TYPE,
        '',
        '',
        port,
        []
      )
      break
    } catch (e) {
      const type = (e as { type?: string }).type
      if (type !== COLLISION_ERROR || attempt >= MAX_RENAMES) throw e
      await rename()
    }
  }
  await group.Commit()
}

// avahi's own scheme: "name" -> "name #2" -> "name #3" ...
async function rename(): Promise<void> {
  alternativeName = await server.GetAlternativeServiceName(currentName())
  log('name in use, renaming to', alternativeName)
}

// Turning the Device Port encoder sends a port per step. Re-registering on each
// one tripped avahi's rate limit (2346 -> 2363 left the Push unlisted for about a
// minute), so publish only once the value has settled.
const PORT_SETTLE_MS = 500
let pendingPort: ReturnType<typeof setTimeout> | null = null

function setPort(value: unknown) {
  const p = parsePort(value)
  if (p == null) {
    log('ignoring invalid port', value)
    return
  }
  if (pendingPort) clearTimeout(pendingPort)
  pendingPort = setTimeout(() => {
    pendingPort = null
    if (p === port) return
    port = p
    alternativeName = null
    schedule(publish)
  }, PORT_SETTLE_MS)
}

if (maxApi) {
  maxApi.addHandler('port', setPort)
  // The patch sends `port` once, when the device loads, which is before Node
  // has started this script, so Node for Max drops it. Ask for it again: the
  // patch routes `ready` to a bang on the [int] holding the Device Port.
  maxApi.outlet('ready')
} else {
  setPort(process.argv[2] || '2346')
  const stop = () => {
    if (bus) bus.disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
