# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knobbler4 is a Max for Live device that transforms a tablet/phone into an auto-labeling, multitouch parameter control surface for Ableton Live. It communicates with mobile apps via OSC (Open Sound Control) protocol and uses the Ableton Live API to interact with tracks, devices, and parameters.

## Development Environment

Code editing happens in a **VSCode Devcontainer** environment. The TypeScript source files in `src/` are edited within the container, which provides a Node.js 20 development environment with Prettier and ESLint extensions pre-configured.

**Opening the devcontainer:**
```bash
# From the repository root
dc  # Shell alias for 'devcontainer open .'
# Or manually:
devcontainer open .
```

**Container setup:**
- Based on `node:20` Docker image
- Mounts the repository to `/app` inside the container
- Automatically runs `npm run dev` (TypeScript watch mode) on startup
- Uses a Docker volume for `node_modules` to improve performance
- Pre-configured VSCode extensions: Prettier-ESLint, Prettier, Makefile Tools

**Workflow:** Edit TypeScript files in `src/` within the devcontainer → auto-compile via watch mode → compiled `.js` files appear in `Project/` → test changes in Ableton Live with the device reloaded.

**IMPORTANT — run node/build/test inside the devcontainer, never on the host.** The container is `m4l-knobbler4-node-1` (repo mounted at `/app`). Examples:
```bash
docker start m4l-knobbler4-node-1                      # if stopped
docker exec m4l-knobbler4-node-1 sh -c "cd /app && yarn build"
docker exec m4l-knobbler4-node-1 sh -c "cd /app && yarn tsc --noEmit"
docker exec m4l-knobbler4-node-1 sh -c "cd /app && yarn test"
```
The container usually runs `npm run dev` (tsc --watch) on startup, so saving a `src/*.ts` edit auto-recompiles into `Project/`.

## Development Commands

### Build & Development

```bash
# Install dependencies
yarn install --frozen-lockfile

# Build TypeScript to JavaScript (compiles src/*.ts → Project/*.js)
yarn build

# Watch mode for development (auto-rebuild on changes)
yarn dev
```

### Code Quality

```bash
# Lint TypeScript files
npx eslint src/**/*.ts

# Format code with Prettier
npx prettier --write src/**/*.ts
```

## Architecture Overview

### TypeScript → Max/MSP Compilation Pipeline

TypeScript source files in `src/` compile to JavaScript in `Project/` directory. The compiled `.js` files are loaded by `[js]` objects in Max patches. TypeScript provides type safety and IDE support while Max's JavaScript engine executes the compiled CommonJS output.

**Key compilation setting**: `tsconfig.json` targets ES5 with CommonJS modules, output to `Project/` directory.

### Single-`[v8 knobbler]` architecture (current — May 2026)

The device is ONE `[v8 knobbler]` object (`src/knobbler.ts`) — the old `[v8 router]` and the per-feature `[v8]` objects were consolidated into it (only `[v8 k4-discovery]` stays separate).

`knobbler.ts` is the orchestrator/entry. It owns inbound OSC dispatch via a **route registry** (each feature module exports a `routes: Route[]` table; the entry merges them and calls `fn(...)` directly — no outlet fan-out) and builds an **`AppContext` (`ctx`)** that it hands to every module's `init(ctx)`. Modules reach siblings/services **through `ctx`** (`ctx.settings`, `ctx.osc`, `ctx.gotoTrack`, `ctx.gotoDevice`, `ctx.knobbler.bkMap`, …), never by importing each other.

**Why ctx and not imports:** Max `require()` does **not** cache modules — each file that imports another gets a *separate, dead* instance. So inter-module calls go through the single live instances the entry wired into `ctx`. The same tax means each module gets its own `utils` instance, so its `osc()` won't batch until `init` calls `setOscSink(ctx.osc)`.

**Adding a feature module (`k4-foo`):**

1. `src/k4-foo.ts` exports a `routes` table + an `init`:
   ```ts
   export const routes: Route[] = [{ prefix: '/foo', parse: 'val', fn: doFoo }]
   export function init(c: AppContext) {
     setOscSink(c.osc)   // required: own utils instance, see above
     ctx = c             // stash for ctx.settings / ctx.gotoTrack / etc.
     // observers, initial state push…
   }
   ```
   `parse` is one of `bare | val | slot | slotVal | custom` (see the `Route` type in `types/index.d.ts`).
2. In `knobbler.ts`: `import * as foo from './k4-foo'`, add `foo.routes as any` to the `ROUTES` concat, add `foo.init(ctx)` to `init()`.
3. Reach siblings/services only via `ctx`. Patcher work is only needed if the module has its own UI or non-OSC outlets.

