## Updating the Max Device

Updates to the Knobbler iPad / Android app sometimes necessitate an update to the Knobbler Max for Live device.

The minimum Max for Live device version is coded into each Knobbler app release, and is only changed with truly necessary, since updating the device does not happen automatically.

It is very easy to update the device in your existing Live Sets, and this document shows a couple of strategies for managing it.

### Method 1: Use the "Hot-Swap" function of Live

Simply download the latest Knobbler release (buttons on the top and bottom of this page) and then drag the downloaded file to your User Library in Live.

![Knobbler in the User Library](images/user-library.png)

Each device you add to your set has a Hot-Swap button in the toolbar. This allows you to swap the device for another. In the case of Knobbler, this lets you update to a newer version of your device *without losing your mappings*.

![Hot-Swap Button](images/device-swap.png)

Click the Hot-Swap button then locate and double-click the newest Knobbler you added to your User Library.

This will swap out the older Knobbler device for the newer one.

Save your Live Set and you are good to go!

### Method 2: Copy the versioned file to an unversioned file

This one is a little more involved at download time, but will let you open old sets without having to change anything.

After downloading the latest Knobbler and adding it to your User Library, rename it to "Knobbler4.amxd". Then use this unversioned file to use with your Live Sets.

![Rename Menu](images/rename-1.png)

If you always do this when updating Knobbler, then opening Live Sets will "just work" to use the latest version of the Knobbler device.

![Renamed](images/rename-2.png)

### Version Compatibility: Mix and Match Freely

You do not have to keep the app and the Max for Live device on matching versions. **Any app version works with any device version.** When they connect, the app and device negotiate capabilities — each one advertises what it supports, and they only use the features they have *in common*.

This makes Knobbler forgiving about how you upgrade:

- **Update the app but not the device** (or vice versa) and everything you already use keeps working. Newer features simply stay dormant until *both* sides are recent enough to support them.
- **Roll back** to an older app or an older device — for example, to reopen an archived Live Set on a machine that has not been updated — and the connection still works. The pair just falls back to the feature set they share.
- **Run different versions across machines and devices.** A phone on an older app and a tablet on the newest one can both talk to the same Live Set at the same time, each using whatever it and the device mutually support.

There is no hard "you must update everything at once" requirement. The only time the app shows an update prompt is when an app feature genuinely needs a newer device than the one it found — see [Updating the Max for Live Device](troubleshooting.md#i-see-a-warning-in-the-knobbler-ipad-app-about-a-compatible-version-of-the-device-haaalp) in Troubleshooting.

If you have questions, you can always [email me](mailto:zack@steinkamp.us).
