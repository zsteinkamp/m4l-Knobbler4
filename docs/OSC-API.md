## OSC-API

This document exists to catalog the full set of OSC messages used for control and display between the Knobbler4 Max for Live device and a physical interface, such as an app or TouchOSC running on an iPad. Because the standard OSC protocol is used, you are free to develop alternative interfaces to interact with Knobbler4.

## Knobbler

### Tablet to Knobbler4

#### /valN {float}

Sets the value of Slot N, as a float between 0 and 1, inclusive. If Slot N is already mapped, Knobbler will then quietly update the assigned parameter in the Live set with the value. If Slot N is not mapped and there is a selected parameter in the Live Set, then that parameter will be mapped to Slot N and resulting name, color, and value messages will be sent to update the tablet.

#### /unmapN

Removes the mapping for Slot N. Has side effects of messages sent from Knobbler to tablet to update name, color, and value to unassigned values.

#### /default valN

Sets the value of the parameter mapped to Slot N to its default value. Does so in a way to trigger an update back to the tablet.

#### /trackNtouch 1

Switch the Live display to the track corresponding to Slot N.

#### /xyJoinN

Join Slot N and Slot N+1 into an X-Y pad pair. N must be between 1 and 31. Both slots must not already be part of a pair. Triggers an `/xyPairs` response. Knobbler pairs persist with the Live set.

#### /xySplitN

Split a previously joined X-Y pad pair where N is the left slot index. Triggers an `/xyPairs` response.

### Knobbler4 to Tablet

#### /deviceN {string}

Updates the device name for Slot N.

#### /paramN {string}

Updates the parameter name for Slot N.

#### /paramNauto {integer}

The automation state for the parameter in Slot N.

#### /quantN {integer}

The number of quantization steps for the parameter in Slot N. Continuous (non-quantized) parameters will have a value of zero. On/off buttons will have a value of 2.

#### /quantItemsN {JSON string}

A JSON-encoded array of individual item names for each quantized step. The array is empty if a parameter is not quantized.

#### /track {string}

Updates the track name for Slot N.

#### /valN {float}

Updates the slider for Slot N to the given value.

#### /valNcolor {string}

Updates the color of the slider for Slot N to the one given. Must be a hexidecimal string in the form RRGGBBAA.

#### /valStrN {string}

Updates the string representation of Slot N's mapped parameter value, e.g. (-6db or 2.5KHz).

#### /xyPairs {JSON string}

A JSON-encoded array of left slot indices for active X-Y pad pairs. e.g. `[3, 7]` means slots 3+4 and 7+8 are joined. Sent on refresh, page load, join, split, and Live set load.

## Bluhand

### Tablet to Knobbler4

#### /bvalN {float}

Sets the value of Slot N, as a float between 0 and 1, inclusive. Knobbler will then quietly update the corresponding parameter in the selected device in the Live set with the value.

#### /bdefault bvalN

Sets the value of the parameter mapped to Slot N to its default value. Does so in a way to trigger an update back to the tablet.

#### /bBankN

Go to bank index N.

#### /bbankPrev

If not looking at the first bank, has the effect of switching the Tablet to the previous bank of parameters. Causes a full update of slot names and values.

#### /bbankNext

If more banks of parameters are available, then switch the Tablet to the next bank of parameters. Causes a full update of slot names and values.

#### /undo

Triggers an undo action in the Live set, reverting the last change.

#### /redo

Triggers a redo action in the Live set, reapplying the last undone change.

#### /shortcutNMap

For shortcut button N, will map the button if it is not yet mapped. If mapped already, it will focus the Live UI on the mapped device.

#### /shortcutNUnmap

For shortcut button N, will unmap the button.

### Knobbler4 to Tablet

#### /bcurrDeviceName {string}

Updates the current track / device name in the display.

#### /bTxtCurrBank {string}

Updates the text that indicates the current bank, e.g. "Bank 2 of 6".

#### /bparamN {string}

Updates the parameter name for Slot N.

