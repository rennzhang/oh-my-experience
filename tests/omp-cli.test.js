import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const bin = path.resolve("bin/ome.js");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ome-omp-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const homes = Object.fromEntries(["codex", "claude", "cursor", "omp"].map(name => [name, path.join(root, name)]));
  const dataDir = path.join(root, "data");
  const options = ["--data-dir", dataDir, ...Object.entries(homes).flatMap(([name, home]) => [`--${name}-home`, home])];
  function run(args) {
    const r = spawnSync(process.execPath, [bin, ...args, ...options, "--json"], {
      encoding: "utf8", timeout: 20000,
      env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: path.join(root, "config"), OMP_PROFILE: "", PI_PROFILE: "" },
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    return JSON.parse(r.stdout);
  }
  return { root, homes, dataDir, run };
}

test("OMP init preview discovers hook and skill without writing either target", t => {
  const f = fixture(t), preview = f.run(["init", "--provider", "omp", "--dry-run"]);
  assert.equal(preview.hooks[0].provider, "omp");
  assert.equal(preview.hooks[0].target, path.join(f.homes.omp, "extensions", "ome-recall.ts"));
  assert.equal(preview.skills[0].target, path.join(f.homes.omp, "skills", "oh-my-experience"));
  assert.equal(fs.existsSync(f.homes.omp), false);
  assert.equal(fs.existsSync(f.dataDir), false);
});

test("OMP installs idempotently, reports health and uninstalls only its own hook and skill", t => {
  const f = fixture(t), other = path.join(f.homes.omp, "extensions", "other.ts");
  fs.mkdirSync(path.dirname(other), { recursive: true }); fs.writeFileSync(other, "// unrelated extension\n");
  const first = f.run(["init", "--provider", "omp", "--yes"]), target = first.hooks[0].target;
  assert.equal(fs.existsSync(target), true); assert.equal(first.skills[0].installed, true);
  const source = fs.readFileSync(target, "utf8");
  f.run(["init", "--provider", "omp", "--yes"]);
  assert.equal(fs.readFileSync(target, "utf8"), source);
  assert.equal(f.run(["hook", "status", "--provider", "omp"]).matchesExpectedCommand, true);
  assert.equal(f.run(["doctor", "--provider", "omp"]).ok, true);
  const removed = f.run(["uninstall", "--provider", "omp"]);
  assert.equal(removed.hooks[0].uninstalled, true); assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(first.skills[0].target), false);
  assert.equal(fs.readFileSync(other, "utf8"), "// unrelated extension\n");
  assert.equal(fs.existsSync(path.join(f.dataDir, "experiences", "active")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, "config.json"))).hooks.providers.omp.enabled, false);
});

test("all providers include OMP while selective uninstall preserves other providers and experiences", t => {
  const f = fixture(t), installed = f.run(["init", "--provider", "all", "--yes"]);
  assert.deepEqual(installed.hooks.map(x => x.provider), ["codex", "claude", "cursor", "omp"]);
  f.run(["uninstall", "--provider", "omp"]);
  for (const name of ["codex", "claude", "cursor"]) assert.equal(f.run(["hook", "status", "--provider", name]).installed, true);
  assert.equal(f.run(["hook", "status", "--provider", "omp"]).installed, false);
});

test("an invalid unused OMP profile cannot break existing Codex setup or health checks", t => {
  const f = fixture(t), options = ["--data-dir", f.dataDir, "--codex-home", f.homes.codex, "--json"];
  const env = { ...process.env, OMP_PROFILE: "../invalid-profile", OH_MY_EXPERIENCE_CONFIG_HOME: path.join(f.root, "config") };
  for (const args of [["init", "--provider", "codex", "--yes"], ["doctor", "--provider", "codex"]]) {
    const r = spawnSync(process.execPath, [bin, ...args, ...options], { env, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(JSON.parse(r.stdout).ok, true);
  }
  assert.equal(fs.existsSync(f.homes.omp), false);
});
