# Knobbler4

Knobbler4 turns your iPad into an auto-labeling, auto-coloring, multitouch parameter control surface for Ableton Live.

![Knobbler4 in Action](images/external-with-hand.jpg)

Map parameters in your Ableton Live set to unmapped sliders on the iPad with a single touch. No need to enter and exit a mapping mode. Access every parameter in the currently selected device, directly on the iPad.

Parameter mapping configuration is saved with your Live Set, so you can switch between songs with minimal friction. Track, device, and parameter names are kept synchronized with your Live Set as you change them, even track colors!

Parameter sliders and values are updated in real time, with the same units (e.g. dB, ms, %) displayed as what you see in Live. Double tap a slider on the iPad to reset the parameter to its default value.

Also provides a high-resolution slider that operates on the currently selected parameter in your Live Set, and a Record-Enable toggle switch to improve the process of overdubbing automation.

[Here is a playlist of videos featuring Knobbler4](https://www.youtube.com/playlist?list=PLqzTnRgmRId6cHDkhw_qqJL7dC67Qu440).

## Changelog

- 2024-12-20 [v10](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v10/Knobbler4-v10.zip) - Fix a bug in Current Param Knob that displayed garbled value strings and sometimes led to a crash. Thanks @rds2024-3004 for reporting the bug!
- 2024-12-04 [v9](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v9/Knobbler4-v9.zip) - Simplify main patch with a JS-based OSC router; Fix bug around button param vals; Fix CurrentParamKnob warnings when no param is selected; Bundle versioned TouchOSC template in the zip.
- 2024-12-01 [v8](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v8/Knobbler4-v8.zip) - Fixes a bug that would affect recall if a track or device was moved.
- 2024-11-30 [v7](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v7/Knobbler4-v7.zip) - Use the chain color/name instead of the track's if the parameter's device is in a rack.
- 2024-11-28 [v6](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v6/Knobbler4-v6.zip) - Fixes Issue #10 reported by @rds2024-3004 which prevented multiple knobs mapped to the same parameter from being updated. This led to some more widespread fixes/improvements to how locks are implemented across the board.
- 2024-10-29 [v5](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v5/Knobbler4-v5.zip) - Add non-blocking telemetry ping on load. Does not send any identifying information, only the plugin name, the local computer name, type of computer, and CPU type. I just want to see which plugins are used the most.
- 2024-10-24 [v4](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v4/Knobbler4-v4.zip) - Add assignable device presets to Bluhand.
- 2024-10-12 [v3](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v3/Knobbler4-v3.zip) - Fix bug related to slider 25 masquerading as slider 15; Typography refinement in the .tosc file; Consolidate back to a single `Knobbler4.tosc` file (Bluhand is back, baby!); Fix value display in Bluhand if the value was a bare number; Fix bug with changing devices in Bluhand if you were not on bank 1, the display would be incorrect. _NOTE: Use the Files app on the iPad to delete the `.tosc` files before updating with the new version from here._
- 2024-09-22 [v2](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v2/Knobbler4-v2.zip) - Re-adds Bluhand functionality, double-tap a slider to return to the default value. Make sure you update the `.tosc` files on your iPad when downloading this update!
- 2024-09-08 [v1](https://github.com/zsteinkamp/m4l-Knobbler4/releases/download/v1/Knobbler4-v1.zip) - Initial release.

## Installation

### Requirements

- Computer running Ableton Live 12
- iPad or Android tablet running [TouchOSC](https://hexler.net/touchosc#get)

### Steps

1. Download the .zip file from the latest [release](https://github.com/zsteinkamp/m4l-Knobbler4/releases)
1. Unzip the file
1. Drag the `Knobbler4.amxd` file to Live's User Library
1. Add Knobbler4 to a MIDI/Instrument track in your Live Set
1. Copy the `Knobbler4.tosc` (or `Knobbler4-with-bluhand.tosc`) file to your iPad (e.g. with AirDrop)
1. Configure TouchOSC on the iPad to talk OSC to your computer. (NOTE: If you want to connect over USB, see the [instructions here](USB.md).)
   ![Ports](images/ports.png)
   - In TouchOSC on the iPad, click the Chain icon in the toolbar
   - Select "OSC" in the left-side menu
   - Click "Browse" under Connection 1
   - You should see your computer's hostname followed by "Knobbler4"
   - Select that item, then select the IPv4 address in the sub-menu (e.g. 10.1.1.1:2346)
     ![Connection Selection](images/touchosc-connect-1.png)
   - Set the "Receive Port" to 2347. This is the port that TouchOSC on the iPad listens on.
     ![Connection Selection](images/touchosc-connect-2.png)
   - Press `Done` in the upper-right
1. In the TouchOSC toolbar, press the "Play" (triangle) icon to toggle out of Editor mode.
1. Back in Knobbler, click "Rescan Net".
1. Your iPad should show up in the drop-down below. Select it, and you should be in business!
   ![Select iPad](images/ipad-connect.png)

_NOTE: You **MUST** have a control surface configured in Ableton Live. If you do, then you will see the "Blue Hand" icon in the title bar of the selected device._

![Blue Hand Icon](images/blue-hand.png)

If you do not see the Blue Hand, then you will need to set up a "dummy" control surface in order for the Bluhand portion of Knobbler to work. To do this, you can open the settings in Live and switch to the Link, Tempo & MIDI tab. Chooose any control surface from the list and assign its input to the IAC driver.

![Control surface setup](images/control-surface-setup.png)

If you do not have the IAC driver set up, then open the Audio & Midi Setup app, open the MIDI window, double click the IAC driver and make sure it is Online.

![IAC Driver configuration](images/iac-driver.png)

## Usage

### Mapping Parameters

1. Select any parameter in Ableton Live by clicking on it. A border or corners of a border will appear around the object, e.g. "Frequency" below...

   <img alt="Selected Parameter" src="images/selected-param.png" style="width: 384"/>

2. Touch any unmapped slider on the iPad screen.
3. Voila!

### Unmapping Parameters

1. Touch the `X` icon in the upper-left corner of the iPad screen. The sliders will all turn into red rectangles.
2. Touch a red rectangle to unmap the parameter.
3. Touch the `X` icon again to leave unmapping mode.

### Bluhand

Ableton Live uses a blue hand icon to indicate which device is currently under control of a control surface.

   <img alt="Selected device" src="images/bluhand-device.jpg" style="width: 384"/>

If you use the `Knobbler4-with-Bluhand.tosc` TouchOSC layout on your iPad, then you can use the `Bluhand` tab to access all of the parameters the currently selected device offers.

   <img alt="Device parameters on iPad" src="images/bluhand-ipad.jpg" style="width: 384"/>

If the current device has more than 16 parameters, then you can use the `<<<` and `>>>` controls in the upper-right of the Bluhand tab to access different banks / pages of parameters.

HOT TIP: You can assign a keystroke to a device. This lets you access all of a device's parameters on the iPad with a single keystroke. To do this:

- Press Cmd-K
- Select the device you want to assign
- Press the key you want to use to focus that device
  ![Key mapping](images/key-mapping.png)
- Press Cmd-K to exit mapping mode
  Now, with the iPad on the Bluhand tab, you can press a single key (e.g. "k" for your kickdrum) and access all of its parameters on the iPad.
  ![Jump to device](images/key-device.jpg)

NOTE: If you do not see the Blue Hand icon on the current device, then go to the Ableton Live settings and configure any control surface to connect any input port. You may need to configure an IAC MIDI port in the Audio MIDI Setup app if on a Mac.

### Double-tap Default

Double-tap any slider to return the parameter to its default value.

### Jump to Track

Tap a track name on one of the Knobbler tabs to navigate to that track in Live.

### Current Param Slider

Along the bottom of the iPad screen is a horizontal slider that is used to control the currently selected parameter in your Live Set. This parameter does not have to be mapped to a slider. You can use that slider to control the paramter with a high degree of accuracy.

### Toggle Record Enable

Recording automation is sometimes frustrating, especially in MIDI tracks since you cannot disable recording easily. I created this feature so that I could easily record and overdub automation without recording into or changing anything about MIDI clips.

The Toggle Record Enable button gives you a way to easily disable and re-enable MIDI or audio recording in the currently selected track. The input settings are retained when recording is disabled.

## OSC API

Knobbler uses the standard OSC protocol to communicate between the Max for Live device and TouchOSC on your iPad or other tablet. If you would like to develop your own TouchOSC template, or create an alternative interface (e.g. hardware!) then have a look at the [OSC API specs here](./OSC-API.md).

## Development

See the docs at [the m4l-typescript-base repo](https://github.com/zsteinkamp/m4l-typescript-base) for instructions on how to develop in this device.

## TODOs

- ...

## Feedback Welcome!

Please let me know if you have any stories, good or bad, about your Knobbler4 experience. I'd love to hear your feedback and ideas of how to make it better! zack@steinkamp.us