#### /bparamNauto {integer}

The automation state for the parameter in Slot N.

#### /bquantN {integer}

The number of quantization steps for the parameter in Slot N. Continuous (non-quantized) parameters will have a value of zero. On/off buttons will have a value of 2.

#### /bquantItemsN {JSON string}

A JSON-encoded array of individual item names for each quantized step. The array is empty if a parameter is not quantized.

#### /bvalN {float}

Updates the slider for Slot N to the given value.

#### /bvalNcolor {string}

Updates the color of the slider for Slot N to the one given. Must be a hexidecimal string in the form RRGGBBAA.

#### /bvalStrN {string}

Updates the string representation of Slot N's mapped parameter value, e.g. (-6db or 2.5KHz).

#### /shortcutNColor {string}

Updates the shortcut button N to the given color value (RRGGBBAA).

#### /shortcutNameN {string}

Updates the device name displayed beneath the shortcut button N.

## Navigation

### Knobbler4 to Tablet

#### /nav/currTrackId {integer}

Live object ID number for the currently selected track.

#### /nav/currDeviceId {integer}

Live object ID number for the currently selected device.

#### /nav/devices`

JSON-stringified array of device objects. See the source file `src/consts.ts` to see the field ID definitions. e.g.

```
[
  [5,8,"Knobbler4-v26","FFF034",0]
]
```

### Tablet to Knobbler4

#### /gotoChain {chainID}

Navigate to the given chain by ID in the Live UI.

#### /gotoDevice {deviceID}

Navigate to the given device by ID in the Live UI.

#### /gotoTrack {trackID}

Navigate to the given track by ID in the Live UI.

#### /hideChains {deviceID}

If collapsing a rack, this message is sent to Live so that it can hide the chain devices display in that rack. Otherwise every rack will eventually be fully expanded and that gets overwhelming / messy.

#### /toggleGroup {deviceID}

Toggles the fold state (expand / collapse) of a group.

## Mixer / Channel Strip

### Knobbler4 to Tablet

#### /mixer/returnTrackColors {string}

JSON-stringified list of color values for the 12 possible return tracks. e.g.

```
[
  "#10A4EE","#00BFAF","#990000",
  "#990000","#990000","#990000",
  "#990000","#990000","#990000",
  "#990000","#990000","#990000"
]
```

#### /mixer/type {type}

Indicates the type of track - normal, group, return, or main. See `src/consts.ts` for the track type definitions.

#### /mixer/recordArm { 0 | 1 }

Indicates whether the track is armed for recording.

#### /mixer/inputEnabled { 0 | 1 }

Indicates whether input is enabled for the current track.

#### /mixer/vol { 0., 1. }

The track volume level. `0.85` is 0.0db.

#### /mixer/pan { -1., 1. }

The pan position for the track.

#### /mixer/crossfader { 0 | 1 | 2 }

The crossfader value for the track. 0 = A, 1 = none, 2 = B.

#### /mixer/sendN {float}

The amount to send to return track N, with N being a value from 1-12.

#### /mixer/numSends {0-12}

The number of return tracks.

#### /mixer/xFadeA { 0 | 1 }

#### /mixer/xFadeB { 0 | 1 }

Indicates if the A or B crossfader buttons are selected for the given track.

#### /mixer/solo { 0 | 1 }

Indicates the Solo state of the track.

#### /mixer/soloCount {integer}

The number of tracks currently soloed across the entire set. Useful for showing a global solo indicator.

#### /mixer/mute { 0 | 1 }

Indicates the Mute state of the track.

#### /mixer/trackColor { colorInteger }

The color of the current track, in integer form ((r<<16) + (g<<8) + b)

#### /mixer/hasOutput { 0 | 1 }

Indicates whether the track has audio output. Controls the enabled state of some mixer components, e.g. the volume slider.

#### /mixer/volStr {string}

String value of the current track volume level. Displayed above the volume slider in the mixer.

#### /track/isFrozen { 0 | 1 }

Indicates whether the currently selected track is frozen.

