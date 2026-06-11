import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeDataDir } from "./config.js";
import { rebuildCardIndex, writeCard } from "./cards.js";
import { matchCards, renderAdditionalContext } from "./retrieval.js";
import { detectProjectContext } from "./project-context.js";
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
  const { limit = 8, threshold = 40, persist = false } = options;
  const suite = loadSuite(suiteFile);
  const fixture = prepareFixtureDataDir(dataDir, suiteFile, suite, options);
  const cases: EvaluatedCase[] = suite.cases.map((item: EvalCase) => evaluateCase(fixture.dataDir, item, { limit, threshold }));
  const report = {
    ok: cases.every((item: EvaluatedCase) => item.passed),
    suite: suite.name || path.basename(suiteFile),
    generatedAt: nowIso(),
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
  const cases = Array.from(new Set([...baseCases.keys(), ...nextCases.keys()])).map((id) => {
    const before = baseCases.get(id);
    const after = nextCases.get(id);
    return {
      id,
      beforePassed: before?.passed ?? null,
      afterPassed: after?.passed ?? null,
      changed: before?.passed !== after?.passed,
      beforeReturnedCards: before?.returnedCards ?? [],
      afterReturnedCards: after?.returnedCards ?? [],
      beforeMissingCards: before?.missingCards ?? [],
      afterMissingCards: after?.missingCards ?? [],
    };
  });
  return {
    ok: Number(next.metrics?.passRate ?? 0) >= Number(base.metrics?.passRate ?? 0)
      && Number(next.metrics?.recallAtK ?? 0) >= Number(base.metrics?.recallAtK ?? 0),
    base: { file: baseFile, suite: base.suite, generatedAt: base.generatedAt },
    next: { file: nextFile, suite: next.suite, generatedAt: next.generatedAt },
    metrics,
    regressions: cases.filter((item) => item.beforePassed === true && item.afterPassed === false),
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
  const now = nowIso();
  for (const card of cards) {
    writeCard(fixtureDataDir, {
      status: "active",
      risk: "medium",
      recallPolicy: "should",
      sources: ["eval-fixture"],
      createdAt: now,
      updatedAt: now,
      ...card,
    });
  }
  rebuildCardIndex(fixtureDataDir);
  return { dataDir: fixtureDataDir, isolated: true, cardCount: cards.length };
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
  const expectedSet = new Set<string>(expected);
  const unexpectedSet = new Set(unexpected);
  const hits = expected.filter((id) => returned.includes(id));
  const falsePositives = returned.filter((id) => unexpectedSet.has(id));
  const extraCards = returned.filter((id) => !expectedSet.has(id));
  const firstRank = returned.findIndex((id) => expectedSet.has(id));
  const expectNoMatches = Boolean(item.expectNoMatches);
  const precisionAtK = returned.length ? hits.length / returned.length : expected.length ? 0 : 1;
  const recallAtK = expected.length ? hits.length / expected.length : returned.length ? 0 : 1;
  const passed = expectNoMatches
    ? returned.length === 0
    : hits.length === expected.length && falsePositives.length === 0;
  return {
    id: item.id,
    difficulty: item.difficulty || "unknown",
    tags: item.tags || [],
    prompt: item.prompt,
    expectedCards: expected,
    returnedCards: returned,
    missingCards: expected.filter((id) => !returned.includes(id)),
    falsePositives,
    extraCards,
    expectNoMatches,
    passed,
    metrics: {
      precisionAtK: round(precisionAtK),
      recallAtK: round(recallAtK),
      reciprocalRank: firstRank === -1 ? 0 : round(1 / (firstRank + 1)),
      ndcgAtK: round(ndcg(returned, expectedSet)),
      contextSizeChars,
      durationMs: Date.now() - started,
      returnedCount: returned.length,
      extraCount: extraCards.length,
    },
  };
}

function aggregateMetrics(cases: EvaluatedCase[]) {
  const size = Math.max(cases.length, 1);
  return {
    passRate: round(cases.filter((item) => item.passed).length / size),
    precisionAtK: avg(cases, "precisionAtK"),
    recallAtK: avg(cases, "recallAtK"),
    mrr: avg(cases, "reciprocalRank"),
    ndcgAtK: avg(cases, "ndcgAtK"),
    falsePositiveRate: round(cases.filter((item) => item.falsePositives.length > 0).length / size),
    noHitRate: round(cases.filter((item) => item.returnedCards.length === 0).length / size),
    overRecallRate: round(cases.filter((item) => item.extraCards.length > 0).length / size),
    avgReturnedCards: avg(cases, "returnedCount"),
    avgContextSizeChars: avg(cases, "contextSizeChars"),
    avgDurationMs: avg(cases, "durationMs"),
    byDifficulty: aggregateByDifficulty(cases),
  };
}

function ndcg(returned: string[], expectedSet: Set<string>): number {
  if (!expectedSet.size) return returned.length ? 0 : 1;
  const dcg = returned.reduce((sum, id, index) => {
    const relevance = expectedSet.has(id) ? 1 : 0;
    return sum + relevance / Math.log2(index + 2);
  }, 0);
  const ideal = Array.from(expectedSet).slice(0, returned.length).reduce((sum, _, index) => sum + 1 / Math.log2(index + 2), 0);
  return ideal ? dcg / ideal : 1;
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
    mrr: avg(items, "reciprocalRank"),
  }]));
}

function avg(cases: EvaluatedCase[], key: MetricKey): number {
  return round(cases.reduce((sum, item) => sum + (item.metrics[key] || 0), 0) / Math.max(cases.length, 1));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
