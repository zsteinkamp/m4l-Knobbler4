# Knobbler4

An auto-labeling control surface for Ableton Live.

## Bluhand

The `Bluhand` tab displays pages of 16 parameters for the currently selected device. Ableton indicates this with a "Blue Hand" icon in the device title bar.

If you have a control surface attached to the computer, then you should be seeing the Blue Hand in the title bar.

If you do not have a blue hand, then you can set up a fake control surface.

- Enable the IAC driver in Audio + Midi Setup
  - Double-click the IAC Driver in the MIDI Studio view
  - Check the "Device is online" checkbox
- Open Ableton Live's Preferences and go to the Link, Tempo & MIDI page
- Choose any control surface from the dropdown
- Enable control surface _output_ for the IAC device

## Development

See the docs at [the m4l-typescript-base repo](https://github.com/zsteinkamp/m4l-typescript-base) for instructions on how to develop in this device.

## TODOs

- ...
