import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeDataDir } from "./config.js";
import { listCards, rebuildCardIndex, removeStarterCards, writeCard } from "./cards.js";
import { matchCards, renderAdditionalContext } from "./retrieval.js";
import { detectProjectContext } from "./project-context.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_RETRIEVAL_THRESHOLD,
  RETRIEVAL_ENGINE_VERSION,
  RETRIEVAL_SCORER_VERSION,
} from "./retrieval-contract.js";
import { buildCardSetFingerprint, buildTelemetryFingerprint } from "./stats.js";
import { appendJsonl, layout, nowIso } from "./storage.js";

type EvalOptions = {
  limit?: number;
  threshold?: number;
  persist?: boolean;
  experiencesFile?: string;
  useCurrentLibrary?: boolean;
};

type EvalCase = Record<string, any>;
type EvaluatedCase = ReturnType<typeof evaluateCase>;
type MetricKey = keyof ReturnType<typeof evaluateCase>["metrics"];

export function evaluateRecallSuite(dataDir: string, suiteFile: string, options: EvalOptions = {}) {
  const { limit = DEFAULT_RETRIEVAL_LIMIT, threshold = DEFAULT_RETRIEVAL_THRESHOLD, persist = false } = options;
  const suite = loadSuite(suiteFile);
  const fixture = prepareFixtureDataDir(dataDir, suiteFile, suite, options);
  const cases: EvaluatedCase[] = suite.cases.map((item: EvalCase) => evaluateCase(fixture.dataDir, item, { limit, threshold }));
  const suiteName = suite.name || path.basename(suiteFile);
  const report = {
    ok: cases.every((item: EvaluatedCase) => item.passed),
    suite: suiteName,
    generatedAt: nowIso(),
    engineVersion: RETRIEVAL_ENGINE_VERSION,
    scorerVersion: RETRIEVAL_SCORER_VERSION,
    suiteFingerprint: buildSuiteFingerprint(suiteName, cases),
    cardSetFingerprint: buildCardSetFingerprint(listCards(fixture.dataDir, "active")),
    evalConfigFingerprint: buildTelemetryFingerprint({ limit, threshold, isolated: fixture.isolated }),
    isolated: fixture.isolated,
    fixtureDataDir: fixture.isolated ? fixture.dataDir : null,
    cardFixtureCount: fixture.cardCount,
    limit,
    threshold,
    metrics: aggregateMetrics(cases),
    cases,
  };
  if (persist) {
    appendJsonl(layout(fixture.dataDir).events, { kind: "eval", report, createdAt: nowIso() }, fixture.dataDir);
  }
  return report;
}