## Multi-Track Mixer

The multi-track mixer provides a full-screen, horizontally scrollable mixer with per-strip observers. The device uses a windowed approach — observers are only active for visible strips. Strip indices are absolute (matching the position in `/visibleTracks`).

### Tablet to Knobbler4

#### /mixerView {JSON array}

Sets the visible window for the multi-track mixer. The value is a JSON array `[leftIndex, visibleCount]`. The device will set up observers for strips from `leftIndex` to `leftIndex + visibleCount - 1`. Sending `[0, 0]` tears down all observers and deactivates the mixer.

#### /mixerMeters { 0 | 1 }

Enables or disables output level meter observers for all visible strips. Meters are off by default. Only tracks with audio output will have meter observers.

#### /mixer/{N}/vol {float}

Sets the volume for strip N.

#### /mixer/{N}/pan {float}

Sets the pan for strip N.

#### /mixer/{N}/volDefault

Resets volume for strip N to its default value.

#### /mixer/{N}/panDefault

Resets pan for strip N to its default value.

#### /mixer/{N}/send1 - /mixer/{N}/send12 {float}

Sets the send level for strip N to the given return track.

#### /mixer/{N}/sendDefault1 - /mixer/{N}/sendDefault12

Resets the send level for strip N to the given return track's default value.

#### /mixer/{N}/toggleMute

Toggles the mute state for strip N.

#### /mixer/{N}/toggleSolo

Toggles the solo state for strip N.

#### /mixer/{N}/enableRecord

Arms strip N for recording.

#### /mixer/{N}/disableRecord

Disarms strip N.

#### /mixer/{N}/disableInput

Disables input routing for strip N.

#### /mixer/{N}/toggleXFadeA

Toggles crossfader assignment A for strip N.

#### /mixer/{N}/toggleXFadeB

Toggles crossfader assignment B for strip N.

### Knobbler4 to Tablet

#### /visibleTracks {JSON}

Sent as chunked data (`/visibleTracks/chunk`). Each entry is `[type, id, name, color, null, null, parentId]`. Type values are defined in `src/consts.ts`. `parentId` is the group track ID (0 if not in a group). Sent on mixer open, track list changes, and color changes.

#### /mixer/{N}/name {string}

The track name for strip N.

#### /mixer/{N}/color {string}

The track color for strip N (hex string).

#### /mixer/{N}/type {integer}

The track type for strip N (see `src/consts.ts`).

#### /mixer/{N}/vol {float}

The volume level for strip N.

#### /mixer/{N}/volStr {string}

String representation of strip N's volume (e.g. "-6.0 dB").

#### /mixer/{N}/pan {float}

The pan position for strip N.

#### /mixer/{N}/panStr {string}

String representation of strip N's pan (e.g. "20L").

#### /mixer/{N}/mute { 0 | 1 }

The mute state for strip N.

#### /mixer/{N}/solo { 0 | 1 }

The solo state for strip N.

#### /mixer/{N}/recordArm { 0 | 1 }

Whether strip N is armed for recording.

#### /mixer/{N}/inputEnabled { 0 | 1 }

Whether input is enabled for strip N.

#### /mixer/{N}/hasOutput { 0 | 1 }

Whether strip N has audio output.

#### /mixer/{N}/xFadeA { 0 | 1 }

Whether crossfader A is assigned for strip N.

#### /mixer/{N}/volAuto {integer}

The volume automation state for strip N. Values match Ableton's automation state enum (0 = none, 1 = playing, 2 = overridden).

#### /mixer/{N}/xFadeB { 0 | 1 }

Whether crossfader B is assigned for strip N.

#### /mixer/{N}/send1 - /mixer/{N}/send12 {float}

Send levels for strip N.

#### /mixer/meters {JSON array}

Batched meter values for all visible strips, sent as a single message every ~30ms when meters are enabled. The value is a flat JSON array `[L0, R0, V0, L1, R1, V1, ...]` where each group of 3 values represents left channel, right channel, and combined output level for one strip. Strip index N's values are at offsets `N*3` (left), `N*3+1` (right), `N*3+2` (level). Array length = `visibleCount * 3`. All values are floats (0.0-1.0).

