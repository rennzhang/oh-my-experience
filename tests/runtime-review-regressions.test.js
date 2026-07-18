import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RETRIEVAL_ENGINE_VERSION,
  RETRIEVAL_SCORER_VERSION,
  appendJsonl,
  buildCardSetFingerprint,
  buildRetrievalConfigFingerprint,
  detectProjectContext,
  generateStats,
  initializeDataDir,
  layout,
  listCards,
  loadConfig,
} from "../dist/packages/core/src/index.js";
import { runHook } from "../dist/packages/hook-runtime/src/run.js";

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-${name}-`));
}

test("current stats are a comparable global snapshot while cumulative stats retain project cards", () => {
  const dataDir = tmpDir("stats-global-snapshot");
  initializeDataDir({ dataDir });
  const activeCards = listCards(dataDir, "active");
  const config = loadConfig(dataDir);

  appendJsonl(layout(dataDir).events, {
    id: "project-only-current-event",
    kind: "hook",
    schemaVersion: 2,
    engineVersion: RETRIEVAL_ENGINE_VERSION,
    scorerVersion: RETRIEVAL_SCORER_VERSION,
    globalCardSetFingerprint: buildCardSetFingerprint(activeCards),
    configFingerprint: buildRetrievalConfigFingerprint(config.retrieval),
    selectionStage: {
      selectedCardIds: ["project-only-card"],
      cards: [{ id: "project-only-card", libraryScope: "project" }],
    },
    matchedCards: [{ id: "project-only-card", libraryScope: "project" }],
    renderedCardIds: ["project-only-card"],
    injected: true,
    createdAt: new Date().toISOString(),
  }, dataDir);

  const stats = generateStats(dataDir);
  assert.equal(stats.current.eventCount, 1);
  assert.equal(stats.current.matchedEventCount, 0);
  assert.equal(stats.current.renderedEventCount, 0);
  assert.equal(stats.current.noHitRate, 1);
  assert.equal("project-only-card" in stats.current.cardRecallCount, false);
  assert.equal(stats.cumulative.matchedEventCount, 1);
  assert.equal(stats.cumulative.cardRecallCount["project-only-card"], 1);
});

test("maintenance suppression recognizes commands without hiding ordinary OME product work", async () => {
  const dataDir = tmpDir("maintenance-boundary");
  initializeDataDir({ dataDir });

  const productWork = await runHook({
    dataDir,
    input: {
      prompt: "Improve the OME experience for users; refactor retrieval with cohesive architecture and a root-cause fix.",
    },
  });
  assert.match(productWork.hookSpecificOutput?.additionalContext || "", /starter-code-kiss-root-cause/);

  const maintenance = await runHook({ dataDir, input: { prompt: "Please run `ome doctor --json`" } });
  assert.deepEqual(maintenance, {});
});

test("project detection bounds git metadata lookup latency", () => {
  const projectDir = tmpDir("project-git-timeout");
  const binDir = path.join(projectDir, "bin");
  fs.mkdirSync(path.join(projectDir, ".git"));
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "timeout-fixture" }));
  const fakeGit = path.join(binDir, "git");
  fs.writeFileSync(fakeGit, "#!/usr/bin/env node\nsetTimeout(() => process.stdout.write('git@example.test:slow/repo.git'), 10000);\n");
  fs.chmodSync(fakeGit, 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${previousPath || ""}`;
  const started = Date.now();
  try {
    const context = detectProjectContext(projectDir);
    assert.equal(context.projectKey, "timeout-fixture");
    assert.equal(context.source, "package");
  } finally {
    process.env.PATH = previousPath;
  }
  assert.ok(Date.now() - started < 2500, "git metadata lookup should respect the one-second timeout");
});
