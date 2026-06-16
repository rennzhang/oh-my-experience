import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addDecision,
  applyRetrospective,
  auditStorage,
  candidateFromLesson,
  cardPath,
  compactSessionIndex,
  compactStorage,
  createCategory,
  createRetrospectiveRun,
  evaluateRecallSuite,
  explainMatch,
  generateStats,
  getCard,
  initializeDataDir,
  initializeProjectLibrary,
  layout,
  listCards,
  listCategories,
  findSimilarCards,
  matchCards,
  matchCardEntries,
  parseCardMarkdown,
  projectLibraryPath,
  promoteDraft,
  previewApplyRetrospective,
  readCardFile,
  readCardIndex,
  readLibraryStackCards,
  readSessionIndex,
  rebuildSessionCatalog,
  rebuildSessionIndex,
  resolveLibraryStack,
  removeStarterCards,
  renderAdditionalContext,
  runDoctor,
  pruneMaterializedSessions,
  serializeCard,
  setSessionStoreMode,
  withLock,
  writeCard,
  writeSessionRecords,
  writeTextAtomic,
  writeCandidates,
  buildTaskEnvelope,
} from "../dist/packages/core/src/index.js";

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ome-${name}-`));
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

function candidateFromFixture(runId, fixture) {
  return candidateFromLesson(runId, {
    ...fixture,
    criteria: {
      use_when: fixture.triggers || [],
      ignore_when: fixture.negativeTriggers || [],
      ...(fixture.criteria || {}),
    },
    engine_hints: {
      positive: fixture.requiredSignals || fixture.triggers || [],
      negative: fixture.blockedSignals || fixture.negativeTriggers || [],
      ...(fixture.engine_hints || {}),
    },
    recall: {
      policy: fixture.recallPolicy || "should",
      risk: fixture.risk || "medium",
      confidence: fixture.confidence || "medium",
      triggers: fixture.triggers || [],
      topics: fixture.topics || [],
      ...(fixture.recall || {}),
    },
    scope: fixture.scope || {},
  });
}

function writeTestCandidates(dataDir, runId, candidates, options = {}) {
  return writeCandidates(dataDir, runId, candidates, { audit: completeAudit(), ...options });
}

test("initializes a safe data directory and passes doctor", () => {
  const dataDir = tmpDir("init");
  initializeDataDir({ dataDir });
  const result = runDoctor(dataDir);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(fs.existsSync(layout(dataDir).config));
});

test("doctor dedupes PATH shims that resolve to the same ome binary", () => {
  const dataDir = tmpDir("doctor-path-dedupe");
  initializeDataDir({ dataDir });
  const binRoot = tmpDir("doctor-path-bin");
  const targetDir = path.join(binRoot, "target");
  const shimOne = path.join(binRoot, "shim-one");
  const shimTwo = path.join(binRoot, "shim-two");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(shimOne, { recursive: true });
  fs.mkdirSync(shimTwo, { recursive: true });
  const target = path.join(targetDir, "ome");
  fs.writeFileSync(target, "#!/usr/bin/env node\n", "utf8");
  fs.symlinkSync(target, path.join(shimOne, "ome"));
  fs.symlinkSync(target, path.join(shimTwo, "ome"));

  const previousPath = process.env.PATH;
  process.env.PATH = `${shimOne}${path.delimiter}${shimTwo}`;
  try {
    const doctor = runDoctor(dataDir);
    assert.equal(doctor.warnings.some((warning) => warning.includes("multiple ome binaries")), false);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("doctor accepts duplicate PATH binaries when package identity matches", () => {
  const dataDir = tmpDir("doctor-path-same-version");
  initializeDataDir({ dataDir });
  const binRoot = tmpDir("doctor-path-same-version-bin");
  const installOne = path.join(binRoot, "install-one", "lib", "node_modules", "oh-my-experience");
  const installTwo = path.join(binRoot, "install-two", "lib", "node_modules", "oh-my-experience");
  const shimOne = path.join(binRoot, "shim-one");
  const shimTwo = path.join(binRoot, "shim-two");
  for (const install of [installOne, installTwo]) {
    fs.mkdirSync(path.join(install, "bin"), { recursive: true });
    fs.writeFileSync(path.join(install, "package.json"), JSON.stringify({ name: "oh-my-experience", version: "0.1.0" }), "utf8");
    fs.writeFileSync(path.join(install, "bin", "ome.js"), "#!/usr/bin/env node\n", "utf8");
  }
  fs.mkdirSync(shimOne, { recursive: true });
  fs.mkdirSync(shimTwo, { recursive: true });
  fs.symlinkSync(path.join(installOne, "bin", "ome.js"), path.join(shimOne, "ome"));
  fs.symlinkSync(path.join(installTwo, "bin", "ome.js"), path.join(shimTwo, "ome"));

  const previousPath = process.env.PATH;
  process.env.PATH = `${shimOne}${path.delimiter}${shimTwo}`;
  try {
    const doctor = runDoctor(dataDir);
    assert.equal(doctor.warnings.some((warning) => warning.includes("multiple ome binaries")), false);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("doctor treats invalid archived cards as governance warnings", () => {
  const dataDir = tmpDir("doctor-invalid-archived");
  initializeDataDir({ dataDir });
  const invalidPath = path.join(layout(dataDir).archivedExperiences, "legacy-card.md");
  fs.writeFileSync(invalidPath, "---\nid: legacy-card\nstatus: archived\n---\n# Legacy\n", "utf8");

  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, true, doctor.errors.join("\n"));
  assert.equal(doctor.checked.invalidCards, 1);
  assert.match(doctor.warnings.join("\n"), /archived card schema invalid/);
});

test("doctor fails on invalid active cards", () => {
  const dataDir = tmpDir("doctor-invalid-active");
  initializeDataDir({ dataDir });
  const invalidPath = path.join(layout(dataDir).activeExperiences, "broken-card.md");
  fs.writeFileSync(invalidPath, "---\nid: broken-card\nstatus: active\n---\n# Broken\n", "utf8");

  const doctor = runDoctor(dataDir);
  assert.equal(doctor.ok, false);
  assert.match(doctor.errors.join("\n"), /card schema invalid/);
});

test("plain review does not imply dispatch operation", () => {
  const envelope = buildTaskEnvelope("做一次交付前 review，看看能不能提交");

  assert.deepEqual(envelope.operations, ["review"]);
  assert.equal(envelope.operations.includes("dispatch"), false);
});

test("generic checks do not imply review or runtime", () => {
  const envelope = buildTaskEnvelope("前端页面状态不对，检查 DB SDK API schema 数据链");

  assert.equal(envelope.intentModes.includes("review"), false);
  assert.equal(envelope.operations.includes("review"), false);
  assert.equal(envelope.taskTypes.includes("runtime"), false);
});

test("matcher keeps source names separate from execution commands", () => {
  const envelope = buildTaskEnvelope("用 spool 查 019e90a5-9539-7922-86f1-ea81f9a3b01f，研究 github x 论文里的召回引擎设计。");

  assert.deepEqual(envelope.commands, []);
  assert.ok(envelope.surfaces.includes("spool"));
  assert.ok(envelope.surfaces.includes("github"));
  assert.ok(envelope.ruleSignals.some((signal) => signal.id === "historical_session_lookup"));
  assert.equal(envelope.taskTypes.includes("git"), false);
});

test("matcher suppresses positive signals in explicit near-miss examples", () => {
  const goalExample = buildTaskEnvelope("文档里要增加实际案例，比如当我说创建目标或者使用 /goal 斜杠命令时会加载什么经验，并展示给用户看。");
  assert.ok(goalExample.ruleSignals.some((signal) => signal.id === "goal_example_discussion"));
  assert.equal(goalExample.ruleSignals.some((signal) => signal.id === "goal_execute"), false);
  assert.equal(goalExample.intentModes.includes("execute"), false);

  const englishGoalExample = buildTaskEnvelope("Write documentation that explains how to create a goal in Codex.");
  assert.ok(englishGoalExample.ruleSignals.some((signal) => signal.id === "goal_example_discussion"));
  assert.equal(englishGoalExample.ruleSignals.some((signal) => signal.id === "goal_execute"), false);
  assert.equal(englishGoalExample.intentModes.includes("execute"), false);

  const uiNoise = buildTaskEnvelope("这个提示里有 UI、browser 等噪声；真正任务是 npm tarball 安装验证。");
  assert.ok(uiNoise.ruleSignals.some((signal) => signal.id === "ui_surface_noise"));
  assert.equal(uiNoise.ruleSignals.some((signal) => signal.id === "ui_surface"), false);
});

test("init creates only the compact root storage model", () => {
  const dataDir = tmpDir("compact-layout");

  initializeDataDir({ dataDir });

  assert.equal(fs.existsSync(path.join(dataDir, "experiences", "active")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "retrospectives")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "indexes", "experiences.json")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "indexes", "sources.json")), true);
  assert.equal(fs.existsSync(path.join(dataDir, ".system")), false);
  assert.equal(fs.existsSync(path.join(dataDir, "sessions")), false);
  assert.equal(fs.existsSync(path.join(dataDir, "logs")), false);
});

test("retrospective runs persist user-supplied focus and guide metadata without prompt snapshots", () => {
  const dataDir = tmpDir("retrospective-focus");
  initializeDataDir({ dataDir });
  const focus = "创建目标时附加的要求，不要扩展成执行目标协议";
  const guideRef = "skills/oh-my-experience/references/reflect-retrospective.md";
  const guideHash = "a".repeat(64);
  const run = createRetrospectiveRun(dataDir, {
    title: "manual",
    focus,
    guideRef,
    guideHash,
  });
  const input = JSON.parse(fs.readFileSync(path.join(run.runDir, "input.json"), "utf8"));
  assert.equal(run.focus, focus);
  assert.equal(run.guideRef, guideRef);
  assert.equal(run.guideHash, guideHash);
  assert.equal(input.focus, focus);
  assert.deepEqual(input.sources, []);
  assert.equal(input.guideRef, guideRef);
  assert.equal(input.guideHash, guideHash);
  assert.equal(fs.existsSync(path.join(run.runDir, "prompt.md")), false);
});

test("init resetConfig overwrites runtime config without deleting the experience library", () => {
  const dataDir = tmpDir("reset-config");
  initializeDataDir({ dataDir });
  const configPath = layout(dataDir).config;
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  fs.writeFileSync(configPath, JSON.stringify({
    ...config,
    privacy: { ...config.privacy, saveRawPrompt: true },
    retrieval: { ...config.retrieval, maxCards: 99 },
  }, null, 2), "utf8");
  const retrospectiveDir = path.join(layout(dataDir).retrospectives, "keep-run");
  fs.mkdirSync(retrospectiveDir, { recursive: true });
  fs.writeFileSync(path.join(retrospectiveDir, "candidates.json"), JSON.stringify({ candidates: [] }), "utf8");
  const sourceIndexBefore = fs.readFileSync(layout(dataDir).sourceIndex, "utf8");
  const cardsBefore = listCards(dataDir).map((card) => card.id).sort();

  const result = initializeDataDir({ dataDir, resetConfig: true });

  assert.equal(result.plan.resetConfig, true);
  const reset = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(reset.privacy.saveRawPrompt, false);
  assert.equal(reset.retrieval.maxCards, 4);
  assert.deepEqual(listCards(dataDir).map((card) => card.id).sort(), cardsBefore);
  assert.equal(fs.existsSync(path.join(retrospectiveDir, "candidates.json")), true);
  assert.equal(fs.readFileSync(layout(dataDir).sourceIndex, "utf8"), sourceIndexBefore);
  const backups = fs.readdirSync(layout(dataDir).backups, { recursive: true }).map(String);
  assert.ok(backups.some((entry) => entry.endsWith("config.json")));

  const freshResetDir = tmpDir("fresh-reset-config");
  initializeDataDir({ dataDir: freshResetDir, resetConfig: true });
  assert.equal(listCards(freshResetDir).length, 0);
});

test("init repairs a stale self config dataDir pointer", () => {
  const dataDir = tmpDir("stale-pointer");
  initializeDataDir({ dataDir });
  const configPath = layout(dataDir).config;
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  fs.writeFileSync(configPath, JSON.stringify({
    ...config,
    dataDir: "/tmp/stale-ome-pointer",
    locale: { ui: "zh-CN", cardDefault: "zh", additionalContext: "zh-CN" },
  }, null, 2), "utf8");
  initializeDataDir({ dataDir });
  const repaired = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(repaired.dataDir, path.resolve(dataDir));
  assert.equal("locale" in repaired, false);
});

test("legacy card schema is rejected instead of silently downgraded", () => {
  assert.throws(() => parseCardMarkdown(`---
