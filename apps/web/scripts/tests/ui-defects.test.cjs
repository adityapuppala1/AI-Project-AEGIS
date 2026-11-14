// Regression checks from the end-to-end acceptance pass: dead submit button, raw failure codes, drill status line.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..", "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
function load(file) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", out)(() => { throw new Error("unexpected dependency"); }, mod, mod.exports);
  return mod.exports;
}

test("grounded guide: the form's primary button submits the form", () => {
  const source = read("components/grounded-evidence-guide.tsx");
  const buttons = [...source.matchAll(/<Button\b[^>]*>/g)].map(m => m[0]);
  assert.ok(buttons.length >= 1);
  for (const tag of buttons) assert.match(tag, /\btype="(submit|button)"/, "Button needs an explicit type: " + tag);
  assert.ok(buttons.some(tag => /type="submit"/.test(tag)), "the form needs a submit button");
});

test("failure codes become plain sentences, never raw codes", () => {
  const labels = load("lib/labels.ts");
  for (const code of ["raw_archive_missing", "training_years_only", "invalid_window", "stats_do_not_support_change", "proactive_paused"]) {
    const text = labels.apiFailureText(Object.assign(new Error("Request rejected"), { code }));
    assert.ok(!text.includes(code) && !/[a-z]+_[a-z_]+/.test(text), text);
  }
  assert.match(labels.apiFailureText(Object.assign(new Error("x"), { code: "proactive_paused" })), /kill switch/);
  assert.equal(labels.apiFailureText(Object.assign(new Error("x"), { code: "some_new_code" })), labels.API_CODE_FALLBACK);
  assert.equal(labels.apiFailureText(new Error("Insufficient role")), "Insufficient role");
  assert.ok(labels.KNOWN_LABEL_TEXTS.includes(labels.API_CODE_SENTENCES.raw_archive_missing));
});

test("call() keeps the code off the message", () => {
  const source = read("lib/learning.ts");
  assert.ok(!/join\(" · "\)/.test(source));
  assert.match(source, /Object\.assign\(new Error/);
});

test("drill actions set a success sentence", () => {
  const source = read("components/exercise-drills.tsx");
  assert.match(source, /setMessage\(done\)/);
  assert.equal((source.match(/\bact\(`?"?\/api/g) || []).length, (source.match(/(t\("[^"]+"\)|DONE_LABEL\[action\])\)\}>/g) || []).length);
});
