#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const projectName = process.env.CF_PAGES_PROJECT_NAME || "oh-my-experience";
const branch = process.env.CF_PAGES_BRANCH || currentBranch();
const outputDir = path.join(root, "docs", ".vitepress", "dist");
const deployArgs = [
  "wrangler",
  "pages",
  "deploy",
  outputDir,
  "--project-name",
  projectName,
  "--branch",
  branch,
  "--commit-dirty=true",
];

run("npm", ["run", "docs:build"]);

if (!fs.existsSync(path.join(outputDir, "index.html"))) {
  fail(`Docs output is missing index.html: ${outputDir}`);
}

run("npx", deployArgs);

function currentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return "main";
  return result.stdout.trim() || "main";
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