id: dated-card
status: active
title: Dated card
summary: Dated card summary
criteria:
  use_when: [date]
recall:
  triggers: [date]
  topics: [frontmatter]
created: 2026-05-27
updated: 2026-05-28
---

## 完整规则

\`\`\`text
Keep dated card dates parseable.
\`\`\`
`), /unsupported experience card schema/);
});

test("candidate to draft to active lifecycle is explicit", () => {
  const dataDir = tmpDir("lifecycle");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const runId = "run-1";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "UI browser validation",
    summary: "UI changes were accepted without browser validation.",
    rule: "Open the real UI and check viewport and console.",
    triggers: ["UI", "浏览器验证"],
    topics: ["frontend", "console"],
    evidence: ["fixture"],
    risk: "high",
    recallPolicy: "must",
  });
  assert.equal(candidate.category, "产品与 UI");
  writeTestCandidates(dataDir, runId, [candidate]);
  const reviewFile = path.join(layout(dataDir).retrospectives, runId, "experience-review.md");
  const generatedReview = fs.readFileSync(reviewFile, "utf8");
  assert.match(generatedReview, /状态：candidates_generated/);
  assert.match(generatedReview, /经验草稿审批/);
  assert.match(generatedReview, new RegExp(`复盘编号：${runId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(generatedReview, /### 经验总结/);
  assert.match(generatedReview, /### 触发时机/);
  assert.match(generatedReview, /### 可复用规则/);
  assert.match(generatedReview, /以下内容是激活后会进入 Agent 上下文的规则正文：/);
  assert.match(generatedReview, /```agent-rule\nOpen the real UI and check viewport and console\.\n```/);
  assert.match(generatedReview, /Open the real UI and check viewport and console/);
  assert.match(generatedReview, /### 审批意见/);
  assert.match(generatedReview, /可写：通过 \/ 不通过 \/ 修改为…… \/ 合并到……/);
  assert.deepEqual(Array.from(generatedReview.matchAll(/^### (.+)$/gm), (match) => match[1]), ["经验总结", "触发时机", "可复用规则", "审批意见"]);
  assert.doesNotMatch(generatedReview, /\| # \| 经验 \| 状态 \|/);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "approve", reason: "useful" });
  const decidedReview = fs.readFileSync(reviewFile, "utf8");
  assert.match(decidedReview, /状态：decisions_recorded/);
  assert.match(decidedReview, /审批：approve/);
  assert.match(decidedReview, /意见：useful/);
  const preview = previewApplyRetrospective(dataDir, runId);
  assert.equal(preview.ok, true);
  assert.equal(preview.drafts.length, 1);
  assert.equal(readCardIndex(dataDir).experiences.length, 0);
  const applied = applyRetrospective(dataDir, runId);
  assert.equal(applied.drafts.length, 1);
  assert.match(applied.drafts[0].body, /## 这张卡解决什么问题/);
  assert.match(applied.drafts[0].body, /## 使用标准/);
  assert.match(applied.drafts[0].body, /## 完整规则/);
  assert.match(applied.drafts[0].body, /Open the real UI and check viewport and console\./);
  assert.equal(applied.drafts[0].rule, "Open the real UI and check viewport and console.");
  assert.doesNotMatch(applied.drafts[0].rule, /```/);
  assert.deepEqual(applied.drafts[0].sources, ["retrospective:run-1"]);
  assert.match(fs.readFileSync(reviewFile, "utf8"), /状态：applied_to_drafts/);
  const repeated = applyRetrospective(dataDir, runId);
  assert.equal(repeated.drafts.length, 0);
  assert.equal(repeated.merges.length, 0);
  assert.equal(readCardIndex(dataDir).experiences.length, 0);
  promoteDraft(dataDir, applied.drafts[0].id);
  const promoted = getCard(dataDir, applied.drafts[0].id);
  assert.deepEqual(promoted.sources, ["retrospective:run-1"]);
  assert.deepEqual(promoted.sourceRefs, [{ type: "retrospective", ref: "run-1" }]);
  assert.equal(promoted.origin.createdBy, "retrospective");
  const index = readCardIndex(dataDir);
  assert.equal(index.experiences.length, 1);
  assert.equal(index.experiences[0].category, "产品与 UI");
});

