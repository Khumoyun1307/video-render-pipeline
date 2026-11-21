// node tools/verify.mjs <production> [--file final.mp4]
//
// Checks a joined result (default out/<production>/<production>.mp4) against the production, for any engine:
//   - size and frame rate as the production's format and fps say, H.264
//   - frame count equal to the sum of the downloaded parts, and a duration that matches it
//   - a full decode with no errors
//   - with "framecode": true in pipeline.json (test productions), the frame number drawn in the top-left
//     corner of every frame: it must count 0, 1, 2 ... through each project (scene or composition) and start
//     again at 0 at the next one, so no frame is missing or repeated at any join.
// Reads only; uses ffmpeg and ffprobe on this computer (one decode of the file).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, plan, parseArgs, must, die, videoInfo } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2), ["file"]);
const name = args._[0];
if (!name) die("usage: node tools/verify.mjs <production> [--file final.mp4]");
const p = plan(name);
const file = path.resolve(args.file || path.join(REPO, "out", name, name + ".mp4"));
const partsDir = path.join(REPO, "out", name, "parts");
if (!fs.existsSync(file)) die("not found: " + file);

const fails = [];
const ok = (cond, msg) => { console.log((cond ? "  ok    " : "  FAIL  ") + msg); if (!cond) fails.push(msg); };

// frames per part, from the downloaded parts (Manim parts have no frame count in the plan)
const parts = p.parts.map((x) => {
  const f = path.join(partsDir, x.id + ".mp4");
  if (!fs.existsSync(f)) die("part " + x.id + " is not in " + partsDir);
  return { ...x, frames: videoInfo(f).frames };
});
const total = parts.reduce((s, x) => s + x.frames, 0);

const v = videoInfo(file);
const audio = JSON.parse(must("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name,sample_rate,channels,duration", "-of", "json", file])).streams;
console.log(path.basename(file) + ": " + [v.codec, v.profile, v.width + "x" + v.height, v.pix_fmt, v.fps + " fps", v.frames + " frames", v.duration.toFixed(3) + " s"].join(", "));
if (audio.length) console.log("  sound: " + audio.map((a) => a.codec_name + " " + a.sample_rate + " Hz " + a.channels + " ch " + parseFloat(a.duration).toFixed(3) + " s").join("; "));
else console.log("  sound: none (silent picture)");
ok(v.codec === "h264", "video codec is H.264");
ok(v.width === p.width && v.height === p.height, "size is " + p.width + "x" + p.height + " (" + p.format + ")");
ok(v.fps === p.fps + "/1", "frame rate is " + p.fps + " fps");
ok(v.frames === total, "frame count " + v.frames + " = sum of the " + parts.length + " parts (" + total + ")");
const want = total / p.fps, longest = Math.max(want, ...audio.map((a) => parseFloat(a.duration) || 0));
ok(Math.abs(v.duration - longest) < 0.1, "duration " + v.duration.toFixed(3) + " s matches " + total + " frames (" + want.toFixed(3) + " s)" + (audio.length ? " and the sound" : ""));

const dec = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-i", file, "-map", "0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
ok(dec.status === 0 && !dec.stderr.trim(), "full decode without errors" + (dec.stderr.trim() ? ": " + dec.stderr.trim().split("\n").slice(0, 3).join(" | ") : ""));

if (p.framecode) {
  // 16 squares of 24 px from pixel 8,8; sample the middle of each square in a grey crop of the band.
  const W = 400, H = 40;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-i", file, "-map", "0:v:0", "-vf", "crop=" + W + ":" + H + ":0:0,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) die("could not decode the frame codes: " + String(r.stderr));
  const buf = r.stdout, n = buf.length / (W * H);
  const code = (k) => { let c = 0; for (let i = 0; i < 16; i++) c = (c << 1) | (buf[k * W * H + 20 * W + 20 + 24 * i] > 127 ? 1 : 0); return c; };
  // expected: per project 0 .. frames-1
  const expected = [], starts = new Set();
  let at = 0;
  for (const proj of [...new Set(parts.map((x) => x.project))]) {
    const nf = parts.filter((x) => x.project === proj).reduce((s, x) => s + x.frames, 0);
    for (let i = 0; i < nf; i++) expected.push(i);
  }
  for (const x of parts) { starts.add(at); at += x.frames; }
  let bad = 0, first = null;
  for (let k = 0; k < n; k++) if (code(k) !== expected[k]) { bad++; if (first == null) first = k; }
  ok(n === expected.length && bad === 0, "frame codes count up through every project with no gap or repeat (" + n + " frames read" + (bad ? ", " + bad + " wrong, first at frame " + first + ": read " + code(first) + ", expected " + expected[first] : "") + ")");
  for (const s of [...starts].filter((s) => s > 0)) {
    const part = parts.find((x, i) => parts.slice(0, i).reduce((t, y) => t + y.frames, 0) === s);
    console.log("        join before " + part.id.padEnd(12) + " frame " + String(s).padStart(5) + ": codes " + code(s - 1) + " -> " + code(s));
  }
}

console.log(fails.length ? "\nverify: " + fails.length + " check(s) FAILED" : "\nverify: all checks passed");
process.exit(fails.length ? 1 : 0);