export function compareRecallReports(baseFile: string, nextFile: string) {
  const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
  const next = JSON.parse(fs.readFileSync(nextFile, "utf8"));
  const metricNames = [
    "passRate",
    "precisionAtK",
    "recallAtK",
    "mrr",
    "ndcgAtK",
    "falsePositiveRate",
    "noHitRate",
    "overRecallRate",
    "avgReturnedCards",
    "avgContextSizeChars",
    "avgDurationMs",
  ];
  const metrics = Object.fromEntries(metricNames.map((name) => {
    const before = Number(base.metrics?.[name] ?? 0);
    const after = Number(next.metrics?.[name] ?? 0);
    return [name, { before, after, delta: round(after - before) }];
  }));
  const baseCases = new Map<string, EvalCase>((base.cases || []).map((item: EvalCase) => [String(item.id), item]));
  const nextCases = new Map<string, EvalCase>((next.cases || []).map((item: EvalCase) => [String(item.id), item]));
  const missingCaseIds = Array.from(baseCases.keys()).filter((id) => !nextCases.has(id));
  const addedCaseIds = Array.from(nextCases.keys()).filter((id) => !baseCases.has(id));
  const suiteMismatch = base.suite !== next.suite;
  const missingComparisonMetadata = [
    ...missingReportMetadata(base, "base"),
    ...missingReportMetadata(next, "next"),
  ];
  const identityFields = [
    "engineVersion",
    "scorerVersion",
    "suiteFingerprint",
    "cardSetFingerprint",
    "evalConfigFingerprint",
    "limit",
    "threshold",
  ];
  const identityDrift = identityFields
    .filter((field) => !sameComparisonValue(base[field], next[field]))
    .map((field) => ({ field, before: base[field] ?? null, after: next[field] ?? null }));
  const caseContractDrift = Array.from(baseCases.keys())
    .filter((id) => nextCases.has(id))
    .flatMap((id) => {
      const before = baseCases.get(id)!;
      const after = nextCases.get(id)!;
      const fields = caseContractDriftFields(before, after);
      return fields.length ? [{ id, fields }] : [];
    });
  const caseMetricMissing: Array<{ id: string; metric: string; before: number | null; after: number | null }> = [];
  const caseMetricRegressions: Array<{ id: string; metric: string; before: number; after: number; delta: number }> = [];
  for (const id of baseCases.keys()) {
    const before = baseCases.get(id);
    const after = nextCases.get(id);
    if (!before || !after) continue;
    for (const metric of ["reciprocalRank", "ndcgAtK"]) {
      const beforeMetric = finiteMetric(before.metrics?.[metric]);
      const afterMetric = finiteMetric(after.metrics?.[metric]);
      if (beforeMetric === null || afterMetric === null) {
        caseMetricMissing.push({ id, metric, before: beforeMetric, after: afterMetric });
      } else if (afterMetric < beforeMetric) {
        caseMetricRegressions.push({
          id,
          metric,
          before: beforeMetric,
          after: afterMetric,
          delta: round(afterMetric - beforeMetric),
        });
      }
    }
  }
  const cases = Array.from(new Set([...baseCases.keys(), ...nextCases.keys()])).map((id) => {
    const before = baseCases.get(id);
    const after = nextCases.get(id);
    const contractFields = before && after ? caseContractDriftFields(before, after) : [];
    return {
      id,
      beforePassed: before?.passed ?? null,
      afterPassed: after?.passed ?? null,
      changed: before?.passed !== after?.passed,
      contractChanged: contractFields.length > 0,
      contractFields,
      beforeReturnedCards: before?.returnedCards ?? [],
      afterReturnedCards: after?.returnedCards ?? [],
      beforeMissingCards: before?.missingCards ?? [],
      afterMissingCards: after?.missingCards ?? [],
      beforeReciprocalRank: finiteMetric(before?.metrics?.reciprocalRank),
      afterReciprocalRank: finiteMetric(after?.metrics?.reciprocalRank),
      beforeNdcgAtK: finiteMetric(before?.metrics?.ndcgAtK),
      afterNdcgAtK: finiteMetric(after?.metrics?.ndcgAtK),
    };
  });
  const qualityDirections: Record<string, "higher" | "lower"> = {
    passRate: "higher",
    precisionAtK: "higher",
    recallAtK: "higher",
    mrr: "higher",
    ndcgAtK: "higher",
    falsePositiveRate: "lower",
    overRecallRate: "lower",
  };
  const metricRegressions = Object.entries(qualityDirections)
    .filter(([name, direction]) => {
      const before = Number(base.metrics?.[name] ?? 0);
      const after = Number(next.metrics?.[name] ?? 0);
      return direction === "higher" ? after < before : after > before;
    })
    .map(([name, direction]) => ({
      metric: name,
      direction,
      ...metrics[name],
    }));
  const regressions = cases.filter((item) => item.beforePassed === true && item.afterPassed !== true);
  const caseSetDrift = {
    missingInNext: missingCaseIds,
    addedInNext: addedCaseIds,
  };
  return {
    ok: metricRegressions.length === 0
      && regressions.length === 0
      && !suiteMismatch
      && missingCaseIds.length === 0
      && addedCaseIds.length === 0
      && missingComparisonMetadata.length === 0
      && identityDrift.length === 0
      && caseContractDrift.length === 0
      && caseMetricMissing.length === 0
      && caseMetricRegressions.length === 0,
    base: comparisonReportSummary(baseFile, base),
    next: comparisonReportSummary(nextFile, next),
    suiteMismatch,
    missingComparisonMetadata,
    identityDrift,
    caseSetDrift,
    caseContractDrift,
    metrics,
    metricRegressions,
    caseMetricMissing,
    caseMetricRegressions,
    regressions,
    improvements: cases.filter((item) => item.beforePassed === false && item.afterPassed === true),
    cases,
  };
}

function loadSuite(suiteFile: string): Record<string, any> {
  const raw = JSON.parse(fs.readFileSync(suiteFile, "utf8"));
  if (!Array.isArray(raw.cases)) throw new Error("recall suite must contain cases[]");
  return raw;
}

function prepareFixtureDataDir(dataDir: string, suiteFile: string, suite: Record<string, any>, options: EvalOptions) {
  if (options.useCurrentLibrary) return { dataDir, isolated: false, cardCount: null };
  const cards = loadCardFixtures(suiteFile, suite, options.experiencesFile);
  if (!cards.length) {
    throw new Error("recall eval uses isolated fixtures by default; add suite.experiences/experiencesFile or pass --use-current-library");
  }
  const fixtureDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ome-eval-recall-"));
  initializeDataDir({ dataDir: fixtureDataDir });
  removeStarterCards(fixtureDataDir);
  const now = nowIso();
  for (const card of cards) {
    writeCard(fixtureDataDir, {
      status: "active",
      sources: ["eval-fixture"],
      createdAt: now,
      updatedAt: now,
      ...normalizeFixtureCard(card),
    });
  }
  rebuildCardIndex(fixtureDataDir);
  return { dataDir: fixtureDataDir, isolated: true, cardCount: cards.length };
}

