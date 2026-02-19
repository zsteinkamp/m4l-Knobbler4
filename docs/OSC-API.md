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

#### /nav/tracks

JSON-stringified array of track array objects. See the source file `src/consts.ts` to see the field ID definitions. e.g.

```
[
  [0,3,"1-MIDI","FFF034",0],
  [0,10,"2-MIDI","99724B",0],
  [0,11,"3-Audio","F7F47C",0],
  [0,12,"4-Audio","FFA529",0],
  [2,13,"A-Reverb","10A4EE",0],
  [2,14,"B-Delay","00BFAF",0],
  [3,15,"Main","19E9FF",0]
]
```

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

#### /ack

Response to a `/syn` message to facilitate, e.g. for feedback in setting up the tablet-computer connection.

#### /page/X

Sent when one of the tabs in the Max for Live device is clicked. `X` can be:

- knobbler1
- knobbler2
- bluhand

#### /pong

Response to a `/ping` message to keep the network connection "warmed up".

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

#### /syn

A request for an `/ack` response to facilitate a UX feedback loop when configuring the connections.
