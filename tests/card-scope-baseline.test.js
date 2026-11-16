import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  cardPath,
  explainMatch,
  getCard,
  initializeDataDir,
  initializeProjectLibrary,
  layout,
  listCards,
  loadConfig,
  readCardFile,
  removeStarterCards,
  renderAdditionalContext,
  runDoctor,
  saveConfig,
  setConfigValue,
  updateCard,
  writeCard,
} from "../dist/packages/core/src/index.js";
import { runHook } from "../dist/packages/hook-runtime/src/run.js";

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-${name}-`));
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
  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join("\n"), /combines scope\.project_keys with scope\.module_path: guarded/);
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

  const scoreWithoutPhases = explainMatch(dataDir, "trigger-phase-card").matches[0].score;
  const stripped = { ...matches[0], card: { ...matches[0].card, appliesTo: [] } };
  const renderedBare = renderAdditionalContext([stripped], { maxChars: 2000 });
  assert.doesNotMatch(renderedBare, /\[applies:/);
  assert.equal(explainMatch(dataDir, "trigger-phase-card").matches[0].score, scoreWithoutPhases);
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
  setConfigValue(dataDir, "retrieval.baseline.refreshEveryTurns", "5");
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
  setConfigValue(dataDir, "retrieval.baseline.refreshEveryTurns", "5");
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
  assert.match(doctor.warnings.join("\n"), /baseline card exceeds the delivery budget and is never delivered: baseline-0/);
  assert.match(doctor.warnings.join("\n"), /baseline set uses \d+ chars, above maxChars 120/);
  assert.equal(listCards(dataDir, "active").filter((card) => card.baseline).length, 4);
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
