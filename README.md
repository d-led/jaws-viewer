# Jaw Scan Viewer

A web viewer for intraoral scanner exports — the folder an Aoralscan (or any exocad-based
system) hands over: several `.stl` scans plus the `.dentalProject` case description and the
`.matrix4` placement transform.

Nothing is uploaded. Files are read in the browser and never leave the machine.

## What it does

- **Loads a bundle** by dropping it on the page — loose files, the whole export folder, or a
  `.zip` of it. Multiple nested archives are unpacked, and files are identified by their
  contents rather than their extensions.
- **Remembers the bundle** you had open, so a reload brings it straight back. The files are
  kept in IndexedDB; `Forget` in the sidebar clears them.
- **Opens the bite** with the `Open / explode` slider, which lifts each layer along the
  occlusal axis in proportion to how high it sits, so the surfaces that were touching become
  visible.
- **Switches the reference grid** from the same list the layers are in, and remembers it.
- **Stays out of the way**: the case details and the transform fold away, and the transform sits
  at the bottom of the panel — it is an advanced control, not an everyday one.
- **Shows each scan as its own layer** with visibility, colour and a transparency slider, so
  jaws and preparation dies can be read through one another.
- **Solo** isolates a single layer and brings the others back.
- **Applies the `.matrix4` transform** per layer, so the difference between the exported
  placement and the raw scan space can be seen by ticking a box.
- **Shows the case metadata**: patient, practice, tray number, tooth colour, antagonist type
  and the sending practice's notes.
- **Orbit, pan and zoom** with a mouse or by touch, snap to orthographic views, and toggle
  the reference grid and full screen.

## Getting started

```bash
npm install
npm run dev          # hot-reloading dev server on http://localhost:5173
```

Then drop your export onto the page, or use **Open folder…**.

### Scripts

