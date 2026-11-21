// Shared helpers. Node built-ins only: nothing to install.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The three render engines. Each version is pinned: change it here and in the engine's workflow file together
// (for Remotion also in the production's package.json and package-lock.json).
export const ENGINES = {
  hyperframes: { version: "0.9.72", workflow: "render.yml" },
  remotion: { version: "4.0.540", workflow: "render-remotion.yml" },
  manim: { version: "0.22.1", workflow: "render-manim.yml" },
};
export const HF_VERSION = ENGINES.hyperframes.version;
export const FORMATS = { landscape: [1920, 1080], vertical: [1080, 1920] };
export const DEFAULTS = { engine: "hyperframes", format: "landscape", fps: 30, quality: "high", workers: 4, sliceSeconds: 45, check: true };

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
  const where = "productions/" + name + "/pipeline.json";
  if (!ENGINES[cfg.engine]) die(where + ": engine must be one of " + Object.keys(ENGINES).join(", ") + ", not \"" + cfg.engine + "\"");
  if (!FORMATS[cfg.format]) die(where + ": format must be one of " + Object.keys(FORMATS).join(", "));
  if (!Array.isArray(cfg.projects) || !cfg.projects.length) die(where + " needs a \"projects\" list");
  return { name, dir, cfg };
}

// How many slices a project of `dur` seconds is cut into: one, unless it is longer than one and a half times
// sliceSeconds; never a last slice shorter than 5 s.
function sliceCount(dur, S) {
  let n = S > 0 && dur > S * 1.5 ? Math.ceil(dur / S) : 1;
  if (n > 1 && dur - (n - 1) * S < 5) n--;
  return n;
}
const sliceId = (project, n, k) => (n === 1 ? project : project + "-p" + String(k + 1).padStart(2, "0"));

// HyperFrames: one project folder (index.html) per chapter. Slices are rendered with --start/--end on a whole
// second, so the pieces join frame-exactly.
function planHyperframes(name, dir, cfg) {
  const parts = [];
  let totalFrames = 0;
  for (const project of cfg.projects) {
    if (typeof project !== "string") die("hyperframes projects are folder names, for example \"ch01\"");
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
    const S = cfg.sliceSeconds, n = sliceCount(dur, S);
    for (let k = 0; k < n; k++) {
      const start = k * S, last = k === n - 1;
      parts.push({
        id: sliceId(project, n, k), project, order: parts.length,
        start: n === 1 ? "" : String(start), end: last ? "" : String(start + S),
        frames: last ? frames - start * cfg.fps : S * cfg.fps,
        check: cfg.check && k === 0,
      });
    }
    totalFrames += frames;
  }
  return { parts, totalFrames };
}

// Remotion: the production folder is one Remotion project and each entry of "projects" is a composition,
// { "id": "Intro", "frames": 300 }. A long composition is cut into frame ranges (--frames=a-b); the last range is
// open-ended (--frames=a-), so a composition longer or shorter than stated shows up as a wrong frame count.
function planRemotion(name, dir, cfg) {
  const where = "productions/" + name + "/";
  const entry = cfg.entry || "src/index.ts";
  if (!fs.existsSync(path.join(dir, entry))) die(where + entry + " (the Remotion entry point) is missing");
  if (!fs.existsSync(path.join(dir, "package-lock.json"))) die(where + "package-lock.json is missing: run npm install there once and commit the lockfile");
  const deps = { ...(readJson(path.join(dir, "package.json")).dependencies || {}) };
  if (!deps.remotion || !deps["@remotion/cli"]) die(where + "package.json needs remotion and @remotion/cli");
  for (const [pkg, v] of Object.entries(deps)) {
    if (!/^\d+\.\d+\.\d+$/.test(v)) die(where + "package.json: " + pkg + " must be pinned to an exact version, not \"" + v + "\"");
    if (pkg.startsWith("@remotion/") && v !== deps.remotion) die(where + "package.json: " + pkg + " " + v + " differs from remotion " + deps.remotion);
  }
  if (deps.remotion !== ENGINES.remotion.version) console.error("note: " + name + " uses remotion " + deps.remotion + "; the pipeline was tested with " + ENGINES.remotion.version);
  const parts = [];
  let totalFrames = 0;
  for (const p of cfg.projects) {
    if (!p || !/^[A-Za-z0-9-]+$/.test(p.id || "") || !Number.isInteger(p.frames) || p.frames < 1)
      die("remotion projects are { \"id\": \"<composition id>\", \"frames\": <whole number> }, not " + JSON.stringify(p));
    const S = cfg.sliceSeconds, n = sliceCount(p.frames / cfg.fps, S), F = S * cfg.fps;
    for (let k = 0; k < n; k++) {
      const a = k * F, last = k === n - 1;
      parts.push({ id: sliceId(p.id, n, k), project: p.id, order: parts.length,
        range: n === 1 ? "" : last ? a + "-" : a + "-" + (a + F - 1), frames: last ? p.frames - a : F });
    }
    totalFrames += p.frames;
  }
  return { parts, totalFrames, remotion: deps.remotion, entry };
}

// Manim: one job per scene class. Entries of "projects" are class names in "file" (default scenes.py), or
// { "scene": "Graph", "file": "other.py" }. A scene's length is known only once it is rendered, so frames is null.
function planManim(name, dir, cfg) {
  const parts = [];
  for (const p of cfg.projects) {
    const scene = typeof p === "string" ? p : p && p.scene;
    const file = (p && typeof p === "object" && p.file) || cfg.file || "scenes.py";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(scene || "")) die("manim projects are scene class names, not " + JSON.stringify(p));
    if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.py$/.test(file) || file.includes("..")) die("not a Python file inside the production: " + file);
    const f = path.join(dir, file);
    if (!fs.existsSync(f)) die("productions/" + name + "/" + file + " is missing");
    if (!new RegExp("^class\\s+" + scene + "\\s*\\(", "m").test(fs.readFileSync(f, "utf8"))) die("there is no class " + scene + " in productions/" + name + "/" + file);
    if (parts.some((x) => x.id === scene)) die("scene " + scene + " is listed twice");
    parts.push({ id: scene, project: scene, order: parts.length, file, frames: null });
  }
  return { parts, totalFrames: null };
}

// The render jobs of a production (the GitHub matrix) and the settings every job needs.
export function plan(name) {
  const { dir, cfg } = loadProduction(name);
  const r = { hyperframes: planHyperframes, remotion: planRemotion, manim: planManim }[cfg.engine](name, dir, cfg);
  if (r.parts.length > 256) die("more than 256 jobs: raise sliceSeconds");
  const [width, height] = FORMATS[cfg.format];
  const out = { production: name, engine: cfg.engine, version: ENGINES[cfg.engine].version, workflow: ENGINES[cfg.engine].workflow,
    fps: cfg.fps, format: cfg.format, width, height, quality: cfg.quality, workers: cfg.workers,
    totalFrames: r.totalFrames, framecode: !!cfg.framecode, parts: r.parts };
  if (cfg.engine === "hyperframes") out.hyperframes = HF_VERSION;
  if (cfg.engine === "remotion") { out.remotion = r.remotion; out.entry = r.entry; }
  return out;
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
