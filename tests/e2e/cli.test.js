import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const bin = path.join(root, "bin", "ome.js");
const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "ome-e2e-config-home-"));
const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "ome-e2e-codex-home-"));

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-e2e-${name}-`));
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd || root,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome, CODEX_HOME: codexHome, ...(options.env || {}) },
    input: options.input,
    encoding: "utf8",
  });
  return result;
}

function json(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function completeAudit(overrides = {}) {
  return {
    scope: "focused",
    focusLens: "fixture focus",
    sourceCoverage: "all-accessible",
    nativeSourcesCovered: ["codex", "claude"],
    userOnlyIndexBuilt: true,
    queryFamilies: ["fixture focus", "fixture correction"],
    contextReplaySamples: ["fixture-session.jsonl:1"],
    spoolSupplement: "unavailable",
    searchedSources: ["fixture-session.jsonl"],
    unavailableSources: [],
    noiseFilters: ["user messages only"],
    evidenceClusters: ["fixture cluster"],
    userCorrections: [],
    rejectedInterpretations: [],
    activeCardOverlapQa: "no overlapping active card",
    remainingEvidenceGaps: [],
    ...overrides,
  };
}

function currentCandidate(fixture) {
  return {
    title: fixture.title,
    category: fixture.category,
    summary: fixture.summary,
    rule: fixture.rule,
    criteria: {
      use_when: fixture.triggers || [],
      ignore_when: fixture.negativeTriggers || [],
    },
    engine_hints: {
      positive: fixture.triggers || [],
      negative: fixture.negativeTriggers || [],
    },
    recall: {
      policy: fixture.recallPolicy || "should",
      risk: fixture.risk || "medium",
      confidence: fixture.confidence || "medium",
      triggers: fixture.triggers || [],
      topics: fixture.topics || [],
    },
    scope: fixture.scope || { level: "global" },
    evidence: fixture.evidence || [],
  };
}

test("CLI full lifecycle runs in temporary dataDir", () => {
  const dataDir = tmpDir("full");
  const init = json(run(["init", "--data-dir", dataDir, "--json"]));
  assert.equal("locale" in init, false);
  const scanResult = json(run(["source", "scan", "codex", "--sessions", path.join(root, "tests", "fixtures", "codex"), "--data-dir", dataDir, "--json"]));
  assert.equal(scanResult.indexed.length, 3);
  const sessionIndex = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8"));
  assert.equal(sessionIndex.storage, "sources");
  assert.equal("messages" in sessionIndex.sessions[0], false);
  const retrospective = json(run(["reflect", "start", "--data-dir", dataDir, "--json"]));
  const input = JSON.parse(fs.readFileSync(path.join(retrospective.runDir, "input.json"), "utf8"));
  assert.equal(fs.existsSync(path.join(retrospective.runDir, "prompt.md")), false);
  assert.equal(input.focus, "");
  assert.equal(input.guideRef, "skills/oh-my-experience/references/reflect-retrospective.md");
  assert.match(input.guideHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(input.sources, []);
  assert.match(retrospective.nextStep, /skill reference/);
  assert.doesNotMatch(retrospective.nextStep, /prompt\.md/);
  const candidatesFile = path.join(dataDir, "tmp-candidates.json");
  fs.writeFileSync(candidatesFile, JSON.stringify({
    audit: completeAudit(),
    candidates: [currentCandidate({
      title: "UI browser validation",
      summary: "UI was not validated in browser.",
      rule: "Use browser validation and console check.",
      category: "测试验收",
      triggers: ["UI", "浏览器验证"],
      topics: ["frontend", "console"],
      evidence: ["e2e"],
      risk: "high",
      recallPolicy: "must",
    })],
  }), "utf8");
  const candidates = json(run(["reflect", "candidates", retrospective.runId, "--from-file", candidatesFile, "--data-dir", dataDir, "--json"]));
  const candidateId = candidates.candidates[0].id;
  assert.equal(candidates.candidates[0].evidence.length, 1);
  assert.equal(candidates.candidates[0].category, "测试验收");
  assert.equal(candidates.reviewFile, path.join(dataDir, "retrospectives", retrospective.runId, "experience-review.md"));
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /经验草稿审批/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), new RegExp(`复盘编号：${retrospective.runId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /审计：coverage=all-accessible \/ focus=fixture focus \/ user-index=yes \/ native=codex,claude \/ sources=1 \/ gaps=0/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 经验总结/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 触发时机/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 可复用规则/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 审批意见/);
  const humanShow = run(["reflect", "show", retrospective.runId, "--data-dir", dataDir]);
  assert.equal(humanShow.status, 0, `${humanShow.stderr}\n${humanShow.stdout}`);
  assert.match(humanShow.stdout, /Draft approval:/);
  const reviewRelativePath = path.relative(process.cwd(), candidates.reviewFile).split(path.sep).join("/");
  assert.match(humanShow.stdout, new RegExp(`\\[Review\\]\\(<${reviewRelativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>\\)`));
  assert.doesNotMatch(humanShow.stdout, /retrospective\.md/);
  assert.doesNotMatch(humanShow.stdout, /candidates\.json/);
  const added = json(run(["reflect", "add", retrospective.runId, "--title", "Git diff scope", "--category", "Git 操作", "--summary", "Unrelated files were mixed", "--rule", "Keep the diff scoped", "--triggers", "git status,commit", "--topics", "git", "--data-dir", dataDir, "--json"]));
  assert.equal(added.candidates.length, 2);
  json(run(["reflect", "decide", retrospective.runId, candidateId, "--action", "approve", "--category", "产品与 UI", "--data-dir", dataDir, "--json"]));
  const dryRun = json(run(["reflect", "apply", retrospective.runId, "--dry-run", "--data-dir", dataDir, "--json"]));
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.drafts.length, 1);
  assert.equal(json(run(["experience", "list", "--status", "draft", "--data-dir", dataDir, "--json"])).experiences.length, 0);
  const humanApply = run(["reflect", "apply", retrospective.runId, "--data-dir", dataDir]);
  assert.equal(humanApply.status, 0, `${humanApply.stderr}\n${humanApply.stdout}`);
  assert.match(humanApply.stdout, /Drafts ready to add:/);
  assert.match(humanApply.stdout, /not recalled yet/);
  const reviewAfterApply = fs.readFileSync(candidates.reviewFile, "utf8");
  assert.match(reviewAfterApply, /状态：decisions_recorded/);
  assert.deepEqual(Array.from(reviewAfterApply.matchAll(/^### (.+)$/gm), (match) => match[1]).slice(0, 4), ["经验总结", "触发时机", "可复用规则", "审批意见"]);
  const humanShowAfterApply = run(["reflect", "show", retrospective.runId, "--data-dir", dataDir]);
  assert.equal(humanShowAfterApply.status, 0, `${humanShowAfterApply.stderr}\n${humanShowAfterApply.stdout}`);
  assert.match(humanShowAfterApply.stdout, /Approval notes are recorded/);
  const draftCards = json(run(["experience", "list", "--status", "draft", "--data-dir", dataDir, "--json"])).experiences;
  const draftCard = draftCards.find((card) => card.title === "UI browser validation");
  assert.ok(draftCard);
  const compactDrafts = json(run(["experience", "list", "--status", "draft", "--compact", "--data-dir", dataDir, "--json"]));
  assert.equal(compactDrafts.compact, true);
  assert.equal(compactDrafts.total, 1);
  assert.deepEqual(Object.keys(compactDrafts.experiences[0]).sort(), ["category", "id", "status", "title"]);
  assert.equal(compactDrafts.experiences[0].title, "UI browser validation");
  const cardId = draftCard.id;
  assert.equal(draftCard.category, "产品与 UI");
  const ruleShow = run(["experience", "show", cardId, "--section", "rule", "--data-dir", dataDir]);
  assert.equal(ruleShow.status, 0, `${ruleShow.stderr}\n${ruleShow.stdout}`);
  assert.match(ruleShow.stdout, /Use browser validation and console check/);
  json(run(["experience", "enable", cardId, "--data-dir", dataDir, "--json"]));
  const match = json(run(["match", "修复 UI 并做 浏览器验证", "--data-dir", dataDir, "--json"]));
  assert.equal(match.matches.length, 1);
  const explained = json(run(["match", "修复 UI 并做 浏览器验证", "--explain", "--data-dir", dataDir, "--json"]));
  assert.equal(explained.matches[0].id, cardId);
  assert.ok(explained.matches[0].reasons.length > 0);
  assert.match(explained.additionalContext, new RegExp(`Rule: ome experience show ${cardId} --section rule`));
  assert.doesNotMatch(explained.additionalContext, /本次挂载/);
  const suiteFile = path.join(dataDir, "recall-suite.json");
  fs.writeFileSync(suiteFile, JSON.stringify({ cases: [{ id: "ui", prompt: "修复 UI 并做 浏览器验证", expectedCards: [cardId] }] }), "utf8");
  const evalReport = json(run(["eval", "recall", "--suite", suiteFile, "--use-current-library", "--data-dir", dataDir, "--json"]));
  assert.equal(evalReport.ok, true);
  assert.equal(evalReport.metrics.recallAtK, 1);
  const beforeReport = path.join(dataDir, "before-report.json");
  const afterReport = path.join(dataDir, "after-report.json");
  fs.writeFileSync(beforeReport, JSON.stringify(evalReport), "utf8");
  fs.writeFileSync(afterReport, JSON.stringify(evalReport), "utf8");
  const compare = json(run(["eval", "recall", "--compare", beforeReport, afterReport, "--data-dir", dataDir, "--json"]));
  assert.equal(compare.ok, true);
  assert.equal(compare.metrics.recallAtK.delta, 0);
  const hook = json(run(["hook", "run", "--data-dir", dataDir, "--json"], { input: JSON.stringify({ prompt: "修复 UI 并做 浏览器验证", session_id: "s1", turn_id: "t1" }) }));
  assert.ok(hook.hookSpecificOutput.additionalContext.includes("UI browser validation"));
  const stats = json(run(["stats", "--data-dir", dataDir, "--json"]));
  assert.equal(stats.cardRecallCount[cardId], 1);
  assert.equal(json(run(["doctor", "--data-dir", dataDir, "--json"])).ok, true);
});

test("source user-index builds searchable Codex and Claude user evidence", () => {
  const dataDir = tmpDir("user-index");
  const built = json(run([
    "source", "user-index", "build",
    "--provider", "all",
    "--codex-sessions", path.join(root, "tests", "fixtures", "codex"),
    "--claude-sessions", path.join(root, "tests", "fixtures", "claude"),
    "--data-dir", dataDir,
    "--json",
  ]));
  assert.equal(built.command, "source.user-index.build");
  assert.equal(built.ephemeral, true);
  assert.equal(built.messages, 4);
  assert.equal(fs.existsSync(built.indexPath), true);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(built.indexPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(built.indexPath)).mode & 0o777, 0o700);
  }

  const codexSearch = json(run([
    "source", "user-index", "search", "浏览器验证",
    "--index", built.indexPath,
    "--json",
  ]));
  assert.equal(codexSearch.hits.length, 1);
  assert.equal(codexSearch.hits[0].provider, "codex");

  const claudeSearch = json(run([
    "source", "user-index", "search", "Claude 一等来源",
    "--index", built.indexPath,
    "--json",
  ]));
  assert.equal(claudeSearch.hits.length, 1);
  assert.equal(claudeSearch.hits[0].provider, "claude");

  const context = json(run([
    "source", "user-index", "show", claudeSearch.hits[0].id,
    "--index", built.indexPath,
    "--context", "1",
    "--json",
  ]));
  assert.equal(context.hit.provider, "claude");
  assert.equal(context.context.some((message) => message.isHit && message.role === "user"), true);
  assert.equal(context.context.some((message) => message.role === "assistant"), true);

  const noiseSearch = json(run([
    "source", "user-index", "search", "System prompt should",
    "--index", built.indexPath,
    "--json",
  ]));
  assert.equal(noiseSearch.hits.length, 0);

  const staleIndexPath = path.join(dataDir, "stale-user-index.json");
  const staleIndex = JSON.parse(fs.readFileSync(built.indexPath, "utf8"));
  staleIndex.messages[0].line = 999;
  fs.writeFileSync(staleIndexPath, JSON.stringify(staleIndex), "utf8");
  const staleShow = run([
    "source", "user-index", "show", staleIndex.messages[0].id,
    "--index", staleIndexPath,
    "--json",
  ]);
  assert.notEqual(staleShow.status, 0);
  assert.match(staleShow.stdout, /no longer matches source context/);

  const invalidProvider = run([
    "source", "user-index", "build",
    "--provider", "copilot",
    "--data-dir", dataDir,
    "--json",
  ]);
  assert.notEqual(invalidProvider.status, 0);
  assert.match(invalidProvider.stdout, /unsupported user-index provider/);

  assert.equal(fs.existsSync(path.join(dataDir, "indexes", "sources.json")), false);
});

