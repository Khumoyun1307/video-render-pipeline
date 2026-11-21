// node tools/plan.mjs <production> [--only "ch03 ch07"] [--github]
// Prints the render jobs of a production as JSON. --only keeps the jobs of the named projects (a re-render).
// With --github (used by the workflow) it also writes plan.json and hands the job list to the matrix.
import fs from "node:fs";
import { plan, parseArgs, die } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2), ["only"]);
if (!args._[0]) die("usage: node tools/plan.mjs <production> [--only \"ch03 ch07\"] [--github]");
const p = plan(args._[0]);
const only = String(args.only || "").split(/[\s,]+/).filter(Boolean);
if (only.length) {
  const unknown = only.filter((o) => !p.parts.some((x) => x.project === o));
  if (unknown.length) die("not a project of " + p.production + ": " + unknown.join(", "));
  p.parts = p.parts.filter((x) => only.includes(x.project));
  p.partial = true;
}
if (args.github) {
  fs.writeFileSync("plan.json", JSON.stringify(p, null, 2) + "\n");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, "matrix=" + JSON.stringify({ include: p.parts }) + "\n");
  const secs = (f) => (f / p.fps).toFixed(1) + " s";
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### " + p.production + ": " + p.parts.length + " render job(s)\n\n| job | frames | length |\n|---|---|---|\n" +
    p.parts.map((x) => "| " + x.id + " | " + x.frames + " | " + secs(x.frames) + " |").join("\n") + "\n");
}
console.log(JSON.stringify(p, null, 2));