test("retrospective candidates require source audit unless explicitly incomplete", () => {
  const dataDir = tmpDir("audit-required");
  initializeDataDir({ dataDir });
  const run = createRetrospectiveRun(dataDir, { title: "manual" });
  const candidate = candidateFromFixture(run.runId, {
    title: "Source audit gate",
    summary: "Candidates were written without source audit.",
    rule: "Complete source audit before writing candidates.",
    triggers: ["retrospective"],
    topics: ["audit"],
  });
  assert.throws(
    () => writeCandidates(dataDir, run.runId, [candidate]),
    /retrospective source audit is required/,
  );
  writeCandidates(dataDir, run.runId, [candidate], {
    allowIncompleteAudit: true,
    incompleteAuditReason: "test override",
  });
  const reviewFile = path.join(run.runDir, "experience-review.md");
  const generatedReview = fs.readFileSync(reviewFile, "utf8");
  assert.match(generatedReview, /审计：不完整：test override/);
});

test("retrospective candidates persist complete source audit", () => {
  const dataDir = tmpDir("audit-complete");
  initializeDataDir({ dataDir });
  const run = createRetrospectiveRun(dataDir, { title: "manual" });
  const candidate = candidateFromFixture(run.runId, {
    title: "Complete audit",
    summary: "A complete audit is required.",
    rule: "Attach the audit before candidate import.",
    triggers: ["retrospective"],
    topics: ["audit"],
  });
  writeCandidates(dataDir, run.runId, [candidate], { audit: completeAudit({ searchedSources: ["a.jsonl", "b.jsonl"] }) });
  const raw = JSON.parse(fs.readFileSync(path.join(run.runDir, "candidates.json"), "utf8"));
  assert.equal(raw.audit.focusLens, "fixture focus");
  assert.equal(raw.audit.sourceCoverage, "all-accessible");
  assert.equal(raw.audit.searchedSources.length, 2);
  assert.equal(raw.audit.incomplete, false);
  assert.match(fs.readFileSync(path.join(run.runDir, "experience-review.md"), "utf8"), /审计：coverage=all-accessible \/ focus=fixture focus \/ user-index=yes \/ native=codex,claude \/ sources=2 \/ gaps=0/);
});

test("retrospective source audit requires explicit source coverage", () => {
  const dataDir = tmpDir("audit-source-coverage");
  initializeDataDir({ dataDir });
  const run = createRetrospectiveRun(dataDir, { title: "manual" });
  const candidate = candidateFromFixture(run.runId, {
    title: "Missing coverage",
    summary: "Audit did not say how much source was covered.",
    rule: "State source coverage separately from focus.",
    triggers: ["retrospective"],
    topics: ["audit"],
  });
  assert.throws(
    () => writeCandidates(dataDir, run.runId, [candidate], { audit: completeAudit({ sourceCoverage: "unknown" }) }),
    /sourceCoverage/,
  );
});

test("retrospective apply can resume later decisions without duplicating earlier drafts", () => {
  const dataDir = tmpDir("incremental-review");
  initializeDataDir({ dataDir });
  const runId = "run-incremental";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const first = candidateFromFixture(runId, {
    title: "First lesson",
    summary: "P1",
    rule: "C1",
    triggers: ["first lesson"],
    topics: ["review"],
    evidence: ["fixture"],
  });
  const second = candidateFromFixture(runId, {
    title: "Second lesson",
    summary: "P2",
    rule: "C2",
    triggers: ["second lesson"],
    topics: ["review"],
    evidence: ["fixture"],
  });
  writeTestCandidates(dataDir, runId, [first, second]);
  addDecision(dataDir, runId, { candidateId: first.id, action: "approve" });
  assert.equal(applyRetrospective(dataDir, runId).drafts.length, 1);
  addDecision(dataDir, runId, { candidateId: second.id, action: "approve" });
  const resumed = applyRetrospective(dataDir, runId);
  assert.deepEqual(resumed.drafts.map((card) => card.title), ["Second lesson"]);
  assert.equal(listCards(dataDir).filter((card) => card.status === "draft").length, 2);
});

test("categories can be created and assigned through retrospective decisions", () => {
  const dataDir = tmpDir("categories");
  initializeDataDir({ dataDir });
  const manual = createCategory(dataDir, { name: "自定义验收" });
  assert.equal(manual.name, "自定义验收");
  const runId = "run-category";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "API pagination",
    summary: "List API had no pagination.",
    rule: "Use stable pagination.",
    triggers: ["pagination"],
    topics: ["api"],
    evidence: ["fixture"],
  });
  assert.equal(candidate.category, "后端与 API");
  writeTestCandidates(dataDir, runId, [candidate]);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "approve", rewrite: { category: "自定义验收" } });
  const draft = applyRetrospective(dataDir, runId).drafts[0];
  assert.equal(draft.category, "自定义验收");
  assert.ok(listCategories(dataDir).some((category) => category.name === "自定义验收"));
});

test("recall eval measures multilingual long prompts without AI calls", () => {
  const dataDir = tmpDir("eval");
  initializeDataDir({ dataDir });
  const runId = "run-eval";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const browser = candidateFromFixture(runId, {
    title: "Browser validation",
    summary: "P",
    rule: "C",
    triggers: ["browser validation", "浏览器验证"],
    topics: ["frontend", "ui"],
    evidence: ["e"],
    recallPolicy: "must",
  });
  const git = candidateFromFixture(runId, {
    title: "Git scoped commit",
    summary: "P",
    rule: "C",
    triggers: ["git status", "commit"],
    topics: ["git"],
    evidence: ["e"],
  });
  writeTestCandidates(dataDir, runId, [browser, git]);
  for (const item of [browser, git]) addDecision(dataDir, runId, { candidateId: item.id, action: "approve" });
  const drafts = applyRetrospective(dataDir, runId).drafts;
  for (const draft of drafts) promoteDraft(dataDir, draft.id);
  const suite = path.join(dataDir, "suite.json");
  fs.writeFileSync(suite, JSON.stringify({
    name: "core",
    cases: [{
      id: "long-ui",
      prompt: "请实现 UI 调整，完整做浏览器验证，并且不要误动 git 提交范围。这个任务还包含很多描述，但核心是前端页面和真实浏览器验收。",
      expectedCards: [browser.id],
    }, {
      id: "git",
      prompt: "before commit, run git status and keep the diff scoped",
      expectedCards: [git.id],
    }],
  }), "utf8");
  const report = evaluateRecallSuite(dataDir, suite, { limit: 4, useCurrentLibrary: true });
  assert.equal(report.ok, true);
  assert.equal(report.metrics.recallAtK, 1);
});

test("recall eval keeps precision when the library has many noisy cards", () => {
  const dataDir = tmpDir("eval-scale-noise");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const now = new Date().toISOString();
  const baseCard = {
    status: "active",
    category: "测试验收",
    aliases: {},
    applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "" },
    intentModes: { include: [], exclude: [] },
    blockedSignals: [],
    language: "auto",
    recallPolicy: "should",
    risk: "medium",
    confidence: "medium",
    staleAfter: null,
    sources: ["scale-noise-fixture"],
    origin: { adapter: "manual", agent: "unknown", model: null, sessionId: null, projectKey: null, createdBy: "manual" },
    sourceRefs: [{ type: "manual", ref: "scale-noise-fixture" }],
    body: "",
    createdAt: now,
    updatedAt: now,
  };
  writeCard(dataDir, {
    ...baseCard,
    id: "scale-browser-validation",
    title: "Real browser validation before UI delivery",
    summary: "Use when a UI task changes visible behavior and the agent must verify the real browser state before reporting completion.",
    rule: "Open the real browser path, inspect responsive state, loading state, error state, and console output before saying a UI task is complete.",
    triggers: ["real browser validation", "frontend UI delivery", "visible page check"],
    negativeTriggers: ["documentation example", "just explain browser validation"],
    topics: ["frontend", "ui", "validation"],
    requiredSignals: ["ui_surface"],
    recallPolicy: "must",
    risk: "high",
  });
  const signalPool = ["worktree_diff_operation", "historical_session_lookup", "package_install_validation", "source_truth_chain", "external_model_review", "rule_governance"];
  for (let index = 0; index < 72; index += 1) {
    writeCard(dataDir, {
      ...baseCard,
      id: `scale-noise-${String(index).padStart(2, "0")}`,
      title: `Noise card ${index} for agent delivery notes`,
      summary: "This decoy contains broad agent, delivery, validation, review, docs, and workflow words but belongs to another workflow.",
      rule: "Do not use this decoy unless its exact routed workflow is present.",
      triggers: ["agent delivery", "validation", "review", "workflow", `noise-${index}`],
      negativeTriggers: ["frontend UI delivery", "real browser validation"],
      topics: ["docs", "review", "workflow"],
      requiredSignals: [signalPool[index % signalPool.length]],
    });
  }
  const suite = path.join(dataDir, "scale-suite.json");
  fs.writeFileSync(suite, JSON.stringify({
    name: "scale-noise",
    cases: [{
      id: "ui-hit-with-noise",
      prompt: "修复设置页面 UI，真实浏览器里检查桌面和移动端状态，确认控制台没有错误再交付。",
      expectedCards: ["scale-browser-validation"],
      unexpectedCards: Array.from({ length: 72 }, (_, index) => `scale-noise-${String(index).padStart(2, "0")}`),
    }, {
      id: "docs-near-miss",
      prompt: "给文档补一个 browser validation 示例，只解释用户会看到什么，不运行 UI。",
      expectNoMatches: true,
    }],
  }), "utf8");

  const report = evaluateRecallSuite(dataDir, suite, { limit: 4, threshold: 40, useCurrentLibrary: true });
  assert.equal(report.ok, true);
  assert.equal(report.metrics.precisionAtK, 1);
  assert.equal(report.metrics.overRecallRate, 0);
});