test("experience list reports invalid archived cards without crashing", () => {
  const dataDir = tmpDir("invalid-archived-list");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const archivedDir = path.join(dataDir, "experiences", "archived");
  fs.mkdirSync(archivedDir, { recursive: true });
  const invalidPath = path.join(archivedDir, "legacy-card.md");
  fs.writeFileSync(invalidPath, "---\nid: legacy-card\nstatus: archived\n---\n# Legacy\n", "utf8");

  const listed = json(run(["experience", "list", "--compact", "--data-dir", dataDir, "--json"]));
  assert.equal(listed.ok, false);
  assert.equal(listed.invalidCards.length, 1);
  assert.equal(listed.invalidCards[0].status, "archived");
  assert.equal(listed.invalidCards[0].path, invalidPath);
  assert.match(listed.invalidCards[0].message, /unsupported experience card schema/);
  assert.ok(listed.total > 0);

  const doctor = json(run(["doctor", "--data-dir", dataDir, "--json"]));
  assert.equal(doctor.ok, true, doctor.errors.join("\n"));
  assert.equal(doctor.checked.invalidCards, 1);
  assert.match(doctor.warnings.join("\n"), /archived card schema invalid/);
});

test("project library participates in CLI recall without writing project events", () => {
  const dataDir = tmpDir("project-recall-global");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const projectRoot = tmpDir("project-recall-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-recall" }), "utf8");

  const init = json(run(["project", "init", "--json"], { cwd: projectRoot }));
  const realProjectRoot = fs.realpathSync(projectRoot);
  assert.equal(init.projectRoot, realProjectRoot);
  assert.equal(init.projectLibrary, path.join(realProjectRoot, ".oh-my-experience"));
  const status = json(run(["project", "status", "--json"], { cwd: init.projectLibrary }));
  assert.equal(status.projectContext.root, realProjectRoot);
  assert.equal(status.exists, true);
  assert.equal(status.readable, true);
  assert.deepEqual(status.warnings, []);
  const retrospective = json(run(["reflect", "start", "--scope", "project", "--focus", "project library validation", "--json"], { cwd: projectRoot }));
  const candidatesFile = path.join(projectRoot, "project-candidates.json");
  fs.writeFileSync(candidatesFile, JSON.stringify({
    audit: completeAudit({
      focusLens: "project library validation",
      searchedSources: ["e2e project lifecycle"],
      evidenceClusters: ["project-scoped card created through the reflect lifecycle"],
    }),
    candidates: [currentCandidate({
      title: "Project CLI validation",
      category: "Project recall",
      summary: "Project-local cards should be recalled from the project library.",
      rule: "Use the project-local validation path before reporting done.",
      triggers: ["project library validation"],
      topics: ["project-library"],
      evidence: ["e2e project lifecycle"],
      risk: "high",
      recallPolicy: "must",
    })],
  }), "utf8");
  const added = json(run([
    "reflect",
    "candidates",
    retrospective.runId,
    "--scope",
    "project",
    "--from-file",
    candidatesFile,
    "--json",
  ], { cwd: projectRoot }));
  const candidateId = added.candidates[0].id;
  json(run(["reflect", "decide", retrospective.runId, candidateId, "--action", "approve", "--scope", "project", "--json"], { cwd: projectRoot }));
  const applied = json(run(["reflect", "apply", retrospective.runId, "--scope", "project", "--json"], { cwd: projectRoot }));
  const cardId = applied.drafts[0].id;
  json(run(["experience", "enable", cardId, "--scope", "project", "--json"], { cwd: projectRoot }));

  const eventPath = path.join(projectRoot, ".oh-my-experience", "events.jsonl");
  const eventsBeforeMatch = fs.existsSync(eventPath) ? fs.readFileSync(eventPath, "utf8") : "";
  const explained = json(run(["match", "project library validation", "--data-dir", dataDir, "--cwd", projectRoot, "--explain", "--json"]));
  assert.equal(explained.libraries.some((library) => library.scope === "project" && library.exists && library.readable), true);
  assert.equal(explained.matches[0].id, cardId);
  assert.equal(explained.matches[0].card.libraryScope, "project");
  assert.match(explained.additionalContext, new RegExp(`ome experience show ${cardId} --scope project --section rule`));
  const show = run(["experience", "show", cardId, "--scope", "project", "--section", "rule"], { cwd: projectRoot });
  assert.equal(show.status, 0, `${show.stderr}\n${show.stdout}`);
  assert.match(show.stdout, /project-local validation path/);
  const eventsAfterMatch = fs.existsSync(eventPath) ? fs.readFileSync(eventPath, "utf8") : "";
  assert.equal(eventsAfterMatch, eventsBeforeMatch);
});

