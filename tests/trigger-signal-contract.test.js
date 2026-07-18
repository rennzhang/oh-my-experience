import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getCard,
  initializeDataDir,
  promoteDraft,
  runDoctor,
  validateTriggerSignalContract,
  writeCard,
} from "../dist/packages/core/src/index.js";

const root = path.resolve(new URL("../", import.meta.url).pathname);
const bin = path.join(root, "bin", "ome.js");

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-trigger-contract-${name}-`));
}

function experience(id, status = "draft", overrides = {}) {
  const now = new Date().toISOString();
  return {
    id,
    status,
    title: `Trigger contract ${id}`,
    category: "test",
    summary: "Synthetic public fixture for deterministic signal-contract validation.",
    rule: "Keep positive triggers aligned with their configured routing signals.",
    triggers: ["Review the frontend UI."],
    negativeTriggers: [],
    aliases: {},
    topics: ["signals"],
    applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "" },
    intentModes: { include: [], exclude: [] },
    requiredSignals: [],
    requiredAllSignals: [],
    blockedSignals: [],
    language: "auto",
    recallPolicy: "should",
    risk: "medium",
    confidence: "medium",
    staleAfter: null,
    sources: [],
    origin: { adapter: "manual", agent: "unknown", model: null, sessionId: null, projectKey: null, createdBy: "manual" },
    sourceRefs: [],
    body: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("requiredSignals is an every-trigger required-any contract", () => {
  const passing = validateTriggerSignalContract(experience("required-any-pass", "draft", {
    triggers: ["Review the frontend UI.", "Run e2e validation before delivery."],
    requiredSignals: ["ui_surface", "real_validation"],
  }));
  assert.equal(passing.ok, true);
  assert.equal(passing.checkedTriggers, 2);

  const failing = validateTriggerSignalContract(experience("required-any-fail", "draft", {
    triggers: ["Review the frontend UI.", "Repair the backend cache."],
    requiredSignals: ["ui_surface", "real_validation"],
  }));
  assert.equal(failing.ok, false);
  assert.deepEqual(failing.violations.map((item) => [item.triggerIndex, item.code]), [
    [1, "required-signals-missing"],
  ]);
  assert.deepEqual(failing.violations[0].configuredSignals, ["ui_surface", "real_validation"]);
});

test("requiredAllSignals is an every-trigger conjunction", () => {
  const passing = validateTriggerSignalContract(experience("required-all-pass", "draft", {
    triggers: [
      "Implement the frontend UI and run browser validation with e2e.",
      "修改前端页面并做浏览器验证。",
    ],
    requiredAllSignals: ["ui_surface", "real_validation"],
  }));
  assert.equal(passing.ok, true, JSON.stringify(passing.violations));

  const failing = validateTriggerSignalContract(experience("required-all-fail", "draft", {
    triggers: [
      "Implement the frontend UI and run browser validation with e2e.",
      "Implement the frontend UI.",
    ],
    requiredAllSignals: ["ui_surface", "real_validation"],
  }));
  assert.equal(failing.ok, false);
  assert.deepEqual(failing.violations.map((item) => [item.triggerIndex, item.code, item.missingSignals]), [
    [1, "required-all-signals-missing", ["real_validation"]],
  ]);
});

test("blocked signals and targeted negative suppression invalidate positive triggers", () => {
  const blocked = validateTriggerSignalContract(experience("blocked-trigger", "draft", {
    triggers: ["只解释原因，不要修改代码。"],
    blockedSignals: ["explain_only"],
  }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.violations.some((item) =>
    item.code === "blocked-signal-detected" && item.matchedSignals.includes("explain_only")
  ));

  const suppressed = validateTriggerSignalContract(experience("suppressed-trigger", "draft", {
    triggers: ["Read-only review the current Git diff; do not modify, stage, commit, or push."],
    requiredSignals: ["worktree_diff_operation"],
  }));
  assert.equal(suppressed.ok, false);
  assert.ok(suppressed.violations.some((item) =>
    item.code === "targeted-negative-suppression" && item.matchedSignals.includes("worktree_read_only")
  ), JSON.stringify(suppressed.violations));
});

test("signal contract stays separate from lexical recall admission", () => {
  const result = validateTriggerSignalContract(experience("lexical-boundary", "draft", {
    triggers: ["A deliberately rare lexical anchor with no routing contract."],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.checkedTriggers, 1);
  assert.deepEqual(result.violations, []);
});

test("promotion fails closed and CLI returns structured actionable contract errors", () => {
  const dataDir = tmpDir("promotion");
  initializeDataDir({ dataDir });
  writeCard(dataDir, experience("invalid-promotion", "draft", {
    triggers: ["Repair the backend cache."],
    requiredSignals: ["ui_surface"],
  }));

  assert.throws(
    () => promoteDraft(dataDir, "invalid-promotion"),
    (error) => {
      assert.equal(error.code, "OME_TRIGGER_SIGNAL_CONTRACT_INVALID");
      assert.equal(error.details.ok, false);
      assert.equal(error.details.violations[0].code, "required-signals-missing");
      assert.match(error.message, /Action:/);
      return true;
    },
  );
  assert.equal(getCard(dataDir, "invalid-promotion").status, "draft");

  const cli = spawnSync(process.execPath, [
    bin,
    "experience",
    "enable",
    "invalid-promotion",
    "--data-dir",
    dataDir,
    "--json",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 1, `${cli.stderr}\n${cli.stdout}`);
  const output = JSON.parse(cli.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.error.code, "OME_TRIGGER_SIGNAL_CONTRACT_INVALID");
  assert.equal(output.error.details.cardId, "invalid-promotion");
  assert.equal(output.error.details.violations[0].action.length > 0, true);
  assert.equal(getCard(dataDir, "invalid-promotion").status, "draft");
});

test("doctor reports active and draft contract violations as errors and archived violations as warnings", () => {
  const dataDir = tmpDir("doctor");
  initializeDataDir({ dataDir });
  for (const status of ["active", "draft", "archived"]) {
    writeCard(dataDir, experience(`invalid-${status}`, status, {
      triggers: ["Repair the backend cache."],
      requiredSignals: ["ui_surface"],
      ...(status === "archived" ? { archivedReason: "synthetic fixture" } : {}),
    }));
  }

  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.equal(doctor.checked.triggerContractViolations, 3);
  assert.ok(doctor.errors.some((message) => /active card trigger signal contract invalid: invalid-active/.test(message)));
  assert.ok(doctor.errors.some((message) => /draft card trigger signal contract invalid: invalid-draft/.test(message)));
  assert.ok(doctor.warnings.some((message) => /archived card trigger signal contract invalid: invalid-archived/.test(message)));
  assert.equal(doctor.errors.some((message) => message.includes("invalid-archived")), false);
});