### Core Module Responsibilities

**`knobbler.ts`** - The `[v8 knobbler]` entry / orchestrator

- Receives all inbound OSC from `[udpreceive]`, disassembles `/batch`, and dispatches by prefix via the merged route registry (direct `fn(...)` calls — no outlet fan-out)
- Builds the `AppContext` and calls each module's `init(ctx)`; owns the singletons modules reach through `ctx`
- Hosts the inbound coalescing (leading-edge, ~15ms) and a few entry-owned routes (page dispatch)

**`knobblerCore.ts`** - Core parameter mapping engine (1300+ lines)

- Manages 32 parameter "slots" that users map to Ableton device parameters
- Maintains parallel arrays tracking: parameter objects, names, device info, track info, colors, values
- Implements LiveAPI observers/watchers for real-time parameter updates
- Handles debouncing to prevent feedback loops between OSC and Ableton
- Scales values between OSC range (0-1) and Ableton parameter ranges
- Persists slot path/min/max/customName to `ctx.settings` (`---settingsDict`), dual-written to the legacy bpatcher params for backward compat

**`k4-bluhand.ts`** - Device control ("bluhand")

- Transport, parameter banks, rack variations/macros, the 16 device-parameter slots (delegated to `k4-bluhandSlots.ts`), and navigation (`gotoTrack`/`gotoDevice`/`gotoChain` — `gotoTrack`/`gotoDevice` exposed via `ctx`)
- Its "current track/device" observers (name/color, `paramsWatcher`, `variationsWatcher`, `selectedDeviceApi`) bind via `ctx.focus.trackPath()`/`devicePath()` and re-point on `ctx.focus.onChange` — they do NOT hardcode Live's selection paths. See `k4-focus.ts`.

**`k4-focus.ts`** - Knobbler's "current target" (the lock feature)

- Single source of truth for which track/device the device surface points at, which may differ from Live's `selected_track`/`selected_device`. Exposed as `ctx.focus`.
- **Locked (default):** `trackPath()`/`devicePath()` return Live's selection paths (observers auto-follow); `selectTrack`/`selectDevice` write Live's selection → bidirectional sync (legacy behavior).
- **Unlocked:** holds its own pointer; navigating in Knobbler retargets it WITHOUT writing Live's selection, and `onChange` listeners re-point their id-bound observers. Pointer persists as canonical PATHS (positional, like mapped-slot paths; stale paths fall back to Live's selection).
- `/focusLock <0|1>` toggles; lock state + pointer persist in `ctx.settings`. All in-Knobbler nav must funnel through `ctx.gotoTrack`/`gotoDevice` (→ focus) — a direct `set('selected_track', …)` would leak and move Live's selection in unlocked mode.
- **`trackPath()`/`devicePath()` return canonical, APPENDABLE paths** (so consumers append ` mixer_device volume`, ` parameters N`, etc.). Locked → Live's selection paths (auto-follow); unlocked → the pinned canonical path (`devicePath()` may be `''` = no device, treat as cleared).
- **No module hardcodes `live_set view selected_track[…]` anymore** — every current-track/device observer/read goes through `ctx.focus`, and observer modules re-point on `ctx.focus.onChange`: `k4-bluhand` (+`k4-bluhandSlots` via `setDevicePath`), `k4-tracksDevices` (nav tree), `k4-sidebarMixer` (track strip), `k4-shortcuts` + `knobblerCore` (scratch reads). `k4-currentParam` intentionally still follows Live's `selected_parameter`.
- App side: gated on the **`focus` capability** (`REPLY_CAPS` in `k4-system.ts` ↔ `CAPABILITY_FOCUS`); the "Follow Sel" toolbar button drives `/focusLock`.

**`k4-system.ts`** - Connection + system passthroughs (former router bits)

- Handshake (`/syn`→`/ack`, `/ping`→`/pong`, `/connect`, `deviceVersion`) and the loose Max-side sends (`---REFRESH_LOGIC`/`---CONFIGURE`). On `/connect` it also fires the JS feedback-loop probe (`ctx.loopProbe()` — see Message Flow / `/loop` guard)

**`k4-settings.ts`** - Per-instance persistence service

- ONE `Dict` ref to `---settingsDict` exposed as `ctx.settings`; plus the read-only legacy `[dict settingsDict]` bridge for migrating pre-`[v8]` sets (slated for post-v65 removal)

**`k4-shortcuts.ts`** - 8 device-recall shortcuts (former `[poly~ shortcutPoly]`)

