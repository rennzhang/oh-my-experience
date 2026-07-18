import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskEnvelope,
  matchCardEntriesDetailed,
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

test("unknown required signal ids fail closed with an explainable rejection", () => {
  const requiredAny = card("unknown-any", {
    triggers: ["frontend browser validation"],
    requiredSignals: ["ui_surface", "unknown_pack_signal"],
  });
  const requiredAll = card("unknown-all", {
    triggers: ["frontend browser validation"],
    requiredAllSignals: ["ui_surface", "unknown_pack_signal"],
  });
  const result = matchCardEntriesDetailed(
    [requiredAny, requiredAll],
    "Update the frontend UI and run browser validation.",
    { threshold: 40 },
  );
  const candidates = new Map(result.diagnostics.candidates.map((candidate) => [candidate.id, candidate]));

  assert.deepEqual(result.matches, []);
  assert.equal(candidates.get("unknown-any").rejectionReason, "requiredSignals.unknown:unknown_pack_signal");
  assert.equal(candidates.get("unknown-all").rejectionReason, "requiredAllSignals.unknown:unknown_pack_signal");
  assert.ok(candidates.get("unknown-any").reasons.some((item) => item.kind === "unknown-required-signal"));
  assert.ok(candidates.get("unknown-all").reasons.some((item) => item.kind === "unknown-required-signal"));
});

test("unknown blocked signal ids fail closed with an explainable rejection", () => {
  const unknownBlocked = card("unknown-blocked", {
    triggers: ["frontend browser validation"],
    blockedSignals: ["unknown_pack_signal"],
  });
  const result = matchCardEntriesDetailed(
    [unknownBlocked],
    "Update the frontend UI and run browser validation.",
    { threshold: 40 },
  );
  const candidate = result.diagnostics.candidates[0];

  assert.deepEqual(result.matches, []);
  assert.equal(candidate.rejectionReason, "blockedSignals.unknown:unknown_pack_signal");
  assert.ok(candidate.reasons.some((item) =>
    item.field === "blockedSignals.unknown"
    && item.term === "unknown_pack_signal"
    && item.kind === "unknown-blocked-signal"
  ));
});

test("required_all conjunction contributes signal evidence after every signal passes the gate", () => {
  const conjunction = card("signal-conjunction", {
    title: "Conjunctive signal-only policy",
    summary: "Only the registered signal conjunction routes this card.",
    triggers: ["unrelated zircon protocol"],
    topics: ["conjunction"],
    requiredAllSignals: ["ui_surface", "real_validation"],
  });
  const result = matchCardEntriesDetailed(
    [conjunction],
    "Update the frontend UI and complete browser validation with an e2e check.",
    { threshold: 40 },
  );
  const candidate = result.diagnostics.candidates[0];

  assert.deepEqual(result.diagnostics.selectedCardIds, [conjunction.id]);
  assert.ok(candidate.score >= 40);
  assert.ok(candidate.evidenceFamilies.includes("signals"));
  assert.ok(candidate.reasons.some((item) => item.field === "ruleSignals" && item.term === "ui_surface"));
  assert.ok(candidate.reasons.some((item) => item.field === "ruleSignals" && item.term === "real_validation"));
});

test("generic English and Chinese negation spans cannot become positive phrase or signal evidence", () => {
  const routed = card("provider-boundary", {
    title: "Provider-neutral shared hook runtime",
    summary: "Use one provider-neutral retrieval scoring runtime.",
    triggers: ["provider-neutral hook runtime"],
    topics: ["provider adapter"],
    requiredSignals: ["provider_adapter_boundary"],
  });
  const prompts = [
    "This task is not provider-neutral hook runtime.",
    "This is not a provider-neutral hook runtime task.",
    "Do not use provider-neutral hook runtime.",
    "There is no need for provider-neutral hook runtime.",
    "这不是 provider adapter hook runtime 任务。",
    "不要使用 provider adapter hook runtime。",
    "别做 provider adapter hook runtime。",
    "无需 provider adapter hook runtime。",
    "不涉及 provider adapter hook runtime。",
  ];

  for (const prompt of prompts) {
    const envelope = buildTaskEnvelope(prompt);
    const result = matchCardEntriesDetailed([routed], prompt, { threshold: 40 });
    assert.equal(
      envelope.ruleSignals.some((signal) => signal.id === "provider_adapter_boundary" && signal.polarity === "positive"),
      false,
      prompt,
    );
    assert.deepEqual(result.matches, [], prompt);
  }
});

