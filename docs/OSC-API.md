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

### Knobbler4 to Tablet

#### /deviceN {string}

Updates the device name for Slot N.

#### /paramN {string}

Updates the parameter name for Slot N.

#### /paramNauto {integer}

The automation state for the parameter in Slot N.

#### /track {string}

Updates the track name for Slot N.

#### /valN {float}

Updates the slider for Slot N to the given value.

#### /valNcolor {string}

Updates the color of the slider for Slot N to the one given. Must be a hexidecimal string in the form RRGGBBAA.

#### /valStrN {string}

Updates the string representation of Slot N's mapped parameter value, e.g. (-6db or 2.5KHz).

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

#### /hideChains {deviceID}

If collapsing a rack, this message is sent to Live so that it can hide the chain devices display in that rack. Otherwise every rack will eventually be fully expanded and that gets overwhelming / messy.

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

## Toolbar

### Knobbler4 to Tablet

#### /arrangementOverdub { 0 | 1 }

Indicates if the arrangement overdub button is engaged.

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

## Misc

### Knobbler4 to Tablet

#### /ack

Response to a `/syn` message to facilitate, e.g. for feedback in setting up the tablet-computer connection.

#### /page/X

Sent when one of the tabs in the Max for Live device is clicked. `X` can be:

- knobbler1
- knobbler2
- bluhand

#### /toggleInput {0, 1}

Update the "active" state of the Toggle Input interface button.

### Tablet to Knobbler4

#### /toggleInput {0,1}

If the currently selected track has active input routing (i.e. has a value other than "None" selected under the "MIDI From" or "Audio From" dropdowns), then the input routing selection will be stored internally in the device and the track will be set to `None`.

If the track input is currently set to `None`, then if the prior input setting was stored it will be restored, otherwise the first input will be chosen.

This is useful when recording automation over existing MIDI clips, since the recording state of a MIDI/Instrument track cannot be disabled. Simply disable the input with this message, record your automation overdub, then re-enable the inputs when needed. The underlying MIDI clips will not be modified.

#### /loop

Sent out as part of the network startup sequence to detect network loops (e.g. the send and receive destination being the same). If `/loop` is received, then network communication is halted until the `host` or `port` values are changed.

#### /syn

A request for an `/ack` response to facilitate a UX feedback loop when configuring the connections.