test("project status reports invalid project cards", () => {
  const projectRoot = tmpDir("project-status-invalid-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-status-invalid" }), "utf8");
  json(run(["project", "init", "--json"], { cwd: projectRoot }));
  const invalidPath = path.join(projectRoot, ".oh-my-experience", "experiences", "active", "legacy-card.md");
  fs.writeFileSync(invalidPath, "---\nid: legacy-card\nstatus: active\n---\n# Legacy\n", "utf8");

  const status = json(run(["project", "status", "--json"], { cwd: projectRoot }));
  assert.equal(status.ok, false);
  assert.equal(status.invalidCards.length, 1);
  assert.equal(fs.realpathSync(status.invalidCards[0].path), fs.realpathSync(invalidPath));
  assert.match(status.invalidCards[0].message, /unsupported experience card schema/);
});

test("experience migrate-legacy converts old project cards after dry-run preview", () => {
  const projectRoot = tmpDir("project-migrate-legacy-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-migrate-legacy" }), "utf8");
  json(run(["project", "init", "--json"], { cwd: projectRoot }));
  const legacyPath = path.join(projectRoot, ".oh-my-experience", "experiences", "active", "legacy-card.md");
  fs.writeFileSync(legacyPath, [
    "---",
    "id: legacy-card",
    "status: active",
    "title: Legacy Card",
    "category: Test",
    "summary: Legacy cards need explicit migration.",
    "rule: Migrate legacy cards through the CLI.",
    "triggers:",
    "  - legacy migration",
    "topics:",
    "  - migration",
    "---",
    "# Legacy Card",
    "",
  ].join("\n"), "utf8");

  const preview = json(run(["experience", "migrate-legacy", "--scope", "project", "--dry-run", "--json"], { cwd: projectRoot }));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.migrated.length, 1);
  assert.equal(fs.readFileSync(legacyPath, "utf8").includes("schema: ome-card"), false);

  const migrated = json(run(["experience", "migrate-legacy", "--scope", "project", "--json"], { cwd: projectRoot }));
  assert.equal(migrated.dryRun, false);
  assert.equal(migrated.backup, false);
  assert.deepEqual(migrated.backups, []);
  assert.equal(migrated.migrated.length, 1);
  assert.equal(fs.readFileSync(legacyPath, "utf8").includes("schema: ome-card"), true);
  const status = json(run(["project", "status", "--json"], { cwd: projectRoot }));
  assert.equal(status.ok, true);
  assert.equal(status.invalidCards.length, 0);
});

test("match skips invalid project library and keeps global recall usable", () => {
  const dataDir = tmpDir("project-invalid-match");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const projectRoot = tmpDir("project-invalid-match-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-invalid-match" }), "utf8");
  json(run(["project", "init", "--json"], { cwd: projectRoot }));
  fs.writeFileSync(
    path.join(projectRoot, ".oh-my-experience", "experiences", "active", "legacy-card.md"),
    "---\nid: legacy-card\nstatus: active\n---\n# Legacy\n",
    "utf8",
  );

  const matched = json(run(["match", "fix UI and validate in browser", "--data-dir", dataDir, "--cwd", projectRoot, "--json"]));
  assert.equal(matched.ok, true);
  assert.match(matched.warnings.join("\n"), /failed to read project experience library/);
  const projectLibrary = matched.libraries.find((library) => library.scope === "project");
  assert.ok(projectLibrary);
  assert.match(projectLibrary.warnings.join("\n"), /failed to read project experience library/);
});

test("doctor warns when installed agent skill differs from bundled skill", () => {
  const dataDir = tmpDir("doctor-skill-drift");
  const codexHome = tmpDir("doctor-skill-drift-codex-home");
  json(run(["init", "--data-dir", dataDir, "--codex-home", codexHome, "--json"]));
  const skillDir = path.join(codexHome, "skills", "oh-my-experience");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: oh-my-experience\n---\n# stale\n", "utf8");

  const doctor = json(run(["doctor", "--data-dir", dataDir, "--codex-home", codexHome, "--json"]));
  assert.equal(doctor.ok, true);
  const skill = doctor.checked.agentSkills.find((item) => item.provider === "codex");
  assert.equal(skill.inSync, false);
  assert.match(doctor.warnings.join("\n"), /installed Codex OME skill differs from bundled package/);
});