function normalizeFixtureCard(card: Record<string, any>): Record<string, any> {
  const criteria = card.criteria || {};
  const recall = card.recall || {};
  const engineHints = card.engine_hints || {};
  const scope = card.scope || {};
  return {
    ...card,
    triggers: Array.isArray(recall.triggers) ? recall.triggers : [],
    negativeTriggers: Array.isArray(criteria.ignore_when) ? criteria.ignore_when : [],
    aliases: recall.aliases || {},
    topics: Array.isArray(recall.topics) ? recall.topics : [],
    intentModes: criteria.intent_modes || { include: [], exclude: [] },
    requiredSignals: Array.isArray(engineHints.positive) ? engineHints.positive : [],
    requiredAllSignals: Array.isArray(engineHints.required_all) ? engineHints.required_all : [],
    blockedSignals: Array.isArray(engineHints.negative) ? engineHints.negative : [],
    applicability: {
      level: scope.level || "global",
      projectKey: scope.project_key || scope.projectKey || null,
      modulePath: scope.module_path || scope.modulePath || null,
      confidence: "medium",
      rationale: "",
    },
    recallPolicy: recall.policy || "should",
    risk: recall.risk || "medium",
    confidence: recall.confidence || "medium",
  };
}

function loadCardFixtures(suiteFile: string, suite: Record<string, any>, experiencesFile?: string): Record<string, any>[] {
  if (Array.isArray(suite.experiences)) return suite.experiences;
  const file = experiencesFile || suite.experiencesFile;
  if (!file) return [];
  const resolved = path.resolve(path.dirname(suiteFile), file);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return Array.isArray(raw) ? raw : raw.experiences || [];
}

function evaluateCase(dataDir: string, item: EvalCase, { limit, threshold }: { limit: number; threshold: number }) {
  const started = Date.now();
  const projectContext = item.cwd ? detectProjectContext(item.cwd) : null;
  const matches = matchCards(dataDir, item.prompt, { limit, threshold: item.threshold ?? threshold, projectContext });
  const returned = matches.map((match) => match.card.id);
  const contextSizeChars = renderAdditionalContext(matches).length;
  const expected: string[] = item.expectedCards || [];
  const unexpected: string[] = item.unexpectedCards || [];
  const allowedExtraCards: string[] = item.allowedExtraCards || [];
  const expectedSet = new Set<string>(expected);
  const unexpectedSet = new Set(unexpected);
  const allowedExtraSet = new Set<string>(allowedExtraCards);
  const hits = expected.filter((id) => returned.includes(id));
  const extraCards = returned.filter((id) => !expectedSet.has(id));
  const allowedExtras = extraCards.filter((id) => allowedExtraSet.has(id) && !unexpectedSet.has(id));
  const falsePositives = extraCards.filter((id) => unexpectedSet.has(id));
  const disallowedExtraCards = extraCards.filter((id) => unexpectedSet.has(id) || !allowedExtraSet.has(id));
  const firstRank = returned.findIndex((id) => expectedSet.has(id));
  const expectNoMatches = Boolean(item.expectNoMatches);
  const acceptedHits = hits.length + allowedExtras.length;
  const precisionAtK = returned.length ? acceptedHits / returned.length : expected.length ? 0 : 1;
  const recallAtK = expected.length ? hits.length / expected.length : returned.length ? 0 : 1;
  const passed = expectNoMatches
    ? returned.length === 0
    : hits.length === expected.length && disallowedExtraCards.length === 0;
  return {
    id: item.id,
    difficulty: item.difficulty || "unknown",
    tags: item.tags || [],
    prompt: item.prompt,
    expectedCards: expected,
    unexpectedCards: unexpected,
    returnedCards: returned,
    missingCards: expected.filter((id) => !returned.includes(id)),
    falsePositives,
    extraCards,
    allowedExtraCards,
    allowedExtras,
    disallowedExtraCards,
    expectNoMatches,
    threshold: item.threshold ?? null,
    cwd: item.cwd ?? null,
    passed,
    metrics: {
      precisionAtK: round(precisionAtK),
      recallAtK: round(recallAtK),
      reciprocalRank: firstRank === -1 ? 0 : round(1 / (firstRank + 1)),
      ndcgAtK: round(ndcg(returned, expectedSet, limit)),
      contextSizeChars,
      durationMs: Date.now() - started,
      returnedCount: returned.length,
      extraCount: extraCards.length,
    },
  };
}

function buildSuiteFingerprint(suite: string, cases: EvalCase[]): string {
  return buildTelemetryFingerprint({
    suite,
    cases: cases.map((item) => ({ id: String(item.id), ...caseContract(item) })),
  });
}

