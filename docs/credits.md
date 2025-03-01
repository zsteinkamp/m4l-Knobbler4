## Credits

Many thanks to everyone who has shared experiences with Knobbler with me through the years, in the form of bug reports and anecdotes. I made Knobbler for myself, but it's been so fun to share it with so many people all around the world.

### Beta Test Crew

Huge thanks to each person below. Without your input, Knobbler wouldn't have been nearly what it is today.

- [Andrew Norris](https://andrewnorris.uk/)
- [Boscomac](http://boscomac.free.fr/)
- [David Baa Baa Blacksheep](https://www.youtube.com/watch?v=6YR5sOgt4Eo)
- [UPRIZE](https://open.spotify.com/album/5Cfwba3Xs2eStAyqeBCNya?si=R_EMzXv-R8qHRu9ju-T-_w)
- Andrew Carroll
- David Forman
- D.J.
- Marcin Wiraszka
- Jasper de Jong
- Richard

### Open Source Power

This app was built using the excellent [Expo](https://expo.dev/) framework. As a 30-year veteran of web development, it was a very familiar environment and I was up and running with "Hello, World!" running on my iPad in less than an hour.

On the networking side, I made use of a fork-of-a-fork-of-a-fork of an OSC library. At its core, I am using a fork of [SwiftOSC](https://github.com/zsteinkamp/SwiftOSC), and my own fork of the [expo-osc](https://github.com/zsteinkamp/expo-osc) wrapper for it.

On the Max for Live side, it's just my usual Docker [Devcontainer / Typescript](https://github.com/zsteinkamp/m4l-typescript-base) environment to manage the various facets of Knobbler -- Knobbler, Bluhand, Navigation, Mixer, Shortcut Buttons, and Toolbar Buttons. There's a nifty JS-based [routing](https://github.com/zsteinkamp/m4l-Knobbler4/blob/main/src/router.ts) layer in there too.

The OSC communication in Max is handled by good old `[udpsend]` and `[udpreceive]`. It's almost like they wanted us to build stuff like this :)
