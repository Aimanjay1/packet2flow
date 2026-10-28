#!/usr/bin/env node
/**
 * figma-tokens.mjs — extract design tokens from a Figma file.
 *
 * Reads FIGMA_TOKEN and FIGMA_FILE_KEY from .env.local (or the environment),
 * then pulls the color palette, typography scale, radii and shadows used in
 * the file. Writes a JSON report and prints a readable summary.
 *
 * Usage:
 *   node scripts/figma-tokens.mjs
 *
 * Tip: for the cleanest results, define reusable Color / Text styles and
 * Variables in Figma. If you use Variables, your token needs the
 * "Variables (read)" scope, otherwise the /variables endpoint returns 403.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- env ----
function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env.local */
  }
}
loadEnv();

const TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = process.env.FIGMA_FILE_KEY;

if (!TOKEN || !FILE_KEY) {
  console.error("Missing FIGMA_TOKEN or FIGMA_FILE_KEY (set them in .env.local).");
  process.exit(1);
}

// ---- helpers ----
const base = "https://api.figma.com/v1";
async function get(path) {
  const res = await fetch(base + path, { headers: { "X-Figma-Token": TOKEN } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

function hex(c) {
  const p = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
  const a = c.a ?? 1;
  return `#${p(c.r)}${p(c.g)}${p(c.b)}${a < 1 ? p(a) : ""}`;
}
const num = (x) => Math.round(x * 100) / 100;
const count = (m, k) => m.set(k, (m.get(k) || 0) + 1);

// ---- extraction ----
function extract(doc) {
  const fills = new Map();
  const textColors = new Map();
  const frameBg = new Map();
  const fontFamilies = new Map();
  const sizes = new Map();
  const lineHeights = new Map();
  const letterSpacing = new Map();
  const radii = new Map();
  const shadows = new Map();
  let varRefs = 0;

  function walk(node) {
    if (!node) return;
    if (node.boundVariables) varRefs++;

    if (Array.isArray(node.fills)) {
      for (const f of node.fills) {
        if (f.type === "SOLID" && f.visible !== false && f.color) {
          count(fills, hex(f.color));
          if (node.type === "FRAME") count(frameBg, hex(f.color));
          if (node.type === "TEXT") count(textColors, hex(f.color));
        }
      }
    }

    if (node.type === "TEXT" && node.style) {
      const s = node.style;
      if (s.fontFamily) {
        if (!fontFamilies.has(s.fontFamily)) fontFamilies.set(s.fontFamily, new Set());
        fontFamilies.get(s.fontFamily).add(s.fontWeight || 400);
      }
      if (s.fontSize) count(sizes, s.fontSize);
      if (s.lineHeightPx) count(lineHeights, num(s.lineHeightPx));
      if (s.letterSpacing != null) count(letterSpacing, num(s.letterSpacing));
    }

    if (node.cornerRadius) count(radii, node.cornerRadius);

    if (Array.isArray(node.effects)) {
      for (const e of node.effects) {
        if (e.visible === false) continue;
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          count(
            shadows,
            [
              e.type,
              e.color ? hex(e.color) : "none",
              `x${num(e.offset?.x ?? 0)}`,
              `y${num(e.offset?.y ?? 0)}`,
              `b${num(e.radius ?? 0)}`,
              `s${num(e.spread ?? 0)}`,
            ].join(" "),
          );
        }
      }
    }

    if (node.children) for (const c of node.children) walk(c);
  }
  walk(doc.document);

  const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    file: doc.name,
    pages: (doc.document.children || []).map((p) => p.name),
    variableRefs: varRefs,
    colors: sort(fills),
    textColors: sort(textColors),
    frameBackgrounds: sort(frameBg),
    fontFamilies: [...fontFamilies.entries()].map(([f, w]) => [f, [...w].sort()]),
    fontSizes: sort(sizes),
    lineHeights: sort(lineHeights),
    letterSpacing: sort(letterSpacing),
    radii: sort(radii),
    shadows: sort(shadows),
  };
}

// ---- main ----
const file = await get(`/files/${FILE_KEY}`);

// Named styles / variables are optional (may be empty or 403 without scope).
let styles = [];
let variables = [];
try {
  styles = (await get(`/files/${FILE_KEY}/styles`)).meta?.styles ?? [];
} catch (e) {
  console.warn("⚠  Styles skipped:", e.message);
}
try {
  const v = await get(`/files/${FILE_KEY}/variables/local`);
  variables = v.meta?.variables ?? [];
} catch (e) {
  console.warn("⚠  Variables skipped (token may lack the 'Variables (read)' scope):", e.message);
}

const report = extract(file);
report.styles = styles.map((s) => ({ name: s.name, type: s.style_type }));
report.variables = variables.map((v) => ({ name: v.name, type: v.resolvedType }));

const out = join(__dirname, "figma-tokens.report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nWrote ${out}\n`);

// ---- readable summary ----
console.log(`File: ${report.file}`);
console.log(`Pages: ${report.pages.join(", ")}`);
console.log(`Variable refs: ${report.variableRefs}`);
console.log(`Named styles: ${styles.length} | Variables: ${variables.length}\n`);

console.log("Colors (fills):");
for (const [c, n] of report.colors.slice(0, 40)) console.log(`  ${c.padEnd(10)} ×${n}`);

console.log("\nText colors:");
for (const [c, n] of report.textColors.slice(0, 20)) console.log(`  ${c.padEnd(10)} ×${n}`);

console.log("\nFont families:");
for (const [f, w] of report.fontFamilies) console.log(`  ${f}  [${w.join(", ")}]`);

console.log("\nFont sizes (px):");
console.log("  " + report.fontSizes.slice(0, 20).map(([s]) => s).join(", "));

console.log("\nRadii (px):");
console.log("  " + report.radii.slice(0, 20).map(([r]) => r).join(", "));

console.log("\nShadows (top):");
for (const [s, n] of report.shadows.slice(0, 12)) console.log(`  ×${n}  ${s}`);
