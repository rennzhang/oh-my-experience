import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initializeDataDir,
  matchCardEntriesDetailed,
  parseCardMarkdown,
  promoteDraft,
  runDoctor,
  serializeCard,
  writeCard,
} from "../dist/packages/core/src/index.js";

function card(id, overrides = {}) {
  return {
    id,
    title: `Card ${id}`,
    category: "test",
    status: "active",
    path: `experiences/active/${id}.md`,
    summary: `Deterministic retrieval fixture for ${id}.`,
    triggers: [`anchor ${id}`],
    negativeTriggers: [],
    topics: ["fixture"],
    applicability: {
      level: "global",
      projectKey: null,
      modulePath: null,
      confidence: "medium",
      rationale: "",
    },
    intentModes: { include: [], exclude: [] },
    requiredSignals: [],
    requiredAllSignals: [],
    blockedSignals: [],
    aliases: {},
    language: "auto",
    recallPolicy: "should",
    risk: "medium",
    confidence: "medium",
    libraryScope: "global",
    ...overrides,
  };
}

test("bounded evidence score and threshold decision do not drift with library size", () => {
  const target = card("beryl-ledger", {
    title: "Freeze the beryl settlement ledger",
    summary: "Freeze the beryl settlement ledger after final reconciliation.",
    triggers: ["beryl settlement freeze"],
    topics: ["settlement"],
  });
  const decoys = Array.from({ length: 1000 }, (_, index) => card(`decoy-${index}`, {
    title: `Warehouse ceremony ${index}`,
    summary: `Archive warehouse ceremony marker ${index}.`,
    triggers: [`warehouse ceremony marker ${index}`],
    topics: ["warehouse"],
  }));
  const prompt = "Apply the beryl settlement freeze after reconciliation.";

  const small = matchCardEntriesDetailed([target], prompt, { threshold: 40 });
  const large = matchCardEntriesDetailed([target, ...decoys], prompt, { threshold: 40 });
  const smallTarget = small.diagnostics.candidates.find((item) => item.id === target.id);
  const largeTarget = large.diagnostics.candidates.find((item) => item.id === target.id);

  assert.deepEqual(small.diagnostics.selectedCardIds, [target.id]);
  assert.deepEqual(large.diagnostics.selectedCardIds, [target.id]);
  assert.equal(smallTarget.score, largeTarget.score);
  assert.notEqual(smallTarget.rawScore, largeTarget.rawScore);
});

test("BM25F preserves repeated term frequency while the bounded score stays interpretable", () => {
  const repeated = card("repeated", {
    triggers: ["quartz sync quartz sync quartz sync"],
    topics: ["quartz"],
  });
  const single = card("single", {
    triggers: ["quartz sync"],
    topics: ["quartz"],
  });
  const result = matchCardEntriesDetailed([repeated, single], "quartz sync", { threshold: 4 });
  const byId = new Map(result.diagnostics.candidates.map((item) => [item.id, item]));

  assert.ok(byId.get("repeated").rawScore > byId.get("single").rawScore);
  assert.ok(byId.get("single").score >= 40);
});

test("exact ignore criteria hard-reject even when positive evidence is strong", () => {
  const guarded = card("browser-guarded", {
    title: "Validate UI in the real browser",
    triggers: ["browser validation", "real browser"],
    negativeTriggers: ["do not run browser"],
    topics: ["ui"],
    requiredSignals: ["ui_surface"],
  });
  const result = matchCardEntriesDetailed(
    [guarded],
    "Fix the frontend UI and prepare browser validation, but do not run browser.",
    { threshold: 40 },
  );

  assert.deepEqual(result.matches, []);
  assert.match(result.diagnostics.candidates[0].rejectionReason, /^negativeTriggers:/);
  assert.ok(result.diagnostics.candidates[0].reasons.some((item) => item.kind === "negative-exact"));
});

