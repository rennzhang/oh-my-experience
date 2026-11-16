import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  appendJsonl,
  baselineOptionsFromConfig,
  readBaselineCards,
  baselineStatus,
  buildCardSetFingerprint,
  buildRetrievalConfigFingerprint,
  cardPath,
  evaluateRecallSuite,
  explainMatch,
  getCard,
  generateStats,
  initializeDataDir,
  initializeProjectLibrary,
  inspectProjectLibrary,
  layout,
  listCards,
  loadConfig,
  readCardFile,
  removeStarterCards,
  renderAdditionalContext,
  readLibraryStackCards,
  resolveLibraryStack,
  runDoctor,
  saveConfig,
  updateCard,
  withLock,
  writeCard,
} from "../dist/packages/core/src/index.js";
import { runHook } from "../dist/packages/hook-runtime/src/run.js";

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-${name}-`));
}

function setRefreshTurns(dataDir, turns) {
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: { ...config.retrieval, baseline: { ...config.retrieval.baseline, refreshEveryTurns: turns } },
  });
}

function context(projectKey, modulePath = ".") {
  return { cwd: null, root: "/tmp/project", projectKey, modulePath, packageName: null, source: "git" };
}

function baseCard(id, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id,
    status: "active",
    title: `Card ${id}`,
    category: "测试",
    summary: `Summary for ${id}`,
    rule: "Follow the rule.",
    triggers: [`trigger-${id}`],
    negativeTriggers: [],
    topics: [`topic-${id}`],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function lastHookEvent(dataDir) {
  const events = fs.readFileSync(layout(dataDir).events, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.kind === "hook");
  return events.at(-1);
}

test("scope.project_keys matches any listed repository and exclusion still wins", () => {
  const dataDir = tmpDir("scope-multi-repo");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("multi-target", {
    applicability: {
      level: "project",
      projectKey: null,
      projectKeys: ["github.com/example/one", "github.com/example/two"],
      modulePath: null,
      excludeProjects: [],
    },
  }));

  assert.equal(explainMatch(dataDir, "trigger-multi-target", { projectContext: context("github.com/example/one") }).matches.length, 1);
  assert.equal(explainMatch(dataDir, "trigger-multi-target", { projectContext: context("github.com/example/two") }).matches.length, 1);
  assert.equal(explainMatch(dataDir, "trigger-multi-target", { projectContext: context("github.com/example/three") }).matches.length, 0);

  writeCard(dataDir, baseCard("multi-target", {
    applicability: {
      level: "project",
      projectKey: null,
      projectKeys: ["github.com/example/one", "github.com/example/two"],
      modulePath: null,
      excludeProjects: ["github.com/example/one"],
    },
  }));
  assert.equal(explainMatch(dataDir, "trigger-multi-target", { projectContext: context("github.com/example/one") }).matches.length, 0);
  assert.equal(explainMatch(dataDir, "trigger-multi-target", { projectContext: context("github.com/example/two") }).matches.length, 1);
});

test("multi-repo targets plus a module path fail closed and doctor reports it", () => {
  const dataDir = tmpDir("scope-module-guard");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("guarded", {
    applicability: {
      level: "project",
      projectKey: null,
      projectKeys: ["github.com/example/one", "github.com/example/two"],
      modulePath: "packages/app",
      excludeProjects: [],
    },
  }));

  assert.equal(explainMatch(dataDir, "trigger-guarded", { projectContext: context("github.com/example/one", "packages/app") }).matches.length, 0);
  // A one-element project_keys list is still the array contract, not the legacy
  // single-key form, so the combination stays invalid.
  writeCard(dataDir, baseCard("guarded", {
    applicability: {
      level: "project",
      projectKey: null,
      projectKeys: ["github.com/example/one"],
      modulePath: "packages/app",
      excludeProjects: [],
    },
  }));
  assert.equal(explainMatch(dataDir, "trigger-guarded", { projectContext: context("github.com/example/one", "packages/app") }).matches.length, 0);
  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join("\n"), /combines scope\.project_keys with scope\.module_path: guarded/);
});

test("legacy single project_key still supports a module path", () => {
  const dataDir = tmpDir("scope-single-module");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("single-module", {
    applicability: {
      level: "project",
      projectKey: "github.com/example/one",
      projectKeys: [],
      modulePath: "packages/app",
      excludeProjects: [],
    },
  }));

  assert.equal(explainMatch(dataDir, "trigger-single-module", { projectContext: context("github.com/example/one", "packages/app") }).matches.length, 1);
  assert.equal(explainMatch(dataDir, "trigger-single-module", { projectContext: context("github.com/example/one", "packages/other") }).matches.length, 0);
});

test("card setting both project_key and project_keys is a doctor error", () => {
  const dataDir = tmpDir("scope-both-fields");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("both-forms", {
    applicability: {
      level: "project",
      projectKey: "github.com/example/one",
      projectKeys: ["github.com/example/two"],
      modulePath: null,
      excludeProjects: [],
    },
  }));

  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join("\n"), /sets both scope\.project_key and scope\.project_keys: both-forms/);
});

test("applies_to round-trips, renders on the card header, and never scores", () => {
  const dataDir = tmpDir("applies-to");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("phase-card", { appliesTo: ["edit", "verify"] }));

  assert.deepEqual(getCard(dataDir, "phase-card").appliesTo, ["edit", "verify"]);
  assert.match(fs.readFileSync(cardPath(dataDir, "active", "phase-card"), "utf8"), /applies_to:/);

  const updated = updateCard(dataDir, "phase-card", { applies_to: "verify, deliver" });
  assert.deepEqual(updated.appliesTo, ["verify", "deliver"]);

  const matches = explainMatch(dataDir, "trigger-phase-card").matches;
  assert.equal(matches.length, 1);
  const rendered = renderAdditionalContext([{
    ...matches[0],
    card: matches[0].card,
  }], { maxChars: 2000 });
  assert.match(rendered, /1\. \[medium risk\]\[should\]\[applies: verify, deliver\]/);

  // Real invariance check: clear the phase field on the stored card and compare
  // the same query. A stripped copy passed to the renderer proves nothing.
  const scoreWithPhases = explainMatch(dataDir, "trigger-phase-card").matches[0].score;
  updateCard(dataDir, "phase-card", { appliesTo: [] });
  const scoreWithoutPhases = explainMatch(dataDir, "trigger-phase-card").matches[0].score;
  assert.deepEqual(getCard(dataDir, "phase-card").appliesTo, []);
  assert.equal(scoreWithoutPhases, scoreWithPhases);
  const renderedBare = renderAdditionalContext(explainMatch(dataDir, "trigger-phase-card").matches, { maxChars: 2000 });
  assert.doesNotMatch(renderedBare, /\[applies:/);
});

test("unknown applies_to values are a doctor error and many phases a warning", () => {
  const dataDir = tmpDir("applies-to-doctor");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("bad-phase", { appliesTo: ["writes"] }));
  writeCard(dataDir, baseCard("wide-phase", { appliesTo: ["inspect", "edit", "verify", "deliver"] }));

  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join("\n"), /unknown applies_to values: bad-phase: writes/);
  assert.match(doctor.warnings.join("\n"), /card lists 4 applies_to phases: wide-phase/);
});

test("baseline cards leave the matching set and deliver on turn 1, 6, 11", async () => {
  const dataDir = tmpDir("baseline-cadence");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  // saveConfig, not setConfigValue: the latter also repoints the global config
  // pointer, which would overwrite the user's real config during tests.
  setRefreshTurns(dataDir, 5);
  writeCard(dataDir, baseCard("baseline-rule", {
    triggers: ["baseline-only-trigger"],
    rule: "Keep the change minimal and explain what changed.",
    appliesTo: ["edit"],
    baseline: true,
  }));

  const explained = explainMatch(dataDir, "baseline-only-trigger");
  assert.equal(explained.matches.length, 0);
  assert.deepEqual(explained.diagnostics.baselineExcludedCardIds, ["baseline-rule"]);

  const delivered = [];
  for (let turn = 1; turn <= 11; turn += 1) {
    const output = await runHook({
      dataDir,
      input: { prompt: "unrelated question", session_id: "cadence-session", turn_id: `t${turn}` },
    });
    if (output.hookSpecificOutput?.additionalContext) delivered.push(turn);
  }
  assert.deepEqual(delivered, [1, 6, 11]);

  const event = lastHookEvent(dataDir);
  assert.deepEqual(event.baseline.deliveredCardIds, ["baseline-rule"]);
  assert.equal(event.baseline.skipReason, null);
  assert.equal(event.matched, false);
  assert.deepEqual(event.renderedCardIds, []);
  assert.match(fs.readFileSync(path.join(dataDir, "events.jsonl"), "utf8"), /"deliveredCardIds":\["baseline-rule"\]/);
});

test("baseline cadence resets when the set changes and skips counting without a session", async () => {
  const dataDir = tmpDir("baseline-reset");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  setRefreshTurns(dataDir, 5);
  writeCard(dataDir, baseCard("baseline-a", { rule: "First rule.", baseline: true }));

  await runHook({ dataDir, input: { prompt: "hello", session_id: "reset-session" } });
  const skipped = await runHook({ dataDir, input: { prompt: "hello", session_id: "reset-session" } });
  assert.deepEqual(skipped, {});

  writeCard(dataDir, baseCard("baseline-a", { rule: "First rule, edited.", baseline: true }));
  const afterEdit = await runHook({ dataDir, input: { prompt: "hello", session_id: "reset-session" } });
  assert.match(afterEdit.hookSpecificOutput.additionalContext, /First rule, edited\./);

  const stateless = await runHook({ dataDir, input: { prompt: "hello" } });
  assert.match(stateless.hookSpecificOutput.additionalContext, /First rule, edited\./);
  const statelessAgain = await runHook({ dataDir, input: { prompt: "hello" } });
  assert.match(statelessAgain.hookSpecificOutput.additionalContext, /First rule, edited\./);
});

test("baseline budgets omit whole cards and stay separate from matched budgets", async () => {
  const dataDir = tmpDir("baseline-budget");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: {
      ...config.retrieval,
      additionalContextMaxChars: 400,
      baseline: { enabled: true, maxChars: 80, setMaxChars: 60, refreshEveryTurns: 5 },
    },
  });
  writeCard(dataDir, baseCard("oversized", {
    rule: "This rule is long enough that it cannot fit into the tiny baseline budget configured by this test.",
    baseline: true,
  }));

  const output = await runHook({ dataDir, input: { prompt: "unrelated question", session_id: "budget-session" } });
  assert.deepEqual(output, {});
  const event = lastHookEvent(dataDir);
  assert.deepEqual(event.baseline.deliveredCardIds, []);
  assert.deepEqual(event.baseline.omittedCardIds, ["oversized"]);
  assert.equal(event.baseline.skipReason, "budget");
  assert.equal(event.baseline.chars, 0);
});

test("project baseline card wins over the global card with the same id", async () => {
  const dataDir = tmpDir("baseline-project");
  const projectRoot = tmpDir("baseline-project-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/baseline-project" }), "utf8");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(dataDir, baseCard("shared-rule", { rule: "Global wording.", baseline: true }));
  writeCard(projectLibrary, baseCard("shared-rule", { rule: "Project wording.", baseline: true }));

  const output = await runHook({
    dataDir,
    input: { prompt: "unrelated question", cwd: projectRoot, session_id: "project-session" },
  });
  const text = output.hookSpecificOutput.additionalContext;
  assert.match(text, /- \[project\] Card shared-rule \(shared-rule\)/);
  assert.match(text, /Project wording\./);
  assert.doesNotMatch(text, /Global wording\./);
  assert.equal(text.match(/\(shared-rule\)/g).length, 1);
});

test("doctor warns about an oversized or too large baseline set", () => {
  const dataDir = tmpDir("baseline-doctor");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: { ...config.retrieval, baseline: { enabled: true, maxChars: 120, setMaxChars: 120, refreshEveryTurns: 5 } },
  });
  for (let index = 0; index < 4; index += 1) {
    writeCard(dataDir, baseCard(`baseline-${index}`, {
      rule: "A rule that is long enough to consume a serious share of the configured baseline budget.",
      baseline: true,
    }));
  }

  const doctor = runDoctor(dataDir);
  assert.match(doctor.warnings.join("\n"), /baseline card never fits the delivery budget and is omitted whole: baseline-0/);
  assert.equal(listCards(dataDir, "active").filter((card) => card.baseline).length, 4);
});

test("doctor warns when a library budget silently drops later baseline cards", () => {
  const dataDir = tmpDir("baseline-doctor-set-budget");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: { ...config.retrieval, baseline: { enabled: true, maxChars: 800, setMaxChars: 500, refreshEveryTurns: 5 } },
  });
  for (const id of ["first-card", "second-card"]) {
    writeCard(dataDir, baseCard(id, {
      rule: `Keep ${id} honest. `.repeat(15).trim(),
      baseline: true,
    }));
  }

  const doctor = runDoctor(dataDir);
  assert.match(doctor.warnings.join("\n"), /baseline card never fits the delivery budget and is omitted whole: second-card/);
});

test("baseline list reports membership and budget usage", () => {
  const dataDir = tmpDir("baseline-cli");
  const configHome = tmpDir("baseline-cli-config");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("cli-baseline", { rule: "Short rule.", baseline: true }));

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "experience", "baseline", "--data-dir", dataDir, "--json"], {
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.enabled, true);
  assert.equal(status.refreshEveryTurns, 5);
  assert.deepEqual(status.cards.map((card) => card.id), ["cli-baseline"]);
  assert.ok(status.totalChars > 0);
});

test("baseline cadence repairs corrupted state instead of suppressing delivery", async () => {
  const dataDir = tmpDir("baseline-corrupt-state");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("state-card", { rule: "Keep state honest.", baseline: true }));
  await runHook({ dataDir, input: { prompt: "hello", session_id: "corrupt-session" } });

  const statePath = layout(dataDir).baselineState;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.sessions["corrupt-session"].turns = "bad";
  fs.writeFileSync(statePath, JSON.stringify(state), "utf8");

  const output = await runHook({ dataDir, input: { prompt: "hello", session_id: "corrupt-session" } });
  assert.match(output.hookSpecificOutput.additionalContext, /Keep state honest\./);
  assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).sessions["corrupt-session"].turns, 1);
});

test("baseline delivery fails open when the counter cannot be written", async () => {
  const dataDir = tmpDir("baseline-readonly-state");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("readonly-card", { rule: "Read-only state still delivers.", baseline: true }));
  await runHook({ dataDir, input: { prompt: "hello", session_id: "readonly-session" } });

  const stateDir = path.dirname(layout(dataDir).baselineState);
  fs.chmodSync(stateDir, 0o555);
  try {
    const output = await runHook({ dataDir, input: { prompt: "hello", session_id: "readonly-session" } });
    assert.match(output.hookSpecificOutput.additionalContext, /Read-only state still delivers\./);
  } finally {
    fs.chmodSync(stateDir, 0o755);
  }
});

test("equivalent project scope forms collapse as near duplicates", () => {
  const dataDir = tmpDir("scope-duplicate-forms");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const shared = {
    title: "Same lesson",
    category: "测试",
    summary: "Same summary.",
    rule: "Same rule.",
    topics: ["duplicate"],
    triggers: ["duplicate trigger"],
  };
  writeCard(dataDir, baseCard("dup-old", {
    ...shared,
    applicability: { level: "project", projectKey: "github.com/example/one", modulePath: null, excludeProjects: [] },
  }));
  writeCard(dataDir, baseCard("dup-new", {
    ...shared,
    applicability: { level: "project", projectKey: null, projectKeys: ["github.com/example/one"], modulePath: null, excludeProjects: [] },
  }));

  const explained = explainMatch(dataDir, "duplicate trigger", { projectContext: context("github.com/example/one") });
  assert.equal(explained.matches.length, 1);
});

test("baseline rule text cannot mark a matched card as rendered", async () => {
  const dataDir = tmpDir("baseline-render-isolation");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("match-rule", { triggers: ["match rule trigger"], rule: "Short matched rule." }));
  writeCard(dataDir, baseCard("baseline-echo", {
    rule: "Run ome experience show match-rule --section rule when unsure.",
    baseline: true,
  }));
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: {
      ...config.retrieval,
      additionalContextMaxChars: 10,
      baseline: { enabled: true, maxChars: 5000, setMaxChars: 5000, refreshEveryTurns: 5 },
    },
  });

  const output = await runHook({ dataDir, input: { prompt: "match rule trigger", session_id: "render-session" } });
  const text = output.hookSpecificOutput.additionalContext;
  assert.match(text, /# OME Baseline Experience/);
  assert.doesNotMatch(text, /# OME Matched Experience Cards/);
  const event = lastHookEvent(dataDir);
  assert.deepEqual(event.renderedCardIds, []);
  assert.equal(event.rendered, false);
  assert.deepEqual(event.baseline.deliveredCardIds, ["baseline-echo"]);
});

test("stats do not report delivered baseline cards as stale", () => {
  const dataDir = tmpDir("baseline-stale");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("baseline-stale", { baseline: true }));
  writeCard(dataDir, baseCard("normal-stale"));
  const activeCards = listCards(dataDir, "active");
  appendJsonl(layout(dataDir).events, {
    id: "baseline-stale-event",
    kind: "hook",
    schemaVersion: 2,
    engineVersion: "sparse-v2",
    scorerVersion: "bm25f-evidence-v2",
    globalCardSetFingerprint: buildCardSetFingerprint(activeCards),
    configFingerprint: buildRetrievalConfigFingerprint(loadConfig(dataDir).retrieval),
    selectionStage: { selectedCardIds: [], cards: [] },
    matchedCards: [],
    renderedCardIds: [],
    injected: false,
    createdAt: new Date().toISOString(),
  }, dataDir);

  const stats = generateStats(dataDir);
  assert.equal(stats.staleCards.includes("baseline-stale"), false);
  assert.equal(stats.staleCards.includes("normal-stale"), true);
});

test("baseline status ignores recall-off cards and duplicate ids across libraries", () => {
  const dataDir = tmpDir("baseline-status-membership");
  const projectRoot = tmpDir("baseline-status-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/baseline-status" }), "utf8");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(dataDir, baseCard("shared-baseline", { rule: "Global wording.", baseline: true }));
  writeCard(projectLibrary, baseCard("shared-baseline", { rule: "Project wording.", baseline: true }));
  writeCard(dataDir, baseCard("off-baseline", { rule: "Disabled wording.", baseline: true, recallPolicy: "off" }));

  const stack = resolveLibraryStack(dataDir, projectRoot);
  const status = baselineStatus(stack.libraries, baselineOptionsFromConfig(loadConfig(dataDir).retrieval));
  assert.deepEqual(status.cards.map((card) => card.id), ["shared-baseline"]);
  assert.equal(status.cards[0].libraryScope, "project");
  assert.equal(status.totalChars, status.cards[0].chars);
  assert.deepEqual(status.neverDelivered, []);
  assert.equal(inspectProjectLibrary(projectRoot).readable, true);
});

test("project library card semantics surface through doctor", () => {
  const dataDir = tmpDir("project-semantics-doctor");
  const configHome = tmpDir("project-semantics-config");
  const projectRoot = tmpDir("project-semantics-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-semantics" }), "utf8");
  initializeDataDir({ dataDir });
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(projectLibrary, baseCard("project-bad-phase", { appliesTo: ["writes"] }));

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "doctor", "--data-dir", dataDir, "--json"], {
    cwd: projectRoot,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  const record = JSON.parse(result.stdout);
  assert.equal(record.ok, false);
  assert.match(record.errors.join("\n"), /project library: card uses unknown applies_to values: project-bad-phase/);
});

test("baseline list renders a human summary", () => {
  const dataDir = tmpDir("baseline-cli-human");
  const configHome = tmpDir("baseline-cli-human-config");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("human-baseline", { rule: "Short rule.", baseline: true }));

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "experience", "baseline", "--data-dir", dataDir], {
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Baseline cards: 1/);
  assert.match(result.stdout, /Budget: \d+\/800 chars total/);
  assert.match(result.stdout, /human-baseline/);
});

test("non-numeric turn counters are treated as missing state", async () => {
  const dataDir = tmpDir("baseline-boolean-turns");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("bool-state", { rule: "Boolean state still delivers.", baseline: true }));
  await runHook({ dataDir, input: { prompt: "hello", session_id: "bool-session" } });

  const statePath = layout(dataDir).baselineState;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.sessions["bool-session"].turns = true;
  fs.writeFileSync(statePath, JSON.stringify(state), "utf8");

  const output = await runHook({ dataDir, input: { prompt: "hello", session_id: "bool-session" } });
  assert.match(output.hookSpecificOutput.additionalContext, /Boolean state still delivers\./);
  assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).sessions["bool-session"].turns, 1);
});

test("a young lock without its marker is treated as held", () => {
  const dataDir = tmpDir("lock-window");
  initializeDataDir({ dataDir });
  const lockPath = path.join(layout(dataDir).locks, "window.lock");
  fs.mkdirSync(lockPath, { recursive: true });
  try {
    assert.throws(() => withLock(dataDir, "window", () => "unexpected"), /resource is locked/);
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
  assert.equal(withLock(dataDir, "window", () => "acquired"), "acquired");
});

test("baseline falls back to the global card when the project copy is inert", () => {
  const dataDir = tmpDir("baseline-fallback");
  const projectRoot = tmpDir("baseline-fallback-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/fallback" }), "utf8");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(dataDir, baseCard("same-id", { rule: "Global wording.", baseline: true }));
  writeCard(projectLibrary, baseCard("same-id", { rule: "Project off.", baseline: true, recallPolicy: "off" }));

  const stack = resolveLibraryStack(dataDir, projectRoot);
  const cards = readBaselineCards(stack, readLibraryStackCards(stack));
  assert.deepEqual(cards.map((card) => [card.id, card.rule, card.libraryScope]), [["same-id", "Global wording.", "global"]]);
});

test("doctor evaluates baseline budgets across the whole library stack", () => {
  const dataDir = tmpDir("baseline-stack-budget");
  const configHome = tmpDir("baseline-stack-budget-config");
  const projectRoot = tmpDir("baseline-stack-budget-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/stack-budget" }), "utf8");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  const config = loadConfig(dataDir);
  saveConfig(dataDir, {
    ...config,
    retrieval: { ...config.retrieval, baseline: { enabled: true, maxChars: 600, setMaxChars: 500, refreshEveryTurns: 5 } },
  });
  writeCard(dataDir, baseCard("global-long", {
    rule: "Global rule. ".repeat(25).trim(),
    baseline: true,
  }));
  writeCard(projectLibrary, baseCard("project-long", {
    rule: "Project rule. ".repeat(25).trim(),
    baseline: true,
  }));

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "doctor", "--data-dir", dataDir, "--json"], {
    cwd: projectRoot,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  const record = JSON.parse(result.stdout);
  assert.match(record.warnings.join("\n"), /baseline card never fits the delivery budget and is omitted whole: global-long/);
});

test("project status human output reports semantic errors", () => {
  const dataDir = tmpDir("project-status-human");
  const configHome = tmpDir("project-status-human-config");
  const projectRoot = tmpDir("project-status-human-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-status" }), "utf8");
  initializeDataDir({ dataDir });
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(projectLibrary, baseCard("status-bad-phase", { appliesTo: ["writes"] }));

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "project", "status", "--data-dir", dataDir], {
    cwd: projectRoot,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /problems found/);
  assert.match(result.stdout, /Error: card uses unknown applies_to values: status-bad-phase/);
});

test("doctor still returns aggregated diagnostics when global config is invalid", () => {
  const dataDir = tmpDir("doctor-broken-config");
  const configHome = tmpDir("doctor-broken-config-config");
  const projectRoot = tmpDir("doctor-broken-config-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/broken-config" }), "utf8");
  initializeDataDir({ dataDir });
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(projectLibrary, baseCard("broken-config-phase", { appliesTo: ["writes"] }));
  const raw = JSON.parse(fs.readFileSync(layout(dataDir).config, "utf8"));
  raw.retrieval.baseline.maxChars = 0;
  fs.writeFileSync(layout(dataDir).config, JSON.stringify(raw), "utf8");

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "doctor", "--data-dir", dataDir, "--json"], {
    cwd: projectRoot,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  const record = JSON.parse(result.stdout);
  assert.equal(record.ok, false);
  assert.match(record.errors.join("\n"), /config schema invalid/);
  assert.match(record.errors.join("\n"), /project library: card uses unknown applies_to values: broken-config-phase/);
});

test("project identity on a global card fails closed and is a doctor error", () => {
  const dataDir = tmpDir("scope-global-conflict");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  writeCard(dataDir, baseCard("global-with-keys", {
    applicability: {
      level: "global",
      projectKey: null,
      projectKeys: ["github.com/example/one"],
      modulePath: null,
      excludeProjects: [],
    },
  }));
  writeCard(dataDir, baseCard("global-with-path", {
    applicability: {
      level: "global",
      projectKey: null,
      projectKeys: ["github.com/example/one"],
      modulePath: "packages/app",
      excludeProjects: [],
    },
  }));

  assert.equal(explainMatch(dataDir, "trigger-global-with-keys", { projectContext: context("github.com/example/one") }).matches.length, 0);
  assert.equal(explainMatch(dataDir, "trigger-global-with-path", { projectContext: context("github.com/example/one", "packages/app") }).matches.length, 0);
  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join("\n"), /declares a project scope on a global card: global-with-keys/);
  assert.match(doctor.errors.join("\n"), /combines scope\.project_keys with scope\.module_path: global-with-path/);
});

test("doctor survives a syntactically broken config and still reports cards", () => {
  const dataDir = tmpDir("doctor-broken-json");
  const configHome = tmpDir("doctor-broken-json-config");
  const projectRoot = tmpDir("doctor-broken-json-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/broken-json" }), "utf8");
  initializeDataDir({ dataDir });
  const projectLibrary = initializeProjectLibrary(projectRoot).projectLibrary;
  writeCard(projectLibrary, baseCard("broken-json-phase", { appliesTo: ["writes"] }));
  fs.writeFileSync(layout(dataDir).config, '{"retrieval":', "utf8");

  const result = spawnSync(process.execPath, [path.resolve(new URL("../", import.meta.url).pathname, "bin", "ome.js"), "doctor", "--data-dir", dataDir, "--json"], {
    cwd: projectRoot,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome },
    encoding: "utf8",
  });
  const record = JSON.parse(result.stdout);
  assert.equal(record.ok, false);
  assert.match(record.errors.join("\n"), /config schema invalid/);
  assert.match(record.errors.join("\n"), /project library: card uses unknown applies_to values: broken-json-phase/);
});

test("isolated eval fixtures keep project_keys and contradictory scope semantics", () => {
  const dataDir = tmpDir("eval-scope-parity");
  const projectRoot = tmpDir("eval-scope-parity-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "eval-project-one" }), "utf8");
  initializeDataDir({ dataDir });

  const fixture = (id, prompt, scope) => ({
    id,
    title: `Fixture ${id}`,
    category: "测试",
    summary: `Fixture ${id}.`,
    rule: `Fixture ${id} rule.`,
    criteria: { use_when: [prompt], ignore_when: [] },
    recall: { triggers: [prompt], topics: ["scope"] },
    scope,
  });
  const suite = {
    name: "scope-parity",
    experiences: [
      fixture("array-scope", "array scope prompt", { level: "project", project_keys: ["eval-project-one"] }),
      fixture("global-conflict", "global conflict prompt", { level: "global", project_keys: ["eval-project-one"], module_path: "packages/app" }),
    ],
    cases: [
      { id: "array-hit", prompt: "array scope prompt", cwd: projectRoot, expectedCards: ["array-scope"] },
      { id: "global-conflict-miss", prompt: "global conflict prompt", cwd: projectRoot, expectedCards: [], expectNoMatches: true },
    ],
  };

  const suiteFile = path.join(tmpDir("eval-scope-suite"), "scope-parity.json");
  fs.writeFileSync(suiteFile, JSON.stringify(suite), "utf8");
  const report = evaluateRecallSuite(dataDir, suiteFile, { limit: 4, threshold: 40 });
  assert.equal(report.ok, true, JSON.stringify(report.cases));
  assert.equal(report.cases.find((item) => item.id === "array-hit").passed, true);
  assert.equal(report.cases.find((item) => item.id === "global-conflict-miss").passed, true);
});