test("recall eval uses isolated fixture libraries by default", () => {
  const dataDir = tmpDir("eval-isolated");
  initializeDataDir({ dataDir });
  const suite = path.join(dataDir, "isolated-suite.json");
  fs.writeFileSync(suite, JSON.stringify({
    name: "isolated",
    experiences: [{
      id: "isolated-browser-card",
      title: "Isolated Browser Card",
      summary: "Browser validation should be evaluated in an isolated fixture library.",
      rule: "Evaluate browser validation without writing to the user's library.",
      criteria: {
        use_when: ["browser validation", "浏览器验证"],
      },
      engine_hints: {
        positive: ["ui_surface"],
      },
      recall: {
        policy: "must",
        risk: "high",
        confidence: "medium",
        triggers: ["browser validation", "浏览器验证"],
        topics: ["frontend"],
      },
      scope: { level: "global" },
    }],
    cases: [{
      id: "isolated-hit",
      prompt: "请做浏览器验证",
      expectedCards: ["isolated-browser-card"],
    }],
  }), "utf8");
  const beforeCards = readCardIndex(dataDir).experiences.length;
  const report = evaluateRecallSuite(dataDir, suite, { limit: 4 });
  assert.equal(report.ok, true);
  assert.equal(report.isolated, true);
  assert.equal(report.cardFixtureCount, 1);
  assert.equal(readCardIndex(dataDir).experiences.length, beforeCards);
});

test("match only recalls active cards", () => {
  const dataDir = tmpDir("match");
  initializeDataDir({ dataDir });
  const runId = "run-2";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "Git safety",
    summary: "Dirty worktree was ignored.",
    rule: "Check git status and only touch scoped files.",
    triggers: ["git status", "commit"],
    topics: ["git"],
    evidence: ["fixture"],
  });
  writeTestCandidates(dataDir, runId, [candidate]);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "approve" });
  const draft = applyRetrospective(dataDir, runId).drafts[0];
  assert.equal(matchCards(dataDir, "git status before commit").length, 0);
  promoteDraft(dataDir, draft.id);
  assert.equal(matchCards(dataDir, "git status before commit").length, 1);
});

test("runtime recall fails closed when an active card file is invalid", () => {
  const dataDir = tmpDir("match-invalid-active");
  initializeDataDir({ dataDir });
  const activePath = cardPath(dataDir, "active", "starter-code-kiss-root-cause");
  writeTextAtomic(activePath, "---\nid: starter-code-kiss-root-cause\nstatus: active\n---\n# broken\n", dataDir);
  assert.throws(
    () => matchCards(dataDir, "fix the root cause"),
    /unsupported experience card schema/,
  );
});

test("hook context is neutral and carries scope hints", () => {
  const dataDir = tmpDir("context-neutral");
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "neutral-context",
    status: "active",
    title: "Neutral context wording",
    category: "经验召回",
    summary: "Keep hook output neutral so unrelated lessons can be ignored.",
    rule: "Write hook context as potentially relevant guidance, not as a mandatory instruction.",
    triggers: ["neutral hook context"],
    negativeTriggers: ["unrelated task"],
    topics: ["hook", "recall"],
    recallPolicy: "must",
    risk: "high",
    body: "Keep hook output neutral so the model can ignore unrelated lessons.",
    createdAt: now,
    updatedAt: now,
  });
  const matches = matchCards(dataDir, "neutral hook context");
  const context = renderAdditionalContext(matches, { maxChars: 2000 });
  assert.match(context, /OME matched experience cards/);
  assert.match(context, /Matched does not mean used/);
  assert.match(context, /Before acting, if any matched card is applicable/);
  assert.match(context, /Final report: if you actually used any card/);
  assert.match(context, /\*\*本次使用 N条 OME 经验卡：\*\*/);
  assert.match(context, /Summary: Keep hook output neutral/);
  assert.match(context, /Rule: ome experience show neutral-context --section rule/);
  assert.match(context, /Use if: neutral hook context/);
  assert.match(context, /Ignore if: unrelated task/);
  assert.match(context, /Final link if used: \[Neutral context wording\]\(<experiences\/active\/neutral-context\.md>\)/);
  assert.doesNotMatch(context, /Candidate links:/);
  assert.doesNotMatch(context, /本次挂载/);
  assert.doesNotMatch(context, /Final mounted-card disclosure/);
  assert.doesNotMatch(context, /must follow|必须遵守/i);
  assert.doesNotMatch(context, /可能相关的过往经验|关键词命中可能存在歧义/);
});

test("candidate links include all rendered cards without claiming usage", () => {
  const dataDir = tmpDir("mounted-count");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "alpha-mounted-card",
    status: "active",
    title: "Alpha mounted card",
    category: "验证",
    summary: "Alpha card should be mounted for alpha prompts.",
    rule: "Use alpha mounted card.",
    triggers: ["alpha-mounted-validation"],
    topics: ["alpha"],
    body: "Use alpha mounted card.",
    createdAt: now,
    updatedAt: now,
  });
  writeCard(dataDir, {
    id: "beta-mounted-card",
    status: "active",
    title: "Beta mounted card",
    category: "验证",
    summary: "Beta card should be mounted for beta prompts.",
    rule: "Use beta mounted card.",
    triggers: ["beta-mounted-validation"],
    topics: ["beta"],
    body: "Use beta mounted card.",
    createdAt: now,
    updatedAt: now,
  });
  const matches = matchCards(dataDir, "alpha-mounted-validation beta-mounted-validation");
  assert.equal(matches.length, 2);
  const context = renderAdditionalContext(matches);
  assert.match(context, /\*\*本次使用 N条 OME 经验卡：\*\*/);
  assert.doesNotMatch(context, /本次挂载/);
  assert.match(context, /\[Alpha mounted card\]\(<experiences\/active\/alpha-mounted-card\.md>\)/);
  assert.match(context, /\[Beta mounted card\]\(<experiences\/active\/beta-mounted-card\.md>\)/);
});

test("retrieval collapses near duplicates without hiding scoped cards", () => {
  const dataDir = tmpDir("similar-collapse");
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  const base = {
    status: "active",
    category: "测试验收",
    summary: "Browser validation cards should collapse when they describe the same acceptance requirement.",
    rule: "After UI changes, verify in a real browser and check console errors.",
    triggers: ["browser validation", "real browser smoke"],
    topics: ["frontend", "ui"],
    recallPolicy: "must",
    risk: "high",
    body: "After UI changes, verify in a real browser and check console errors.",
    createdAt: now,
    updatedAt: now,
  };
  writeCard(dataDir, { ...base, id: "browser-a", title: "Browser validation" });
  writeCard(dataDir, { ...base, id: "browser-b", title: "Real browser validation" });
  writeCard(dataDir, {
    ...base,
    id: "browser-project",
    title: "Project browser validation",
    applicability: {
      level: "project",
      projectKey: "@eval/project",
      modulePath: "app",
      confidence: "high",
      rationale: "project specific",
    },
  });
  const matches = matchCards(dataDir, "browser validation real browser smoke", {
    projectContext: {
      cwd: null,
      root: null,
      projectKey: "@eval/project",
      modulePath: "app",
      packageName: null,
      source: "package",
    },
  });
  const ids = matches.map((item) => item.card.id);
  assert.ok(ids.includes("browser-a"));
  assert.ok(ids.includes("browser-project"));
  assert.equal(ids.includes("browser-b"), false);
  assert.equal(matches.find((item) => item.card.id === "browser-a").similarCards[0].id, "browser-b");
  const explained = explainMatch(dataDir, "browser validation real browser smoke", {
    projectContext: {
      cwd: null,
      root: null,
      projectKey: "@eval/project",
      modulePath: "app",
      packageName: null,
      source: "package",
    },
  });
  assert.equal(explained.matches.find((item) => item.id === "browser-a").similarCards[0].id, "browser-b");
  const similar = findSimilarCards({ title: "Browser smoke", triggers: ["browser validation"], topics: ["frontend"] }, listCards(dataDir));
  assert.ok(similar.some((item) => item.id === "browser-a"));
});