test("reflect candidates rejects missing source audit unless explicitly overridden", () => {
  const dataDir = tmpDir("audit-gate");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const retrospective = json(run(["reflect", "start", "--data-dir", dataDir, "--json"]));
  const candidatesFile = path.join(dataDir, "auditless-candidates.json");
  fs.writeFileSync(candidatesFile, JSON.stringify({
    candidates: [currentCandidate({
      title: "Auditless candidate",
      summary: "This candidate has no source audit.",
      rule: "It should not pass silently.",
      triggers: ["retrospective"],
      topics: ["audit"],
    })],
  }), "utf8");
  const rejected = run(["reflect", "candidates", retrospective.runId, "--from-file", candidatesFile, "--data-dir", dataDir, "--json"]);
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stderr}\n${rejected.stdout}`, /retrospective source audit is required/);
  const accepted = json(run([
    "reflect",
    "candidates",
    retrospective.runId,
    "--from-file",
    candidatesFile,
    "--allow-incomplete-audit",
    "--incomplete-audit-reason",
    "test override",
    "--data-dir",
    dataDir,
    "--json",
  ]));
  assert.equal(accepted.candidates.length, 1);
  assert.match(fs.readFileSync(accepted.reviewFile, "utf8"), /审计：不完整：test override/);
});

test("retrospective run creation rejects session-scoped CLI design", () => {
  const dataDir = tmpDir("retrospective-no-session");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const result = run(["reflect", "start", "--from-session", "abc123", "--data-dir", dataDir, "--json"]);
  assert.notEqual(result.status, 0);
  const error = JSON.parse(result.stdout);
  assert.match(error.error.message, /does not accept --from-session/);
});

test("reflect run creation uses the progressive reflect entrypoint", () => {
  for (const command of ["review", "retrospective", "prepare"]) {
    const result = run([command, "--json"]);
    assert.notEqual(result.status, 0, command);
    const error = JSON.parse(result.stdout);
    assert.match(error.error.message, new RegExp(`unknown command: ${command}`));
  }

  const dataDir = tmpDir("reflect-start");
  const bareReflect = json(run(["reflect", "--data-dir", dataDir, "--json"]));
  assert.match(bareReflect.runId, /manual$/);
  const explicitStart = json(run(["reflect", "start", "--data-dir", dataDir, "--json"]));
  assert.match(explicitStart.runId, /manual$/);
});

test("subcommand help is read-only and never initializes real state", () => {
  const dataDir = path.join(tmpDir("help-readonly"), "data");
  const localConfigHome = tmpDir("help-config-home");
  const localCodexHome = tmpDir("help-codex-home");
  const result = run(["init", "--help", "--data-dir", dataDir], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
    },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /ome init/);
  assert.match(result.stdout, /ome reflect start/);
  assert.match(result.stdout, /ome reflect list\|show\|add\|candidates\|decide\|apply\|resume/);
  assert.doesNotMatch(result.stdout, /ome prepare/);
  assert.doesNotMatch(result.stdout, /ome retrospective/);
  assert.equal(fs.existsSync(dataDir), false);
  assert.equal(fs.existsSync(path.join(localConfigHome, "config.json")), false);
  assert.equal(fs.existsSync(path.join(localCodexHome, "hooks.json")), false);
});

test("version command identifies the active binary", () => {
  const text = run(["version"]);
  assert.equal(text.status, 0, `${text.stderr}\n${text.stdout}`);
  assert.match(text.stdout.trim(), /^oh-my-experience \d+\.\d+\.\d+/);
  const short = run(["-v"]);
  assert.equal(short.status, 0, `${short.stderr}\n${short.stdout}`);
  assert.match(short.stdout.trim(), /^oh-my-experience \d+\.\d+\.\d+/);
  const machine = json(run(["version", "--json"]));
  assert.equal(machine.name, "oh-my-experience");
  assert.match(machine.version, /^\d+\.\d+\.\d+/);
});

test("CLI errors stay actionable and machine-readable", () => {
  const human = run(["mach"]);
  assert.notEqual(human.status, 0);
  assert.match(human.stderr, /unknown command: mach/);
  assert.doesNotMatch(human.stderr, /ome match/);
  assert.match(human.stderr, /ome help/);

  const hidden = run(["retrospectiv"]);
  assert.notEqual(hidden.status, 0);
  assert.doesNotMatch(hidden.stderr, /ome create-reflect/);
  assert.doesNotMatch(hidden.stderr, /ome reflect/);
  assert.doesNotMatch(hidden.stderr, /ome prepare/);
  assert.doesNotMatch(hidden.stderr, /ome retrospective/);

  const machine = run(["mach", "--json"]);
  assert.notEqual(machine.status, 0);
  assert.equal(machine.stderr.trim(), "");
  const parsed = JSON.parse(machine.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error.message, /unknown command: mach/);

  const formatJson = run(["mach", "--format", "json"]);
  assert.notEqual(formatJson.status, 0);
  assert.equal(JSON.parse(formatJson.stdout).ok, false);
});

test("init rejects removed language flags instead of keeping compatibility shims", () => {
  const dataDir = tmpDir("removed-language-flag");
  const result = run(["init", "--data-dir", dataDir, "--locale-ui", "zh-CN", "--json"]);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error.message, /unknown init option/);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), false);
});

test("init short yes flag skips prompts for scripted setup", () => {
  const dataDir = path.join(tmpDir("short-yes"), "library");
  const localConfigHome = tmpDir("short-yes-config-home");
  const localCodexHome = tmpDir("short-yes-codex-home");
  const result = run(["init", "-y", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      LANG: "zh_CN.UTF-8",
      NO_COLOR: "1",
    },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Setup complete/);
  assert.equal(result.stdout.includes("OH MY EXPERIENCE"), false);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), true);
  assert.equal(fs.existsSync(path.join(localCodexHome, "skills", "oh-my-experience", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(localCodexHome, "skills", "oh-my-experience", ".ome-skill.json")), true);
});

test("init no-hook does not claim automatic recall is connected", () => {
  const dataDir = path.join(tmpDir("no-hook-next-step"), "library");
  const jsonResult = json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  assert.equal(jsonResult.hooks.skipped, true);
  assert.equal(jsonResult.skills.length, 0);
  assert.match(jsonResult.nextStep, /Library is ready/);
  assert.doesNotMatch(jsonResult.nextStep, /installed hook will recall/);

  const human = run(["init", "--data-dir", path.join(tmpDir("no-hook-human"), "library"), "--no-hook"], {
    env: { NO_COLOR: "1" },
  });
  assert.equal(human.status, 0, `${human.stderr}\n${human.stdout}`);
  assert.match(human.stdout, /Agent recall: disabled/);
  assert.match(human.stdout, /prompt-time recall is not connected to an agent yet/);
  assert.doesNotMatch(human.stdout, /installed hook will recall/);
});

test("init reset-config overwrites setup files but keeps experience assets", () => {
  const dataDir = tmpDir("cli-reset-config");
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  const configPath = path.join(dataDir, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  fs.writeFileSync(configPath, JSON.stringify({
    ...config,
    privacy: { ...config.privacy, saveRawPrompt: true },
    retrieval: { ...config.retrieval, maxCards: 99 },
  }, null, 2), "utf8");
  const runDir = path.join(dataDir, "retrospectives", "keep-run");
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "candidates.json"), JSON.stringify({ candidates: [] }), "utf8");
  const sourceIndexBefore = fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8");
  const cardsBefore = fs.readdirSync(path.join(dataDir, "experiences", "active")).sort();

  const reset = json(run(["init", "--data-dir", dataDir, "--no-hook", "--reset-config", "--json"]));

  assert.equal(reset.plan.resetConfig, true);
  const nextConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(nextConfig.privacy.saveRawPrompt, false);
  assert.equal(nextConfig.retrieval.maxCards, 4);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "experiences", "active")).sort(), cardsBefore);
  assert.equal(fs.existsSync(path.join(runDir, "candidates.json")), true);
  assert.equal(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8"), sourceIndexBefore);
});

test("interactive init exposes first-run choices without migration prompts", () => {
  const dataDir = path.join(tmpDir("interactive-init"), "library");
  const localConfigHome = tmpDir("interactive-config-home");
  const localCodexHome = tmpDir("interactive-codex-home");
  const emptyPath = tmpDir("empty-path");
  const result = run(["init", "--interactive", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      LANG: "zh_CN.UTF-8",
      PATH: emptyPath,
      NO_COLOR: "1",
    },
    input: "\n\ny\n",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /____  __  ___ ______/);
  assert.match(result.stdout, /Oh My Experience v\d+\.\d+\.\d+/);
  assert.match(result.stdout, /Stop teaching your agent the same lesson twice/);
  assert.match(result.stdout, /Local-first · Draft approval-first · Prompt-time recall/);
  assert.match(result.stdout, /Enter accepts path defaults · confirmation requires y\/n · Ctrl\+C cancels/);
  assert.match(result.stdout, /Which agents should OME connect/);
  assert.match(result.stdout, /Codex is the best-tested path today/);
  assert.match(result.stdout, /Choices: codex, claude, all, none/);
  assert.match(result.stdout, /Setup summary/);
  assert.match(result.stdout, /Recall is ready for your next agent task/);
  assert.match(result.stdout, /Send this to your selected agent so the hook can recall relevant experience automatically/);
  assert.match(result.stdout, /Copy this task into your selected agent/);
  assert.match(result.stdout, /```text/);
  assert.match(result.stdout, /\/tmp/);
  assert.match(result.stdout, /ome-todo-demo/);
  assert.match(result.stdout, /Todo app/);
  assert.match(result.stdout, /Create a goal and start now/);
  assert.match(result.stdout, /localStorage/);
  assert.match(result.stdout, /real browser entry/);
  assert.match(result.stdout, /scan this full run/);
  assert.match(result.stdout, /review the generated drafts/);
  assert.match(result.stdout, /only add approved drafts/);
  assert.match(result.stdout, /```/);
  assert.match(result.stdout, /Suggestions:/);
  assert.match(result.stdout, /Turn real corrections into cards/);
  assert.match(result.stdout, /first-card\.md/);
  assert.match(result.stdout, /Connect more agent histories with Spool/);
  assert.match(result.stdout, /OME recall works without it/);
  assert.match(result.stdout, /github\.com\/rennzhang\/oh-my-experience\/blob\/main\/docs\/guides\/source-scan\.md/);
  assert.match(result.stdout, /Spool is not installed/);
  assert.match(result.stdout, /OME is ready without it/);
  assert.match(result.stdout, /npm install -g @spool-lab\/cli/);
  assert.match(result.stdout, /OME will not install Spool during first setup/);
  assert.doesNotMatch(result.stdout, /Step Optional/);
  assert.doesNotMatch(result.stdout, /Install Spool CLI now/);
  assert.doesNotMatch(result.stdout, /Skipped Spool; OME core recall still works/);
  assert.doesNotMatch(result.stdout, /Create a scheduled retrospective task/);
  assert.doesNotMatch(result.stdout, /scheduled-retrospectives\.md/);
  assert.match(result.stdout, /Step 1\/2/);
  assert.match(result.stdout, /Step 2\/2/);
  assert.match(result.stdout, /Where should the experience library live/);
  assert.match(result.stdout, /local OME directory/);
  assert.match(result.stdout, /UserPromptSubmit hook/);
  assert.match(result.stdout, /hooks\.json/);
  assert.match(result.stdout, /Codex skill/);
  assert.match(result.stdout, /Codex App may ask you to trust the new UserPromptSubmit hook/);
  assert.match(result.stdout, /Continue\?/);
  assert.match(result.stdout, /install the selected recall hooks/);
  assert.match(result.stdout, /Library ready:\s+/);
  assert.match(result.stdout, /Config file:\s+/);
  assert.match(result.stdout, /Recall enabled:\s+Codex/);
  assert.equal(result.stdout.includes("Plan"), false);
  assert.equal(result.stdout.includes("ome doctor"), false);
  assert.equal(result.stdout.includes("ome serve"), false);
  assert.equal(result.stdout.includes("Copy the prompt above"), false);
  assert.equal(result.stdout.includes("Use the oh-my-experience skill to run a retrospective over my recent AI coding sessions"), false);
  assert.equal(result.stdout.includes("Create candidates only; do not activate cards automatically"), false);
  assert.equal(result.stdout.includes("mistakes that should not repeat"), false);
  assert.equal(result.stdout.includes("UI language"), false);
  assert.equal(result.stdout.includes("界面语言"), false);
  assert.equal(result.stdout.includes("经验语言"), false);
  assert.equal(result.stdout.includes("注入给 Agent 的提示语言"), false);
  assert.equal(result.stdout.includes("默认行为:"), false);
  assert.equal(result.stdout.includes("流程:"), false);
  assert.equal(result.stdout.includes("迁移"), false);
  assert.equal(result.stdout.includes("项目级"), false);
  assert.equal(result.stdout.includes("Spool CLI install failed"), false);

  const config = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8"));
  assert.equal("locale" in config, false);
  assert.equal(config.sources.spool.mode, "off");
  const activeCards = fs.readdirSync(path.join(dataDir, "experiences", "active")).filter((file) => file.endsWith(".md"));
  assert.ok(activeCards.length >= 3);
  const hooks = JSON.parse(fs.readFileSync(path.join(localCodexHome, "hooks.json"), "utf8"));
  assert.match(hooks.hooks.UserPromptSubmit[0].hooks[0].command, /ome hook run/);
  assert.equal(fs.existsSync(path.join(localCodexHome, "skills", "oh-my-experience", "SKILL.md")), true);
});

test("interactive init can enable detected Spool CLI without installing it", () => {
  const dataDir = path.join(tmpDir("interactive-spool-detected"), "library");
  const localConfigHome = tmpDir("interactive-spool-detected-config-home");
  const localCodexHome = tmpDir("interactive-spool-detected-codex-home");
  const binDir = tmpDir("interactive-spool-detected-bin");
  const spoolPath = path.join(binDir, "spool");
  fs.writeFileSync(spoolPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "spool-test 9.9.9"
  exit 0
fi
exit 1
`, "utf8");
  fs.chmodSync(spoolPath, 0o755);

  const result = run(["init", "--interactive", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      PATH: binDir,
      NO_COLOR: "1",
    },
    input: "\n\ny\ny\n",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Spool CLI detected. Enable Spool sources/);
  assert.match(result.stdout, /Detected Spool spool-test 9\.9\.9/);
  assert.match(result.stdout, /This only updates OME source config/);
  assert.match(result.stdout, /Spool sources enabled/);

  const config = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8"));
  assert.equal(config.sources.spool.mode, "enabled");
});

