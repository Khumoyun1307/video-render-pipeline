// node tools/guard.mjs [--staged | --tracked | <folder>]
//
// Last line of defence for a PUBLIC repository. Exits 1 (and blocks the commit when run from
// .githooks/pre-commit) if any file about to be committed is something that must stay on the
// Owner's computer:
//   - sound or video (narration masters, renders), any file over 50 MB
//   - Microsoft fonts (Georgia, Ink Free, anything whose name table says Microsoft or Monotype)
//   - text that contains an email address or a Windows user folder path
//   - production paperwork (manifests, reports, scripts, transcripts, upload metadata)
//   - build output and installed packages of any engine: node_modules, Remotion bundles and its browser,
//     Manim media/ (renders, TeX caches), Python caches
// --staged: files in the git index (default). --tracked: every tracked file. <folder>: every file in it.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 50 * 1024 * 1024;
const MEDIA = /\.(wav|mp3|m4a|aac|flac|ogg|mp4|mov|mkv|webm|avi)$/i;
const FONT = /\.(ttf|otf|ttc|woff|woff2)$/i;
const TEXT = /\.(html?|css|js|mjs|cjs|jsx|ts|tsx|mts|cts|json|md|txt|svg|ya?ml|sh|ps1|py|cfg|toml)$/i;
// generated folders of the three engines (and Python byte code): never committed, whatever is inside
const BUILD = /(^|\/)(node_modules|\.remotion|build|dist|out|media|__pycache__|\.venv|\.hyperframes)\/|\.py[co]$/i;
const PAPERWORK = /(^|\/)(manifest[^/]*|[^/]*report[^/]*|[^/]*metadata[^/]*|cues\.json|script[^/]*\.md|storyboard[^/]*|transcript[^/]*)$/i;
// file names of fonts that ship with Windows or Office and may not be redistributed
const MS_FONT_NAME = /(^|\/)(georgia|inkfree|arial|ariblk|times|calibri|cambria|candara|consola|constan|corbel|comic|segoe|seguisb|tahoma|verdana|trebuc|impact|gabriola|bahnschrift|palatino|pala|bookman|garamond|century|sitka)[^/]*\.(ttf|otf|ttc|woff2?)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const EMAIL_OK = /@users\.noreply\.github\.com$|@example\.(com|org)$/i;
const USER_PATH = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/;

function git(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stderr); process.exit(2); }
  return r.stdout.split("\0").filter(Boolean);
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// The decoded tables of a font, so its name table can be searched. WOFF2 packs all tables into one brotli stream.
function fontBytes(buf) {
  if (buf.toString("latin1", 0, 4) !== "wOF2") return buf;                 // ttf / otf / woff1 header: names are searched raw
  const numTables = buf.readUInt16BE(12), compressed = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[p++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return v; };
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++], tag = flags & 0x3f, version = flags >> 6;
    if (tag === 0x3f) p += 4;
    base128();                                                             // origLength
    const transformed = tag === 10 || tag === 11 ? version !== 3 : version !== 0;   // glyf and loca are transformed by default
    if (transformed) base128();
  }
  return zlib.brotliDecompressSync(buf.subarray(p, p + compressed));
}
function fontOwner(buf) {
  let raw;
  try { raw = fontBytes(buf); } catch { return "unreadable font file (cannot confirm its licence)"; }
  const ascii = raw.toString("latin1");
  const wide = ascii.replace(/\0/g, "");                                   // name records are UTF-16BE: drop the zero bytes
  for (const owner of ["Microsoft", "Monotype"]) if (ascii.includes(owner) || wide.includes(owner)) return owner;
  return null;
}

const arg = process.argv[2] || "--staged";
let files;
if (arg === "--staged") files = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).map((f) => path.join(REPO, f));
else if (arg === "--tracked") files = git(["ls-files", "-z"]).map((f) => path.join(REPO, f));
else files = walk(path.resolve(arg));

const problems = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const rel = path.relative(REPO, file).replace(/\\/g, "/");
  const bad = (why) => problems.push(rel + "\n      " + why);
  const size = fs.statSync(file).size;
  if (BUILD.test(rel)) { bad("build output or installed packages (node_modules, bundles, Manim media/, Python caches): generated on the runner"); continue; }
  if (MEDIA.test(rel)) { bad("sound or video file: narration and renders stay on the Owner's computer"); continue; }
  if (size > MAX_BYTES) { bad("larger than 50 MB (" + (size / 1048576).toFixed(0) + " MB)"); continue; }
  if (PAPERWORK.test(rel) && !rel.startsWith("tools/")) bad("production paperwork (manifest, report, script, transcript or upload text)");
  if (FONT.test(rel)) {
    if (MS_FONT_NAME.test(rel)) bad("Windows font file name: Microsoft fonts may not be redistributed");
    else if (!/\.woff2$/i.test(rel)) bad("fonts are committed as .woff2 with their OFL licence text beside them");
    else {
      const owner = fontOwner(fs.readFileSync(file));
      if (owner) bad("font data names " + owner + ": not an open-licence font");
      else if (!fs.readdirSync(path.dirname(file)).some((n) => /^OFL-.*\.txt$/.test(n))) bad("no OFL-*.txt licence text in the same folder");
    }
    continue;
  }
  if (TEXT.test(rel)) {
    const text = fs.readFileSync(file, "utf8");
    const emails = (text.match(EMAIL) || []).filter((e) => !EMAIL_OK.test(e));
    const licenceText = /(^|\/)OFL-[^/]*\.txt$/.test(rel);                 // font licences are kept word for word, foundry contact included
    if (emails.length && !licenceText && !rel.startsWith("tools/guard.mjs")) bad("contains an email address (" + emails.length + " found)");
    if (USER_PATH.test(text)) bad("contains a Windows user folder path");
  }
}

if (problems.length) {
  console.error("\nGUARD: refused. This repository is public; these files must not be committed:\n");
  for (const p of problems) console.error("  - " + p);
  console.error("\nRemove them from the commit (git restore --staged <file>) and try again.\n");
  process.exit(1);
}
console.log("guard: " + files.length + " file(s) checked, nothing forbidden");
