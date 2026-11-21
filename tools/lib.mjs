// Shared helpers. Node built-ins only: nothing to install.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HF_VERSION = "0.9.72";                       // pinned. Change it here and in .github/workflows/render.yml together.
export const DEFAULTS = { fps: 30, quality: "high", workers: 4, sliceSeconds: 45, check: true };

export function die(msg, code = 1) { console.error("\nERROR: " + msg + "\n"); process.exit(code); }
export function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

export function parseArgs(argv, withValue = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const k = a.slice(2);
    out[k] = withValue.includes(k) ? argv[++i] : true;
  }
  return out;
}

// Runs a program and returns { status, stdout, stderr }. `shell` is needed for .cmd launchers on Windows (npm, npx).
export function run(cmd, args, { cwd = REPO, shell = false, inherit = false } = {}) {
  if (shell) { cmd = [cmd, ...args].map((a) => (/^[A-Za-z0-9@._\/:=-]+$/.test(a) ? a : '"' + a + '"')).join(" "); args = []; }
  const r = spawnSync(cmd, args, { cwd, shell, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || (r.error ? String(r.error) : "") };
}
export function must(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (r.status !== 0) die(cmd + " " + args.join(" ") + " failed:\n" + r.stderr + r.stdout);
  return r.stdout;
}

export function productionDir(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name || "")) die("production name must be letters, digits, dot, dash or underscore: " + name);
  const dir = path.join(REPO, "productions", name);
  if (!fs.existsSync(path.join(dir, "pipeline.json"))) die("no productions/" + name + "/pipeline.json");
  return dir;
}
export function loadProduction(name) {
  const dir = productionDir(name);
  const cfg = { ...DEFAULTS, vendor: [], ...readJson(path.join(dir, "pipeline.json")) };
  if (!Array.isArray(cfg.projects) || !cfg.projects.length) die("productions/" + name + "/pipeline.json needs a \"projects\" list");
  return { name, dir, cfg };
}

// The list of render jobs for a production: one per project, or several when a project is longer than
// sliceSeconds (each slice is rendered with --start/--end on a whole second, so the pieces join frame-exactly).
export function plan(name) {
  const { dir, cfg } = loadProduction(name);
  const parts = [];
  let totalFrames = 0;
  for (const project of cfg.projects) {
    const html = path.join(dir, project, "index.html");
    if (!fs.existsSync(html)) die("productions/" + name + "/" + project + "/index.html is missing");
    const src = fs.readFileSync(html, "utf8");
    const dur = parseFloat((/data-duration="([^"]+)"/.exec(src) || [])[1]);
    if (!(dur > 0)) die(project + "/index.html has no data-duration on its root element");
    let frames = Math.ceil(dur * cfg.fps);                  // what the renderer produces
    const cuesFile = path.join(dir, project, "cues.js");
    if (fs.existsSync(cuesFile)) {                          // productions built with the scene kit state their exact frame count
      const m = /window\.CH\s*=\s*(\{[\s\S]*?\});/.exec(fs.readFileSync(cuesFile, "utf8"));
      if (m) { const ch = JSON.parse(m[1]); if (Number.isInteger(ch.frames)) frames = ch.frames; }
    }
    const S = cfg.sliceSeconds;
    let n = S > 0 && dur > S * 1.5 ? Math.ceil(dur / S) : 1;
    if (n > 1 && dur - (n - 1) * S < 5) n--;                 // do not leave a tail shorter than 5 s
    for (let k = 0; k < n; k++) {
      const start = k * S, last = k === n - 1;
      parts.push({
        id: n === 1 ? project : project + "-p" + String(k + 1).padStart(2, "0"),
        project, order: parts.length,
        start: n === 1 ? "" : String(start), end: last ? "" : String(start + S),
        frames: last ? frames - start * cfg.fps : S * cfg.fps,
        check: cfg.check && k === 0,
      });
    }
    totalFrames += frames;
  }
  if (parts.length > 256) die("more than 256 jobs: raise sliceSeconds");
  return { production: name, hyperframes: HF_VERSION, fps: cfg.fps, quality: cfg.quality, workers: cfg.workers, totalFrames, parts };
}

// ---- ffprobe ----
export function videoInfo(file) {
  const out = must("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
    "stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_packets:format=duration", "-of", "json", file]);
  const j = JSON.parse(out), s = j.streams[0];
  return { codec: s.codec_name, profile: s.profile, width: s.width, height: s.height, pix_fmt: s.pix_fmt, fps: s.r_frame_rate,
    frames: parseInt(s.nb_read_packets, 10), duration: parseFloat(j.format.duration) };
}
export function mediaDuration(file) {
  return parseFloat(JSON.parse(must("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", file])).format.duration);
}