test("retrieval does not collapse distinct reviewed cards only because they share a signal", () => {
  const dataDir = tmpDir("same-signal-distinct");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const now = new Date().toISOString();
  for (const card of [
    {
      id: "module-boundary-cleanup",
      title: "模块边界清理",
      summary: "模块边界混乱时先拆职责。",
      rule: "Separate module responsibilities before changing implementation.",
      triggers: ["module boundary cleanup", "模块边界清理"],
    },
    {
      id: "fallback-removal",
      title: "删除 fallback 包袱",
      summary: "fallback 掩盖问题时要删掉包袱。",
      rule: "Remove fallback clutter when it hides the real failure.",
      triggers: ["fallback removal", "删除 fallback 包袱"],
    },
  ]) {
    writeCard(dataDir, {
      ...card,
      status: "active",
      category: "工程质量",
      negativeTriggers: [],
      topics: ["architecture"],
      requiredSignals: ["architecture_quality"],
      recallPolicy: "should",
      risk: "medium",
      body: card.rule,
      createdAt: now,
      updatedAt: now,
    });
  }

  const matches = matchCards(dataDir, "请做高内聚低耦合优化：module boundary cleanup，同时做 fallback removal。", { threshold: 40 });
  assert.deepEqual(matches.map((item) => item.card.id).sort(), ["fallback-removal", "module-boundary-cleanup"]);
});

test("negative triggers disambiguate overloaded terms like goal", () => {
  const dataDir = tmpDir("goal-ambiguity");
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "agent-goal-routine",
    status: "active",
    title: "Agent goal command routine",
    category: "Agent 工作流",
    summary: "Agent goal wording is an execution workflow trigger, not any ordinary business or personal goal discussion.",
    rule: "When the user asks Codex to create a goal for a long-running task, recall the standard execution requirements.",
    triggers: ["goal", "目标", "创建目标", "长任务"],
    negativeTriggers: ["公司目标", "业务目标", "某人的目标", "人生目标"],
    topics: ["goal", "agent-workflow"],
    intentModes: { include: ["execute"], exclude: ["discuss", "explain"] },
    requiredSignals: ["goal_execute"],
    blockedSignals: ["business_goal_discussion", "explain_only"],
    recallPolicy: "must",
    risk: "high",
    body: "When the user asks Codex to create a goal for a long-running task, recall the standard execution requirements.",
    createdAt: now,
    updatedAt: now,
  });
  const commandGoal = matchCards(dataDir, "请用 codex goal 创建目标跑一个长任务");
  assert.equal(commandGoal[0]?.card.id, "agent-goal-routine");
  assert.ok(commandGoal[0]?.reasons.some((item) => item.field === "ruleSignals" && item.term === "goal_execute"));
  const explained = explainMatch(dataDir, "请用 codex goal 创建目标跑一个长任务");
  assert.ok(explained.envelope.intentModes.includes("execute"));
  assert.ok(explained.envelope.ruleSignals.some((item) => item.id === "goal_execute"));
  const businessGoal = matchCards(dataDir, "本次公司要求达到增长目标，我们只是讨论业务目标是什么");
  assert.equal(businessGoal.some((item) => item.card.id === "agent-goal-routine"), false);
  const ordinaryGoal = matchCards(dataDir, "今天的目标是去公司验收前端页面，只讨论项目指标", { threshold: 40 });
  assert.equal(ordinaryGoal.some((item) => item.card.id === "agent-goal-routine"), false);
  const docsExample = matchCards(dataDir, "文档里要增加实际案例，比如当我说创建目标或者使用 /goal 斜杠命令时会加载什么经验，并展示给用户看。", { threshold: 20 });
  assert.equal(docsExample.some((item) => item.card.id === "agent-goal-routine"), false);
  const englishDocsExample = matchCards(dataDir, "write documentation that explains how to create a goal in Codex", { threshold: 20 });
  assert.equal(englishDocsExample.some((item) => item.card.id === "agent-goal-routine"), false);
});

test("starter architecture card recalls for cohesive root-cause implementation work", () => {
  const dataDir = tmpDir("starter-architecture-quality-gate");
  initializeDataDir({ dataDir });

  const match = matchCards(dataDir, "召回引擎还是不太行，急需优化，高内聚低耦合，逻辑要干净，不要继续堆兼容包袱。", { threshold: 40 });
  assert.equal(match[0]?.card.id, "starter-code-kiss-root-cause");
  assert.ok(match[0]?.reasons.some((item) => item.field === "ruleSignals" && item.term === "architecture_quality"));
  assert.match(renderAdditionalContext(match), /cohesive architecture, clean logic, or a root-cause fix/);
});

test("browser validation cards require a UI or browser surface", () => {
  const dataDir = tmpDir("browser-validation-surface-gate");
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "browser-validation",
    status: "active",
    title: "前端改动必须做真实浏览器验收",
    category: "测试验收",
    summary: "前端 UI 改动不能只靠静态检查。",
    rule: "必须打开真实页面，按用户路径点击、输入、提交，检查可见状态、移动端布局和浏览器控制台错误。",
    triggers: ["浏览器验证", "真实浏览器", "前端验收", "UI 验收", "browser validation", "real browser"],
    negativeTriggers: [],
    topics: ["frontend", "ui", "test"],
    requiredSignals: ["ui_surface"],
    blockedSignals: ["ui_surface_noise"],
    recallPolicy: "must",
    risk: "high",
    body: "前端 UI 改动不能只靠静态检查。",
    createdAt: now,
    updatedAt: now,
  });

  const storageValidation = matchCards(dataDir, "把 dataDir 迁移到 Obsidian 子目录，必须 preview、backup、doctor 验证，不能误写真实根目录。", { threshold: 40 });
  assert.equal(storageValidation.some((item) => item.card.id === "browser-validation"), false);

  const uiAsNoise = matchCards(dataDir, "这个提示里有 UI、hook、docs 等噪声；真正任务是 npm tarball 安装验证和 git status 检查。", { threshold: 40 });
  assert.equal(uiAsNoise.some((item) => item.card.id === "browser-validation"), false);

  const browserValidation = matchCards(dataDir, "Fix a frontend UI bug and validate the result in a real browser.", { threshold: 40 });
  assert.equal(browserValidation[0]?.card.id, "browser-validation");
  assert.ok(browserValidation[0]?.reasons.some((item) => item.field === "ruleSignals" && item.term === "ui_surface"));
});

test("git safety cards require a real git operation, not a GitHub source mention", () => {
  const dataDir = tmpDir("git-operation-gate");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "git-commit-safety",
    status: "active",
    title: "脏工作区只处理本任务 diff",
    category: "Git 安全",
    summary: "Dirty worktree, stage, commit, format and user-change protection.",
    rule: "Check git status and only stage this task's diff.",
    triggers: ["git", "commit", "push", "stage", "脏工作区", "dirty", "diff", "worktree"],
    negativeTriggers: ["GitHub 只是资料来源", "只读资料研究"],
    topics: ["git", "worktree", "commit-safety", "user-change-protection"],
    requiredSignals: ["worktree_diff_operation"],
    recallPolicy: "must",
    risk: "high",
    body: "Check git status and only stage this task's diff.",
    createdAt: now,
    updatedAt: now,
  });

  const githubResearch = matchCards(dataDir, "研究 github 和 X 上关于召回引擎设计的资料。", { threshold: 4 });
  assert.equal(githubResearch.some((item) => item.card.id === "git-commit-safety"), false);
  const githubSourceOnly = matchCards(dataDir, "GitHub 只是资料来源，帮我读 issue 背景，不要处理 diff。", { threshold: 40 });
  assert.equal(githubSourceOnly.some((item) => item.card.id === "git-commit-safety"), false);
  const noLocalGitOperation = matchCards(dataDir, "不涉及 git diff 或提交，只做代码阅读。", { threshold: 40 });
  assert.equal(noLocalGitOperation.some((item) => item.card.id === "git-commit-safety"), false);
  const gitOperation = matchCards(dataDir, "Before commit, run git status and keep unrelated dirty files out of the staged diff.", { threshold: 4 });
  assert.equal(gitOperation[0]?.card.id, "git-commit-safety");
  assert.ok(gitOperation[0]?.reasons.some((item) => item.field === "ruleSignals" && item.term === "worktree_diff_operation"));
});