test("interactive init requires explicit confirmation before writing", () => {
  const dataDir = path.join(tmpDir("interactive-explicit-confirm"), "library");
  const localConfigHome = tmpDir("interactive-explicit-confirm-config-home");
  const localCodexHome = tmpDir("interactive-explicit-confirm-codex-home");
  const result = run(["init", "--interactive", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      LANG: "en_US.UTF-8",
      PATH: tmpDir("interactive-explicit-confirm-empty-path"),
      NO_COLOR: "1",
    },
    input: "\n\n",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /\[y\/n\]/);
  assert.match(result.stdout, /Enter y or n/);
  assert.match(result.stdout, /Cancelled. Nothing was written/);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), false);
  assert.equal(fs.existsSync(path.join(localCodexHome, "hooks.json")), false);
});

test("forced interactive init without a terminal or answers does not write state", () => {
  const dataDir = path.join(tmpDir("interactive-empty"), "library");
  const localConfigHome = tmpDir("interactive-empty-config-home");
  const localCodexHome = tmpDir("interactive-empty-codex-home");
  const result = run(["init", "--interactive", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      LANG: "zh_CN.UTF-8",
      NO_COLOR: "1",
    },
    input: "",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /需要真实终端|requires a real terminal/);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), false);
  assert.equal(fs.existsSync(path.join(localConfigHome, "config.json")), false);
  assert.equal(fs.existsSync(path.join(localCodexHome, "hooks.json")), false);
});

test("interactive init reuses existing config as defaults", () => {
  const dataDir = path.join(tmpDir("interactive-existing"), "library");
  const localConfigHome = tmpDir("interactive-existing-config-home");
  const localCodexHome = tmpDir("interactive-existing-codex-home");
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      NO_COLOR: "1",
    },
  }));
  const result = run(["init", "--interactive", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      LANG: "zh_CN.UTF-8",
      PATH: tmpDir("existing-empty-path"),
      NO_COLOR: "1",
    },
    input: "\n\ny\n",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /reconfigure existing library/);
  assert.match(result.stdout, /Default path: .*interactive-existing/);
  const config = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8"));
  assert.equal("locale" in config, false);
  assert.equal(config.hooks.providers.codex.enabled, true);
});

test("default CLI output is human-readable and JSON is opt-in", () => {
  const dataDir = path.join(tmpDir("human-output"), "library");
  const localConfigHome = tmpDir("human-output-config-home");
  const localCodexHome = tmpDir("human-output-codex-home");
  const result = run(["init", "--data-dir", dataDir, "--codex-home", localCodexHome], {
    env: {
      OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome,
      CODEX_HOME: localCodexHome,
      LANG: "zh_CN.UTF-8",
      NO_COLOR: "1",
    },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Setup complete/);
  assert.match(result.stdout, /Library:/);
  assert.match(result.stdout, /Use --json for full machine-readable output/);
  assert.doesNotThrow(() => {
    assert.throws(() => JSON.parse(result.stdout));
  });

  const doctor = run(["doctor", "--data-dir", dataDir], {
    env: { OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome, CODEX_HOME: localCodexHome, LANG: "zh_CN.UTF-8", NO_COLOR: "1" },
  });
  assert.equal(doctor.status, 0, `${doctor.stderr}\n${doctor.stdout}`);
  assert.match(doctor.stdout, /Health check/);
  assert.throws(() => JSON.parse(doctor.stdout));

  const machine = json(run(["doctor", "--data-dir", dataDir, "--json"], {
    env: { OH_MY_EXPERIENCE_CONFIG_HOME: localConfigHome, CODEX_HOME: localCodexHome },
  }));
  assert.equal(machine.ok, true);
});

test("human CLI stays English in non-English locales", () => {
  const english = run(["help"], { env: { LANG: "zh_CN.UTF-8", NO_COLOR: "1" } });
  assert.equal(english.status, 0, `${english.stderr}\n${english.stdout}`);
  assert.match(english.stdout, /Common path:/);
  assert.equal(english.stdout.includes("常用路径:"), false);
});

test("CLI recall eval defaults to isolated fixture data", () => {
  const dataDir = tmpDir("eval-isolated");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const suite = path.join(root, "tests", "fixtures", "eval", "core.json");
  const beforeIndex = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "experiences.json"), "utf8"));
  const report = json(run(["eval", "recall", "--suite", suite, "--limit", "3", "--data-dir", dataDir, "--json"]));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "eval", "core.cards.json"), "utf8"));
  assert.equal(report.isolated, true);
  assert.equal(report.cardFixtureCount, fixture.experiences.length);
  assert.equal(report.ok, true);
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "experiences.json"), "utf8"));
  assert.equal(index.experiences.length, beforeIndex.experiences.length);
});