function caseContract(item: EvalCase): Record<string, any> {
  return {
    prompt: String(item.prompt ?? ""),
    expectedCards: sortedStrings(item.expectedCards),
    unexpectedCards: sortedStrings(item.unexpectedCards),
    allowedExtraCards: sortedStrings(item.allowedExtraCards),
    expectNoMatches: Boolean(item.expectNoMatches),
    threshold: finiteMetric(item.threshold),
    cwd: item.cwd === null || item.cwd === undefined ? null : String(item.cwd),
  };
}

function caseContractDriftFields(before: EvalCase, after: EvalCase): string[] {
  const left = caseContract(before);
  const right = caseContract(after);
  return Object.keys(left).filter((field) => !sameComparisonValue(left[field], right[field]));
}

function missingReportMetadata(report: EvalCase, label: string): string[] {
  const requiredStrings = [
    "suite",
    "engineVersion",
    "scorerVersion",
    "suiteFingerprint",
    "cardSetFingerprint",
    "evalConfigFingerprint",
  ];
  const missing = requiredStrings
    .filter((field) => typeof report[field] !== "string" || !report[field].trim())
    .map((field) => `${label}.${field}`);
  for (const field of ["limit", "threshold"]) {
    if (finiteMetric(report[field]) === null) missing.push(`${label}.${field}`);
  }
  return missing;
}

function comparisonReportSummary(file: string, report: EvalCase): Record<string, any> {
  return {
    file,
    suite: report.suite,
    generatedAt: report.generatedAt,
    engineVersion: report.engineVersion ?? null,
    scorerVersion: report.scorerVersion ?? null,
    suiteFingerprint: report.suiteFingerprint ?? null,
    cardSetFingerprint: report.cardSetFingerprint ?? null,
    evalConfigFingerprint: report.evalConfigFingerprint ?? null,
    limit: report.limit ?? null,
    threshold: report.threshold ?? null,
  };
}

function sortedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String))).sort((left, right) => left.localeCompare(right));
}

function sameComparisonValue(left: unknown, right: unknown): boolean {
  return buildTelemetryFingerprint({ value: left ?? null }) === buildTelemetryFingerprint({ value: right ?? null });
}

function finiteMetric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function aggregateMetrics(cases: EvaluatedCase[]) {
  const size = Math.max(cases.length, 1);
  return {
    passRate: round(cases.filter((item) => item.passed).length / size),
    precisionAtK: avg(cases, "precisionAtK"),
    recallAtK: avg(cases, "recallAtK"),
    mrr: avgRankingCases(cases, "reciprocalRank"),
    ndcgAtK: avgRankingCases(cases, "ndcgAtK"),
    falsePositiveRate: round(cases.filter((item) => item.falsePositives.length > 0).length / size),
    noHitRate: round(cases.filter((item) => item.returnedCards.length === 0).length / size),
    overRecallRate: round(cases.filter((item) => item.disallowedExtraCards.length > 0).length / size),
    avgReturnedCards: avg(cases, "returnedCount"),
    avgContextSizeChars: avg(cases, "contextSizeChars"),
    avgDurationMs: avg(cases, "durationMs"),
    byDifficulty: aggregateByDifficulty(cases),
  };
}

function ndcg(returned: string[], expectedSet: Set<string>, limit: number): number {
  if (!expectedSet.size) return returned.length ? 0 : 1;
  const dcg = returned.reduce((sum, id, index) => {
    const relevance = expectedSet.has(id) ? 1 : 0;
    return sum + relevance / Math.log2(index + 2);
  }, 0);
  const idealCount = Math.min(expectedSet.size, Math.max(limit, 0));
  const ideal = Array.from({ length: idealCount }).reduce<number>((sum, _, index) => sum + 1 / Math.log2(index + 2), 0);
  return ideal ? dcg / ideal : 0;
}

function aggregateByDifficulty(cases: EvaluatedCase[]) {
  const groups: Record<string, EvaluatedCase[]> = {};
  for (const item of cases) {
    const key = item.difficulty || "unknown";
    groups[key] ||= [];
    groups[key].push(item);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, {
    cases: items.length,
    passRate: round(items.filter((item) => item.passed).length / items.length),
    precisionAtK: avg(items, "precisionAtK"),
    recallAtK: avg(items, "recallAtK"),
    mrr: avgRankingCases(items, "reciprocalRank"),
  }]));
}

function avgRankingCases(cases: EvaluatedCase[], key: MetricKey): number {
  return avg(cases.filter((item) => item.expectedCards.length > 0), key);
}

function avg(cases: EvaluatedCase[], key: MetricKey): number {
  return round(cases.reduce((sum, item) => sum + (item.metrics[key] || 0), 0) / Math.max(cases.length, 1));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