**`k4-tracksDevices.ts`** - Track/device navigation tree builder

- Builds hierarchical structures for tracks, returns, and master
- Generates display data for tablet's navigation browser
- Watches for changes to track counts, names, colors, and folding states

**`k4-bluhandBanks.ts`** - Device parameter bank management

- Manages parameter banks for controlling selected devices
- Handles Ableton instruments with multiple parameter pages
- Imports device bank definitions from `deviceParams.ts`

**`k4-sidebarMixer.ts`** - Single-track mixer (the selected track)

- Volume, pan, sends, mute, solo, arm, crossfade-assign, record; meters
- Holds the operational `selected_track` handle and the master-track detach gotchas for mute/xfade
- Shared command helpers live in `mixerUtils.ts`

**`k4-clipView.ts`** - Session clip grid (windowed clip-slot/scene observers)

**`k4-currentParam.ts`** - Selected parameter display

- Follows Live's `selected_parameter` view property (mode=1 observer)
- Pushes parameter name, device name, track name, track color, value, and min/max strings to the app
- Supports lock/unlock to freeze the display on a specific parameter
- Observes value changes and track color changes in real time

**`k4-multiMixer.ts`** - Multi-track mixer

- Full-screen, horizontally scrollable mixer with per-strip observers
- Windowed approach: observers only active for visible strips
- Per-strip observers for volume, pan, mute, solo, arm, color, sends, meters, and volume automation state
- Batched meter output via `/mixer/meters` JSON array

**`k4-oscBatch.ts`** - Outbound OSC batching (in-process)

- Folded in: `utils.osc()` feeds `oscBatch.send` via the `setOscSink(ctx.osc)` hook (not a wire)
- Batches NUMERIC values into a single `/batch` JSON payload (batch-capable clients), else per-address throttle; non-numeric payloads go straight out as their own packet
- Flushes every 10ms / >1KB; bypasses chunked + meter messages
- **Chunking is a pipeline stage here, not a caller concern.** A large array `osc(addr, arr)` is split into `addr/start` + `addr/chunk…` + `addr/end` (checksum = `simpleHash`) automatically — callers never call a chunk helper. Gated by capability: `chunkAny` apps get *any* address chunked (the app reassembles + dispatches generically); `cNav`-only apps get only `LEGACY_CHUNK_ADDRS` chunked (they reassemble those into `oscDataRef[prefix]`); others get the array whole. The app re-dispatches a reassembled chunk through its normal handler, so a chunked and a whole message are equivalent.

**`k4-discovery.ts`** - Network device discovery

- Discovers and filters available Knobbler apps on the network. The one feature that stays a **separate `[v8]`** (own `[udpsend]`/`[udpreceive]` for the discovery protocol)

### Supporting Modules

**`deviceParams.ts`** (3000+ lines) - Comprehensive device parameter bank definitions sourced from Ableton's MIDI control scripts. Covers stock Live devices and Max for Live devices.

**`utils.ts`** - Helper functions including logging factory, path validation, color conversion, string truncation, debounced task management.

**`consts.ts`** - Constants and type definitions including `MAX_SLOTS = 32`, track types, the `[v8 knobbler]` entry outlet indices, default colors.

**`toggleInput.ts`** - Track input routing enable/disable functionality.

### Message Flow Architecture

```
inbound:  Tablet (OSC) → [udpreceive] → [v8 knobbler] anything()
              → /batch disassembly → route registry (dispatch by prefix) → module fn(...)
                  → LiveAPI ↔ Ableton Live (real-time sync)
outbound: module osc() → ctx.osc → k4-oscBatch.send (in-process batch/throttle)
              → entry outlet 0 → [udpsend] → Tablet
                  ≥9.1.0: rawbytes <byte…>  (packet built in JS, no interning)
                  <9.1.0: native `addr value` (udpsend OSC-formats; batching off)
```

**Outbound is version-gated (`RAWBYTES_OK` in `utils.ts`).** `[udpsend]`'s
`rawbytes` message — ship a JS-built OSC packet as a byte list, no string
interning, no app-side crash — only exists in **Max 9.1.0+ (Live 12.4+)**. Below
that it's OSC-formatted as a literal address and crashes the app's parser. So:

- **≥ 9.1.0:** `k4-oscBatch` builds the packet (`buildOscPacket`) and emits
  `rawbytes <byte…>`; batching on (the `/batch` JSON rides as bytes).
