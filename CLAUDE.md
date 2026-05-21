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

**`k4-system.ts`** - Connection + system passthroughs (former router bits)

- Handshake (`/syn`→`/ack`, `/ping`→`/pong`, `/connect`, `deviceVersion`) and the loose Max-side sends (`---LOOP`/`---REFRESH_LOGIC`/`---CONFIGURE`)

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

**`k4-discovery.ts`** - Network device discovery

- Discovers and filters available Knobbler apps on the network. The one feature that stays a **separate `[v8]`** (own `[udpsend]`/`[udpreceive]` for the discovery protocol)

### Supporting Modules

**`deviceParams.ts`** (3000+ lines) - Comprehensive device parameter bank definitions sourced from Ableton's MIDI control scripts. Covers stock Live devices and Max for Live devices.

**`utils.ts`** - Helper functions including logging factory, path validation, color conversion, string truncation, debounced task management.

**`consts.ts`** - Constants and type definitions including `MAX_SLOTS = 32`, track types, the `[v8 knobbler]` entry outlet indices, default colors.

**`toggleInput.ts`** - Track input routing enable/disable functionality.

**`deprecatedMethods.ts`** - Legacy track/device navigation functions kept for backward compatibility.

### Message Flow Architecture

```
inbound:  Tablet (OSC) → [udpreceive] → [v8 knobbler] anything()
              → /batch disassembly → route registry (dispatch by prefix) → module fn(...)
                  → LiveAPI ↔ Ableton Live (real-time sync)
outbound: module osc() → ctx.osc → k4-oscBatch.send (in-process batch/throttle)
              → entry outlet 0 → [s ---UDPSEND] → OSC-out gate → [udpsend] → Tablet
```

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
- `[v8 k4-discovery]` - The one remaining separate feature object (network discovery)
- `[udpreceive]` / `[udpsend]` - Network communication (OSC-out runs through a gate opened on `/connect`)
- `[poly~ finger]` - Multi-touch gesture detection
- bpatchers - Repeating UI elements for parameter slots; `[dict ---settingsDict @parameter_enable 1]` persists per-instance settings

## Release Process

The `frozen/` directory contains historical releases (`.amxd` device files and `.tosc` TouchOSC templates). Current development happens in `src/` and `Project/`. After building, the `Project/Knobbler4.amxd` file is the distributable device.

Version numbers are manually updated in the changelog and device itself. Releases include the compiled `.amxd` file published to GitHub releases.

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
