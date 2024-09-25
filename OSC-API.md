This document exists to catalog the full set of OSC messages used for control and display between the Knobbler4 Max for Live device and a physical interface, such as TouchOSC running on an iPad. Because the standard OSC protocol is used, you are free to develop alternative interfaces to interact with Knobbler4.

## Knobbler

### Interface to Knobbler4

#### `/valN {float}`

Sets the value of Slot N, as a float between 0 and 1, inclusive. If Slot N is already mapped, Knobbler will then quietly update the assigned parameter in the Live set with the value. If Slot N is not mapped and there is a selected parameter in the Live Set, then that parameter will be mapped to Slot N and resulting name, color, and value messages will be sent to update the interface.

#### `/unmapN`

Removes the mapping for Slot N. Has side effects of messages sent from Knobbler to interface to update name, color, and value to unassigned values.

#### `/default valN`

Sets the value of the parameter mapped to Slot N to its default value. Does so in a way to trigger an update back to the interface.

#### `/trackNtouch 1`

Switch the Live display to the track corresponding to Slot N.

### Knobbler4 to Interface

#### `/deviceN {string}`

Updates the device name for Slot N.

#### `/paramN {string}`

Updates the parameter name for Slot N.

#### `/track {string}`

Updates the track name for Slot N.

#### `/valN {float}`

Updates the slider for Slot N to the given value.

#### `/valNcolor {string}`

Updates the color of the slider for Slot N to the one given. Must be a hexidecimal string in the form RRGGBBAA.

#### `/valStrN {string}`

Updates the string representation of Slot N's mapped parameter value, e.g. (-6db or 2.5KHz).

## Bluhand

### Interface to Knobbler4

#### `/bvalN {float}`

Sets the value of Slot N, as a float between 0 and 1, inclusive. Knobbler will then quietly update the corresponding parameter in the selected device in the Live set with the value.

#### `/bdefault bvalN`

Sets the value of the parameter mapped to Slot N to its default value. Does so in a way to trigger an update back to the interface.

#### `/bbankPrev`

If not looking at the first bank, has the effect of switching the Interface to the previous bank of parameters. Causes a full update of slot names and values.

#### `/bbankNext`

If more banks of parameters are available, then switch the Interface to the next bank of parameters. Causes a full update of slot names and values.

### Knobbler4 to Interface

#### `/bcurrDeviceName {string}`

Updates the current track / device name in the display.

#### `/bTxtCurrBank {string}`

Updates the text that indicates the current bank, e.g. "Bank 2 of 6".

#### `/bparamN {string}`

Updates the parameter name for Slot N.

#### `/bvalN {float}`

Updates the slider for Slot N to the given value.

#### `/bvalNcolor {string}`

Updates the color of the slider for Slot N to the one given. Must be a hexidecimal string in the form RRGGBBAA.

#### `/bvalStrN {string}`

Updates the string representation of Slot N's mapped parameter value, e.g. (-6db or 2.5KHz).

## Misc

### Knobbler4 to Interface

#### `/toggleInput {0, 1}`

Update the "active" state of the Toggle Input interface button.

### Interface to Knobbler4

#### `/currentParam {float}`

Sets the currently selected parameter in the Live Set (usually indicated with lines at the corners of the parameter) to the given value.

#### `/toggleInput {0,1}`

If the currently selected track has active input routing (i.e. has a value other than "None" selected under the "MIDI From" or "Audio From" dropdowns), then the input routing selection will be stored internally in the device and the track will be set to `None`.

If the track input is currently set to `None`, then if the prior input setting was stored it will be restored, otherwise the first input will be chosen.

This is useful when recording automation over existing MIDI clips, since the recording state of a MIDI/Instrument track cannot be disabled. Simply disable the input with this message, record your automation overdub, then re-enable the inputs when needed. The underlying MIDI clips will not be modified.

#### `/loop`

Sent out as part of the network startup sequence to detect network loops (e.g. the send and receive destination being the same). If `/loop` is received, then network communication is halted until the `host` or `port` values are changed.