test("Spool handoff cards require historical-session lookup intent", () => {
  const dataDir = tmpDir("spool-session-gate");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "spool-session-context-anchoring",
    status: "active",
    title: "历史会话交接必须用 Spool UUID 锚定",
    category: "会话交接",
    summary: "Use stable Spool/session anchors when reusing historical conversation evidence.",
    rule: "Record Spool/session UUID, turn ids, sourceRefs and current source-of-truth checks.",
    triggers: ["Spool", "spool uuid", "session UUID", "历史会话", "会话交接"],
    negativeTriggers: ["Spool 是可选扫描来源", "不是当前召回前置条件"],
    topics: ["spool", "session-handoff", "source-refs"],
    requiredSignals: ["historical_session_lookup"],
    recallPolicy: "should",
    risk: "medium",
    body: "Use stable Spool/session anchors when reusing historical conversation evidence.",
    createdAt: now,
    updatedAt: now,
  });

  const optionalScan = matchCards(dataDir, "Spool 是可选扫描来源，不是当前召回前置条件。", { threshold: 4 });
  assert.equal(optionalScan.some((item) => item.card.id === "spool-session-context-anchoring"), false);
  const historicalLookup = matchCards(dataDir, "用 spool 查 019e90a5-9539-7922-86f1-ea81f9a3b01f 的历史会话证据。", { threshold: 4 });
  assert.equal(historicalLookup[0]?.card.id, "spool-session-context-anchoring");
  assert.ok(historicalLookup[0]?.reasons.some((item) => item.field === "ruleSignals" && item.term === "historical_session_lookup"));
  assert.match(renderAdditionalContext(historicalLookup), /Matched by: task asks to look up historical session evidence/);
});

test("global hooks filter project-specific cards by scope", () => {
  const dataDir = tmpDir("scope");
  initializeDataDir({ dataDir });
  const now = new Date().toISOString();
  writeCard(dataDir, {
    id: "global-browser-validation",
    status: "active",
    title: "Global browser validation",
    category: "测试验收",
    summary: "Global UI validation applies when no narrower project-specific card overrides it.",
    rule: "Use the real browser after UI changes.",
    triggers: ["browser validation"],
    topics: ["frontend", "test"],
    applicability: { level: "global" },
    body: "Use the real browser after UI changes.",
    createdAt: now,
    updatedAt: now,
  });
  writeCard(dataDir, {
    id: "project-browser-validation",
    status: "active",
    title: "Project browser validation",
    category: "测试验收",
    summary: "This project has a narrower UI validation path than the global card.",
    rule: "Use the product-app acceptance path for UI changes.",
    triggers: ["browser validation"],
    topics: ["frontend", "test"],
    applicability: {
      level: "project",
      projectKey: "github.com/example/product-app",
      modulePath: "modules/infra/oh-my-experience",
      confidence: "high",
      rationale: "fixture project card",
    },
    body: "Use the product-app acceptance path for UI changes.",
    createdAt: now,
    updatedAt: now,
  });
  writeCard(dataDir, {
    id: "project-family-browser-validation",
    status: "active",
    title: "Project family browser validation",
    category: "测试验收",
    summary: "Project-family UI validation applies across related projects in the same family.",
    rule: "Use the shared project-family acceptance pattern.",
    triggers: ["browser validation"],
    topics: ["frontend", "test"],
    applicability: {
      level: "project-family",
      projectKey: "github.com/example/another-tool",
      confidence: "medium",
      rationale: "fixture family card",
    },
    body: "Use the shared project-family acceptance pattern.",
    createdAt: now,
    updatedAt: now,
  });
  const matchingProject = {
    cwd: null,
    root: null,
    projectKey: "github.com/example/product-app",
    modulePath: "modules/infra/oh-my-experience",
    packageName: null,
    source: "git",
  };
  const otherProject = {
    cwd: null,
    root: null,
    projectKey: "github.com/other/other",
    modulePath: ".",
    packageName: null,
    source: "git",
  };
  const matching = matchCards(dataDir, "browser validation", { projectContext: matchingProject }).map((item) => item.card.id);
  assert.ok(matching.includes("global-browser-validation"));
  assert.ok(matching.includes("project-browser-validation"));
  assert.ok(matching.includes("project-family-browser-validation"));
  const descendantModule = matchCards(dataDir, "browser validation", {
    projectContext: { ...matchingProject, modulePath: "modules/infra/oh-my-experience/packages/cli" },
  }).map((item) => item.card.id);
  assert.ok(descendantModule.includes("project-browser-validation"));
  const siblingModule = matchCards(dataDir, "browser validation", {
    projectContext: { ...matchingProject, modulePath: "modules/infra/other" },
  }).map((item) => item.card.id);
  assert.equal(siblingModule.includes("project-browser-validation"), false);
  const other = matchCards(dataDir, "browser validation", { projectContext: otherProject }).map((item) => item.card.id);
  assert.ok(other.includes("global-browser-validation"));
  assert.equal(other.includes("project-browser-validation"), false);
  assert.equal(other.includes("project-family-browser-validation"), false);
});

test("project library cards merge with global recall without writing project events", () => {
  const globalDataDir = tmpDir("project-stack-global");
  initializeDataDir({ dataDir: globalDataDir });
  removeStarterCards(globalDataDir);
  const projectRoot = tmpDir("project-stack-repo");
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "@example/project-stack" }), "utf8");
  const projectInit = initializeProjectLibrary(projectRoot);
  const projectLibrary = projectLibraryPath(projectRoot);
  const now = new Date().toISOString();
  writeCard(globalDataDir, {
    id: "global-project-stack-validation",
    status: "active",
    title: "Global project stack validation",
    category: "测试验收",
    summary: "Global fallback for project library validation.",
    rule: "Use the global validation path.",
    triggers: ["project library validation"],
    topics: ["project-library"],
    applicability: { level: "global" },
    body: "Use the global validation path.",
    createdAt: now,
    updatedAt: now,
  });
  writeCard(globalDataDir, {
    id: "other-project-stack-validation",
    status: "active",
    title: "Other project validation",
    category: "测试验收",
    summary: "This card belongs to another project.",
    rule: "Do not recall in this project.",
    triggers: ["project library validation"],
    topics: ["project-library"],
    applicability: { level: "project", projectKey: "github.com/other/project" },
    body: "Do not recall in this project.",
    createdAt: now,
    updatedAt: now,
  });
  fs.writeFileSync(path.join(projectLibrary, "experiences", "active", "project-stack-validation.md"), serializeCard({
    id: "project-stack-validation",
    status: "active",
    title: "Project stack validation",
    category: "测试验收",
    summary: "Project-local validation should be preferred in this repository.",
    rule: "Use the project-local validation path.",
    triggers: ["project library validation"],
    negativeTriggers: [],
    aliases: {},
    topics: ["project-library"],
    applicability: { level: "global" },
    intentModes: { include: [], exclude: [] },
    requiredSignals: [],
    blockedSignals: [],
    language: "auto",
    recallPolicy: "must",
    risk: "high",
    confidence: "high",
    staleAfter: null,
    sources: [],
    origin: { adapter: "manual", agent: "codex", model: null, sessionId: null, projectKey: null, createdBy: "manual" },
    sourceRefs: [],
    body: "Use the project-local validation path.",
    createdAt: now,
    updatedAt: now,
  }), "utf8");

  const stack = resolveLibraryStack(globalDataDir, projectRoot);
  const stackFromProjectLibrary = resolveLibraryStack(globalDataDir, projectLibrary);
  assert.equal(projectInit.projectLibrary, projectLibrary);
  assert.equal(stack.libraries.length, 2);
  assert.equal(stackFromProjectLibrary.projectContext.root, projectRoot);
  const cards = readLibraryStackCards(stack);
  const matches = matchCardEntries(cards, "project library validation", { projectContext: stack.projectContext, threshold: 20 });
  const ids = matches.map((match) => match.card.id);
  assert.equal(ids[0], "project-stack-validation");
  assert.ok(matches[0].similarCards.some((card) => card.id === "global-project-stack-validation"));
  assert.equal(ids.includes("other-project-stack-validation"), false);
  const context = renderAdditionalContext(matches);
  assert.ok(context.includes(`[Project stack validation](<${path.join(projectLibrary, "experiences", "active", "project-stack-validation.md")}>)`));
  assert.match(context, /ome experience show project-stack-validation --scope project --section rule/);
  assert.equal(fs.existsSync(path.join(projectLibrary, "events.jsonl")), false);
});