test("codex importer parses real response_item content arrays", () => {
  const dataDir = tmpDir("codex-real");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const result = json(run(["source", "scan", "codex", "--sessions", path.join(root, "tests", "fixtures", "codex"), "--data-dir", dataDir, "--json"]));
  assert.equal(result.failed.length, 0);
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8")).sessions;
  const parsed = sessions.find((session) => session.messageCount >= 2);
  assert.ok(parsed, "array content fixture should be indexed without raw summary");
  assert.equal(parsed.summary, "");
  assert.equal("messages" in parsed, false);
  assert.equal(parsed.sessionFile, "");
  assert.equal(parsed.materialized, false);
  assert.ok(parsed.messageCount >= 2);
});

test("source status and clean expose and clean source summaries", () => {
  const dataDir = tmpDir("source-inspect-compact");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const sourceIndex = path.join(dataDir, "indexes", "sources.json");
  fs.writeFileSync(sourceIndex, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    storage: "sources",
    sessions: [{
      id: "source-1",
      provider: "codex",
      sourcePath: "/tmp/source.jsonl",
      startedAt: null,
      cwd: null,
      summary: "raw summary",
      metadataHash: "hash",
      messageCount: 2,
      materialized: false,
      sessionFile: "",
    }],
  }, null, 2), "utf8");

  const status = json(run(["source", "status", "--data-dir", dataDir, "--json"]));
  assert.equal(status.sourceIndex.sessions, 1);
  assert.equal(status.sourceIndex.summaryRecords, 1);
  const dryRun = json(run(["source", "clean", "--data-dir", dataDir, "--json"]));
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.compact.dropSummaries, true);
  assert.equal(JSON.parse(fs.readFileSync(sourceIndex, "utf8")).sessions[0].summary, "raw summary");
  const applied = json(run(["source", "clean", "--yes", "--data-dir", dataDir, "--json"]));
  assert.equal(applied.dryRun, false);
  assert.equal(applied.compact.dropSummaries, true);
  assert.equal(JSON.parse(fs.readFileSync(sourceIndex, "utf8")).sessions[0].summary, "");
});

