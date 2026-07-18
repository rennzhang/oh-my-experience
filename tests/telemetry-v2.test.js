import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HookEventSchema,
  appendJsonl,
  generateStats,
  initializeDataDir,
  layout,
  loadConfig,
  saveConfig,
} from "../dist/packages/core/src/index.js";
import { runHook } from "../dist/packages/hook-runtime/src/run.js";

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-${name}-`));
}

function hookEvents(dataDir) {
  return fs.readFileSync(layout(dataDir).events, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.kind === "hook");
}

test("hook telemetry v2 separates matched, rendered, and unknown delivery without raw prompts", async () => {
  const dataDir = tmpDir("telemetry-v2");
  initializeDataDir({ dataDir });
  const prompt = "/goal execute the synthetic cache migration and verify delivery synthetic-sensitive-marker";

  const output = await runHook({
    dataDir,
    input: { prompt, session_id: "telemetry-session", turn_id: "telemetry-turn" },
  });
  assert.ok(output.hookSpecificOutput?.additionalContext);

  const log = fs.readFileSync(layout(dataDir).events, "utf8");
  assert.equal(log.includes(prompt), false);
  assert.equal(log.includes("synthetic-sensitive-marker"), false);
  const event = HookEventSchema.parse(hookEvents(dataDir).at(-1));
  assert.equal(event.schemaVersion, 2);
  assert.match(event.engineVersion, /\S/);
  assert.match(event.scorerVersion, /\S/);
  assert.match(event.libraryFingerprint || "", /^[a-f0-9]{64}$/);
  assert.match(event.cardSetFingerprint || "", /^[a-f0-9]{64}$/);
  assert.match(event.globalCardSetFingerprint || "", /^[a-f0-9]{64}$/);
  assert.match(event.configFingerprint || "", /^[a-f0-9]{64}$/);
  assert.equal(event.candidateStage.available, true);
  assert.equal(event.candidateStage.complete, true);
  assert.ok((event.candidateStage.count || 0) > 0);
  assert.equal(event.candidateStage.truncated, false);
  assert.equal(event.candidateStage.unavailableReason, null);
  assert.ok(event.candidateStage.cards.length > 0);
  assert.ok(event.candidateStage.cards.some((card) => card.selected));
  assert.equal(event.matched, true);
  assert.ok(event.selectionStage.cards.length > 0);
  assert.equal(typeof event.selectionStage.cards[0].rawScore, "number");
  assert.equal(typeof event.selectionStage.cards[0].rankScore, "number");
  assert.equal(
    event.selectionStage.cards[0].postSelectionScore,
    event.selectionStage.cards[0].score,
  );
  assert.deepEqual(event.renderedCardIds, event.selectionStage.selectedCardIds);
  assert.equal(event.rendered, true);
  assert.equal(event.contextTruncated, false);
  assert.equal(event.deliveryStatus, "unknown");
  assert.equal(event.injected, event.rendered);
});

test("hook telemetry stores the exact raw prompt when explicitly enabled", async () => {
  const dataDir = tmpDir("telemetry-raw-prompt");
  initializeDataDir({ dataDir });
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    privacy: { ...config.privacy, saveRawPrompt: true },
  });
  const prompt = "第一行 raw prompt\nsecond line with punctuation: []{}";

  await runHook({
    dataDir,
    input: { prompt, session_id: "raw-prompt-session", turn_id: "raw-prompt-turn" },
  });

  const event = HookEventSchema.parse(hookEvents(dataDir).at(-1));
  assert.equal(event.rawPrompt, prompt);
  assert.equal(event.promptHash.length, 64);
});

test("hook telemetry reports selection without pretending an undersized context was rendered", async () => {
  const dataDir = tmpDir("telemetry-truncated");
  initializeDataDir({ dataDir });
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: { ...config.retrieval, additionalContextMaxChars: 32 },
  });

  const output = await runHook({
    dataDir,
    input: { prompt: "/goal execute the synthetic cache migration and verify delivery", session_id: "truncated-session" },
  });
  assert.deepEqual(output, {});
  const event = HookEventSchema.parse(hookEvents(dataDir).at(-1));
  assert.equal(event.matched, true);
  assert.ok(event.selectionStage.selectedCardIds.length > 0);
  assert.deepEqual(event.renderedCardIds, []);
  assert.equal(event.rendered, false);
  assert.equal(event.contextTruncated, true);
  assert.equal(event.deliveryStatus, "unknown");
  assert.equal(event.injected, false);
});

test("stats defaults to the current telemetry, engine, scorer, card, and config snapshot", async () => {
  const dataDir = tmpDir("telemetry-stats");
  initializeDataDir({ dataDir });
  await runHook({
    dataDir,
    input: { prompt: "/goal execute the synthetic cache migration and verify delivery", session_id: "current-session" },
  });
  const currentEvent = hookEvents(dataDir).at(-1);
  const currentCardId = currentEvent.selectionStage.selectedCardIds[0];
  assert.ok(currentCardId);

  appendJsonl(layout(dataDir).events, {
    id: "legacy-hook-event",
    kind: "hook",
    provider: "unknown",
    event: "prompt.submit",
    promptHash: "legacy-hash",
    taskEnvelope: {},
    matchedCards: [{ id: "removed-or-archived-card", score: 99, reasons: [] }],
    injected: true,
    durationMs: 1,
    createdAt: new Date().toISOString(),
  }, dataDir);

  const stats = generateStats(dataDir);
  assert.equal(stats.view, "current-snapshot");
  assert.equal(stats.current.eventCount, 1);
  assert.equal(stats.current.matchedEventCount, 1);
  assert.equal(stats.current.renderedEventCount, 1);
  assert.equal(stats.cardRecallCount[currentCardId], 1);
  assert.equal("removed-or-archived-card" in stats.cardRecallCount, false);
  assert.equal(stats.cumulative.eventCount, 2);
  assert.equal(stats.cumulative.cardRecallCount["removed-or-archived-card"], 1);
  assert.equal(stats.excludedEventCount, 1);
  assert.equal(stats.coverageRate, stats.current.matchRate);
  assert.equal(stats.injectionRate, stats.current.renderRate);
  assert.equal(stats.renderRate, stats.current.renderRate);
});
