const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

function block(selector) {
  const match = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${selector} token block must exist`);
  return match[1];
}

function rgb(tokens, name) {
  const match = tokens.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`));
  assert.ok(match, `${name} must be a numeric RGB token`);
  return match.slice(1).map(Number);
}

function luminance([red, green, blue]) {
  const channels = [red, green, blue].map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test("operations graphite themes define complete, distinct semantic tokens", () => {
  const light = block(":root");
  const dark = block(".dark");
  for (const name of ["canvas", "surface", "elevated", "stroke", "ink", "muted", "accent", "accent-contrast", "signal", "chart-grid", "chart-tooltip"]) {
    assert.notDeepEqual(rgb(light, name), rgb(dark, name), `${name} must visibly change between themes`);
  }
});

test("body copy and primary controls retain WCAG AA contrast", () => {
  for (const tokens of [block(":root"), block(".dark")]) {
    assert.ok(contrast(rgb(tokens, "ink"), rgb(tokens, "surface")) >= 4.5);
    assert.ok(contrast(rgb(tokens, "muted"), rgb(tokens, "surface")) >= 4.5);
    assert.ok(contrast(rgb(tokens, "accent"), rgb(tokens, "accent-contrast")) >= 4.5);
  }
});

test("depth treatment remains compatible with reduced motion", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.command-rail\s*\{/);
  assert.match(css, /\.nav-active\s*\{/);
});