test("init installs and uninstall removes global hook without project setup", () => {
  const dataDir = path.join(tmpDir("hook weird"), "data dir $(bad)");
  const localCodexHome = tmpDir("codex-home");
  fs.mkdirSync(localCodexHome, { recursive: true });
  fs.writeFileSync(path.join(localCodexHome, "hooks.json"), JSON.stringify({
    hooks: {
      UserPromptSubmit: [{
        hooks: [
          { type: "command", command: "ome hook run --data-dir /tmp/old-ome-one", timeout: 5 },
          { type: "command", command: "ome hook run --data-dir /tmp/old-ome-two", timeout: 5 },
          { type: "command", command: "echo keep-me", timeout: 5 },
        ],
      }],
    },
  }, null, 2));
  const dryRun = json(run(["init", "--codex-home", localCodexHome, "--dry-run", "--data-dir", dataDir, "--json"]));
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.hooks[0].provider, "codex");
  assert.equal(dryRun.hooks[0].installTarget, "global");
  assert.equal(dryRun.skills[0].dryRun, true);
  const installed = json(run(["init", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(installed.hooks[0].installed, true);
  assert.equal(installed.hooks[0].installTarget, "global");
  const hooksJson = JSON.parse(fs.readFileSync(path.join(localCodexHome, "hooks.json"), "utf8"));
  const commands = hooksJson.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks).map((hook) => hook.command);
  assert.equal(commands.filter((command) => command.includes("ome hook run")).length, 1);
  assert.equal(commands.includes("echo keep-me"), true);
  assert.match(commands.find((command) => command.includes("ome hook run")), /--json/);
  assert.match(commands.find((command) => command.includes("ome hook run")), /--data-dir '.*\$\(bad\)'/);
  const status = json(run(["hook", "status", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(status.installed, true);
  json(run(["uninstall", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  const uninstalledHooksJson = JSON.parse(fs.readFileSync(path.join(localCodexHome, "hooks.json"), "utf8"));
  const remainingCommands = uninstalledHooksJson.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks).map((hook) => hook.command);
  assert.equal(remainingCommands.some((command) => command.includes("ome hook run")), false);
  assert.equal(remainingCommands.includes("echo keep-me"), true);
  const after = json(run(["hook", "status", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(after.installed, false);
});

test("hook status recognizes existing OME hook even when command options drift", () => {
  const dataDir = path.join(tmpDir("hook-current"), "data");
  const localCodexHome = tmpDir("codex-home-existing-hook");
  fs.mkdirSync(localCodexHome, { recursive: true });
  const existingCommand = "ome hook run --json --data-dir '/tmp/previous ome data'";
  fs.writeFileSync(path.join(localCodexHome, "hooks.json"), JSON.stringify({
    hooks: {
      UserPromptSubmit: [{
        hooks: [
          { type: "command", command: existingCommand, timeout: 5 },
          { type: "command", command: "echo keep-me", timeout: 5 },
        ],
      }],
    },
  }, null, 2));

  const status = json(run(["hook", "status", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(status.installed, true);
  assert.equal(status.installedCommand, existingCommand);
  assert.equal(status.matchesExpectedCommand, false);
});

test("skill lifecycle protects user-owned targets", () => {
  const localCodexHome = tmpDir("skill-codex-home");
  const dataDir = tmpDir("skill-data");
  const skillDir = path.join(localCodexHome, "skills", "oh-my-experience");
  const installed = json(run(["init", "--data-dir", dataDir, "--codex-home", localCodexHome, "--no-hook", "--json"]));
  assert.equal(installed.skills.length, 0);
  const installedWithHook = json(run(["init", "--data-dir", dataDir, "--codex-home", localCodexHome, "--json"]));
  assert.equal(installedWithHook.skills[0].installed, true);
  assert.equal(installedWithHook.skills[0].owned, true);
  assert.equal(fs.existsSync(path.join(skillDir, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, ".ome-skill.json")), true);
  const removed = json(run(["uninstall", "--data-dir", dataDir, "--codex-home", localCodexHome, "--keep-hooks", "--json"]));
  assert.equal(removed.skills[0].uninstalled, true);
  assert.equal(fs.existsSync(skillDir), false);

  const conflictHome = tmpDir("skill-conflict-home");
  const conflictDataDir = tmpDir("skill-conflict-data");
  const conflictDir = path.join(conflictHome, "skills", "oh-my-experience");
  fs.mkdirSync(conflictDir, { recursive: true });
  fs.writeFileSync(path.join(conflictDir, "SKILL.md"), "---\nname: custom-skill\n---\n", "utf8");
  const conflict = run(["init", "--data-dir", conflictDataDir, "--codex-home", conflictHome, "--no-hook", "--json"]);
  assert.equal(conflict.status, 0);
  const conflictWithHook = run(["init", "--data-dir", conflictDataDir, "--codex-home", conflictHome, "--json"]);
  assert.notEqual(conflictWithHook.status, 0);
  assert.match(JSON.parse(conflictWithHook.stdout).error.message, /not owned by OME/);
  assert.equal(fs.readFileSync(path.join(conflictDir, "SKILL.md"), "utf8").includes("custom-skill"), true);
  const forced = json(run(["init", "--data-dir", conflictDataDir, "--codex-home", conflictHome, "--no-hook", "--force", "--json"]));
  assert.equal(forced.skills.length, 0);
  const forcedWithHook = json(run(["init", "--data-dir", conflictDataDir, "--codex-home", conflictHome, "--force", "--json"]));
  assert.equal(forcedWithHook.skills[0].installed, true);
  assert.equal(fs.existsSync(path.join(conflictDir, ".ome-skill.json")), true);
});

test("uninstall removes local entry points and keeps library unless explicitly deleted", () => {
  const dataDir = path.join(tmpDir("uninstall-flow"), "library");
  const localCodexHome = tmpDir("uninstall-codex-home");
  json(run(["init", "--data-dir", dataDir, "--codex-home", localCodexHome, "--json"]));
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), true);
  assert.equal(fs.existsSync(path.join(localCodexHome, "hooks.json")), true);
  assert.equal(fs.existsSync(path.join(localCodexHome, "skills", "oh-my-experience", "SKILL.md")), true);

  const result = json(run(["uninstall", "--data-dir", dataDir, "--codex-home", localCodexHome, "--json"]));
  assert.equal(result.skills[0].uninstalled, true);
  assert.equal(result.library.kept, true);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), true);
  assert.equal(fs.existsSync(path.join(localCodexHome, "skills", "oh-my-experience")), false);
  const status = json(run(["hook", "status", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(status.installed, false);

  const blocked = run(["uninstall", "--delete-library", "--data-dir", dataDir, "--codex-home", localCodexHome, "--json"]);
  assert.notEqual(blocked.status, 0);
  assert.match(JSON.parse(blocked.stdout).error.message, /requires --yes or --force/);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json")), true);

  const deleted = json(run(["uninstall", "--delete-library", "--yes", "--data-dir", dataDir, "--codex-home", localCodexHome, "--json"]));
  assert.equal(deleted.library.deleted, true);
  assert.equal(fs.existsSync(dataDir), false);
});

test("init installs claude hook through the same runtime command", () => {
  const dataDir = tmpDir("claude-hook");
  const claudeHome = tmpDir("claude-home");
  const localCodexHome = tmpDir("claude-skill-home");
  fs.mkdirSync(claudeHome, { recursive: true });
  fs.writeFileSync(path.join(claudeHome, "settings.json"), JSON.stringify({
    hooks: {
      UserPromptSubmit: [{
        hooks: [
          { type: "command", command: "ome hook run --data-dir /tmp/old-claude-ome", timeout: 5 },
          { type: "command", command: "echo keep-me", timeout: 5 },
        ],
      }],
    },
  }, null, 2));
  const installed = json(run(["init", "--provider", "claude", "--claude-home", claudeHome, "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(installed.hooks[0].provider, "claude");
  assert.equal(installed.hooks[0].installed, true);
  assert.equal(installed.hooks[0].installTarget, "global");
  assert.equal(installed.skills[0].provider, "claude");
  assert.equal(installed.skills[0].installed, true);
  assert.equal(fs.existsSync(path.join(claudeHome, "skills", "oh-my-experience", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(claudeHome, "skills", "oh-my-experience", ".ome-skill.json")), true);
  assert.equal(fs.existsSync(path.join(localCodexHome, "skills", "oh-my-experience")), false);
  const settings = JSON.parse(fs.readFileSync(path.join(claudeHome, "settings.json"), "utf8"));
  const commands = settings.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks).map((hook) => hook.command);
  assert.equal(commands.filter((command) => command.includes("ome hook run")).length, 1);
  assert.equal(commands.includes("echo keep-me"), true);
  assert.match(commands.find((command) => command.includes("ome hook run")), /--json/);
  const doctor = json(run(["doctor", "--data-dir", dataDir, "--claude-home", claudeHome, "--json"]));
  assert.equal(doctor.ok, true, doctor.errors.join("\n"));
  assert.equal(doctor.checked.agentSkills[0].provider, "claude");
  assert.equal(doctor.checked.agentSkills[0].inSync, true);
});

test("init provider all installs hooks and skills for Codex and Claude", () => {
  const dataDir = tmpDir("all-provider-skills");
  const codexHome = tmpDir("all-provider-codex-home");
  const claudeHome = tmpDir("all-provider-claude-home");

  const installed = json(run(["init", "--provider", "all", "--data-dir", dataDir, "--codex-home", codexHome, "--claude-home", claudeHome, "--json"]));
  assert.deepEqual(installed.hooks.map((hook) => hook.provider), ["codex", "claude"]);
  assert.deepEqual(installed.skills.map((skill) => skill.provider), ["codex", "claude"]);
  assert.equal(fs.existsSync(path.join(codexHome, "skills", "oh-my-experience", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(claudeHome, "skills", "oh-my-experience", "SKILL.md")), true);

  const doctor = json(run(["doctor", "--data-dir", dataDir, "--codex-home", codexHome, "--claude-home", claudeHome, "--json"]));
  assert.equal(doctor.ok, true, doctor.errors.join("\n"));
  assert.deepEqual(doctor.checked.agentSkills.map((skill) => skill.provider), ["codex", "claude"]);
  assert.deepEqual(doctor.checked.agentSkills.map((skill) => skill.inSync), [true, true]);

  const removed = json(run(["uninstall", "--provider", "all", "--data-dir", dataDir, "--codex-home", codexHome, "--claude-home", claudeHome, "--json"]));
  assert.deepEqual(removed.skills.map((skill) => skill.provider), ["codex", "claude"]);
  assert.deepEqual(removed.skills.map((skill) => skill.uninstalled), [true, true]);
  assert.equal(fs.existsSync(path.join(codexHome, "skills", "oh-my-experience")), false);
  assert.equal(fs.existsSync(path.join(claudeHome, "skills", "oh-my-experience")), false);
});

test("hook no-hit succeeds without additionalContext", () => {
  const dataDir = tmpDir("hook-no-hit");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const hook = json(run(["hook", "run", "--data-dir", dataDir, "--json"], { input: JSON.stringify({ prompt: "unrelated tiny prompt" }) }));
  assert.deepEqual(hook, {});
});

test("hook does not suppress OME product work prompts", () => {
  const dataDir = tmpDir("hook-ome-product-work");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const hit = json(run(["hook", "run", "--data-dir", dataDir, "--json"], {
    input: JSON.stringify({ prompt: "帮我优化 OME 召回引擎，要求高内聚低耦合，逻辑干净，不要历史包袱。" }),
  }));
  assert.ok(hit.hookSpecificOutput.additionalContext.includes("starter-code-kiss-root-cause"));

  const maintenance = json(run(["hook", "run", "--data-dir", dataDir, "--json"], {
    input: JSON.stringify({ prompt: "ome doctor --json" }),
  }));
  assert.deepEqual(maintenance, {});
});

test("hook run applies project scope from real cwd payload", () => {
  const dataDir = tmpDir("hook-project-context");
  const projectDir = tmpDir("project-context");
  const appDir = path.join(projectDir, "app");
  const otherDir = path.join(projectDir, "other");
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(otherDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "@eval/project" }), "utf8");
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  const retrospective = json(run(["reflect", "start", "--data-dir", dataDir, "--json"]));
  const candidate = json(run([
    "reflect", "add", retrospective.runId,
    "--title", "Project cwd browser card",
    "--category", "测试验收",
    "--summary", "Project-specific UI validation was missed.",
    "--rule", "Recall only inside the app module.",
    "--triggers", "project cwd browser",
    "--topics", "ui",
    "--scope-level", "project",
    "--project-key", "@eval/project",
    "--module-path", "app",
    "--allow-incomplete-audit",
    "--incomplete-audit-reason", "project scope fixture",
    "--data-dir", dataDir,
    "--json",
  ]));
  const candidateId = candidate.candidates[0].id;
  json(run(["reflect", "decide", retrospective.runId, candidateId, "--action", "approve", "--data-dir", dataDir, "--json"]));
  const applied = json(run(["reflect", "apply", retrospective.runId, "--data-dir", dataDir, "--json"]));
  const cardId = applied.drafts[0].id;
  json(run(["experience", "enable", cardId, "--data-dir", dataDir, "--json"]));
  const hit = json(run(["hook", "run", "--data-dir", dataDir, "--json"], {
    input: JSON.stringify({ prompt: "project cwd browser", cwd: appDir, session_id: "s1" }),
  }));
  assert.ok(hit.hookSpecificOutput.additionalContext.includes("Project cwd browser card"));
  assert.ok(hit.hookSpecificOutput.additionalContext.includes("**本次使用 N条 OME 经验卡：**"));
  assert.ok(!hit.hookSpecificOutput.additionalContext.includes("本次挂载"));
  assert.ok(hit.hookSpecificOutput.additionalContext.includes(`[Project cwd browser card](<${path.join(dataDir, "experiences", "active", `${cardId}.md`)}>)`));
  const miss = json(run(["hook", "run", "--data-dir", dataDir, "--json"], {
    input: JSON.stringify({ prompt: "project cwd browser", cwd: otherDir, session_id: "s2" }),
  }));
  assert.deepEqual(miss, {});
});

test("hook log does not persist raw prompt by default", () => {
  const dataDir = tmpDir("hook-privacy");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  json(run(["hook", "run", "--data-dir", dataDir, "--json"], { input: JSON.stringify({ prompt: "private raw prompt abc" }) }));
  const log = fs.readFileSync(path.join(dataDir, "events.jsonl"), "utf8");
  assert.equal(log.includes("private raw prompt abc"), false);
});

test("hook logs project library warnings without injecting them", () => {
  const dataDir = tmpDir("hook-project-warning");
  const projectRoot = tmpDir("hook-project-warning-root");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/hook-project-warning" }), "utf8");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  json(run(["project", "init", "--json"], { cwd: projectRoot }));
  fs.writeFileSync(
    path.join(projectRoot, ".oh-my-experience", "experiences", "active", "legacy-card.md"),
    "---\nid: legacy-card\nstatus: active\n---\n# Legacy\n",
    "utf8",
  );

  const hook = json(run(["hook", "run", "--data-dir", dataDir, "--json"], {
    input: JSON.stringify({ prompt: "unrelated prompt", cwd: projectRoot, session_id: "warning-session" }),
  }));
  assert.deepEqual(hook, {});
  const events = fs.readFileSync(path.join(dataDir, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const event = events.find((item) => item.sessionId === "warning-session");
  const projectLibrary = event.libraries.find((library) => library.scope === "project");
  assert.equal(projectLibrary.warningCount, 1);
  assert.match(projectLibrary.warningMessages.join("\n"), /failed to read project experience library/);
  assert.equal(projectLibrary.warningMessages.join("\n").includes(dataDir), false);
  assert.equal(projectLibrary.warningHashes.length, 1);
});

test("config can point to a custom data directory", () => {
  const dataDir = tmpDir("config-a");
  const nextDir = path.join(os.tmpdir(), `ome-e2e-config-b-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const retrospective = json(run(["reflect", "start", "--data-dir", dataDir, "--json"]));
  const candidatesFile = path.join(dataDir, "data-dir-candidates.json");
  fs.writeFileSync(candidatesFile, JSON.stringify({ audit: completeAudit(), candidates: [currentCandidate({ title: "Data directory card", summary: "P", rule: "C", triggers: ["switch config"], topics: ["config"], evidence: ["test"] })] }), "utf8");
  const candidates = json(run(["reflect", "candidates", retrospective.runId, "--from-file", candidatesFile, "--data-dir", dataDir, "--json"]));
  json(run(["reflect", "decide", retrospective.runId, candidates.candidates[0].id, "--action", "approve", "--data-dir", dataDir, "--json"]));
  const applied = json(run(["reflect", "apply", retrospective.runId, "--data-dir", dataDir, "--json"]));
  json(run(["experience", "enable", applied.drafts[0].id, "--data-dir", dataDir, "--json"]));
  const result = json(run(["config", "set", "dataDir", nextDir, "--data-dir", dataDir, "--json"]));
  assert.equal(result.changed, true);
  assert.equal(result.next, nextDir);
  assert.equal(json(run(["doctor", "--data-dir", nextDir, "--json"])).ok, true);
  assert.equal(json(run(["doctor", "--json"])).checked.dataDir, nextDir);
  assert.equal(json(run(["match", "switch config", "--data-dir", nextDir, "--json"])).matches.length, 1);
  const preview = json(run(["config", "preview", "privacy.saveRawPrompt", "true", "--data-dir", nextDir, "--json"]));
  assert.equal(preview.next, true);
  const privacy = json(run(["config", "set", "privacy.saveRawPrompt", "true", "--data-dir", nextDir, "--json"]));
  assert.equal(privacy.next, true);
  const occupied = tmpDir("config-occupied");
  fs.writeFileSync(path.join(occupied, "foreign.txt"), "do not mix", "utf8");
  const failed = run(["config", "set", "dataDir", occupied, "--data-dir", nextDir, "--json"]);
  assert.notEqual(failed.status, 0);
  assert.equal(fs.existsSync(path.join(occupied, "foreign.txt")), true);
  const nested = path.join(nextDir, "nested");
  const nestedFailed = run(["config", "set", "dataDir", nested, "--data-dir", nextDir, "--json"]);
  assert.notEqual(nestedFailed.status, 0);
  assert.match(JSON.parse(nestedFailed.stdout).error.message, /inside the current dataDir/);
});

test("spool optional path reports without breaking codex workflow", () => {
  const dataDir = tmpDir("spool");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const result = json(run(["source", "status", "--data-dir", dataDir, "--json"]));
  assert.equal(typeof result.spool.available, "boolean");
});

test("spool scan reads official list/show JSON through PATH", () => {
  const dataDir = tmpDir("spool-scan");
  const binDir = tmpDir("spool-bin");
  const spoolPath = path.join(binDir, "spool");
  fs.writeFileSync(spoolPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('spool-test 1.0.0'); process.exit(0); }
if (args[0] === 'list') { console.log(JSON.stringify([{sessionUuid:'spool-1', source:'claude'}])); process.exit(0); }
if (args[0] === 'show') { console.log(JSON.stringify({session:{sessionUuid:'spool-1', source:'claude', filePath:'/tmp/session.jsonl', startedAt:'2026-05-28T00:00:00.000Z', cwd:'/tmp/project', title:'Spool session'}, messages:[{role:'user', contentText:'Need browser validation'}, {role:'assistant', contentText:'Use a real browser'}]})); process.exit(0); }
process.exit(1);
`, "utf8");
  fs.chmodSync(spoolPath, 0o755);
  json(run(["init", "--data-dir", dataDir, "--json"], { env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` } }));
  const result = json(run(["source", "scan", "spool", "--limit", "1", "--data-dir", dataDir, "--json"], { env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.indexed, ["spool-1"]);
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8")).sessions;
  assert.equal(sessions[0].provider, "spool:claude");
  assert.equal(sessions[0].summary, "");
});

test("spool scan skips oversized sessions without failing the whole scan", () => {
  const dataDir = tmpDir("spool-scan-oversized");
  const binDir = tmpDir("spool-bin-oversized");
  const spoolPath = path.join(binDir, "spool");
  fs.writeFileSync(spoolPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('spool-test 1.0.0'); process.exit(0); }
if (args[0] === 'list') { console.log(JSON.stringify([{sessionUuid:'large-1', source:'codex'}])); process.exit(0); }
if (args[0] === 'show') { console.log(JSON.stringify({session:{sessionUuid:'large-1', source:'codex'}, messages:[{role:'user', contentText:'x'.repeat(2000)}]})); process.exit(0); }
process.exit(1);
`, "utf8");
  fs.chmodSync(spoolPath, 0o755);
  json(run(["init", "--data-dir", dataDir, "--json"], { env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` } }));
  const result = json(run(["source", "scan", "spool", "--limit", "1", "--max-session-bytes", "512", "--data-dir", dataDir, "--json"], { env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.indexed, []);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /exceeded 512 bytes/);
});