| Script                     | What it does                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`              | Hot-reloading dev server (edit any file under `src/` and the page updates in place). |
| `npm run watch`            | Alias of `dev`.                                                                      |
| `npm run build`            | Type-checks, then writes the production bundle to `dist/`.                           |
| `npm run preview`          | Serves the built bundle, to check the production output.                             |
| `npm start`                | Alias of `preview`.                                                                  |
| `npm test`                 | Runs the unit suite once.                                                            |
| `npm run test:watch`       | Re-runs affected unit tests as files change.                                         |
| `npm run test:e2e`         | Builds, serves the built app and drives it in a real browser.                        |
| `npm run test:e2e:desktop` | The end-to-end suite on a desktop viewport only.                                     |
| `npm run test:e2e:mobile`  | The end-to-end suite on a phone viewport only.                                       |
| `npm run test:e2e:report`  | Opens the HTML report from the last end-to-end run.                                  |
| `npm run typecheck`        | `tsc --noEmit` on its own.                                                           |
| `npm run prettier`         | Rewrites the formatting in place (`.prettierrc`).                                    |
| `npm run prettier:check`   | Reports formatting without writing anything.                                         |

## Navigating the model

| Input                                                  | Action                    |
| ------------------------------------------------------ | ------------------------- |
| Left-drag                                              | Orbit                     |
| Wheel                                                  | Zoom toward the pointer   |
| Right-drag                                             | Pan                       |
| `Top` / `Bottom` / `Front` / `Back` / `Left` / `Right` | Snap to an axis view      |
| Re-center                                              | Frame every visible layer |

### On a touch screen

The 3D view and the page compete for the same finger. Here the model wins the first finger and
the page gets the second:

| Input                        | Action                                                     |
| ---------------------------- | ---------------------------------------------------------- |
| One finger                   | Orbits — and nothing else, so a drag never scrolls as well |
| Two fingers, moving together | Scrolls the page to the panel below the model              |
| Two fingers, pinching        | Zooms the model                                            |

A browser cannot scroll from a two-finger drag on a touch screen, so that gesture is done by
hand in `src/viewer/two-finger-scroll.ts`: the movement of the two fingers' midpoint becomes a
scroll, and panning the model is stood down while they are down so the two never fight. Zooming
is deliberately left alone, because a pinch barely moves the midpoint. The canvas is
`touch-action: none` so the browser never pans the page from a one-finger drag, and the page —
not just the panel — is allowed to scroll on a narrow screen, so there is something for two
fingers to move.

A hint over the model says so, and disappears once a two-finger gesture has been used.

Folder picking is left out on iOS and Android, which ignore `webkitdirectory`; there the empty
state points at picking the files, or a `.zip` of the folder, instead. Archives are found by
their contents rather than their name — the empty state is honest about this because a zipped
folder is the only way to hand a whole bundle to a phone.

Scan space is treated as Z-up, the convention intraoral and CAD exports share, so `Top` is the
occlusal view.

## Reading the export

| File              | What it is                               | What the viewer does with it                                                       |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `*.stl`           | One scan each, ASCII or binary.          | A layer. Triangle counts are read from the file header before rendering.           |
| `*.dentalProject` | XML (`<Treatment>`) describing the case. | The case panel. Usually XML, occasionally a vendor archive, which is unpacked too. |
| `*.matrix4`       | XML (`<Matrix4>`) with a 4×4 transform.  | Offered to each layer as a placement.                                              |

### The `.matrix4` convention

The matrix is written with the **translation in the last row** (`_30`, `_31`, `_32`) and
`0 0 0 1` in the last column. That is the row-vector convention, where a point transforms as
`p' = p × M`. three.js uses the column-vector convention (`p' = M × p`), so the entries are
transposed on the way in — see `toColumnVectorEntries` in `src/domain/matrix4.ts`.

**No layer starts with the transform applied**, and the ticks exist to inspect what it would
do. Measuring a real export explains why:

| Layer                       | Median distance to the jaw surfaces |
| --------------------------- | ----------------------------------- |
| `TotalJaw0` as exported     | 0.36 mm                             |
| `TotalJaw0` with the matrix | 31.8 mm                             |
| `TotalJaw1` as exported     | 0.34 mm                             |
| `TotalJaw1` with the matrix | 12.7 mm                             |

The scans already ship registered in one scan space — each `TotalJaw` piece sits on the jaw
surface to a fraction of a millimetre — and applying the matrix throws them 13–32 mm out of
the mouth. It is not a registration _between_ the two `TotalJaw` scans either: they stay
about 37 mm apart whether or not it is applied.

So the matrix reads as the export's jaw-motion registration rather than a display placement.
If you know its intended meaning in your workflow, the default is a one-line change in
`src/ui/metadata-panel.ts`.

### There is no jaw-dynamics data here

`Matrix4` holds exactly sixteen numbers — one static pose. A jaw-motion recording would be a
_series_ of matrices over time, and this bundle also declares
`<MovementMarkerScan>false</MovementMarkerScan>`. The whole export is six files: four meshes,
the project XML and the matrix. Nothing in it describes movement.

A hinge axis cannot be derived from the meshes either. The scans are dental **arches**, not
mandibles: the lower jaw stands 7.7–17.8 mm tall in every slice from back to front, with a
horseshoe footprint (29 → 66 → 57 mm). A mandible would show the ramus rising to roughly 70 mm
at the posterior, and there are no condyles here to place a terminal hinge axis on.

That is why `Open / explode` is a lift along the occlusal axis rather than a rotation about a
hinge: it is the separation the data actually supports. `separationOffsets` in
`src/domain/explode.ts` is where that rule lives.

## Keeping the bundle between visits

The files of the last loaded bundle are kept in IndexedDB, and `main.ts` restores them on
load — no re-picking after a refresh. The **raw files** are stored rather than the parsed
bundle, so restoring runs exactly the same reader as a fresh drop, and there is only one way
for a bundle to be understood.

IndexedDB rather than `localStorage`, because a bundle is tens of megabytes of mesh and
`localStorage` holds only strings within a few megabytes — binary would have to be inflated
into base64 and would not fit. Each file's bytes are copied into a buffer of their own before
being stored, because zip entries arrive as views into one shared decompression buffer.

If keeping fails — a full disk, a private window — the viewer says so next to the status and
carries on; the bundle stays loaded for the session either way.

## Architecture

```
src/
  domain/     Pure data and rules: the bundle, the project, the matrix, scan naming.
  parsing/    Turning bytes and XML text into domain values. No DOM, no three.js.
  io/         Reading the user's files: entries, archives, directory drops.
  viewer/     The 3D surface (three.js) behind the Viewport interface.
  ui/         DOM panels and the app shell.
  support/    Small helpers: formatting, error messages.
