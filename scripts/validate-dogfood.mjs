#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const runRoot = path.join(root, "tmp", `dogfood-validation-${stamp()}`);
const configHome = path.join(runRoot, "config-home");
const codexHome = path.join(runRoot, "codex-home");
const claudeHome = path.join(runRoot, "claude-home");
const env = { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome, CODEX_HOME: codexHome };
const steps = [];

fs.mkdirSync(runRoot, { recursive: true });

step("build", "npm", ["run", "build"]);
step("check", "npm", ["run", "check"]);
step("test", "npm", ["test"]);
const recallGate = jsonStep("recall-gate", "node", ["bin/ome.js", "eval", "recall", "--suite", "tests/fixtures/eval/core.json", "--limit", "4", "--threshold", "40", "--min-pass-rate", "1", "--min-recall", "1", "--min-precision", "1", "--max-over-recall", "0", "--json"]);
const hookDataDir = recallGate.fixtureDataDir;
const hookPrompt = "Fix a frontend UI bug and validate the result in a real browser.";
jsonStep("codex-hook-run", "node", ["bin/ome.js", "hook", "run", "--data-dir", hookDataDir, "--json"], {
  input: JSON.stringify({ prompt: hookPrompt, session_id: "dogfood-codex", turn_id: "1", cwd: root }),
  validate: assertHookInjected("browser-validation", hookDataDir),
});
jsonStep("claude-hook-run", "node", ["bin/ome.js", "hook", "run", "--data-dir", hookDataDir, "--json"], {
  input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: hookPrompt, transcript_path: path.join(runRoot, "claude-transcript.jsonl"), cwd: root }),
  validate: assertHookInjected("browser-validation", hookDataDir),
});
step("pack-dry-run", "npm", ["pack", "--dry-run", "--silent"]);

const packDir = path.join(runRoot, "pack");
fs.mkdirSync(packDir, { recursive: true });
const packed = step("pack-tarball", "npm", ["pack", "--pack-destination", packDir, "--silent"]);
const tgz = path.join(packDir, packed.stdout.trim().split("\n").at(-1));
const installDir = path.join(runRoot, "install-smoke");
fs.mkdirSync(installDir, { recursive: true });
fs.writeFileSync(path.join(installDir, "package.json"), `${JSON.stringify({ private: true, name: "ome-install-smoke", version: "0.0.0" }, null, 2)}\n`, "utf8");
step("tarball-install", "npm", ["install", tgz, "--silent"], { cwd: installDir });
step("installed-init", "npx", ["ome", "init", "--data-dir", path.join(runRoot, "installed-data"), "--no-hook", "--json"], { cwd: installDir });
step("installed-doctor", "npx", ["ome", "doctor", "--data-dir", path.join(runRoot, "installed-data"), "--json"], { cwd: installDir });

step("bun-binary", "npm", ["run", "build:binary:bun"]);
step("binary-init", path.join(root, "build", "ome"), ["init", "--data-dir", path.join(runRoot, "binary-data"), "--no-hook", "--json"]);
step("binary-doctor", path.join(root, "build", "ome"), ["doctor", "--data-dir", path.join(runRoot, "binary-data"), "--json"]);

const report = { ok: true, runRoot, configHome, codexHome, claudeHome, steps };
fs.writeFileSync(path.join(runRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

function step(name, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...env, CLAUDE_HOME: claudeHome, ...(options.env || {}) },
    encoding: "utf8",
    input: options.input,
    maxBuffer: 20 * 1024 * 1024,
  });
  const entry = {
    name,
    command: [command, ...args].join(" "),
    status: result.status,
    signal: result.signal,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdout: result.stdout.slice(-8000),
    stderr: result.stderr.slice(-8000),
  };
  steps.push(entry);
  if (result.status !== 0) {
    const report = { ok: false, runRoot, failedStep: entry, steps };
    fs.writeFileSync(path.join(runRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.error(JSON.stringify(report, null, 2));
    process.exit(result.status || 1);
  }
  return result;
}

function jsonStep(name, command, args, options = {}) {
  const result = step(name, command, args, options);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    fail(name, `invalid JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (options.validate) options.validate(parsed);
  return parsed;
}

function assertHookInjected(cardId, dataDir) {
  return (output) => {
    const context = output?.hookSpecificOutput?.additionalContext || "";
    if (!context.includes(cardId)) {
      fail("hook-run-validation", `expected hook additionalContext to include ${cardId}`);
    }
    if (!context.includes("**本次使用 N条 OME 经验卡：**")) {
      fail("hook-run-validation", "expected hook additionalContext to include used-card disclosure template");
    }
    if (context.includes("本次挂载")) {
      fail("hook-run-validation", "expected hook additionalContext not to use mounted-card wording");
    }
    if (!context.includes("Final link if used:")) {
      fail("hook-run-validation", "expected hook additionalContext to include final-use links");
    }
    const expectedLink = `](<${path.join(dataDir, "experiences", "active", `${cardId}.md`)}>)`;
    if (!context.includes(expectedLink)) {
      fail("hook-run-validation", `expected hook additionalContext to link mounted card path ${expectedLink}`);
    }
  };
}

function fail(name, message) {
  const entry = {
    name,
    command: "internal validation",
    status: 1,
    signal: null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    stdout: "",
    stderr: message,
  };
  steps.push(entry);
  const report = { ok: false, runRoot, failedStep: entry, steps };
  fs.writeFileSync(path.join(runRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
