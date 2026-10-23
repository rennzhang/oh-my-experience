import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultConfig, ensureBaseDirs, layout, runDoctor } from "../dist/packages/core/src/index.js";

function fixture(t, enabled = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ome-omp-doctor-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, "library"), homes = {
    codexHome: path.join(root, "codex"), claudeHome: path.join(root, "claude"),
    cursorHome: path.join(root, "cursor"), ompHome: path.join(root, "omp-agent"),
  };
  ensureBaseDirs(dataDir);
  const config = createDefaultConfig(dataDir);
  config.hooks.providers.omp = { enabled };
  fs.writeFileSync(layout(dataDir).config, JSON.stringify(config));
  fs.writeFileSync(layout(dataDir).experienceIndex, JSON.stringify({ experiences: [] }));
  return { root, dataDir, homes, config };
}

test("doctor reports an enabled missing OMP extension without creating files", t => {
  const f = fixture(t), result = runDoctor(f.dataDir, f.homes);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /OMP hook enabled.*not found/);
  assert.equal(fs.existsSync(f.homes.ompHome), false);
});

test("disabled OMP is ignored and existing provider diagnostics remain unchanged", t => {
  const f = fixture(t, false), target = path.join(f.homes.ompHome, "extensions", "ome-recall.ts");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "// another owner's extension; never execute\n");
  f.config.hooks.providers.codex.enabled = true;
  fs.writeFileSync(layout(f.dataDir).config, JSON.stringify(f.config));
  const result = runDoctor(f.dataDir, f.homes);
  assert.deepEqual(result.errors, [`Codex hook enabled but hook config not found: ${path.join(f.homes.codexHome, "hooks.json")}`]);
  assert.equal(fs.readFileSync(target, "utf8"), "// another owner's extension; never execute\n");
});

test("doctor accepts the current managed OMP source and rejects modified or foreign content", async t => {
  const f = fixture(t);
  const { installOmpHook } = await import("../dist/packages/adapters/agents/omp/src/hook-install.js");
  const installed = installOmpHook({ ompHome: f.homes.ompHome, dataDir: f.dataDir });
  const source = fs.readFileSync(installed.target, "utf8");
  assert.equal(runDoctor(f.dataDir, f.homes).ok, true);
  for (const [content, expected] of [[source + "\n// tampered\n", /OMP hook.*current|OMP hook.*expected/], ["// external code\n", /OMP hook.*owned|OMP hook.*managed|OMP hook.*foreign/]]) {
    fs.writeFileSync(installed.target, content);
    const result = runDoctor(f.dataDir, f.homes);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), expected);
    assert.equal(fs.readFileSync(installed.target, "utf8"), content);
  }
});

test("doctor respects an installed custom binary while checking the inspected library binding", async t => {
  const f = fixture(t);
  const { installOmpHook } = await import("../dist/packages/adapters/agents/omp/src/hook-install.js");
  const bin = path.join(f.root, "custom ome binary");
  installOmpHook({ ompHome: f.homes.ompHome, bin, dataDir: f.dataDir });
  assert.equal(runDoctor(f.dataDir, f.homes).ok, true);
  installOmpHook({ ompHome: f.homes.ompHome, bin, dataDir: path.join(f.root, "another-library") });
  const wrongLibrary = runDoctor(f.dataDir, f.homes);
  assert.equal(wrongLibrary.ok, false);
  assert.match(wrongLibrary.errors.join("\n"), /OMP hook.*dataDir/);
});
