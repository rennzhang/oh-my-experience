import test from "node:test";
import assert from "node:assert/strict";
import { matchCardEntriesDetailed } from "../dist/packages/core/src/index.js";

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
    topics: [`topic-${id}`],
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

test("global and project cards with the same id keep distinct diagnostics and one project representative", () => {
  const shared = {
    title: "Validate the cobalt release gate",
    summary: "Validate the cobalt release gate through the real release path.",
    triggers: ["cobalt release gate"],
    topics: ["release"],
  };
  const globalCard = card("shared-release", shared);
  const projectCard = card("shared-release", {
    ...shared,
    libraryScope: "project",
    path: "experiences/active/shared-release.md",
  });

  const result = matchCardEntriesDetailed(
    [globalCard, projectCard],
    "Validate the cobalt release gate through the real release path.",
    { threshold: 40 },
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].card.id, "shared-release");
  assert.equal(result.matches[0].card.libraryScope, "project");
  assert.deepEqual(result.diagnostics.selectedCardIds, ["shared-release"]);

  const rows = result.diagnostics.candidates.filter((candidate) => candidate.id === "shared-release");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((candidate) => candidate.libraryScope).sort(), ["global", "project"]);
  assert.equal(rows.filter((candidate) => candidate.selected).length, 1);
  assert.equal(rows.find((candidate) => candidate.libraryScope === "project").selected, true);
  assert.match(
    rows.find((candidate) => candidate.libraryScope === "global").rejectionReason,
    /^post-selection:duplicate:project:shared-release$/,
  );
});

test("every admitted but unselected candidate records a post-selection reason", () => {
  const cards = [
    card("amber", {
      title: "Apply the amber ledger protocol",
      triggers: ["amber ledger protocol"],
      topics: ["ledger"],
    }),
    card("violet", {
      title: "Apply the violet transport protocol",
      triggers: ["violet transport protocol"],
      topics: ["transport"],
    }),
    card("indigo", {
      title: "Apply the indigo archive protocol",
      triggers: ["indigo archive protocol"],
      topics: ["transport"],
    }),
  ];
  const result = matchCardEntriesDetailed(
    cards,
    "Apply the amber ledger protocol, violet transport protocol, and indigo archive protocol.",
    { threshold: 40, limit: 1 },
  );

  const admittedUnselected = result.diagnostics.candidates.filter((candidate) => candidate.eligible && !candidate.selected);
  assert.ok(admittedUnselected.length >= 2);
  assert.ok(admittedUnselected.every((candidate) => candidate.rejectionReason?.startsWith("post-selection:")));
  assert.ok(admittedUnselected.some((candidate) => candidate.rejectionReason === "post-selection:limit"));
  assert.ok(admittedUnselected.some((candidate) => candidate.rejectionReason === "post-selection:limit-after-diversity"));
});

test("starter replacement collapse uses registered required_all signals", () => {
  const registeredCards = [
    card("starter-architecture", {
      title: "Amber module boundary",
      summary: "Repair the amber module boundary through a cohesive root-cause refactor.",
      triggers: ["amber module boundary"],
      topics: ["amber"],
      requiredAllSignals: ["architecture_quality"],
    }),
    card("violet-root-cause", {
      title: "Violet dependency seam",
      summary: "Repair the violet dependency seam through a cohesive root-cause refactor.",
      triggers: ["violet dependency seam"],
      topics: ["violet"],
      requiredAllSignals: ["architecture_quality"],
    }),
  ];
  const registered = matchCardEntriesDetailed(
    registeredCards,
    "Refactor the amber module boundary and violet dependency seam with cohesive architecture and a root-cause fix.",
    { threshold: 40, limit: 4 },
  );
  assert.equal(registered.matches.length, 1);
  assert.ok(registered.diagnostics.candidates.some((candidate) =>
    candidate.eligible && !candidate.selected && candidate.rejectionReason?.startsWith("post-selection:duplicate:")));
});