- **< 9.1.0:** emit native `addr value` for `[udpsend]` to format; batching
  **off** (its per-flush `/batch` JSON would be the big interning source).
  Numerics don't intern; only low-churn strings (names/colors) do.

`max.version` is a per-component hex string (`9.0.10 → "90a"`, `9.1.0 → "910"`),
so compare major/minor by character — NOT `parseInt` the whole string. We removed
the old `[node.script]`+`dgram` sender (it fought M4L's per-set lifecycle: fresh
~1s boot + no re-handshake on set switch). `[udpsend]` is native and instant, and
gets its target from the persisted host/port fields on load — so a **set switch
repopulates the tablet with no handshake** (no 'Test' tap). `k4-discovery` keeps
its own `[udpsend]`/`[udpreceive]` for the discovery protocol.

**Feedback-loop guard (`/loop`):** lives entirely in JS. On `/connect`,
`k4-system` pings `/loop` to the configured target; if output host:port == our
own `[udpreceive]`, the ping echoes back as inbound `/loop` and
`oscBatch.setOutputBlocked(true)` stops the storm (a fresh `/connect` re-probes).
`/page` (device→app page sync) is tapped off the `---UDPSEND` bus into the entry
(`[prepend udpSend]` → `udpSend()` → `osc()`).

**Set-switch gotcha:** the device does an HTTP version check on load via
`[maxurl]` (`plugins.steinkamp.us/version/...`). An in-flight `maxurl` racing the
set teardown crashes Max **9.0.x** (fixed in 9.1.0). It's deferred `[delay 5000]`
so a quick set switch cancels it on unload before it fires.

### Key Architectural Patterns

1. **Route-registry dispatch**: each module exports a `routes: Route[]` table; the entry merges them and calls `fn(...)` directly (replaces the old outlet fan-out)
2. **`ctx` orchestration + require()-no-cache**: modules reach siblings/services through the `ctx` the entry injects in `init(ctx)`, never via direct imports (a direct import would be a separate dead instance); each module wires `setOscSink(ctx.osc)` for the same reason
3. **LiveAPI Observer Pattern**: extensive use of Ableton LiveAPI observers to push real-time updates; distinguish *identity observers* (dedupable) from *operational handles* (per-module, kept)
4. **32-Slot Parallel Arrays**: core parameter mapping uses indexed parallel arrays
5. **Debouncing Strategy**: multiple debouncing approaches prevent feedback loops between OSC input and direct manipulation in Live
6. **Module exports**: the entry (`knobbler.ts`) keeps the `const module = {}; export = {}` boilerplate so tsc emits valid CommonJS for the `[v8]` object; folded feature modules use plain named exports (`export { routes, init }`)

## OSC Protocol

The device communicates via OSC messages. See `docs/OSC-API.md` for complete protocol documentation including:

- Parameter mapping (`/valN`, `/unmapN`, `/defaultN`)
- Device control (Bluhand banks: `/bvalN`, `/bbankNext`, `/bbankPrev`)
- Navigation (`/gotoTrack`, `/gotoDevice`, `/gotoChain`)
- Mixer controls (`/mixer/vol`, `/mixer/pan`, `/mixer/sendN`)
- Toolbar/transport (`/tempo`, `/metronome`, `/isPlaying`)

## Max/MSP Integration Details

**Main Device**: `Project/Knobbler4.amxd` is the Max for Live audio device (added to Master track)

**Key Max Objects**:

- `[v8 knobbler]` - Loads `knobbler.js`, the single entry/orchestrator (all feature modules `require`d in-process). The old `[v8 router]` and per-feature `[v8]` objects are gone.
- `[v8 k4-discovery]` - The one remaining separate feature object (network discovery; keeps its own `[udpsend]`/`[udpreceive]`)
- `[udpsend]` / `[udpreceive]` - Network I/O. Outbound is version-gated (`rawbytes` vs native — see Message Flow Architecture); the target comes from the persisted host/port fields on load.
- `[poly~ finger]` - Multi-touch gesture detection
- bpatchers - Repeating UI elements for parameter slots; `[dict ---settingsDict @parameter_enable 1]` persists per-instance settings

## Release Process

The `frozen/` directory contains historical releases (`.amxd` device files and `.tosc` TouchOSC templates). Current development happens in `src/` and `Project/`. After building, the `Project/Knobbler4.amxd` file is the distributable device.

Version numbers are manually updated in the changelog and device itself. Releases include the compiled `.amxd` file published to GitHub releases.

