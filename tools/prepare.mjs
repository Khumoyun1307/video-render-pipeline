// node tools/prepare.mjs <production> [project]
// Makes a project folder complete before `hyperframes check` or `render` (HyperFrames only serves files
// inside the project folder):
//   1. copies productions/<production>/kit/ into <project>/assets/kit/   (generated copy, never committed)
//   2. fetches the files listed under "vendor" in pipeline.json from npm at the pinned version, for example
//      { "npm": "gsap@3.14.2", "file": "dist/gsap.min.js", "to": "assets/kit/gsap.min.js" }
//      so third-party code is not redistributed from this repository.
// Runs the same way on the laptop and on the GitHub runner.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO, loadProduction, parseArgs, run, die } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args._[0]) die("usage: node tools/prepare.mjs <production> [project]");
const { name, dir, cfg } = loadProduction(args._[0]);
const projects = args._[1] ? [args._[1]] : cfg.projects;
const WIN = process.platform === "win32";

function vendorFile(v) {
  if (!/^[@a-z0-9._/-]+@\d+\.\d+\.\d+$/i.test(v.npm || "")) die("vendor entry needs an exact npm version, for example gsap@3.14.2: " + JSON.stringify(v));
  const cache = path.join(REPO, ".vendor-cache", v.npm.replace(/[\\/@]/g, "_"));
  const hit = path.join(cache, "package", v.file);
  if (fs.existsSync(hit)) return hit;
  fs.mkdirSync(cache, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-"));
  const r = run("npm", ["pack", v.npm, "--silent", "--pack-destination", tmp], { cwd: tmp, shell: WIN });
  if (r.status !== 0) die("npm pack " + v.npm + " failed:\n" + r.stderr);
  const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  // relative names only: GNU tar reads "C:\..." as a remote host
  const x = run("tar", ["-xzf", tgz, "package/" + v.file], { cwd: tmp });
  const got = path.join(tmp, "package", v.file);
  if (x.status !== 0 || !fs.existsSync(got)) die("could not take " + v.file + " out of " + v.npm + ":\n" + x.stderr);
  fs.mkdirSync(path.dirname(hit), { recursive: true });
  fs.copyFileSync(got, hit);
  fs.rmSync(tmp, { recursive: true, force: true });
  return hit;
}

const kit = path.join(dir, "kit");
for (const project of projects) {
  const pdir = path.join(dir, project);
  if (!fs.existsSync(path.join(pdir, "index.html"))) die("productions/" + name + "/" + project + "/index.html is missing");
  if (fs.existsSync(kit)) {
    const dest = path.join(pdir, "assets", "kit");
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(kit, dest, { recursive: true });
  }
  for (const v of cfg.vendor) {
    const to = path.join(pdir, v.to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(vendorFile(v), to);
  }
  console.log("prepared productions/" + name + "/" + project + (fs.existsSync(kit) ? "  (kit copied" : "  (no kit") + ", " + cfg.vendor.length + " vendor file(s))");
}