```

Dependencies point inwards only. `domain` knows nothing about XML, the browser or three.js;
the UI never touches a renderer — it drives the `Viewport` interface, which is what makes the
interaction testable without a GPU. `three.js` is confined to `viewer/`.

### Libraries

| Library                                                                   | Used for                                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [three.js](https://threejs.org)                                           | Rendering, `STLLoader`, `OrbitControls`, environment lighting.    |
| [fflate](https://github.com/101arrowz/fflate)                             | Unpacking dropped `.zip` archives.                                |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval)                 | Keeping the last bundle in IndexedDB between visits.              |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | Reading the two XML files, in the browser and in tests alike.     |
| [Vite](https://vite.dev)                                                  | Dev server with hot module replacement, and the production build. |
| [Vitest](https://vitest.dev)                                              | Tests, with `happy-dom` for the UI ones.                          |

## Publishing

Pushing to `main` runs two workflows:

- `.github/workflows/ci.yml` — unit tests, the production build, and the browser suite on both
  the desktop and phone projects. A failing run keeps the Playwright report as an artifact.
- `.github/workflows/pages.yml` — builds the site and deploys it to GitHub Pages.

Turning Pages on is a one-time setting: **Settings → Pages → Build and deployment → Source →
GitHub Actions**. Nothing else is needed — there is no server, and what gets deployed is only
static files.

A project site is served from `/<repository>/`, so the workflow hands the Pages base path to Vite
as `VITE_BASE` and every asset URL is prefixed with it. `vite.config.ts` falls back to the root
when that is empty, which is what a user or organisation site wants.

## Code style

Prettier owns the formatting, driven by `.prettierrc` — two spaces, no tabs — taken from
`mermaidlive`. Everything Prettier understands is formatted, including the workflows and this
file; `.prettierignore` covers the build output, the generated lockfile, the bundles the
end-to-end tests write, and `data/`.

```bash
npm run prettier         # rewrite in place
npm run prettier:check   # report only
```

`prettier:check` is not wired into CI, matching `mermaidlive`. Adding it as a step in the
`checks` job is a one-liner if you want the formatting enforced rather than merely agreed.

Four `// prettier-ignore` comments protect the four-to-a-line layout of 4×4 matrices — the
`Matrix4Entries` tuple, both halves of the transpose, and one test fixture. Prettier's only
alternative there is to stack sixteen numbers vertically, which loses the very thing those
files are about. They are the only exceptions in the repository.

## Tests

```bash
npm test
```

The suite covers the parsing, reading and naming rules, the matrix convention, and the
interaction contract of the panels and app shell — the UI tests run against a recording
`Viewport`, so they assert what the user's click asks the 3D surface to do.

`tests/sample-export.test.ts` additionally loads a real export from `data/` when one is
present, and skips itself when it is not.

### End-to-end tests

```bash
npm run test:e2e
```

Playwright drives the built app in a real browser, in two projects: `desktop` and `mobile` (a
phone viewport with touch). The mobile specs are what hold the responsive layout and the
gesture split in place — including the two rules that matter most on a phone, driven through
CDP rather than assumed: **one finger must not scroll the page**, and **two fingers must**.

`e2e/sample-bundle.ts` writes the bundle the specs use: three 12-triangle boxes, a case XML and
a transform, loose on disk _and_ zipped up with the meshes in a folder. It is generated, not
committed, so no patient data is anywhere in this repository.

Two details worth knowing if a run looks flaky:

- The suite runs with `workers: 1`. Software WebGL in headless Chromium crashes the page when
  several browsers render at once, which shows up as "session closed" rather than a failure.
- Headless Chromium needs `--enable-unsafe-swiftshader` to give WebGL at all; that is set in
  `playwright.config.ts`.

## License

[Mozilla Public License 2.0](LICENSE).

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy
of the MPL was not distributed with this file, You can obtain one at
https://mozilla.org/MPL/2.0/.

`LICENSE` is the verbatim MPL 2.0 text as published by Mozilla, with no copyright line added
to it. Add your own name or entity — to `LICENSE`, or as a notice in the source files — before
distributing.
