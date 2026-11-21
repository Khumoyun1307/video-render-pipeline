# Render pipeline

Renders [HyperFrames](https://github.com/heygen-com/hyperframes) video projects on GitHub Actions, one job per chapter (long chapters are cut into slices), all at the same time, so the laptop does not have to. HyperFrames is pinned to **0.9.72**.

**This repository is public.** Everything committed here, the run logs and the rendered parts (until they are deleted after download) can be seen by anyone, and copies cannot be taken back. Commit a production's picture only when it may be seen before the video is out.

## What runs where

| Step | Where |
|---|---|
| Narration, word timing, scene building, stills and checks while building | the laptop |
| Chapter renders (the only step that loads every CPU core) and the check before each render | GitHub |
| Download of the parts, join, adding the narration, upload | the laptop |

The narration is never uploaded: the picture is rendered silent and the sound is added on the laptop after the download.

## Using it for a production

A production is a folder `productions/<name>/`:

```
productions/<name>/
  pipeline.json      settings and the list of projects, in playing order
  kit/               shared css, js, fonts (.woff2 with OFL-*.txt), images   (optional)
  ch01/ ch02/ ...    one HyperFrames project each: index.html, hyperframes.json, scene.js, scene.css, cues.js, assets/img/
```

1. Copy the render inputs in. For a production built with the scene kit (a `04_visuals` folder):
   `node tools/import-production.mjs "<path to 04_visuals>" <name>`
   It copies only what a render needs and says what it left behind.
2. Look at `git status`, then `git add -A`, `git commit`, `git push`. The commit is refused if it holds anything forbidden.
3. Render, download, join and add the narration in one go:
   `node tools/cloud.mjs render <name> --audio "<path to narration_master.wav>" --out "<path to final.mp4>"`
4. Re-render one chapter after a change (commit and push first): add `--only "ch07"`. The other parts are reused from `out/<name>/parts/`.

Without `--audio` the result is a silent picture. Without `--out` it is written to `out/<name>/<name>.mp4` (never committed).

`pipeline.json`:

```json
{
  "fps": 30, "quality": "high", "workers": 4, "sliceSeconds": 45,
  "projects": ["ch01", "ch02"],
  "vendor": [{ "npm": "gsap@3.14.2", "file": "dist/gsap.min.js", "to": "assets/kit/gsap.min.js" }]
}
```

A project longer than one and a half times `sliceSeconds` is rendered as several slices on whole seconds and joined without re-encoding. `vendor` files are fetched from npm at the stated version on the runner (and by `node tools/prepare.mjs <name>` on the laptop) instead of being committed.

Shorts work the same way, one project per Short, with one difference: the project must be built without its narration file, and the sound is added locally with `--audio`.

## What must never be committed

`.gitignore` lets in only the files listed above and `tools/guard.mjs` checks every commit again:

- narration and any other sound or video file; anything over 50 MB (GitHub blocks files over 100 MiB)
- manifests, reports, scripts, storyboards, transcripts, cue phrases (`cues.json`), upload texts
- anything containing an email address or a Windows user folder path
- Microsoft fonts (Georgia, Ink Free and the rest of `C:\Windows\Fonts`). Use open fonts: Gelasio has Georgia's widths, Kalam Light is close to Ink Free; both are SIL OFL, as is Inter.

After cloning on a new computer run `git config core.hooksPath .githooks` once, and set a GitHub no-reply address as the commit email for this repository.

## Tools

| Tool | What it does |
|---|---|
| `tools/cloud.mjs render\|start\|collect` | starts a run, waits, downloads, checks frame counts, joins, adds the narration, deletes the artifacts from GitHub |
| `tools/import-production.mjs` | copies the render inputs of a production into this repository |
| `tools/prepare.mjs` | copies the kit into each project and fetches vendor files |
| `tools/plan.mjs` | lists the render jobs of a production |
| `tools/guard.mjs` | refuses forbidden files (commit hook and first step of every run) |

Needed on the laptop: Node 22 or later, git, the GitHub CLI signed in, ffmpeg.

## Test production

`productions/pipeline-test` is two chapters of placeholder content (8 s and 26 s, the second rendered as three slices) that proves the whole path.
