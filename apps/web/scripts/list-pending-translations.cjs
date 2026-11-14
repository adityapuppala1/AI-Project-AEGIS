// Regenerates lib/translations-pending.ts: every English interface string that has no reviewed Telugu and Hindi
// entry yet. Those strings are shown in English in every language until a native speaker supplies the translation
// (AGENTS.md: do not machine-translate). Run from apps/web:  node scripts/list-pending-translations.cjs
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
function load(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = request => request.startsWith(".") ? load(path.posix.join(path.posix.dirname(file), request) + ".ts") : require(request);
  new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
  return mod.exports;
}
function tsx(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = dir + "/" + name;
    if (fs.statSync(path.join(root, rel)).isDirectory()) tsx(rel, out); else if (name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

/** Every string the interface passes to t(): literals in the source plus the data tables read through t(variable). */
function collect() {
  const found = new Set();
  for (const file of [...tsx("components"), ...tsx("app")]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)) found.add(JSON.parse('"' + match[1] + '"'));
    // AppShell translates the title and description it is given.
    for (const match of source.matchAll(/<AppShell[^>]*?\btitle="([^"]+)"/g)) found.add(match[1]);
    for (const match of source.matchAll(/<AppShell[^>]*?\bdescription="([^"]+)"/g)) found.add(match[1]);
    for (const match of source.matchAll(/<SystemPage[^>]*?\btitle="([^"]+)"[^>]*?\bbody="([^"]+)"/g)) { found.add(match[1]); found.add(match[2]); }
  }
  const labels = load("lib/labels.ts"), roles = load("lib/roles.ts"), help = load("lib/page-help.ts"), hazards = load("lib/hazards.ts");
  for (const text of labels.KNOWN_LABEL_TEXTS) found.add(text);
  for (const info of Object.values(roles.ROLE_INFO)) { found.add(info.label); found.add(info.summary); }
  for (const item of roles.CAPABILITIES) { found.add(item.label); found.add(item.group); }
  for (const entry of Object.values(help.PAGE_HELP)) for (const text of Object.values(entry)) found.add(text);
  for (const text of Object.values(help.PAGE_HELP_HEADINGS)) found.add(text);
  for (const style of hazards.HAZARD_STYLES) found.add(style.label);
  found.add("Other hazard");
  const navigation = fs.readFileSync(path.join(root, "lib/navigation.ts"), "utf8");
  for (const match of navigation.matchAll(/(?:label|description): "([^"]+)"/g)) found.add(match[1]);
  for (const step of ["Sense", "Predict", "Decide", "Hand over", "Reach", "Learn", "For other roles", "Signed-in operator", "submitted", "approved", "refused", "waiting"]) found.add(step);
  // The About page keeps its copy in data tables above the component.
  const about = fs.readFileSync(path.join(root, "components/about-aegis.tsx"), "utf8").split("/** The signed-in About page")[0];
  for (const match of about.matchAll(/(?:title|text|ai|people): "((?:[^"\\]|\\.)*)"/g)) found.add(JSON.parse('"' + match[1] + '"'));
  const limits = /const LIMITS = \[([\s\S]*?)\];/.exec(about);
  if (limits) for (const match of limits[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) found.add(JSON.parse('"' + match[1] + '"'));
  // The patent rehearsal keeps its copy in tables (lib/patent.ts, and constants above the components).
  const patent = load("lib/patent.ts");
  for (const text of [patent.PATENT.title, patent.PATENT.howItApplies, patent.PATENT.titleOnlyNote, ...Object.values(patent.PRIORITY_LABELS), ...Object.values(patent.LINK_LABELS),
    ...patent.SCENARIOS.map(item => item.label), ...patent.SENSORS.flatMap(item => [item.name, item.type]), ...patent.COMM_PARTIES.flatMap(item => [item.name, item.kind]),
    ...Object.values(patent.SUMMARY_TEXTS)]) found.add(text);
  for (const file of ["components/sensor-link.tsx", "components/patent-credit.tsx"]) {
    const src = fs.readFileSync(path.join(root, file), "utf8").split("export function")[0];
    for (const block of src.matchAll(/^const (?:REHEARSAL|LIMITS|STATE_LABEL|COMM_LABEL)\b[\s\S]*?;$/gm))
      for (const match of block[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)) found.add(JSON.parse('"' + match[1] + '"'));
  }
  found.delete("");
  return found;
}

function pending() {
  const known = new Set(load("lib/translations.ts").TRANSLATION_ENTRIES.map(entry => entry[0]));
  return [...collect()].filter(text => !known.has(text)).sort((a, b) => a.localeCompare(b, "en"));
}

module.exports = { collect, pending };

if (require.main === module) {
  const list = pending();
  const body = "// GENERATED by scripts/list-pending-translations.cjs. Do not edit by hand.\n"
    + "// English interface strings that have no Telugu or Hindi translation yet. They are shown in English in every\n"
    + "// language until a native speaker supplies and reviews the translation; they must not be machine-translated.\n"
    + "export const PENDING_NATIVE_REVIEW: readonly string[] = [\n" + list.map(text => "  " + JSON.stringify(text) + ",").join("\n") + "\n];\n";
  fs.writeFileSync(path.join(root, "lib/translations-pending.ts"), body);
  console.log("pending strings:", list.length);
}