#### /mixerMeters { 0 | 1 }

Confirms the current meters enabled/disabled state.

#### /mixer/numSends {0-12}

The number of return tracks (same for all strips).

## Current Parameter

Displays information about the currently selected parameter in Live. The device follows Live's selected parameter and pushes updates to the app. Supports locking the display to a specific parameter.

### Tablet to Knobbler4

#### /currentParam/show

Activates the current parameter observer. The device will begin following Live's selected parameter.

#### /currentParam/hide

Deactivates the current parameter observer and tears down all observers.

#### /currentParam/val {float}

Sets the value of the currently displayed parameter, as a float between 0 and 1.

#### /currentParam/default

Resets the currently displayed parameter to its default value.

#### /currentParam/lock {0 | 1}

Locks (1) or unlocks (0) the current parameter display. When locked, the display stays on the current parameter even if the user selects a different parameter in Live. On unlock, the display updates to whichever parameter is currently selected.

### Knobbler4 to Tablet

#### /currentParam/name {string}

The parameter name.

#### /currentParam/deviceName {string}

The name of the device containing the parameter.

#### /currentParam/trackName {string}

The name of the track containing the device.

#### /currentParam/trackColor {string}

The color of the track, as a hex string (e.g. `#FF0034`).

#### /currentParam/val {float}

The parameter value, scaled to 0-1.

#### /currentParam/valStr {string}

The string representation of the parameter value (e.g. "-6.0 dB", "2.5 kHz").

#### /currentParam/minStr {string}

The string representation of the parameter's minimum value.

#### /currentParam/maxStr {string}

The string representation of the parameter's maximum value.

## Toolbar

#### /arrangementOverdub { 0 | 1 }

Indicates if the arrangement overdub button is engaged.

#### /cuePoints { cuePoint List }

JSON-encoded array of cue point objects.

```
[
  { 
    "name": {string},
    "idx": {number},
    "time": {number},
  },
  ...
}
```

#### /sessionRecord { 0 | 1 }

Indicates if the session automation record button is engaged.

#### /reEnableAutomationEnabled { 0 | 1 }

Indicates that automation has been overridden, and is available to be re-enabled.

#### /metronome { 0 | 1 }

Indicates whether the metronome is enabled.

#### /isPlaying { 0 | 1 }

Indicates if Live is playing.

#### /recordMode { 0 | 1 }

Indicates if Live is recording.

#### /tempo {float}

The current tempo value.

#### /gotoCuePoint {idx}

Jumps to the cue point at `live_set cue_points {idx}`.

#### /btnSkipPrev

Jumps to the previous cue point.

#### /btnSkipNext

Jumps to the next cue point.

## Misc

### Knobbler4 to Tablet

#### /ack {string}

Response to a `/syn` message to facilitate connection setup. The value is a string containing the device version number followed by capability flags (e.g. `53 mxr`). The `mxr` capability indicates support for the multi-track mixer.

#### /page/X

Sent when one of the tabs in the Max for Live device is clicked. `X` can be:

- knobbler1
- knobbler2
- bluhand

#### /pong {string}

Response to a `/ping` message to keep the network connection "warmed up". Like `/ack`, the value contains the device version and capability flags (e.g. `53 mxr`).

#### /batch {JSON string}

A batched set of OSC messages combined into a single JSON object. Each key is an OSC address and each value is the message payload. Example:

```json
{"/param1":"Filter Freq","/val1":0.5,"/valStr1":"2.5 kHz"}
```

Batching is only used when the client advertises the `batch` capability in its `/syn` handshake. Messages are flushed every 10ms or when the buffer exceeds 1KB. Chunked data (`/start`, `/end`, `/chunk` suffixes) and meter messages are never batched.

#### /toggleInput {0, 1}

Update the "active" state of the Toggle Input interface button.

