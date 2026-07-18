import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareRecallReports,
  evaluateRecallSuite,
  initializeDataDir,
} from "../dist/packages/core/src/index.js";

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-eval-v2-${name}-`));
}

function card(id, title, triggers, topics, summary = title) {
  return {
    id,
    title,
    category: topics[0] || "general",
    summary,
    criteria: {
      use_when: triggers,
      ignore_when: [],
    },
    recall: {
      policy: "should",
      risk: "medium",
      confidence: "medium",
      triggers,
      topics,
    },
    scope: { level: "global" },
    rule: summary,
  };
}

function writeSuite(dir, name, data) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
  return file;
}

function comparisonMetadata() {
  return {
    engineVersion: "test-engine-v1",
    scorerVersion: "test-scorer-v1",
    suiteFingerprint: "a".repeat(64),
    cardSetFingerprint: "b".repeat(64),
    evalConfigFingerprint: "c".repeat(64),
    limit: 4,
    threshold: 40,
  };
}

function comparisonCase(id, passed, overrides = {}) {
  return {
    id,
    prompt: `Synthetic prompt ${id}`,
    expectedCards: [`card-${id}`],
    unexpectedCards: [],
    allowedExtraCards: [],
    expectNoMatches: false,
    passed,
    metrics: { reciprocalRank: passed ? 1 : 0, ndcgAtK: passed ? 1 : 0 },
    ...overrides,
  };
}

test("ranking metrics exclude judged no-hit cases and score a positive miss as zero", () => {
  const dataDir = tmpDir("ranking");
  initializeDataDir({ dataDir });
  const suite = writeSuite(dataDir, "ranking.json", {
    name: "ranking-truth",
    experiences: [card(
      "orchid-checksum",
      "Orchid checksum protocol",
      ["orchid checksum protocol"],
      ["integrity"],
      "Verify the orchid checksum protocol before importing a ledger.",
    )],
    cases: [{
      id: "positive-hit",
      prompt: "Run the orchid checksum protocol before import.",
      expectedCards: ["orchid-checksum"],
    }, {
      id: "positive-miss",
      prompt: "Prepare a lunar gardening calendar.",
      expectedCards: ["orchid-checksum"],
    }, {
      id: "judged-no-hit",
      prompt: "Write a tomato soup recipe.",
      expectedCards: [],
      expectNoMatches: true,
    }],
  });

  const report = evaluateRecallSuite(dataDir, suite, { limit: 2, threshold: 40 });
  const miss = report.cases.find((item) => item.id === "positive-miss");
  const noHit = report.cases.find((item) => item.id === "judged-no-hit");

  assert.equal(miss.metrics.ndcgAtK, 0);
  assert.equal(noHit.passed, true);
  assert.equal(report.metrics.mrr, 0.5);
  assert.equal(report.metrics.ndcgAtK, 0.5);
});

test("unjudged extra cards fail by default and allowedExtraCards is explicit", () => {
  const dataDir = tmpDir("extras");
  initializeDataDir({ dataDir });
  const experiences = [
    card(
      "a-ledger-owner",
      "Ledger owner workflow",
      ["quarterly ledger reconciliation"],
      ["finance"],
      "The finance owner reconciles the quarterly ledger before close.",
    ),
    card(
      "z-ledger-observer",
      "Compliance observation workflow",
      ["quarterly ledger reconciliation"],
      ["compliance"],
      "An observer records independent compliance evidence after reconciliation.",
    ),
  ];
  const suite = writeSuite(dataDir, "extras.json", {
    name: "strict-extra-truth",
    experiences,
    cases: [{
      id: "strict",
      prompt: "Run quarterly ledger reconciliation.",
      expectedCards: ["a-ledger-owner"],
    }, {
      id: "explicitly-allowed",
      prompt: "Run quarterly ledger reconciliation.",
      expectedCards: ["a-ledger-owner"],
      allowedExtraCards: ["z-ledger-observer"],
    }],
  });

  const report = evaluateRecallSuite(dataDir, suite, { limit: 4, threshold: 4 });
  const strict = report.cases.find((item) => item.id === "strict");
  const allowed = report.cases.find((item) => item.id === "explicitly-allowed");

  assert.deepEqual(strict.returnedCards, ["a-ledger-owner", "z-ledger-observer"]);
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.disallowedExtraCards, ["z-ledger-observer"]);
  assert.equal(allowed.passed, true);
  assert.deepEqual(allowed.allowedExtras, ["z-ledger-observer"]);
  assert.equal(allowed.metrics.precisionAtK, 1);
  assert.equal(report.metrics.overRecallRate, 0.5);
});

test("report comparison fails closed on ranking and precision regressions", () => {
  const dir = tmpDir("compare");
  const baseFile = path.join(dir, "base.json");
  const nextFile = path.join(dir, "next.json");
  const baseline = {
    suite: "compare",
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...comparisonMetadata(),
    metrics: {
      passRate: 1,
      precisionAtK: 1,
      recallAtK: 1,
      mrr: 1,
      ndcgAtK: 1,
      falsePositiveRate: 0,
      noHitRate: 0,
      overRecallRate: 0,
    },
    cases: [],
  };
  const regressed = {
    ...baseline,
    generatedAt: "2026-01-02T00:00:00.000Z",
    metrics: {
      ...baseline.metrics,
      precisionAtK: 0.9,
      mrr: 0.8,
      ndcgAtK: 0.85,
      falsePositiveRate: 0.1,
      overRecallRate: 0.1,
    },
  };
  fs.writeFileSync(baseFile, JSON.stringify(baseline), "utf8");
  fs.writeFileSync(nextFile, JSON.stringify(regressed), "utf8");

  const report = compareRecallReports(baseFile, nextFile);

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.metricRegressions.map((item) => item.metric),
    ["precisionAtK", "mrr", "ndcgAtK", "falsePositiveRate", "overRecallRate"],
  );
});

test("report comparison fails closed on a case regression even when aggregate metrics are unchanged", () => {
  const dir = tmpDir("compare-case");
  const baseFile = path.join(dir, "base.json");
  const nextFile = path.join(dir, "next.json");
  const metrics = {
    passRate: 0.5,
    precisionAtK: 0.5,
    recallAtK: 0.5,
    mrr: 0.5,
    ndcgAtK: 0.5,
    falsePositiveRate: 0,
    noHitRate: 0,
    overRecallRate: 0,
  };
  fs.writeFileSync(baseFile, JSON.stringify({
    suite: "case-swap",
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...comparisonMetadata(),
    metrics,
    cases: [comparisonCase("a", true), comparisonCase("b", false)],
  }), "utf8");
  fs.writeFileSync(nextFile, JSON.stringify({
    suite: "case-swap",
    generatedAt: "2026-01-02T00:00:00.000Z",
    ...comparisonMetadata(),
    metrics,
    cases: [comparisonCase("a", false), comparisonCase("b", true)],
  }), "utf8");

  const report = compareRecallReports(baseFile, nextFile);

  assert.equal(report.metricRegressions.length, 0);
  assert.deepEqual(report.regressions.map((item) => item.id), ["a"]);
  assert.equal(report.ok, false);
});

test("report comparison fails on a per-case ranking regression hidden by unchanged aggregates", () => {
  const dir = tmpDir("compare-case-ranking");
  const baseFile = path.join(dir, "base.json");
  const nextFile = path.join(dir, "next.json");
  const aggregate = {
    passRate: 1,
    precisionAtK: 1,
    recallAtK: 1,
    mrr: 0.75,
    ndcgAtK: 0.815,
    falsePositiveRate: 0,
    noHitRate: 0,
    overRecallRate: 0,
  };
  const metadata = comparisonMetadata();
  fs.writeFileSync(baseFile, JSON.stringify({
    suite: "rank-swap",
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...metadata,
    metrics: aggregate,
    cases: [
      comparisonCase("a", true, { metrics: { reciprocalRank: 1, ndcgAtK: 1 } }),
      comparisonCase("b", true, { metrics: { reciprocalRank: 0.5, ndcgAtK: 0.63 } }),
    ],
  }), "utf8");
  fs.writeFileSync(nextFile, JSON.stringify({
    suite: "rank-swap",
    generatedAt: "2026-01-02T00:00:00.000Z",
    ...metadata,
    metrics: aggregate,
    cases: [
      comparisonCase("a", true, { metrics: { reciprocalRank: 0.5, ndcgAtK: 0.63 } }),
      comparisonCase("b", true, { metrics: { reciprocalRank: 1, ndcgAtK: 1 } }),
    ],
  }), "utf8");

  const report = compareRecallReports(baseFile, nextFile);

  assert.equal(report.metricRegressions.length, 0);
  assert.deepEqual(
    report.caseMetricRegressions.map((item) => `${item.id}:${item.metric}`),
    ["a:reciprocalRank", "a:ndcgAtK"],
  );
  assert.equal(report.ok, false);
});

test("eval reports stable comparison fingerprints for suite, cards, engine, scorer, and config", () => {
  const dataDir = tmpDir("fingerprints");
  initializeDataDir({ dataDir });
  const cases = [{
    id: "orchid-hit",
    prompt: "Apply the orchid ledger lock.",
    expectedCards: ["orchid-ledger-lock"],
  }];
  const firstSuite = writeSuite(dataDir, "fingerprints-a.json", {
    name: "fingerprint-suite",
    experiences: [card("orchid-ledger-lock", "Lock orchid ledger", ["orchid ledger lock"], ["ledger"])],
    cases,
  });
  const changedCardSuite = writeSuite(dataDir, "fingerprints-b.json", {
    name: "fingerprint-suite",
    experiences: [card("orchid-ledger-lock", "Lock the revised orchid ledger", ["orchid ledger lock"], ["ledger"])],
    cases,
  });

  const first = evaluateRecallSuite(dataDir, firstSuite, { limit: 3, threshold: 40 });
  const repeat = evaluateRecallSuite(dataDir, firstSuite, { limit: 3, threshold: 40 });
  const changedCard = evaluateRecallSuite(dataDir, changedCardSuite, { limit: 3, threshold: 40 });
  const changedConfig = evaluateRecallSuite(dataDir, firstSuite, { limit: 2, threshold: 41 });

  for (const field of ["suiteFingerprint", "cardSetFingerprint", "evalConfigFingerprint"]) {
    assert.match(first[field], /^[a-f0-9]{64}$/, field);
    assert.equal(first[field], repeat[field], field);
  }
  assert.match(first.engineVersion, /\S/);
  assert.match(first.scorerVersion, /\S/);
  assert.equal(first.suiteFingerprint, changedCard.suiteFingerprint);
  assert.notEqual(first.cardSetFingerprint, changedCard.cardSetFingerprint);
  assert.notEqual(first.evalConfigFingerprint, changedConfig.evalConfigFingerprint);
});

test("held-out business fixture stays precise without engine-specific signals", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const dataDir = tmpDir("held-out");
  initializeDataDir({ dataDir });
  const suite = path.join(root, "tests", "fixtures", "eval", "held-out.json");

  const report = evaluateRecallSuite(dataDir, suite, { limit: 3, threshold: 40 });

  assert.equal(report.cardFixtureCount, 6);
  assert.equal(report.ok, true);
  assert.equal(report.metrics.precisionAtK, 1);
  assert.equal(report.metrics.recallAtK, 1);
  assert.equal(report.metrics.overRecallRate, 0);
});

test("public pairwise fixture separates adjacent governance workflows", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const dataDir = tmpDir("pairwise");
  initializeDataDir({ dataDir });
  const suite = path.join(root, "tests", "fixtures", "eval", "pairwise.json");

  const report = evaluateRecallSuite(dataDir, suite, { limit: 3, threshold: 40 });

  assert.equal(report.cardFixtureCount, 11);
  assert.equal(report.ok, true);
  assert.equal(report.metrics.precisionAtK, 1);
  assert.equal(report.metrics.recallAtK, 1);
  assert.equal(report.metrics.overRecallRate, 0);
});

test("isolated eval contains only fixture cards and never recalls starter cards", () => {
  const dataDir = tmpDir("fixture-only");
  initializeDataDir({ dataDir });
  const suite = writeSuite(dataDir, "fixture-only.json", {
    name: "fixture-only",
    experiences: [card(
      "orchid-ledger-lock",
      "Lock the orchid ledger",
      ["orchid ledger lock"],
      ["ledger"],
      "Lock the orchid ledger after reconciliation.",
    )],
    cases: [{
      id: "fixture-hit",
      prompt: "Apply the orchid ledger lock after reconciliation.",
      expectedCards: ["orchid-ledger-lock"],
    }, {
      id: "starter-goal-must-not-exist",
      prompt: "Create an agent goal and execute it to completion with verification.",
      expectedCards: [],
      expectNoMatches: true,
    }],
  });

  const report = evaluateRecallSuite(dataDir, suite, { limit: 3, threshold: 40 });
  const index = JSON.parse(fs.readFileSync(path.join(report.fixtureDataDir, "indexes", "experiences.json"), "utf8"));
  const starterCase = report.cases.find((item) => item.id === "starter-goal-must-not-exist");

  assert.deepEqual(index.experiences.map((item) => item.id), ["orchid-ledger-lock"]);
  assert.deepEqual(starterCase.returnedCards, []);
  assert.equal(report.ok, true);
});

test("isolated eval result is invariant when the library grows with unrelated cards", () => {
  const dataDir = tmpDir("library-size");
  initializeDataDir({ dataDir });
  const target = card(
    "beryl-settlement-freeze",
    "Freeze the beryl settlement ledger",
    ["beryl settlement freeze"],
    ["settlement"],
    "Freeze the beryl settlement ledger after final reconciliation.",
  );
  const queryCase = {
    id: "beryl-hit",
    prompt: "Apply the beryl settlement freeze after reconciliation.",
    expectedCards: ["beryl-settlement-freeze"],
  };
  const smallSuite = writeSuite(dataDir, "small.json", {
    name: "small-library",
    experiences: [target],
    cases: [queryCase],
  });
  const noisyCards = Array.from({ length: 200 }, (_, index) => card(
    `unrelated-${String(index).padStart(3, "0")}`,
    `Unrelated warehouse ceremony ${index}`,
    [`warehouse ceremony marker ${index}`],
    [`unrelated-${index}`],
    `Record the independent warehouse ceremony marker ${index} for archival reporting.`,
  ));
  const largeSuite = writeSuite(dataDir, "large.json", {
    name: "large-library",
    experiences: [target, ...noisyCards],
    cases: [queryCase],
  });

  const small = evaluateRecallSuite(dataDir, smallSuite, { limit: 4, threshold: 40 });
  const large = evaluateRecallSuite(dataDir, largeSuite, { limit: 4, threshold: 40 });

  assert.equal(small.cardFixtureCount, 1);
  assert.equal(large.cardFixtureCount, 201);
  assert.deepEqual(small.cases[0].returnedCards, ["beryl-settlement-freeze"]);
  assert.deepEqual(large.cases[0].returnedCards, small.cases[0].returnedCards);
  assert.equal(large.ok, true);
});
