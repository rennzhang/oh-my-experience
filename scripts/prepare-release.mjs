#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const target = process.argv[2];
const allowedIncrements = new Set(["patch", "minor", "major", "prepatch", "preminor", "premajor", "prerelease"]);

if (!target) {
  fail("Usage: npm run release:prepare -- <patch|minor|major|x.y.z>");
}

if (!allowedIncrements.has(target) && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(target)) {
  fail(`Unsupported version target: ${target}`);
}

assertCleanWorktree();

run("npm", ["version", target, "--no-git-tag-version"]);
run("npm", ["run", "validate:release"]);
run("npm", ["pack", "--dry-run"]);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
console.log(`Release candidate prepared: ${pkg.version}`);
console.log("Review package.json/package-lock.json, then commit, tag, publish, and deploy docs explicitly.");

function assertCleanWorktree() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  if (result.stdout.trim()) {
    fail("Worktree must be clean before preparing a release.");
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
