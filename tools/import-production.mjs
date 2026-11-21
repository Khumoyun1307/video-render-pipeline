// node tools/import-production.mjs "<path to a production's 04_visuals folder>" <name> [--projects "ch01 ch02 ..."]
//
// Copies ONLY the render inputs of a production into productions/<name>/ and leaves everything else
// (narration, script, storyboard, timing, cue phrases, manifests, renders) where it is:
//   kit\kit.css, kit\*.js (not gsap), kit\fonts\*.woff2 + OFL-*.txt, kit\img\**
//   chNN\index.html, hyperframes.json, scene.js, scene.css, cues.js, assets\img\**
// Then writes pipeline.json (if there is none) and runs the guard over the result.
// The source folder is only read. Re-running replaces the copies.
import fs from "node:fs";
import path from "node:path";
import { REPO, DEFAULTS, parseArgs, run, die } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2), ["projects"]);
const [srcArg, name] = args._;
if (!srcArg || !/^[A-Za-z0-9._-]+$/.test(name || "")) die("usage: node tools/import-production.mjs \"<path to 04_visuals>\" <name> [--projects \"ch01 ch02\"]");
const src = path.resolve(srcArg), dest = path.join(REPO, "productions", name);
if (!fs.existsSync(src)) die("not found: " + src);
const skipped = [];
let copied = 0;
function copy(from, to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); copied++; }
function copyTree(from, to) {
  if (!fs.existsSync(from)) return;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b); else copy(a, b);
  }
}

// ---- kit ----
const kit = path.join(src, "kit");
if (fs.existsSync(kit)) {
  fs.rmSync(path.join(dest, "kit"), { recursive: true, force: true });
  for (const f of fs.readdirSync(kit)) {
    if (/^gsap.*\.js$/i.test(f)) { skipped.push("kit/" + f + "  (fetched from npm instead: see \"vendor\" in pipeline.json)"); continue; }
    if (/\.(css|js)$/i.test(f)) copy(path.join(kit, f), path.join(dest, "kit", f));
  }
  const fonts = path.join(kit, "fonts");
  if (fs.existsSync(fonts)) for (const f of fs.readdirSync(fonts)) {
    if (/\.woff2$/i.test(f) || /^OFL-.*\.txt$/.test(f)) copy(path.join(fonts, f), path.join(dest, "kit", "fonts", f));
    else skipped.push("kit/fonts/" + f + "  (only open-licence .woff2 fonts go to GitHub; change kit.css to an open font)");
  }
  copyTree(path.join(kit, "img"), path.join(dest, "kit", "img"));
}

// ---- projects ----
const wanted = args.projects ? String(args.projects).split(/[\s,]+/).filter(Boolean)
  : fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory() && /^ch\d\d$/.test(d.name)).map((d) => d.name).sort();
if (!wanted.length) die("no chNN folders in " + src + " (name them with --projects)");
for (const id of wanted) {
  const p = path.join(src, id);
  if (!fs.existsSync(path.join(p, "index.html"))) die(id + " has no index.html");
  fs.rmSync(path.join(dest, id), { recursive: true, force: true });
  for (const f of ["index.html", "hyperframes.json", "scene.js", "scene.css", "cues.js"]) if (fs.existsSync(path.join(p, f))) copy(path.join(p, f), path.join(dest, id, f));
  copyTree(path.join(p, "assets", "img"), path.join(dest, id, "assets", "img"));
}

// ---- pipeline.json ----
const cfgFile = path.join(dest, "pipeline.json");
if (!fs.existsSync(cfgFile)) {
  const cfg = { fps: DEFAULTS.fps, quality: DEFAULTS.quality, workers: DEFAULTS.workers, sliceSeconds: DEFAULTS.sliceSeconds, projects: wanted,
    vendor: [{ npm: "gsap@3.14.2", file: "dist/gsap.min.js", to: "assets/kit/gsap.min.js" }] };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n");
}

console.log("copied " + copied + " file(s) into productions/" + name + "  (" + wanted.length + " project(s))");
if (skipped.length) console.log("\nNOT copied:\n  " + skipped.join("\n  "));
const g = run("node", [path.join(REPO, "tools", "guard.mjs"), dest], { inherit: true });
if (g.status !== 0) die("the guard refused part of the copy: fix the source or delete those files before committing");
console.log("\nNext: look at `git status`, then commit, push and run: node tools/cloud.mjs render " + name + " --audio <narration.wav>");