test("card ids reject path separators", () => {
  const dataDir = tmpDir("card-id");
  initializeDataDir({ dataDir });
  assert.throws(() => writeCard(dataDir, {
    id: "bad/id",
    status: "active",
    title: "Bad id",
    summary: "Card ids must stay flat.",
    rule: "Reject card ids with path separators.",
    triggers: ["bad"],
    topics: ["test"],
    body: "Path separators would make this card disappear from the flat experience listing.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), /path separators/);
});

test("matcher handles partial trigger tokens and Chinese variants", () => {
  const dataDir = tmpDir("match-token");
  initializeDataDir({ dataDir });
  removeStarterCards(dataDir);
  const runId = "run-token";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "Mixed trigger token matching",
    summary: "P",
    rule: "C",
    triggers: ["git commit", "浏览器验证"],
    topics: ["frontend"],
    evidence: ["e"],
    recallPolicy: "must",
  });
  writeTestCandidates(dataDir, runId, [candidate]);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "approve" });
  const draft = applyRetrospective(dataDir, runId).drafts[0];
  promoteDraft(dataDir, draft.id);
  assert.equal(matchCards(dataDir, "commit my staged changes carefully").length, 1);
  assert.equal(matchCards(dataDir, "在浏览器里验证前端页面").length, 1);
  assert.equal(matchCards(dataDir, "在浏览器里验证前端页面", { timeoutMs: -1, failOpenOnTimeout: true }).length, 0);
});

test("starter lessons recall the first-run goal execution example", () => {
  const dataDir = tmpDir("starter-goal-example");
  initializeDataDir({ dataDir });
  const query = [
    "Create a goal and start now: in /tmp/ome-todo-demo, build a small single-page Todo app with plain HTML, CSS, and JavaScript.",
    "It should let me add tasks, mark tasks complete, delete tasks, clear completed tasks, show the remaining count, persist tasks in localStorage, and verify it through the real browser entry.",
  ].join(" ");
  const matches = matchCards(dataDir, query);
  assert.equal(matches[0]?.card.id, "starter-agent-goal-execution");
  const context = renderAdditionalContext(matches);
  assert.match(context, /Enter full-closure delivery mode when a goal starts/);
  assert.match(context, /ome experience show starter-agent-goal-execution --section rule/);
  const fullCard = getCard(dataDir, "starter-agent-goal-execution");
  assert.match(fullCard.rule, /Default execution rules/);
  assert.match(fullCard.rule, /Completion must fail closed/);
});

test("starter goal lesson does not recall for documentation or explanation examples", () => {
  const dataDir = tmpDir("starter-goal-near-misses");
  initializeDataDir({ dataDir });

  for (const query of [
    "write documentation that explains how to create a goal in Codex",
    "discuss what /goal means without executing anything",
    "create a business goal for Q3 OKR",
  ]) {
    const matches = matchCards(dataDir, query, { threshold: 20 });
    assert.equal(matches.some((item) => item.card.id === "starter-agent-goal-execution"), false, query);
  }
});

test("review rewrite creates rewritten draft and merge updates target card", () => {
  const dataDir = tmpDir("rewrite-merge");
  initializeDataDir({ dataDir });
  const runId = "run-3";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const first = candidateFromFixture(runId, {
    title: "Target card",
    summary: "P",
    rule: "C",
    triggers: ["target"],
    topics: ["core"],
    evidence: ["e"],
  });
  writeTestCandidates(dataDir, runId, [first]);
  addDecision(dataDir, runId, { candidateId: first.id, action: "approve" });
  const draft = applyRetrospective(dataDir, runId).drafts[0];
  promoteDraft(dataDir, draft.id);

  const runId2 = "run-4";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId2), { recursive: true });
  const rewrite = candidateFromFixture(runId2, {
    title: "Rewrite card",
    summary: "P",
    rule: "old",
    triggers: ["rewrite"],
    topics: ["core"],
    evidence: ["e"],
  });
  const merge = candidateFromFixture(runId2, {
    title: "Merge card",
    summary: "P",
    rule: "merged approach",
    triggers: ["merged"],
    topics: ["core"],
    evidence: ["e2"],
  });
  writeTestCandidates(dataDir, runId2, [rewrite, merge]);
  addDecision(dataDir, runId2, { candidateId: rewrite.id, action: "rewrite", rewrite: { rule: "new" } });
  addDecision(dataDir, runId2, { candidateId: merge.id, action: "merge", targetCardId: draft.id });
  const result = applyRetrospective(dataDir, runId2);
  assert.equal(result.drafts.length, 1);
  const mergedCard = readCardFile(cardPath(dataDir, "active", draft.id));
  assert.match(mergedCard.rule, /merged approach/);
  assert.match(mergedCard.body, /## 完整规则/);
  assert.match(mergedCard.body, /merged approach/);
  assert.equal(matchCards(dataDir, "merged").length, 1);
});

test("review merge and rewrite fail fast when payload is incomplete", () => {
  const dataDir = tmpDir("decision-fail-fast");
  initializeDataDir({ dataDir });
  const runId = "run-5";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "Needs payload",
    summary: "P",
    rule: "C",
    triggers: ["payload"],
    topics: ["core"],
    evidence: ["e"],
  });
  writeTestCandidates(dataDir, runId, [candidate]);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "merge", targetCardId: "missing-card" });
  const preview = previewApplyRetrospective(dataDir, runId);
  assert.equal(preview.ok, false);
  assert.match(preview.errors[0].error, /not found/);
  assert.throws(() => applyRetrospective(dataDir, runId), /not found/);
});

test("retrospective candidates reject duplicate ids before apply", () => {
  const dataDir = tmpDir("candidate-dupe");
  initializeDataDir({ dataDir });
  const runId = "run-dupe";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "Same",
    summary: "P",
    rule: "C",
    triggers: ["same"],
    topics: ["core"],
    evidence: ["e"],
  });
  assert.throws(() => writeTestCandidates(dataDir, runId, [candidate, candidate]), /duplicate retrospective candidate id/);
});

test("doctor fails when active index is stale", () => {
  const dataDir = tmpDir("doctor-index");
  initializeDataDir({ dataDir });
  const runId = "run-index";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "Indexed card",
    summary: "P",
    rule: "C",
    triggers: ["indexed"],
    topics: ["core"],
    evidence: ["e"],
  });
  writeTestCandidates(dataDir, runId, [candidate]);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "approve" });
  const draft = applyRetrospective(dataDir, runId).drafts[0];
  promoteDraft(dataDir, draft.id);
  fs.writeFileSync(layout(dataDir).experienceIndex, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), cards: [] }), "utf8");
  const result = runDoctor(dataDir);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing from index/);
});

test("source index is lightweight and rebuildable from source records", () => {
  const dataDir = tmpDir("session-index");
  initializeDataDir({ dataDir });
  const sourceFile = path.join(dataDir, "source.jsonl");
  fs.writeFileSync(sourceFile, "{\"type\":\"message\"}\n", "utf8");
  const session = {
    id: "session-1",
    provider: "codex",
    sourcePath: sourceFile,
    startedAt: "2026-06-05T00:00:00.000Z",
    cwd: "/tmp/project",
    summary: "fixture summary",
    messages: [
      { role: "user", text: "one", createdAt: null },
      { role: "assistant", text: "two", createdAt: null },
    ],
    metadataHash: "hash",
  };
  writeSessionRecords(dataDir, [session]);

  const result = rebuildSessionIndex(dataDir);
  const index = readSessionIndex(dataDir);
  const raw = JSON.parse(fs.readFileSync(layout(dataDir).sourceIndex, "utf8"));

  assert.equal(result.sessions, 1);
  assert.equal(index.sessions[0].messageCount, 2);
  assert.equal(index.sessions[0].sessionFile, "");
  assert.equal(index.sessions[0].materialized, false);
  assert.equal(index.sessions[0].sourceExists, true);
  assert.equal("messages" in raw.sessions[0], false);
});

test("session index compact dry-run reports savings without mutating", () => {
  const dataDir = tmpDir("session-compact");
  initializeDataDir({ dataDir });
  fs.writeFileSync(layout(dataDir).sourceIndex, JSON.stringify({
    version: 1,
    updatedAt: "2026-06-05T00:00:00.000Z",
    sessions: [{
      id: "legacy",
      provider: "codex",
      sourcePath: "/tmp/source.jsonl",
      startedAt: null,
      cwd: null,
      summary: "legacy",
      messages: [{ role: "user", text: "x".repeat(1000), createdAt: null }],
      metadataHash: "hash",
    }],
  }, null, 2), "utf8");
  const before = fs.readFileSync(layout(dataDir).sourceIndex, "utf8");

  const dryRun = compactSessionIndex(dataDir, { dryRun: true });
  assert.equal(dryRun.dryRun, true);
  assert.ok(dryRun.savedBytes > 0);
  assert.equal(fs.readFileSync(layout(dataDir).sourceIndex, "utf8"), before);

  const applied = compactSessionIndex(dataDir);
  assert.equal(applied.dryRun, false);
  const raw = JSON.parse(fs.readFileSync(layout(dataDir).sourceIndex, "utf8"));
  assert.equal(raw.storage, "sources");
  assert.equal("messages" in raw.sessions[0], false);
});

