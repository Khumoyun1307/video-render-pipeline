// The local half of the pipeline. Needs git, the GitHub CLI (gh, signed in), ffmpeg and ffprobe.
//
//   node tools/cloud.mjs render  <production> [--only "ch03 ch07"] [--skip-check] [--audio narration.wav] [--out final.mp4]
//        start a run on GitHub, wait for it, download the parts, join them, add the narration
//   node tools/cloud.mjs start   <production> [--only "..."] [--skip-check]      start only; prints the run id
//   node tools/cloud.mjs collect <production> [--run <id>] [--audio narration.wav] [--out final.mp4] [--keep-artifacts]
//        wait for a run (default: the latest), download, join, add the narration
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
if (!["render", "start", "collect"].includes(cmd) || !name) die("usage: node tools/cloud.mjs render|start|collect <production> [options]   (see the top of tools/cloud.mjs)");
const full = plan(name);                                     // also validates the production
const WORKFLOW = "render.yml";
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const gh = (a, opts) => must("gh", a, opts);
const ghJson = (a) => JSON.parse(gh(a));

function start() {
  if (must("git", ["status", "--porcelain"]).trim()) die("there are uncommitted changes. GitHub renders what is pushed: commit and push first.");
  must("git", ["fetch", "--quiet"]);
  const head = must("git", ["rev-parse", "HEAD"]).trim(), remote = must("git", ["rev-parse", "@{u}"]).trim();
  if (head !== remote) die("the last commit is not on GitHub yet: run git push first.");
  const before = new Set(ghJson(["run", "list", "--workflow", WORKFLOW, "--limit", "20", "--json", "databaseId"]).map((r) => r.databaseId));
  const f = ["workflow", "run", WORKFLOW, "-f", "production=" + name];
  if (args.only) f.push("-f", "only=" + args.only);
  if (args["skip-check"]) f.push("-f", "skip_check=true");
  gh(f);
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
  const outDir = path.join(REPO, "out", name), partsDir = path.join(outDir, "parts"), dl = path.join(outDir, "_download");
  fs.mkdirSync(partsDir, { recursive: true });

  console.log("waiting for run " + runId + " ...");
  const w = run("gh", ["run", "watch", runId, "--exit-status", "--interval", "10"], { inherit: true });
  const info = ghJson(["run", "view", runId, "--json", "conclusion,createdAt,updatedAt,url,jobs"]);
  if (w.status !== 0 || info.conclusion !== "success") die("run " + runId + " did not succeed (" + info.conclusion + "): " + info.url);

  const t0 = Date.now();
  fs.rmSync(dl, { recursive: true, force: true });
  gh(["run", "download", runId, "--dir", dl]);
  const ran = JSON.parse(fs.readFileSync(path.join(dl, "plan", "plan.json"), "utf8"));
  if (ran.production !== name) die("run " + runId + " rendered \"" + ran.production + "\", not \"" + name + "\"");
  for (const p of ran.parts) {
    const src = path.join(dl, "part-" + p.id, p.id + ".mp4");
    if (!fs.existsSync(src)) die("part " + p.id + " is missing from the download");
    const v = videoInfo(src);
    if (v.frames !== p.frames) die(p.id + ".mp4 has " + v.frames + " frames, the plan needs " + p.frames);
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
  const timing = { run: runId, url: info.url, parts: ran.parts.length, wallSeconds: secs(info.createdAt, info.updatedAt),
    jobMinutesBilledIfPrivate: jobs.reduce((s, j) => s + Math.ceil(j.seconds / 60), 0), downloadSeconds: downloadSecs, jobs };
  console.log("\nrun " + runId + ": " + timing.wallSeconds.toFixed(0) + " s from start to finish on GitHub, download " + downloadSecs.toFixed(0) + " s");
  for (const j of jobs) console.log("  " + j.name.padEnd(14) + j.seconds.toFixed(0).padStart(5) + " s");

  // join every part of the full plan (parts from earlier runs are reused)
  const missing = full.parts.filter((p) => !fs.existsSync(path.join(partsDir, p.id + ".mp4")));
  if (missing.length) { console.log("\nnot joined yet: " + missing.length + " part(s) have never been rendered: " + missing.map((p) => p.id).join(", ")); return; }
  const t1 = Date.now();
  let ref = null, total = 0;
  const files = [];
  for (const p of full.parts) {
    const f = path.join(partsDir, p.id + ".mp4"), v = videoInfo(f);
    const sig = [v.codec, v.profile, v.width, v.height, v.pix_fmt, v.fps].join(" ");
    if (!ref) ref = sig; else if (sig !== ref) die(p.id + ".mp4 was encoded differently (" + sig + ") from the first part (" + ref + ")");
    if (v.frames !== p.frames) die(p.id + ".mp4 has " + v.frames + " frames but the project now needs " + p.frames + ": re-render it (--only " + p.project + ")");
    total += v.frames; files.push(f);
  }
  const out = path.resolve(args.out || path.join(outDir, name + ".mp4"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const list = path.join(outDir, "_concat.txt");
  fs.writeFileSync(list, files.map((f) => "file '" + f.replace(/\\/g, "/").replace(/'/g, "'\\''") + "'").join("\n") + "\n");
  const picture = args.audio ? out.replace(/\.mp4$/i, "") + "_picture_only.mp4" : out;
  const ff = (a) => must("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", picture]);
  fs.unlinkSync(list);
  const pv = videoInfo(picture);
  if (pv.frames !== total) die("the joined picture has " + pv.frames + " frames, expected " + total);
  console.log("\npicture: " + total + " frames = " + (total / full.fps).toFixed(3) + " s  (" + ref + ")");
  if (args.audio) {
    const audio = path.resolve(args.audio), aDur = mediaDuration(audio), diff = total / full.fps - aDur;
    ff(["-i", picture, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", out]);
    console.log("narration: " + aDur.toFixed(3) + " s, picture minus narration = " + (diff * 1000).toFixed(0) + " ms");
    if (Math.abs(diff) > 1 / full.fps + 0.002) console.log("WARNING: picture and narration differ by more than one frame");
  }
  timing.joinSeconds = (Date.now() - t1) / 1000;
  fs.writeFileSync(path.join(outDir, "last_run.json"), JSON.stringify(timing, null, 2) + "\n");
  console.log("wrote " + out + "  (join " + timing.joinSeconds.toFixed(0) + " s)");
}

if (cmd === "start") start();
else if (cmd === "collect") collect(args.run);
else collect(start());