test("mixed explanation and execution keeps an explicitly routed execution card", () => {
  const goal = card("goal-execution", {
    title: "Execute a goal to full closure",
    triggers: ["create a goal", "start now"],
    topics: ["execution"],
    intentModes: { include: ["execute"], exclude: ["explain"] },
    requiredSignals: ["goal_execute"],
  });
  const result = matchCardEntriesDetailed(
    [goal],
    "Explain the background first. Then create a goal and start now; implement and verify the work.",
    { threshold: 40 },
  );

  assert.deepEqual(result.diagnostics.selectedCardIds, [goal.id]);
});

test("required_all is a real conjunction and project duplicates take precedence", () => {
  const global = card("global-browser", {
    title: "Browser delivery validation",
    summary: "Validate UI delivery in a real browser.",
    triggers: ["browser delivery validation"],
    topics: ["ui"],
    requiredAllSignals: ["ui_surface", "real_validation"],
  });
  const project = card("project-browser", {
    ...global,
    id: "project-browser",
    path: "experiences/active/project-browser.md",
    libraryScope: "project",
  });
  const missingSignal = matchCardEntriesDetailed([global], "Change the frontend UI copy.", { threshold: 40 });
  const complete = matchCardEntriesDetailed(
    [global, project],
    "Change the frontend UI and do browser validation plus e2e verification before delivery.",
    { threshold: 40 },
  );

  assert.deepEqual(missingSignal.matches, []);
  assert.match(missingSignal.diagnostics.candidates[0].rejectionReason, /^requiredAllSignals:/);
  assert.deepEqual(complete.diagnostics.selectedCardIds, [project.id]);
  assert.ok(complete.matches[0].similarCards.some((item) => item.id === global.id));
  assert.ok(complete.matches.every((item) => item.postSelectionScore >= 40));
});

test("one broad word inside a longer unrelated task is not enough to recall", () => {
  const broad = card("generic-review", {
    title: "Engineering review workflow",
    triggers: ["review"],
    topics: ["engineering"],
  });
  const result = matchCardEntriesDetailed(
    [broad],
    "Write a restaurant review describing the tomato soup and service.",
    { threshold: 40 },
  );

  assert.deepEqual(result.matches, []);
  assert.equal(result.diagnostics.abstained, true);
});

test("required_all round-trips and active unknown signals fail doctor closed", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ome-retrieval-v2-signals-"));
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  const experience = {
    id: "signal-contract",
    status: "active",
    title: "Signal contract",
    category: "test",
    summary: "Validate the explicit signal contract.",
    rule: "Use registered ids and diagnose registry drift.",
    triggers: ["signal contract"],
    negativeTriggers: [],
    aliases: {},
    topics: ["signals"],
    applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "" },
    intentModes: { include: [], exclude: [] },
    requiredSignals: [],
    requiredAllSignals: ["ui_surface", "unknown_pack_signal"],
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
  };

  const parsed = parseCardMarkdown(serializeCard(experience));
  assert.deepEqual(parsed.requiredAllSignals, ["ui_surface", "unknown_pack_signal"]);
  writeCard(dataDir, experience);
  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.ok(doctor.errors.some((error) => error.includes("unknown_pack_signal")));
});

test("a draft with unknown signal ids cannot be promoted", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ome-retrieval-v2-draft-signals-"));
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "unknown-signal-draft",
    status: "draft",
    title: "Unknown signal draft",
    category: "test",
    summary: "A draft with registry drift must not become active.",
    rule: "Reject unknown signal identifiers before promotion.",
    triggers: ["unknown signal promotion"],
    negativeTriggers: [],
    aliases: {},
    topics: ["signals"],
    applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "" },
    intentModes: { include: [], exclude: [] },
    requiredSignals: ["unknown_pack_signal"],
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
  });

  assert.throws(() => promoteDraft(dataDir, "unknown-signal-draft"), /unknown signal ids: unknown_pack_signal/);
});