test("session index compact can drop source summaries", () => {
  const dataDir = tmpDir("session-compact-drop-summary");
  initializeDataDir({ dataDir });
  const sourceFile = path.join(dataDir, "source.jsonl");
  fs.writeFileSync(sourceFile, "{\"type\":\"message\"}\n", "utf8");
  writeSessionRecords(dataDir, [{
    id: "summary-session",
    provider: "codex",
    sourcePath: sourceFile,
    startedAt: null,
    cwd: null,
    summary: "raw user-facing summary",
    messages: [{ role: "user", text: "message", createdAt: null }],
    metadataHash: "hash",
  }]);

  const dryRun = compactSessionIndex(dataDir, { dryRun: true, dropSummaries: true });
  assert.equal(dryRun.dropSummaries, true);
  assert.equal(readSessionIndex(dataDir).sessions[0].summary, "raw user-facing summary");

  const applied = compactSessionIndex(dataDir, { dropSummaries: true });
  assert.equal(applied.dropSummaries, true);
  assert.equal(readSessionIndex(dataDir).sessions[0].summary, "");
});

test("storage compact keeps primary recall assets intact", () => {
  const dataDir = tmpDir("storage-compact");
  initializeDataDir({ dataDir });
  fs.writeFileSync(path.join(dataDir, ".DS_Store"), "finder", "utf8");
  fs.writeFileSync(path.join(layout(dataDir).indexes, ".DS_Store"), "finder", "utf8");
  fs.writeFileSync(path.join(dataDir, "config.json.bak-test"), "backup", "utf8");
  fs.mkdirSync(path.join(dataDir, "_cleanup", "old-run"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "_cleanup", "old-run", "note.md"), "legacy cleanup", "utf8");
  fs.mkdirSync(path.join(dataDir, "reviews"), { recursive: true });
  const sourceFile = path.join(dataDir, "s.jsonl");
  fs.writeFileSync(sourceFile, "{\"type\":\"message\"}\n", "utf8");
  writeSessionRecords(dataDir, [{
    id: "s",
    provider: "codex",
    sourcePath: sourceFile,
    startedAt: null,
    cwd: null,
    summary: "summary",
    messages: [{ role: "user", text: "message", createdAt: null }],
    metadataHash: "hash",
  }]);
  rebuildSessionIndex(dataDir);
  const cardsBefore = listCards(dataDir).map((card) => card.id).sort();

  const audit = auditStorage(dataDir);
  assert.equal(audit.ok, true);
  const dryRun = compactStorage(dataDir, { dryRun: true });
  assert.equal(dryRun.dryRun, true);
  assert.equal(fs.existsSync(path.join(dataDir, ".DS_Store")), true);
  assert.equal(fs.existsSync(path.join(layout(dataDir).indexes, ".DS_Store")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "_cleanup")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "reviews")), true);

  const compacted = compactStorage(dataDir);
  assert.equal(compacted.ok, true);
  assert.equal(fs.existsSync(path.join(dataDir, ".DS_Store")), false);
  assert.equal(fs.existsSync(path.join(layout(dataDir).indexes, ".DS_Store")), false);
  assert.equal(fs.existsSync(path.join(dataDir, "config.json.bak-test")), false);
  assert.equal(fs.existsSync(path.join(layout(dataDir).backups, "config", "config.json.bak-test")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "_cleanup")), false);
  assert.equal(fs.existsSync(path.join(layout(dataDir).backups, "legacy", "_cleanup", "old-run", "note.md")), true);
  assert.equal(fs.existsSync(path.join(dataDir, "reviews")), false);
  assert.deepEqual(listCards(dataDir).map((card) => card.id).sort(), cardsBefore);
  assert.equal(runDoctor(dataDir).ok, true);
});

test("source catalog has no materialized caches to prune", () => {
  const dataDir = tmpDir("session-prune");
  const sourceDir = tmpDir("session-prune-source");
  initializeDataDir({ dataDir });
  const recoverableSource = path.join(sourceDir, "recoverable.jsonl");
  fs.writeFileSync(recoverableSource, "{\"type\":\"message\"}\n", "utf8");
  writeSessionRecords(dataDir, [{
    id: "recoverable",
    provider: "codex",
    sourcePath: recoverableSource,
    startedAt: null,
    cwd: null,
    summary: "recoverable",
    messages: [{ role: "user", text: "message", createdAt: null }],
    metadataHash: "hash-1",
  }, {
    id: "missing",
    provider: "codex",
    sourcePath: path.join(sourceDir, "missing.jsonl"),
    startedAt: null,
    cwd: null,
    summary: "missing",
    messages: [{ role: "user", text: "message", createdAt: null }],
    metadataHash: "hash-2",
  }]);

  const catalog = rebuildSessionCatalog(dataDir);
  assert.equal(catalog.sessions, 2);
  assert.equal(catalog.recoverable, 1);
  assert.equal(catalog.missingSources, 1);
  assert.equal(fs.existsSync(layout(dataDir).sourceIndex), true);

  const dryRun = pruneMaterializedSessions(dataDir, { dryRun: true });
  assert.equal(dryRun.pruned, 0);

  assert.throws(() => pruneMaterializedSessions(dataDir), /requires --yes/);
  const applied = pruneMaterializedSessions(dataDir, { yes: true });
  assert.equal(applied.pruned, 0);
  const index = readSessionIndex(dataDir);
  assert.equal(index.sessions.length, 2);

  const rebuiltCatalog = rebuildSessionCatalog(dataDir, { dryRun: true });
  assert.equal(rebuiltCatalog.sessions, 2);
  assert.equal(rebuiltCatalog.recoverable, 1);
  const recoverableCatalogEntry = rebuiltCatalog.catalog.sessions.find((session) => session.id === "recoverable");
  assert.equal(recoverableCatalogEntry.materialized, false);
  assert.equal(recoverableCatalogEntry.sessionFile, "");
  const missingCatalogEntry = rebuiltCatalog.catalog.sessions.find((session) => session.id === "missing");
  assert.equal(missingCatalogEntry.materialized, false);

  const secondPass = pruneMaterializedSessions(dataDir, { yes: true });
  assert.equal(secondPass.pruned, 0);
});

test("session store mode is explicit config, not implicit deletion", () => {
  const dataDir = tmpDir("session-mode");
  initializeDataDir({ dataDir });
  const result = setSessionStoreMode(dataDir, { store: "recent", retainDays: 45 });
  assert.equal(result.sessions.store, "recent");
  assert.equal(result.sessions.retainDays, 45);
  assert.throws(() => setSessionStoreMode(dataDir, { store: "delete" }), /pointer, recent, or full/);
});

test("stats does not mark every card stale before hook is installed", () => {
  const dataDir = tmpDir("stats-no-hook");
  initializeDataDir({ dataDir });
  const runId = "run-stats";
  fs.mkdirSync(path.join(layout(dataDir).retrospectives, runId), { recursive: true });
  const candidate = candidateFromFixture(runId, {
    title: "Stats card",
    summary: "P",
    rule: "C",
    triggers: ["stats"],
    topics: ["core"],
    evidence: ["e"],
  });
  writeTestCandidates(dataDir, runId, [candidate]);
  addDecision(dataDir, runId, { candidateId: candidate.id, action: "approve" });
  const draft = applyRetrospective(dataDir, runId).drafts[0];
  promoteDraft(dataDir, draft.id);
  const stats = generateStats(dataDir);
  assert.deepEqual(stats.staleCards, []);
  assert.match(stats.maintenanceActions.join("\n"), /No hook events yet/);
});

test("live locks are not forcefully recovered", () => {
  const dataDir = tmpDir("lock-live");
  initializeDataDir({ dataDir });
  const lockPath = path.join(layout(dataDir).locks, "cards.lock");
  fs.mkdirSync(lockPath, { recursive: true });
  fs.writeFileSync(path.join(lockPath, "lock.json"), JSON.stringify({ pid: process.pid, createdAt: "2000-01-01T00:00:00.000Z" }), "utf8");
  assert.throws(() => withLock(dataDir, "cards", () => null, { staleMs: 1 }), /resource is locked/);
});

test("writes refuse symlink escape paths inside dataDir", () => {
  const dataDir = tmpDir("symlink");
  const outside = tmpDir("outside");
  initializeDataDir({ dataDir });
  fs.symlinkSync(outside, path.join(layout(dataDir).experiences, "draft", "escape"));
  assert.throws(
    () => writeTextAtomic(path.join(layout(dataDir).experiences, "draft", "escape", "leak.md"), "no", dataDir),
    /outside dataDir/,
  );
});
