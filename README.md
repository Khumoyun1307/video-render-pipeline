# Render pipeline

Renders video projects on GitHub Actions, many jobs at the same time, so the laptop does not have to. Three engines are available, each pinned to one tested version:

| Engine | Version | Good for |
|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | **0.9.72** | Narrated explainers built from HTML scenes with the scene kit (the existing channel productions). |
| [Remotion](https://www.remotion.dev) | **4.0.540** | Videos written as React components: data-driven or templated series, charts, many similar videos from one design. **Licence: see below before using it for a real production.** |
| [Manim Community](https://www.manim.community) | **0.22.1** | Mathematical animation: equations (LaTeX), graphs, geometry, step-by-step derivations. |

**This repository is public.** Everything committed here, the run logs and the rendered parts (until they are deleted after download) can be seen by anyone, and copies cannot be taken back. Commit a production's picture only when it may be seen before the video is out.

## What runs where

| Step | Where |
|---|---|
| Narration, word timing, scene building, stills and checks while building | the laptop |
| Renders (the only step that loads every CPU core) | GitHub |
| Download of the parts, join, adding the narration, final check, upload | the laptop |

The narration is never uploaded: the picture is rendered silent and the sound is added on the laptop after the download. The laptop never renders; for Remotion it only needs `npm install` once per production to write the lockfile (and only if you want Remotion Studio for previews).

## Using it for a production

Whatever the engine, a production is a folder `productions/<name>/` with a `pipeline.json`, and the same commands apply:

1. Put the render inputs in `productions/<name>/` (see the engine sections below).
2. Look at `git status`, then `git add -A`, `git commit`, `git push`. The commit is refused if it holds anything forbidden.
3. Render, download, join and add the narration in one go:
   `node tools/cloud.mjs render <name> --audio "<path to narration_master.wav>" --out "<path to final.mp4>"`
4. Check the result: `node tools/verify.mjs <name> --file "<path to final.mp4>"` (size, frame rate, frame count, clean decode).
5. Re-render one part after a change (commit and push first): add `--only "<project>"` (a chapter, a composition or a scene). The other parts are reused from `out/<name>/parts/`.

Without `--audio` the result is a silent picture. Without `--out` it is written to `out/<name>/<name>.mp4` (never committed). `node tools/cloud.mjs join <name> --audio ...` joins the parts already downloaded again, for example with a new narration, without GitHub.

### Choosing the engine

`pipeline.json` has an `engine` field: `"hyperframes"` (the default, so older productions need no change), `"remotion"` or `"manim"`. Each engine has its own workflow file (`render.yml`, `render-remotion.yml`, `render-manim.yml`) and `tools/cloud.mjs` starts the right one. Separate files because the three set-ups have nothing in common (a browser and HyperFrames; Node packages from a lockfile; a Python container), the proven HyperFrames workflow stays untouched, and each engine's run history stays apart on GitHub. What is shared is everything around the render: the plan, the parts' names, the download, the join, the sound, the artifact clean-up, the checks. Each workflow refuses a production made for another engine.

Common fields: `fps` (30), `format` (`"landscape"` 1920x1080 or `"vertical"` 1080x1920 for Shorts), `projects` (in playing order), `sliceSeconds` (HyperFrames and Remotion: a project longer than one and a half times this is cut into slices that render at the same time), `workers` (CPU threads per job).

### HyperFrames

```
productions/<name>/
  pipeline.json      settings and the list of projects, in playing order
  kit/               shared css, js, fonts (.woff2 with OFL-*.txt), images   (optional)
  ch01/ ch02/ ...    one HyperFrames project each: index.html, hyperframes.json, scene.js, scene.css, cues.js, assets/img/
```

For a production built with the scene kit (a `04_visuals` folder): `node tools/import-production.mjs "<path to 04_visuals>" <name>` copies only what a render needs and says what it left behind.

```json
{
  "fps": 30, "quality": "high", "workers": 4, "sliceSeconds": 45,
  "projects": ["ch01", "ch02"],
  "vendor": [{ "npm": "gsap@3.14.2", "file": "dist/gsap.min.js", "to": "assets/kit/gsap.min.js" }]
}
```

Slices are cut on whole seconds and joined without re-encoding. `vendor` files are fetched from npm at the stated version on the runner (and by `node tools/prepare.mjs <name>` on the laptop) instead of being committed. Shorts work the same way, one project per Short, built without their narration file; the sound is added locally with `--audio`.

### Remotion

The production folder is one ordinary Remotion project (it opens in Remotion Studio with `npx remotion studio src/index.ts`), and each entry of `projects` is one composition:

```
productions/<name>/
  pipeline.json
  package.json         remotion, @remotion/cli, react, react-dom at exact versions (no ^ or ~)
  package-lock.json    committed; the runner installs from it with npm ci
  src/index.ts         registerRoot(...)
  src/*.tsx            compositions
  public/img/, public/fonts/   images; fonts as .woff2 with OFL-*.txt
```

```json
{
  "engine": "remotion", "fps": 30, "format": "landscape", "workers": 4, "sliceSeconds": 45,
  "entry": "src/index.ts",
  "projects": [{ "id": "Intro", "frames": 300 }, { "id": "Main", "frames": 5400 }]
}
```

- The frame count of each composition is stated in `pipeline.json` so the jobs can be planned before anything is installed. Let `Root.tsx` read it from there (`import pipeline from "../pipeline.json"`, as `productions/remotion-test` does) so the two can never disagree. A wrong count fails the job.
- A long composition is rendered as frame ranges (`--frames=0-1349`, `--frames=1350-2699`, ... the last one open-ended) on separate runners and joined without re-encoding. H.264, Remotion's default quality, no sound track.
- To start a new production: copy `productions/remotion-test`, change the compositions, run `npm install` in the folder once on the laptop (download only, no render), commit `package-lock.json`. `node_modules` is never committed.
- The runner keeps `node_modules` (with Remotion's own headless browser and ffmpeg) in the Actions cache, keyed on the lockfile.

#### Remotion licence: the Owner must confirm before a real production

Remotion is not free for everyone. Its licence (remotion.dev/license, read on 21 November 2026) allows free use, commercial use included, for **an individual**, **a for-profit organisation with up to 3 employees**, a **non-profit**, and anyone **evaluating** it. A for-profit organisation with 4 or more people needs a paid Company Licence (from $25 per month per seat, or $0.01 per render with a $100 per month minimum for automated rendering). The licence FAQ says **educational institutions, government bodies and some other kinds of organisation need Remotion's written permission** even to use the free tier. Rendering on servers or GitHub is allowed under the free licence. Nothing has been bought or signed up for, and no licence key is used (without one, Remotion sends no usage data).

**Before using Remotion for any real production, the Owner must confirm that they (or the organisation the video is made for) qualify for the free licence, or arrange a licence.** The test production here is placeholder content made only to evaluate the pipeline.

### Manim

```
productions/<name>/
  pipeline.json
  scenes.py        scene classes (more .py files are allowed)
  manim.cfg        optional Manim settings (size and frame rate are set by the pipeline)
  assets/img/      images
```

```json
{
  "engine": "manim", "fps": 30, "format": "landscape",
  "file": "scenes.py",
  "projects": ["Intro", "Graph", { "scene": "Proof", "file": "proof.py" }]
}
```

- One job per scene class, all at the same time; the scenes are joined in the listed order. A scene is not cut into slices, so split a very long scene into several.
- The picture is always `format` and `fps` from `pipeline.json`: 1920x1080 or 1080x1920 at 30 fps. In the vertical format the frame is 8 units tall and 4.5 wide, so scenes have to be laid out for it.
- Manim runs in its official container image `manimcommunity/manim:v0.22.1`, which already contains LaTeX (`MathTex`, `Tex`), its system libraries and ffmpeg. Chosen by measured set-up time: the image pulls in about 12 s, while `pip install manim` needs apt packages plus a source build (about 43 s) before any TeX, and a minimal TeX from apt costs another 28 s per job (TinyTeX about 14 s). Because TeX comes inside the image, it costs nothing extra, so there is no per-production TeX switch: a text-only production pays nothing for it. The image comes from Docker Hub; a failed pull is retried twice.
- `--disable_caching` is used: every job renders from scratch.

## What must never be committed

`.gitignore` lets in only the files listed above and `tools/guard.mjs` checks every commit again:

- narration and any other sound or video file; anything over 50 MB (GitHub blocks files over 100 MiB)
- manifests, reports, scripts, storyboards, transcripts, cue phrases (`cues.json`), upload texts
- anything containing an email address or a Windows user folder path
- Microsoft fonts (Georgia, Ink Free and the rest of `C:\Windows\Fonts`). Use open fonts: Gelasio has Georgia's widths, Kalam Light is close to Ink Free; both are SIL OFL, as is Inter.
- generated files of any engine: `node_modules`, Remotion bundles and its browser (`.remotion`, `build`, `dist`, `out`), Manim `media/` (renders, TeX cache), Python caches (`__pycache__`, `.pyc`), `.venv`

After cloning on a new computer run `git config core.hooksPath .githooks` once, and set a GitHub no-reply address as the commit email for this repository.

## Tools

| Tool | What it does |
|---|---|
| `tools/cloud.mjs render\|start\|collect\|join` | starts a run with the production's engine, waits, downloads, checks frame counts, joins, adds the narration, deletes the artifacts from GitHub |
| `tools/verify.mjs` | checks a joined result: size, frame rate, frame count, clean decode (and frame codes in the test productions) |
| `tools/import-production.mjs` | copies the render inputs of a HyperFrames production into this repository |
| `tools/prepare.mjs` | HyperFrames: copies the kit into each project and fetches vendor files |
| `tools/plan.mjs` | lists the render jobs of a production |
| `tools/guard.mjs` | refuses forbidden files (commit hook and first step of every run) |

Needed on the laptop: Node 22 or later, git, the GitHub CLI signed in, ffmpeg. Nothing engine-specific (Python and Manim are not needed on the laptop; Remotion's packages only to write a lockfile or preview in Studio).

## Test productions

All placeholder content, nothing from a real script or video.

| Production | Engine | Content |
|---|---|---|
| `pipeline-test` | HyperFrames | two chapters, 8 s and 26 s (the second rendered as three slices) |
| `remotion-test` | Remotion | two compositions, 6 s and 26 s (the second rendered as three frame ranges) |
| `manim-test` | Manim | three scenes: text, a graph (the longest), LaTeX |
| `manim-short-test` | Manim | two vertical 1080x1920 scenes |

The Remotion and Manim tests draw the frame number as 16 squares in the top-left corner; `tools/verify.mjs` reads them back to prove that no frame is missing or repeated at any join.

## Measured (21 November 2026, standard runners of a public repository: 4 CPU, 16 GB)

Start to finish is GitHub's own clock from the request to the last job; download, join and sound are on the laptop.

| Run | Jobs | Start to finish on GitHub | Set-up per job | Render, seconds per finished second | Download | Join and sound |
|---|---|---|---|---|---|---|
| HyperFrames `pipeline-test`, 34 s | 4 at once | 83 to 90 s | 35 to 50 s | 1.3 to 2.7 | 10 to 20 s | 5 to 9 s |
| HyperFrames, re-render of one chapter (`--only ch01`) | 1 | 84 s | | | 4 s | 5 s |
| HyperFrames `pipeline-test` again after adding the other engines | 4 at once | 101 s | 28 to 54 s (the npm install of HyperFrames varied from 24 to 45 s) | 1.6 to 2.7 | 6 s | 2 s |
| Remotion `remotion-test`, 32 s, first run (empty cache) | 4 at once | 55 s | 8 to 10 s install from the lockfile | 1.7 to 2.3 | 7 s | 4 s |
| Remotion `remotion-test`, cache filled | 4 at once | 50 s | 5 to 7 s (cache restore and browser check) | 1.1 to 1.3 | 7 s | 3 s |
| Manim `manim-test`, 32 s | 3 at once | 46 s (49 s on the first run) | 18 to 21 s (image pull and one container start) | 0.35 to 0.67 | 5 s | 2 s |
| Manim `manim-short-test`, 8 s vertical | 2 at once | 46 to 47 s | 18 to 24 s | 1.0 to 1.3 | 3 s | 1 s |

- Every final clip was checked with `tools/verify.mjs`: H.264 High, yuv420p, the format's size, 30 fps, the expected frame count and length, no decode errors; in the Remotion and Manim tests the frame codes count without a gap or repeat across every join (for example 299 -> 300 and 599 -> 600 between Remotion slices). The Remotion and Manim tests were checked silent and with a placeholder tone added locally, the HyperFrames test with a stand-in narration (AAC 48 kHz stereo, picture minus sound 0 ms); the vertical Short silent only.
- Render seconds include Remotion's bundling and Manim's container start, so short test parts look slower per second than long real ones would.
- Each job also spends a few seconds on checkout and upload. Most of a short test run is fixed overhead: the plan job alone takes 5 to 16 s before the render jobs start.
- Not measured yet: a real 10-minute production with any engine. For HyperFrames with 45 s slices it should come to roughly 4 to 6 minutes including download and join, against about 40 minutes of full CPU load on the laptop.
