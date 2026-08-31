# Desktop build

Wraps the web app as a real application: its own window, a taskbar entry, no
terminal window to leave open, and no port to collide with.

```bash
cd instructor/desktop
npm install
npm start              # run it
npm run dist:win       # build for Windows  -> dist/
npm run dist:mac       # build for macOS
```

`prepare.js` copies the app from one directory up before each build, so the
desktop and browser versions cannot drift apart.

## Why a custom scheme rather than localhost

Files are served through `workbench://app`, not `http://localhost:PORT`.

Browser storage is keyed by origin. A port-based desktop app that fell back to
a different port — or picked a free one at random, as they usually do — would
open on a different origin and present the instructor with an empty gradebook
and no explanation. `workbench://app` is the same origin on every launch, on
every machine, permanently.

This is verified rather than assumed: the test closes the app, reopens it, and
checks the roster is still there.

## Cross-building

Building a Windows package from Linux or macOS works, with one limitation:
editing and signing the `.exe` needs Wine, so `signAndEditExecutable` is off.
The executable runs, but it is unsigned and carries the default icon, and
Windows shows its usual SmartScreen warning on first launch — click
**More info → Run anyway**.

For a signed build with a proper icon, run `npm run dist:win` on Windows.