### Tablet to Knobbler4

#### /ping

Sent every 5 seconds when a connection is configured. Intended to keep the network connection "warm".

#### /toggleInput {0,1}

If the currently selected track has active input routing (i.e. has a value other than "None" selected under the "MIDI From" or "Audio From" dropdowns), then the input routing selection will be stored internally in the device and the track will be set to `None`.

If the track input is currently set to `None`, then if the prior input setting was stored it will be restored, otherwise the first input will be chosen.

This is useful when recording automation over existing MIDI clips, since the recording state of a MIDI/Instrument track cannot be disabled. Simply disable the input with this message, record your automation overdub, then re-enable the inputs when needed. The underlying MIDI clips will not be modified.

#### /loop

Sent out as part of the network startup sequence to detect network loops (e.g. the send and receive destination being the same). If `/loop` is received, then network communication is halted until the `host` or `port` values are changed.

#### /syn {string}

A request for an `/ack` response to facilitate a UX feedback loop when configuring the connections. The value is an optional string containing the client version followed by capability flags (e.g. `1.2.0 batch`). The device stores the client version and capabilities for feature negotiation. Triggers a `/sendState` message internally to push full state to the app.

## Clip View

The Clip View provides session view clip grid control including clip launching, recording, scene management, and real-time state updates. The device uses a windowed approach — observers are only active for the visible portion of the grid.

### Tablet to Knobbler4

#### /clipView {JSON array}

Sets the visible window for the clip grid. The value is a JSON array `[left, top, right, bottom]` representing track and scene indices. Sending triggers observer setup for the visible range. Debounced at 250ms.

#### /requestClipsScenes

Requests the full scene list. Triggers a `/clips/scenes` chunked response.

#### /clipLaunch {JSON array}

Launch a clip: `[trackIdx, sceneIdx]`. Fires the clip slot and selects it in Live.

#### /clipRecord {JSON array}

Record into a clip slot: `[trackIdx, sceneIdx]`. Fires the clip slot for recording and selects it.

#### /clipDelete {JSON array}

Delete a clip: `[trackIdx, sceneIdx]`.

#### /clipSetStopButton {JSON array}

Set the stop button for a clip slot: `[trackIdx, sceneIdx, val]`.

#### /clipStop {trackIdx}

Stop all clips on the given track.

#### /stopAll

Stop all clips in the Live set.

#### /sceneLaunch {sceneIdx}

Launch a scene by index.

#### /sceneRename {JSON array}

Rename a scene: `[sceneIdx, name]`.

#### /sceneColor {JSON array}

Set a scene's color: `[sceneIdx, hexStr]`.

#### /clipColor {JSON array}

Set a clip's color: `[trackIdx, sceneIdx, hexStr]`.

#### /clipsUpdate {JSON array}

Bulk update clip properties. Array of `{t, sc, n?}` objects. Currently supports setting clip name.

#### /captureScene

Capture and insert a new scene (equivalent to Live's "Capture and Insert Scene" command).

### Knobbler4 to Tablet

#### /clips/grid {JSON object}

Full grid snapshot: `{ left, top, clips: rows }`. Each cell is `{s, n?, c?, hsb, ps?, hc?}` where `s` is the clip state, `n` is the clip name, `c` is the color, `hsb` is has_stop_button, `ps` is playing_status (group tracks only), and `hc` is has_child_clips (group tracks only).

#### /clips/update {JSON array}

Batched cell state updates: `[{t, sc, s, n?, c?, hsb, ps?, hc?}]`. Sent when individual cells change state.

#### /clips/scenes

Sent as chunked data (`/clips/scenes/chunk`). Array of `{n, c?}` objects for all scenes, where `n` is the scene name and `c` is the optional color.

#### /clips/selectedScene {integer}

The index of the currently selected scene.

#### /clips/trackInfo {JSON object}

Track info updates. Either a full batch `{ left, tracks: [{n, c}] }` or an individual update `{ t, n?, c? }` for name or color changes.
