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

### Core Module Responsibilities

**`router.ts`** - Central OSC message dispatcher

- Receives all incoming OSC messages from the tablet
- Uses prefix-based routing with ~50 routing rules in the ROUTER array
- Distributes messages to 11 outlets for different functional areas (knobbler, bluhand, mixer, page, etc.)
- Handler pattern: `bareMsg`, `bareVal`, `stdVal`, `stdSlot`, `stdSlotVal`

**`knobblerCore.ts`** - Core parameter mapping engine (1300+ lines)

- Manages 32 parameter "slots" that users map to Ableton device parameters
- Maintains parallel arrays tracking: parameter objects, names, device info, track info, colors, values
- Implements LiveAPI observers/watchers for real-time parameter updates
- Handles debouncing to prevent feedback loops between OSC and Ableton
- Scales values between OSC range (0-1) and Ableton parameter ranges
- Stores mapping configuration that persists with Live sets

**`knobbler4.ts`** - Main entry point wrapper

- Sets up Max [js] object with 1 inlet and 2 outlets
- Delegates all operations to `knobblerCore`
- Minimal glue layer between Max and core functionality

**`k4-tracksDevices.ts`** - Track/device navigation tree builder

- Builds hierarchical structures for tracks, returns, and master
- Generates display data for tablet's navigation browser
- Watches for changes to track counts, names, colors, and folding states

**`k4-bluhandBanks.ts`** - Device parameter bank management

- Manages parameter banks for controlling selected devices
- Handles Ableton instruments with multiple parameter pages
- Imports device bank definitions from `deviceParams.ts`

**`k4-mixerSends.ts`** - Mixer control interface

- Manages volume, pan, crossfader, mute, solo, sends
- Implements pause/unpause logic to prevent feedback during rapid changes

**`k4-deviceParamMaps.ts`** - Device parameter lookup utility

- Simple module mapping device names to their parameter banks

**`k4-discovery.ts`** - Network device discovery

- Discovers and filters available Knobbler apps on the network

### Supporting Modules

**`deviceParams.ts`** (3000+ lines) - Comprehensive device parameter bank definitions sourced from Ableton's MIDI control scripts. Covers stock Live devices and Max for Live devices.

**`utils.ts`** - Helper functions including logging factory, path validation, color conversion, string truncation, debounced task management.

**`consts.ts`** - Constants and type definitions including `MAX_SLOTS = 32`, track types, outlet indices, default colors.

**`toggleInput.ts`** - Track input routing enable/disable functionality.

**`deprecatedMethods.ts`** - Legacy track/device navigation functions kept for backward compatibility.

### Message Flow Architecture

```
Tablet (OSC) → [udpreceive] → router.js (dispatch by prefix)
    → Outlets (0-10) → Feature modules (knobbler4, k4-bluhand, k4-mixer, etc.)
        → LiveAPI ↔ Ableton Live (real-time sync)
    → [udpsend] → Tablet (OSC responses)
```

### Key Architectural Patterns

1. **Outlet-Based Distribution**: Router immediately distributes messages to appropriate outlets allowing parallel processing in different Max subpatches
2. **LiveAPI Observer Pattern**: Extensive use of Ableton LiveAPI observers to watch for changes and push updates to controller in real-time
3. **32-Slot Parallel Arrays**: Core parameter mapping uses indexed parallel arrays for efficient slot management
4. **Debouncing Strategy**: Multiple debouncing approaches prevent infinite loops when values change from OSC input vs. direct manipulation in Live
5. **Module Export Pattern**: TypeScript files use `const module = {}; export = {}` pattern to ensure valid CommonJS for Max's JavaScript engine

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

- `[js router]` - Loads `router.js` for OSC message routing
- `[js knobbler4]` - Loads `knobbler4.js` for core parameter functionality
- `[js k4-bluhandBanks]`, `[js k4-mixerSends]`, etc. - Load feature modules
- `[udpreceive 9000]` / `[udpsend]` - Network communication
- `[poly~ finger]` - Multi-touch gesture detection
- bpatchers - Repeating UI elements for parameter slots

## Release Process

The `frozen/` directory contains historical releases (`.amxd` device files and `.tosc` TouchOSC templates). Current development happens in `src/` and `Project/`. After building, the `Project/Knobbler4.amxd` file is the distributable device.

Version numbers are manually updated in the changelog and device itself. Releases include the compiled `.amxd` file published to GitHub releases.

## Important Notes

- **Remember to commit compiled JavaScript files** from `Project/` directory - they are build artifacts currently tracked in git
- **Test in Ableton Live**: Changes require testing in an actual Live set with the device loaded
- **OSC Testing**: Use OSC debugging tools or the actual tablet app to test message handling
- **Debouncing**: When adding new parameter observers, always implement debouncing to prevent feedback loops
- **Max Console**: Check Max's console window for JavaScript errors and log output during development