test("a negated segment does not suppress an independent affirmative segment", () => {
  const routed = card("provider-boundary-positive", {
    title: "Shared provider-neutral retrieval runtime",
    summary: "Keep retrieval scoring provider-neutral.",
    triggers: ["unrelated cobalt boundary"],
    topics: ["adapter"],
    requiredSignals: ["provider_adapter_boundary"],
  });
  const prompt = [
    "This is not a provider-neutral hook runtime task.",
    "Then build a provider-neutral retrieval scoring adapter shared by every hook runtime.",
  ].join(" ");
  const envelope = buildTaskEnvelope(prompt);
  const result = matchCardEntriesDetailed([routed], prompt, { threshold: 40 });

  assert.ok(envelope.ruleSignals.some((signal) => signal.id === "provider_adapter_boundary" && signal.polarity === "positive"));
  assert.deepEqual(result.diagnostics.selectedCardIds, [routed.id]);
});

test("exact negative triggers scan untruncated middle segments while fuzzy matches only penalize", () => {
  const guarded = card("middle-negative", {
    title: "Validate the amber release in a browser",
    summary: "Validate the amber release through the browser workflow.",
    triggers: ["amber release browser validation"],
    negativeTriggers: ["skip the sealed deployment"],
    topics: ["amber release"],
  });
  const middle = "The explicit constraint is to skip the sealed deployment for this run.";
  const filler = (prefix) => Array.from({ length: 8 }, (_, index) => `${prefix} context segment ${index} describes ordinary planning details.`);
  const exactPrompt = [
    "Run amber release browser validation.",
    ...filler("opening"),
    middle,
    ...filler("closing"),
    "Finish the amber release browser validation.",
  ].join(" ");
  const exact = matchCardEntriesDetailed([guarded], exactPrompt, { threshold: 40 });

  assert.deepEqual(exact.matches, []);
  assert.match(exact.diagnostics.candidates[0].rejectionReason, /^negativeTriggers:/);
  assert.ok(exact.diagnostics.candidates[0].reasons.some((item) => item.kind === "negative-exact"));

  const fuzzyGuarded = card("middle-fuzzy", {
    ...guarded,
    id: "middle-fuzzy",
    path: "experiences/active/middle-fuzzy.md",
    negativeTriggers: ["sealed deployment teardown sequence"],
  });
  const fuzzy = matchCardEntriesDetailed(
    [fuzzyGuarded],
    "Run amber release browser validation and inspect the sealed deployment teardown before finishing.",
    { threshold: 20 },
  );
  const fuzzyCandidate = fuzzy.diagnostics.candidates[0];
  assert.equal(fuzzyCandidate.rejectionReason, null);
  assert.ok(fuzzyCandidate.reasons.some((item) => item.kind === "negative-fuzzy"));
});

test("fuzzy negative triggers require high coverage instead of three shared workflow nouns", () => {
  const worktreeMutation = card("worktree-mutation", {
    title: "Isolate the current task diff before changing the worktree",
    summary: "Protect unrelated user changes before modifying the current git diff.",
    triggers: ["continue modifying the current git diff", "继续修改当前 git diff"],
    negativeTriggers: [
      "只读 review 当前 git diff",
      "只查看 git status 或 diff 不修改",
    ],
    topics: ["git", "worktree"],
    requiredSignals: ["worktree_diff_operation"],
  });
  const affirmative = matchCardEntriesDetailed(
    [worktreeMutation],
    "继续修改当前 git diff，但暂时不要提交。",
    { threshold: 40 },
  );
  const readOnly = matchCardEntriesDetailed(
    [worktreeMutation],
    "只读查看 git diff 并给 findings，不修改、暂存或提交。",
    { threshold: 40 },
  );

  assert.deepEqual(affirmative.diagnostics.selectedCardIds, [worktreeMutation.id]);
  assert.ok(!affirmative.diagnostics.candidates[0].reasons.some((item) => item.kind === "negative-fuzzy"));
  assert.deepEqual(readOnly.matches, []);
  assert.match(readOnly.diagnostics.candidates[0].rejectionReason, /^requiredSignals:/);
});

test("the untyped requiredAnySignals shadow field is not a runtime routing contract", () => {
  const legacyShadow = card("legacy-shadow", {
    triggers: ["legacy shadow anchor"],
    requiredAnySignals: ["ui_surface"],
  });
  const result = matchCardEntriesDetailed([legacyShadow], "Apply the legacy shadow anchor.", { threshold: 40 });

  assert.deepEqual(result.diagnostics.selectedCardIds, [legacyShadow.id]);
});