**GitHub release assets: only the `.zip` — never images.** plugins.steinkamp.us
serves the device download from `release.assets[0].browser_download_url` (see
`plugins/components/KnobblerSite.tsx` and `DownloadButton.tsx`), i.e. the first
asset. If an announcement image is uploaded as a release *asset*, it can sort
ahead of the `.zip` and the site will hand out the PNG as the device download.
Embed announcement images as GitHub *attachments* (`gh`/API can't create these —
upload via the web release editor, which yields a `github.com/user-attachments/…`
URL) or reference a `raw.githubusercontent.com` URL; do not `gh release upload`
them. `scripts/release.sh <vNN>` builds the correct zip (README.txt + the
`frozen/Knobbler4-<vNN>*.amxd` devices); the zip is uploaded to the release, not
committed to the repo.

**`Knobbler4-P3SA.amxd` (Push 3 standalone)** is identical to `Knobbler4.amxd`
except for one group of objects built around the `zero.*` externals (zeroconf
discovery), which Push 3 standalone doesn't support. To regenerate it after a
`Knobbler4.amxd` change: open `Knobbler4`, select that `zero` group, delete it,
and Save As `Knobbler4-P3SA`. (Both load the same compiled `Project/*.js`, so JS
changes apply to both automatically — only patcher edits need this re-sync.)

## Editing `.amxd` device files

`.amxd` files are a binary header followed by the patcher JSON and a trailing NUL
(the JSON byte-length is a little-endian uint32 in the 4 bytes right before the
first `{`). **Never edit a `.amxd` with a text editor / Read+Edit — UTF-8
round-tripping corrupts the binary header.** Use the helper instead:

```bash
# extract the JSON to a plain file you can Read/Edit/jq/diff freely
python3 scripts/amxd.py unpack Project/Knobbler4.amxd /tmp/k4.json
# ...edit /tmp/k4.json with any tool...
python3 scripts/amxd.py pack /tmp/k4.json Project/Knobbler4.amxd   # rebuild in place

# or one-shot a jq filter straight into the device (also in place):
python3 scripts/amxd.py jq Project/Knobbler4.amxd '.patcher.parameters."obj-9" = ["Foo","Foo",0]'
```

The header is never reconstructed — `pack`/`jq` copy it verbatim from an existing
`.amxd` (the target itself, or `pack ... --from REF.amxd` to borrow one when
writing a fresh device), patch only the 4-byte length field, and validate the
JSON before writing.
unpack→pack is byte-identical, so it's safe to keep in the loop. Adding/altering
**parameters** (the `patcher.parameters` registry, `parameterbanks`, modulation
indices) is fiddly and interlocks — prefer doing parameter changes in the Max
editor; use this tool for boxes/lines/attributes and inspection.

## Important Notes

- **Remember to commit compiled JavaScript files** from `Project/` directory - they are build artifacts currently tracked in git
- **Test in Ableton Live**: Changes require testing in an actual Live set with the device loaded
- **OSC Testing**: Use OSC debugging tools or the actual tablet app to test message handling
- **Debouncing**: When adding new parameter observers, always implement debouncing to prevent feedback loops
- **Max Console**: Check Max's console window for JavaScript errors and log output during development
- **LiveAPI `.id` returns a string**: Always use `+obj.id === 0` (unary plus), never `obj.id === 0` (strict equality `"0" === 0` is `false`). Same for `!== 0` checks. When passing `.id` to another LiveAPI's `.id` setter, use `parseInt()`.
- **Max `require()` does NOT cache modules**: Each `require('./utils')` in a different file creates a separate module instance with its own state — even within the single `[v8 knobbler]`. If `knobbler.js` and `knobblerCore.js` both require `utils.js`, they get independent copies (independent `oscSink`, `_instancePrefix`, etc.). So: reach siblings/services through the `ctx` the entry injects (never import another feature module directly — you'd get a dead instance), and each module calls `setOscSink(ctx.osc)` in `init` to point its own `utils` at the shared batch buffer. See the "Single-`[v8 knobbler]` architecture" section.
- **`new Dict(name)` resets parameter-enabled dicts**: Creating a new `Dict` reference to a parameter-enabled `[dict]` can reset its contents. Cache `Dict` references as singletons instead of creating new ones on each access.
- **Dict persistence**: One shared `settingsDict` with `parameter_enable` stores all settings. Per-instance keys (xyPairs, metersEnabled) are prefixed with the device's `---` value via `saveInstanceSetting`/`loadInstanceSetting`. Shared keys (clientVersion, clientCapabilities, visibleTracks) use `saveSetting`/`loadSetting` without prefix. The `---` prefix is sent to [js] objects via `setDictPrefix` from the `live.thisdevice` init chain.
