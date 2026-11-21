// The local half of the pipeline, the same for every engine (HyperFrames, Remotion, Manim): the engine named in
// pipeline.json picks the workflow on GitHub (render.yml, render-remotion.yml or render-manim.yml). Needs git, the GitHub CLI (gh, signed in), ffmpeg and ffprobe.
//
//   node tools/cloud.mjs render  <production> [--only "ch03 ch07"] [--skip-check] [--audio narration.wav] [--out final.mp4]
//        start a run on GitHub, wait for it, download the parts, join them, add the narration
//   node tools/cloud.mjs start   <production> [--only "..."] [--skip-check]      start only; prints the run id
//        --skip-check applies to HyperFrames only (it skips "hyperframes check")
//   node tools/cloud.mjs collect <production> [--run <id>] [--audio narration.wav] [--out final.mp4] [--keep-artifacts]
//        wait for a run (default: the latest), download, join, add the narration
//   node tools/cloud.mjs join    <production> [--audio narration.wav] [--out final.mp4]
//        no GitHub: join the parts already in out/<production>/parts/ again (for example with a new narration)
//
// The narration never leaves this computer: it is added here, after the download, as AAC 192 kbps.
// Parts are kept in out/<production>/parts/, so a later --only run replaces just the re-rendered chapters.
// After a successful download the artifacts are deleted from GitHub (the repository is public).
import fs from "node:fs";
import path from "node:path";
import { REPO, plan, parseArgs, run, must, die, videoInfo, mediaDuration } from "./lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest, ["only", "audio", "out", "run"]);
const name = args._[0];
if (!["render", "start", "collect", "join"].includes(cmd) || !name) die("usage: node tools/cloud.mjs render|start|collect|join <production> [options]   (see the top of tools/cloud.mjs)");
const full = plan(name);                                     // also validates the production
const WORKFLOW = full.workflow;
const outDir = path.join(REPO, "out", name), partsDir = path.join(outDir, "parts");
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const gh = (a, opts) => must("gh", a, opts);
const ghJson = (a) => JSON.parse(gh(a));
const ff = (a) => must("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);

function start() {
  if (must("git", ["status", "--porcelain"]).trim()) die("there are uncommitted changes. GitHub renders what is pushed: commit and push first.");
  must("git", ["fetch", "--quiet"]);
  const head = must("git", ["rev-parse", "HEAD"]).trim(), remote = must("git", ["rev-parse", "@{u}"]).trim();
  if (head !== remote) die("the last commit is not on GitHub yet: run git push first.");
  const before = new Set(ghJson(["run", "list", "--workflow", WORKFLOW, "--limit", "20", "--json", "databaseId"]).map((r) => r.databaseId));
  const f = ["workflow", "run", WORKFLOW, "-f", "production=" + name];
  if (args.only) f.push("-f", "only=" + args.only);
  if (args["skip-check"] && full.engine === "hyperframes") f.push("-f", "skip_check=true");
  gh(f);
  console.log("asked GitHub to render " + name + " with " + full.engine + " " + full.version + " (" + WORKFLOW + ")");
  for (let i = 0; i < 30; i++) {
    sleep(2000);
    const fresh = ghJson(["run", "list", "--workflow", WORKFLOW, "--limit", "20", "--json", "databaseId,headSha"]).find((r) => !before.has(r.databaseId) && r.headSha === head);
    if (fresh) { console.log("started run " + fresh.databaseId); return String(fresh.databaseId); }
  }
  die("the run was requested but did not appear within a minute: look at `gh run list`");
}

function collect(runId) {
  if (!runId) runId = String(ghJson(["run", "list", "--workflow", WORKFLOW, "--limit", "1", "--json", "databaseId"])[0]?.databaseId || "");
  if (!runId) die("no run found");
  const dl = path.join(outDir, "_download");
  fs.mkdirSync(partsDir, { recursive: true });

  console.log("waiting for run " + runId + " ...");
  const w = run("gh", ["run", "watch", runId, "--exit-status", "--interval", "10"], { inherit: true });
  const info = ghJson(["run", "view", runId, "--json", "conclusion,createdAt,updatedAt,url,jobs"]);
  if (w.status !== 0 || info.conclusion !== "success") die("run " + runId + " did not succeed (" + info.conclusion + "): " + info.url);

  const t0 = Date.now();
  fs.rmSync(dl, { recursive: true, force: true });
  gh(["run", "download", runId, "--dir", dl]);
  const ran = JSON.parse(fs.readFileSync(path.join(dl, "plan", "plan.json"), "utf8"));
  if (ran.engine && ran.engine !== full.engine) die("run " + runId + " used " + ran.engine + ", but " + name + " is now a " + full.engine + " production");
  if (ran.production !== name) die("run " + runId + " rendered \"" + ran.production + "\", not \"" + name + "\"");
  for (const p of ran.parts) {
    const src = path.join(dl, "part-" + p.id, p.id + ".mp4");
    if (!fs.existsSync(src)) die("part " + p.id + " is missing from the download");
    const v = videoInfo(src);
    if (p.frames != null && v.frames !== p.frames) die(p.id + ".mp4 has " + v.frames + " frames, the plan needs " + p.frames);
    fs.copyFileSync(src, path.join(partsDir, p.id + ".mp4"));
  }
  fs.rmSync(dl, { recursive: true, force: true });
  const downloadSecs = (Date.now() - t0) / 1000;

  if (!args["keep-artifacts"]) {
    const slug = ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
    const ids = ghJson(["api", "repos/" + slug + "/actions/runs/" + runId + "/artifacts?per_page=100"]).artifacts.map((a) => a.id);
    for (const id of ids) gh(["api", "-X", "DELETE", "repos/" + slug + "/actions/artifacts/" + id]);
    console.log("deleted " + ids.length + " artifact(s) from GitHub");
  }

  // timings, from GitHub's own clock
  const secs = (a, b) => (new Date(b) - new Date(a)) / 1000;
  const jobs = info.jobs.filter((j) => j.startedAt && j.completedAt).map((j) => ({ name: j.name, seconds: secs(j.startedAt, j.completedAt) }));
  const timing = { engine: full.engine, version: full.version, run: runId, url: info.url, parts: ran.parts.length, wallSeconds: secs(info.createdAt, info.updatedAt),
    jobMinutesBilledIfPrivate: jobs.reduce((s, j) => s + Math.ceil(j.seconds / 60), 0), downloadSeconds: downloadSecs, jobs };
  console.log("\nrun " + runId + ": " + timing.wallSeconds.toFixed(0) + " s from start to finish on GitHub, download " + downloadSecs.toFixed(0) + " s");
  for (const j of jobs) console.log("  " + j.name.padEnd(14) + j.seconds.toFixed(0).padStart(5) + " s");

  const joinSeconds = join();
  if (joinSeconds != null) timing.joinSeconds = joinSeconds;
  fs.writeFileSync(path.join(outDir, "last_run.json"), JSON.stringify(timing, null, 2) + "\n");
}

// Joins every part of the full plan (parts from earlier runs are reused) and adds the narration.
// Returns the seconds it took, or null when a part has never been rendered.
function join() {
  const missing = full.parts.filter((p) => !fs.existsSync(path.join(partsDir, p.id + ".mp4")));
  if (missing.length) { console.log("\nnot joined yet: " + missing.length + " part(s) have never been rendered: " + missing.map((p) => p.id).join(", ")); return null; }
  const t1 = Date.now();
  let ref = null, total = 0;
  const files = [];
  for (const p of full.parts) {
    const f = path.join(partsDir, p.id + ".mp4"), v = videoInfo(f);
    const sig = [v.codec, v.profile, v.width, v.height, v.pix_fmt, v.fps].join(" ");
    if (!ref) ref = sig; else if (sig !== ref) die(p.id + ".mp4 was encoded differently (" + sig + ") from the first part (" + ref + ")");
    if (p.frames != null && v.frames !== p.frames) die(p.id + ".mp4 has " + v.frames + " frames but the project now needs " + p.frames + ": re-render it (--only " + p.project + ")");
    total += v.frames; files.push(f);
  }
  const want = total / full.fps;
  const out = path.resolve(args.out || path.join(outDir, name + ".mp4"));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // A whole-project render and a --start/--end slice carry different MP4 time bases, and a plain concat then
  // stretches the timestamps. Give every part the same time base first (a copy, no re-encode), then join.
  const norm = path.join(outDir, "_norm");
  fs.rmSync(norm, { recursive: true, force: true });
  fs.mkdirSync(norm, { recursive: true });
  const same = files.map((f, i) => {
    const n = path.join(norm, String(i).padStart(3, "0") + ".mp4");
    ff(["-i", f, "-map", "0:v:0", "-c", "copy", "-video_track_timescale", "90000", n]);
    return n;
  });
  const list = path.join(norm, "list.txt");
  fs.writeFileSync(list, same.map((f) => "file '" + f.replace(/\\/g, "/").replace(/'/g, "'\\''") + "'").join("\n") + "\n");
  const picture = args.audio ? out.replace(/\.mp4$/i, "") + "_picture_only.mp4" : out;
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-video_track_timescale", "90000", "-movflags", "+faststart", picture]);
  fs.rmSync(norm, { recursive: true, force: true });
  const pv = videoInfo(picture);
  if (pv.frames !== total) die("the joined picture has " + pv.frames + " frames, expected " + total);
  if (Math.abs(pv.duration - want) > 1 / full.fps + 0.002) die("the joined picture lasts " + pv.duration.toFixed(3) + " s, but " + total + " frames should last " + want.toFixed(3) + " s");
  console.log("\npicture: " + total + " frames = " + want.toFixed(3) + " s  (" + ref + ")");

  if (args.audio) {
    const audio = path.resolve(args.audio), aDur = mediaDuration(audio), diff = want - aDur;
    ff(["-i", picture, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", out]);
    const fv = videoInfo(out);
    if (fv.frames !== total || Math.abs(fv.duration - Math.max(want, aDur)) > 0.1) die("the final file has " + fv.frames + " frames and lasts " + fv.duration.toFixed(3) + " s: expected " + total + " frames, " + want.toFixed(3) + " s");
    console.log("narration: " + aDur.toFixed(3) + " s, picture minus narration = " + (diff * 1000).toFixed(0) + " ms");
    if (Math.abs(diff) > 1 / full.fps + 0.002) console.log("WARNING: picture and narration differ by more than one frame");
  }
  const took = (Date.now() - t1) / 1000;
  console.log("wrote " + out + "  (join " + took.toFixed(0) + " s)");
  return took;
}

if (cmd === "start") start();
else if (cmd === "join") { if (!fs.existsSync(partsDir)) die("no parts yet in " + partsDir); join(); }
else if (cmd === "collect") collect(args.run);
else collect(start());
