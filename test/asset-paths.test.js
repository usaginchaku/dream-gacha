"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL, fileURLToPath } = require("node:url");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "site.webmanifest"), "utf8"));

// Relative URLs must work both when opening index.html and on repository Pages.
function assertLocalReference(reference, baseFile) {
  assert.doesNotMatch(reference, /^(?:[a-z]+:|\/)/i, reference);
  const localURL = new URL(reference, pathToFileURL(path.join(root, baseFile)));
  assert.ok(fs.statSync(fileURLToPath(localURL)).isFile(), reference);
  for (const prefix of ["/", "/dream-gacha/"]) {
    const hostedURL = new URL(reference, `https://example.test${prefix}${baseFile}`);
    assert.ok(hostedURL.pathname.startsWith(prefix), reference);
    assert.equal(
      path.resolve(root, decodeURIComponent(hostedURL.pathname.slice(prefix.length))),
      fileURLToPath(localURL),
      `file:// and hosted paths must resolve to the same file: ${reference}`
    );
  }
  return fileURLToPath(localURL);
}

test("HTML assets resolve for file, custom domain and repository Pages URLs", () => {
  const references = [...index.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
    .map(match => match[1]);
  assert.ok(references.some(reference => reference.endsWith("site.webmanifest")));
  assert.ok(references.some(reference => reference.includes("styles.css")));
  for (const reference of references) assertLocalReference(reference, "index.html");
});

test("manifest icons and CSS resources resolve relative to their containing files", () => {
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    const bytes = fs.readFileSync(assertLocalReference(icon.src, "site.webmanifest"));
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  const stylesheet = index.match(/<link rel="stylesheet" href="([^"]+)"/)[1];
  const cssFile = path.relative(root, assertLocalReference(stylesheet, "index.html"));
  const css = fs.readFileSync(path.join(root, cssFile), "utf8");
  for (const [, reference] of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
    if (!reference.startsWith("data:") && !reference.startsWith("#")) {
      assertLocalReference(reference, cssFile.replaceAll(path.sep, "/"));
    }
  }
});

test("README links and documented Node commands point to existing files", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const [, reference] of readme.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(?:https?:|#)/.test(reference)) assertLocalReference(reference, "README.md");
  }
  for (const [, script] of readme.matchAll(/`node ([\w/-]+\.(?:mjs|js))/g)) {
    assert.ok(fs.statSync(path.join(root, script)).isFile(), script);
  }
});
