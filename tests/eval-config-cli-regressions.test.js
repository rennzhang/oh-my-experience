import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_RETRIEVAL_THRESHOLD,
  compareRecallReports,
  initializeDataDir,
  layout,
  loadConfig,
  saveConfig,
} from "../dist/packages/core/src/index.js";
import { runHook } from "../dist/packages/hook-runtime/src/run.js";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin", "ome.js");

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-eval-config-cli-${name}-`));
}

function metrics() {
  return {
    passRate: 1,
    precisionAtK: 1,
    recallAtK: 1,
    mrr: 1,
    ndcgAtK: 1,
    falsePositiveRate: 0,
    noHitRate: 0,
    overRecallRate: 0,
    avgReturnedCards: 1,
    avgContextSizeChars: 100,
    avgDurationMs: 1,
  };
}

function report(suite, cases) {
  return {
    suite,
    generatedAt: "2026-07-14T00:00:00.000Z",
    engineVersion: "test-engine-v1",
    scorerVersion: "test-scorer-v1",
    suiteFingerprint: "a".repeat(64),
    cardSetFingerprint: "b".repeat(64),
    evalConfigFingerprint: "c".repeat(64),
    limit: 4,
    threshold: 40,
    metrics: metrics(),
    cases: cases.map((item) => ({
      prompt: "stable synthetic prompt",
      expectedCards: [],
      unexpectedCards: [],
      allowedExtraCards: [],
      expectNoMatches: false,
      metrics: { reciprocalRank: 1, ndcgAtK: 1 },
      ...item,
    })),
  };
}

function writeReport(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
}

test("report comparison fails closed when either report changes the case set", () => {
  const dir = tmpDir("case-drift");
  const baseFile = writeReport(dir, "base.json", report("stable-suite", [
    { id: "kept", passed: true },
    { id: "removed", passed: true },
  ]));
  const nextFile = writeReport(dir, "next.json", report("stable-suite", [
    { id: "kept", passed: true },
    { id: "added", passed: true },
  ]));

  const comparison = compareRecallReports(baseFile, nextFile);

  assert.equal(comparison.ok, false);
  assert.equal(comparison.suiteMismatch, false);
  assert.deepEqual(comparison.caseSetDrift, {
    missingInNext: ["removed"],
    addedInNext: ["added"],
  });
  assert.deepEqual(comparison.regressions.map((item) => item.id), ["removed"]);
});

test("report comparison fails closed when the suite identity changes", () => {
  const dir = tmpDir("suite-drift");
  const cases = [{ id: "same-case", passed: true }];
  const baseFile = writeReport(dir, "base.json", report("suite-a", cases));
  const nextFile = writeReport(dir, "next.json", report("suite-b", cases));

  const comparison = compareRecallReports(baseFile, nextFile);

  assert.equal(comparison.ok, false);
  assert.equal(comparison.suiteMismatch, true);
  assert.deepEqual(comparison.caseSetDrift, { missingInNext: [], addedInNext: [] });
});

test("report comparison fails closed on evaluation identity and case contract drift", () => {
  const dir = tmpDir("identity-contract-drift");
  const stableCase = {
    id: "same-case",
    prompt: "Review the synthetic orchid ledger.",
    expectedCards: ["orchid-ledger"],
    unexpectedCards: ["warehouse-decoy"],
    allowedExtraCards: ["audit-observer"],
    expectNoMatches: false,
    passed: true,
  };
  const base = report("stable-suite", [stableCase]);
  const identityVariants = {
    engineVersion: "test-engine-v2",
    scorerVersion: "test-scorer-v2",
    suiteFingerprint: "d".repeat(64),
    cardSetFingerprint: "e".repeat(64),
    evalConfigFingerprint: "f".repeat(64),
    limit: 3,
    threshold: 41,
  };

  for (const [field, value] of Object.entries(identityVariants)) {
    const baseFile = writeReport(dir, `base-${field}.json`, base);
    const nextFile = writeReport(dir, `next-${field}.json`, { ...base, [field]: value });
    const comparison = compareRecallReports(baseFile, nextFile);

    assert.equal(comparison.ok, false, field);
    assert.ok(comparison.identityDrift.some((item) => item.field === field), field);
  }

  const caseVariants = {
    prompt: "Review a different synthetic ledger.",
    expectedCards: ["different-card"],
    unexpectedCards: ["different-decoy"],
    allowedExtraCards: ["different-observer"],
    expectNoMatches: true,
  };
  for (const [field, value] of Object.entries(caseVariants)) {
    const baseFile = writeReport(dir, `base-case-${field}.json`, base);
    const nextCase = { ...base.cases[0], [field]: value };
    const nextFile = writeReport(dir, `next-case-${field}.json`, { ...base, cases: [nextCase] });
    const comparison = compareRecallReports(baseFile, nextFile);

    assert.equal(comparison.ok, false, field);
    assert.ok(comparison.caseContractDrift.some((item) => item.id === "same-case" && item.fields.includes(field)), field);
  }
});

test("report comparison rejects legacy reports without comparison metadata", () => {
  const dir = tmpDir("missing-comparison-metadata");
  const legacy = {
    suite: "legacy-suite",
    generatedAt: "2026-07-14T00:00:00.000Z",
    metrics: metrics(),
    cases: [],
  };
  const baseFile = writeReport(dir, "legacy-base.json", legacy);
  const nextFile = writeReport(dir, "legacy-next.json", legacy);

  const comparison = compareRecallReports(baseFile, nextFile);

  assert.equal(comparison.ok, false);
  assert.ok(comparison.missingComparisonMetadata.includes("base.engineVersion"));
  assert.ok(comparison.missingComparisonMetadata.includes("next.cardSetFingerprint"));
});

test("CLI compare exits non-zero when the comparison report is not ok", () => {
  const dir = tmpDir("cli-compare");
  const baseFile = writeReport(dir, "base.json", report("cli-suite", [
    { id: "case-a", passed: true },
  ]));
  const nextFile = writeReport(dir, "next.json", report("cli-suite", [
    { id: "case-a", passed: false },
  ]));

  const result = spawnSync(process.execPath, [
    bin,
    "eval",
    "recall",
    "--compare",
    baseFile,
    nextFile,
    "--json",
  ], { cwd: root, encoding: "utf8" });

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.deepEqual(output.regressions.map((item) => item.id), ["case-a"]);
});

test("CLI recall exits non-zero when cases fail without explicit metric thresholds", () => {
  const dataDir = tmpDir("cli-recall-failure");
  initializeDataDir({ dataDir });
  writeReport(dataDir, "failing-suite.cards.json", {
    experiences: [{
      id: "expected-card",
      title: "Expected synthetic card",
      category: "test",
      summary: "Only recall for a synthetic amber deployment anchor.",
      rule: "Use the amber deployment protocol.",
      criteria: { use_when: ["amber deployment protocol"], ignore_when: [] },
      recall: {
        policy: "should",
        risk: "medium",
        confidence: "medium",
        triggers: ["amber deployment protocol"],
        topics: ["amber"],
      },
      scope: { level: "global" },
    }],
  });
  const suiteFile = writeReport(dataDir, "failing-suite.json", {
    name: "failing-cli-suite",
    experiencesFile: "./failing-suite.cards.json",
    cases: [{
      id: "missing-card",
      prompt: "Prepare a lunar gardening calendar.",
      expectedCards: ["expected-card"],
      unexpectedCards: [],
    }],
  });

  const result = spawnSync(process.execPath, [
    bin,
    "eval",
    "recall",
    "--suite",
    suiteFile,
    "--data-dir",
    dataDir,
    "--json",
  ], { cwd: root, encoding: "utf8" });

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test("legacy unbounded minScore loads safely while new writes stay within 0..100", async () => {
  const dataDir = tmpDir("legacy-min-score");
  initializeDataDir({ dataDir });
  const configPath = layout(dataDir).config;
  const legacyConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  legacyConfig.retrieval.minScore = 140;
  fs.writeFileSync(configPath, JSON.stringify(legacyConfig, null, 2), "utf8");

  const loaded = loadConfig(dataDir);
  assert.equal(loaded.retrieval.minScore, DEFAULT_RETRIEVAL_THRESHOLD);

  const hookOutput = await runHook({
    dataDir,
    input: { prompt: "/goal execute the synthetic cache migration and verify delivery", session_id: "legacy-config" },
  });
  assert.ok(hookOutput.hookSpecificOutput?.additionalContext);

  initializeDataDir({ dataDir });
  const repaired = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(repaired.retrieval.minScore, DEFAULT_RETRIEVAL_THRESHOLD);

  assert.throws(() => saveConfig(dataDir, {
    ...loaded,
    retrieval: { ...loaded.retrieval, minScore: 101 },
  }));
  const upperBound = saveConfig(dataDir, {
    ...loaded,
    retrieval: { ...loaded.retrieval, minScore: 100 },
  });
  assert.equal(upperBound.retrieval.minScore, 100);
});
