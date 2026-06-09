import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync, spawn } from "node:child_process";

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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

test("CLI full lifecycle runs in temporary dataDir", () => {
  const dataDir = tmpDir("full");
  const init = json(run(["init", "--data-dir", dataDir, "--json"]));
  assert.equal("locale" in init, false);
  const importResult = json(run(["import", "codex", "--sessions", path.join(root, "tests", "fixtures", "codex"), "--data-dir", dataDir, "--json"]));
  assert.equal(importResult.imported.length, 3);
  const sessionIndex = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8"));
  assert.equal(sessionIndex.storage, "sources");
  assert.equal("messages" in sessionIndex.sessions[0], false);
  const storageAudit = json(run(["storage", "audit", "--data-dir", dataDir, "--json"]));
  assert.equal(storageAudit.ok, true);
  const compactDryRun = json(run(["compact", "--dry-run", "--data-dir", dataDir, "--json"]));
  assert.equal(compactDryRun.dryRun, true);
  assert.ok(compactDryRun.actions.some((action) => action.reason.includes("source catalog")));
  const sessionsCompact = json(run(["source", "compact-index", "--data-dir", dataDir, "--json"]));
  assert.equal(sessionsCompact.index.storage, "sources");
  const sessionMode = json(run(["source", "set-mode", "recent", "--retain-days", "45", "--data-dir", dataDir, "--json"]));
  assert.equal(sessionMode.sessions.store, "recent");
  assert.equal(sessionMode.sessions.retainDays, 45);
  const retrospective = json(run(["create-reflect", "--data-dir", dataDir, "--json"]));
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
    candidates: [{
      title: "UI browser validation",
      summary: "UI was not validated in browser.",
      rule: "Use browser validation and console check.",
      category: "测试验收",
      triggers: ["UI", "浏览器验证"],
      topics: ["frontend", "console"],
      evidence: ["e2e"],
      risk: "high",
      recallPolicy: "must",
    }],
  }), "utf8");
  const candidates = json(run(["reflect", "candidates", retrospective.runId, "--from-file", candidatesFile, "--data-dir", dataDir, "--json"]));
  const candidateId = candidates.candidates[0].id;
  assert.equal(candidates.candidates[0].evidence.length, 1);
  assert.equal(candidates.candidates[0].category, "测试验收");
  assert.equal(candidates.reviewFile, path.join(dataDir, "retrospectives", retrospective.runId, "retrospective.md"));
  assert.equal(candidates.consoleCommand, "ome serve");
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /经验复盘/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /审计：coverage=all-accessible \/ focus=fixture focus \/ sources=1 \/ gaps=0/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 经验总结/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 触发时机/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 可复用规则/);
  assert.match(fs.readFileSync(candidates.reviewFile, "utf8"), /### 审批区/);
  const humanShow = run(["reflect", "show", retrospective.runId, "--data-dir", dataDir]);
  assert.equal(humanShow.status, 0, `${humanShow.stderr}\n${humanShow.stdout}`);
  assert.match(humanShow.stdout, /Approval file:/);
  assert.match(humanShow.stdout, /Console approval: ome serve/);
  json(run(["category", "create", "Git 操作", "--data-dir", dataDir, "--json"]));
  const added = json(run(["reflect", "add", retrospective.runId, "--title", "Git diff scope", "--category", "Git 操作", "--summary", "Unrelated files were mixed", "--rule", "Keep the diff scoped", "--triggers", "git status,commit", "--topics", "git", "--data-dir", dataDir, "--json"]));
  assert.equal(added.candidates.length, 2);
  json(run(["reflect", "decide", retrospective.runId, candidateId, "--action", "approve", "--category", "产品与 UI", "--data-dir", dataDir, "--json"]));
  const dryRun = json(run(["reflect", "apply", retrospective.runId, "--dry-run", "--data-dir", dataDir, "--json"]));
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.drafts.length, 1);
  assert.equal(json(run(["experience", "list", "--status", "draft", "--data-dir", dataDir, "--json"])).experiences.length, 0);
  const humanApply = run(["reflect", "apply", retrospective.runId, "--data-dir", dataDir]);
  assert.equal(humanApply.status, 0, `${humanApply.stderr}\n${humanApply.stdout}`);
  assert.match(humanApply.stdout, /Experience drafts:/);
  assert.match(humanApply.stdout, /Experience drafts are not recalled yet/);
  const reviewAfterApply = fs.readFileSync(candidates.reviewFile, "utf8");
  assert.match(reviewAfterApply, /状态：decisions_recorded/);
  assert.deepEqual(Array.from(reviewAfterApply.matchAll(/^### (.+)$/gm), (match) => match[1]).slice(0, 4), ["经验总结", "触发时机", "可复用规则", "审批区"]);
  const humanShowAfterApply = run(["reflect", "show", retrospective.runId, "--data-dir", dataDir]);
  assert.equal(humanShowAfterApply.status, 0, `${humanShowAfterApply.stderr}\n${humanShowAfterApply.stdout}`);
  assert.match(humanShowAfterApply.stdout, /Approval decisions are recorded/);
  const draftCards = json(run(["experience", "list", "--status", "draft", "--data-dir", dataDir, "--json"])).experiences;
  const draftCard = draftCards.find((card) => card.title === "UI browser validation");
  assert.ok(draftCard);
  const cardId = draftCard.id;
  assert.equal(draftCard.category, "产品与 UI");
  const ruleShow = run(["experience", "show", cardId, "--section", "rule", "--data-dir", dataDir]);
  assert.equal(ruleShow.status, 0, `${ruleShow.stderr}\n${ruleShow.stdout}`);
  assert.match(ruleShow.stdout, /Use browser validation and console check/);
  json(run(["experience", "approve", cardId, "--data-dir", dataDir, "--json"]));
  const match = json(run(["match", "修复 UI 并做 浏览器验证", "--data-dir", dataDir, "--json"]));
  assert.equal(match.matches.length, 1);
  const explained = json(run(["match", "修复 UI 并做 浏览器验证", "--explain", "--data-dir", dataDir, "--json"]));
  assert.equal(explained.matches[0].id, cardId);
  assert.ok(explained.matches[0].reasons.length > 0);
  assert.match(explained.additionalContext, new RegExp(`Full experience: ome experience show ${cardId} --section rule`));
  const suiteFile = path.join(dataDir, "recall-suite.json");
  fs.writeFileSync(suiteFile, JSON.stringify({ cases: [{ id: "ui", prompt: "修复 UI 并做 浏览器验证", expectedCards: [cardId] }] }), "utf8");
  const evalReport = json(run(["eval", "recall", "--suite", suiteFile, "--use-current-library", "--data-dir", dataDir, "--json"]));
  assert.equal(evalReport.ok, true);
  assert.equal(evalReport.metrics.recallAtK, 1);
  const beforeReport = path.join(dataDir, "before-report.json");
  const afterReport = path.join(dataDir, "after-report.json");
  fs.writeFileSync(beforeReport, JSON.stringify(evalReport), "utf8");
  fs.writeFileSync(afterReport, JSON.stringify(evalReport), "utf8");
  const compare = json(run(["eval", "compare", "--base", beforeReport, "--next", afterReport, "--data-dir", dataDir, "--json"]));
  assert.equal(compare.ok, true);
  assert.equal(compare.metrics.recallAtK.delta, 0);
  const hookEval = json(run(["eval", "hook", "--provider", "claude", "--data-dir", dataDir, "--json"]));
  assert.equal(hookEval.ok, true);
  assert.equal(hookEval.assertions.doesNotStoreRawPrompt, true);
  const hook = json(run(["hook", "run", "--data-dir", dataDir, "--json"], { input: JSON.stringify({ prompt: "修复 UI 并做 浏览器验证", session_id: "s1", turn_id: "t1" }) }));
  assert.ok(hook.hookSpecificOutput.additionalContext.includes("UI browser validation"));
  const stats = json(run(["stats", "--data-dir", dataDir, "--json"]));
  assert.equal(stats.cardRecallCount[cardId], 1);
  assert.equal(json(run(["doctor", "--data-dir", dataDir, "--json"])).ok, true);
});

test("reflect candidates rejects missing source audit unless explicitly overridden", () => {
  const dataDir = tmpDir("audit-gate");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const retrospective = json(run(["create-reflect", "--data-dir", dataDir, "--json"]));
  const candidatesFile = path.join(dataDir, "auditless-candidates.json");
  fs.writeFileSync(candidatesFile, JSON.stringify({
    candidates: [{
      title: "Auditless candidate",
      summary: "This candidate has no source audit.",
      rule: "It should not pass silently.",
      triggers: ["retrospective"],
      topics: ["audit"],
    }],
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
  const result = run(["create-reflect", "--from-session", "abc123", "--data-dir", dataDir, "--json"]);
  assert.notEqual(result.status, 0);
  const error = JSON.parse(result.stdout);
  assert.match(error.error.message, /does not accept --from-session/);
});

test("reflect run creation has no compatibility command names", () => {
  for (const command of ["review", "retrospective", "prepare"]) {
    const result = run([command, "--json"]);
    assert.notEqual(result.status, 0, command);
    const error = JSON.parse(result.stdout);
    assert.match(error.error.message, new RegExp(`unknown command: ${command}`));
  }

  const reflect = run(["reflect", "--json"]);
  assert.notEqual(reflect.status, 0);
  const error = JSON.parse(reflect.stdout);
  assert.match(error.error.message, /manages an existing reflect run/);
  assert.match(error.error.message, /ome create-reflect/);
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
  assert.match(result.stdout, /ome create-reflect/);
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
  assert.match(human.stderr, /Did you mean: ome match/);
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
  assert.equal(nextConfig.retrieval.maxCards, 8);
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
    input: "\ny\nn\n",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /____  __  ___ ______/);
  assert.match(result.stdout, /Oh My Experience v\d+\.\d+\.\d+/);
  assert.match(result.stdout, /Stop teaching your agent the same lesson twice/);
  assert.match(result.stdout, /Local-first · Review-first · Prompt-time recall/);
  assert.match(result.stdout, /Enter accepts path defaults · confirmation requires y\/n · Ctrl\+C cancels/);
  assert.match(result.stdout, /Start with built-in starter lessons today/);
  assert.match(result.stdout, /First, send a real task to your agent to feel prompt-time recall/);
  assert.match(result.stdout, /Copy the entire Markdown code block below into Codex, Claude, or another agent/);
  assert.match(result.stdout, /```text/);
  assert.match(result.stdout, /Create a single HTML file for a Kanban board page/);
  assert.match(result.stdout, /not a landing page or a full app/);
  assert.match(result.stdout, /Linear-inspired, work-focused style/);
  assert.match(result.stdout, /After the task summary, naturally ask whether I want to start an OME retrospective scan/);
  assert.match(result.stdout, /```/);
  assert.match(result.stdout, /After the first recall:/);
  assert.match(result.stdout, /ask whether to start the OME retrospective scan/);
  assert.match(result.stdout, /After setup \(optional\):/);
  assert.match(result.stdout, /Import more agent histories with Spool/);
  assert.match(result.stdout, /Claude CLI, Gemini CLI, opencode/);
  assert.match(result.stdout, /github\.com\/rennzhang\/oh-my-experience\/blob\/main\/docs\/guides\/import-sources\.md/);
  assert.match(result.stdout, /Optional: connect Spool CLI/);
  assert.match(result.stdout, /Why install it/);
  assert.match(result.stdout, /Spool is a local AI session index/);
  assert.match(result.stdout, /Without it: OME still draws from the current conversation/);
  assert.match(result.stdout, /With it: index-first lookup, then evidence on demand/);
  assert.match(result.stdout, /saves[\s\S]{0,40}tokens/);
  assert.match(result.stdout, /think traces[\s\S]{0,40}tool[\s\S]{0,40}logs/);
  assert.match(result.stdout, /github\.com\/spool-lab\/spool/);
  assert.match(result.stdout, /npm install -g @spool-lab\/cli/);
  assert.match(result.stdout, /CLI only; no desktop app/);
  assert.match(result.stdout, /Install Spool CLI now/);
  assert.match(result.stdout, /Skipped Spool; OME core recall still works/);
  assert.doesNotMatch(result.stdout, /Create a scheduled retrospective task/);
  assert.doesNotMatch(result.stdout, /scheduled-retrospectives\.md/);
  assert.match(result.stdout, /Step 1\/2/);
  assert.match(result.stdout, /Step 2\/2/);
  assert.match(result.stdout, /Install Codex experience recall/);
  assert.match(result.stdout, /two local entry points/);
  assert.match(result.stdout, /Where should the experience library live/);
  assert.match(result.stdout, /UserPromptSubmit hook/);
  assert.match(result.stdout, /hooks\.json/);
  assert.match(result.stdout, /oh-my-experience skill/);
  assert.match(result.stdout, /skills\/oh-my-experience/);
  assert.match(result.stdout, /Codex App may ask you to trust the new UserPromptSubmit hook/);
  assert.match(result.stdout, /Continue\?/);
  assert.match(result.stdout, /OME will save this library path, install the Codex hook and skill shown above, and add built-in starter lessons/);
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
    input: "\ny\ny\n",
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Spool CLI detected. Enable Spool imports/);
  assert.match(result.stdout, /Detected Spool version: spool-test 9\.9\.9/);
  assert.match(result.stdout, /Spool imports enabled/);

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
    input: "\ny\n",
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

test("human CLI stays English by default and only uses Chinese with explicit OME_LANGUAGE", () => {
  const english = run(["help"], { env: { LANG: "zh_CN.UTF-8", NO_COLOR: "1" } });
  assert.equal(english.status, 0, `${english.stderr}\n${english.stdout}`);
  assert.match(english.stdout, /Common path:/);
  assert.equal(english.stdout.includes("常用路径:"), false);

  const chinese = run(["help"], { env: { OME_LANGUAGE: "zh-CN", LANG: "en_US.UTF-8", NO_COLOR: "1" } });
  assert.equal(chinese.status, 0, `${chinese.stderr}\n${chinese.stdout}`);
  assert.match(chinese.stdout, /常用路径:/);
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
  const result = json(run(["import", "codex", "--sessions", path.join(root, "tests", "fixtures", "codex"), "--data-dir", dataDir, "--json"]));
  assert.equal(result.failed.length, 0);
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8")).sessions;
  const parsed = sessions.find((session) => session.summary.includes("dataDir"));
  assert.ok(parsed, "array content fixture should be indexed");
  assert.equal("messages" in parsed, false);
  assert.equal(parsed.sessionFile, "");
  assert.equal(parsed.materialized, false);
  const filtered = sessions.find((session) => session.summary.includes("真实执行经验"));
  assert.ok(filtered, "user-visible content should remain");
  assert.equal(filtered.summary.includes("harness instruction"), false);
  assert.ok(filtered.messageCount >= 2);
  assert.equal(filtered.sessionFile, "");
});

test("global hook installs and uninstalls without project setup", () => {
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
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  const dryRun = json(run(["hook", "install", "--codex-home", localCodexHome, "--dry-run", "--data-dir", dataDir, "--json"]));
  assert.equal(dryRun.dryRun, true);
  const installed = json(run(["hook", "install", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(installed.installed, true);
  assert.equal(installed.installTarget, "global");
  const hooksJson = JSON.parse(fs.readFileSync(path.join(localCodexHome, "hooks.json"), "utf8"));
  const commands = hooksJson.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks).map((hook) => hook.command);
  assert.equal(commands.filter((command) => command.includes("ome hook run")).length, 1);
  assert.equal(commands.includes("echo keep-me"), true);
  assert.match(commands.find((command) => command.includes("ome hook run")), /--json/);
  assert.match(commands.find((command) => command.includes("ome hook run")), /--data-dir '.*\$\(bad\)'/);
  const status = json(run(["hook", "status", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(status.installed, true);
  json(run(["hook", "uninstall", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  const uninstalledHooksJson = JSON.parse(fs.readFileSync(path.join(localCodexHome, "hooks.json"), "utf8"));
  const remainingCommands = uninstalledHooksJson.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks).map((hook) => hook.command);
  assert.equal(remainingCommands.some((command) => command.includes("ome hook run")), false);
  assert.equal(remainingCommands.includes("echo keep-me"), true);
  const after = json(run(["hook", "status", "--codex-home", localCodexHome, "--data-dir", dataDir, "--json"]));
  assert.equal(after.installed, false);
});

test("skill lifecycle protects user-owned targets", () => {
  const localCodexHome = tmpDir("skill-codex-home");
  const skillDir = path.join(localCodexHome, "skills", "oh-my-experience");
  const installed = json(run(["skill", "install", "--codex-home", localCodexHome, "--json"]));
  assert.equal(installed.installed, true);
  assert.equal(installed.owned, true);
  assert.equal(fs.existsSync(path.join(skillDir, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(skillDir, ".ome-skill.json")), true);
  const status = json(run(["skill", "status", "--codex-home", localCodexHome, "--json"]));
  assert.equal(status.installed, true);
  assert.equal(status.owned, true);
  const removed = json(run(["skill", "uninstall", "--codex-home", localCodexHome, "--json"]));
  assert.equal(removed.uninstalled, true);
  assert.equal(fs.existsSync(skillDir), false);

  const conflictHome = tmpDir("skill-conflict-home");
  const conflictDir = path.join(conflictHome, "skills", "oh-my-experience");
  fs.mkdirSync(conflictDir, { recursive: true });
  fs.writeFileSync(path.join(conflictDir, "SKILL.md"), "---\nname: custom-skill\n---\n", "utf8");
  const conflict = run(["skill", "install", "--codex-home", conflictHome, "--json"]);
  assert.notEqual(conflict.status, 0);
  assert.match(JSON.parse(conflict.stdout).error.message, /not owned by OME/);
  assert.equal(fs.readFileSync(path.join(conflictDir, "SKILL.md"), "utf8").includes("custom-skill"), true);
  const forced = json(run(["skill", "install", "--codex-home", conflictHome, "--force", "--json"]));
  assert.equal(forced.installed, true);
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
  assert.equal(result.skill.uninstalled, true);
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

test("claude hook installs through the same runtime command", () => {
  const dataDir = tmpDir("claude-hook");
  const claudeHome = tmpDir("claude-home");
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
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  const installed = json(run(["hook", "install", "--provider", "claude", "--claude-home", claudeHome, "--data-dir", dataDir, "--json"]));
  assert.equal(installed.provider, "claude");
  assert.equal(installed.installed, true);
  assert.equal(installed.installTarget, "global");
  const settings = JSON.parse(fs.readFileSync(path.join(claudeHome, "settings.json"), "utf8"));
  const commands = settings.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks).map((hook) => hook.command);
  assert.equal(commands.filter((command) => command.includes("ome hook run")).length, 1);
  assert.equal(commands.includes("echo keep-me"), true);
  assert.match(commands.find((command) => command.includes("ome hook run")), /--json/);
  const doctor = json(run(["doctor", "--data-dir", dataDir, "--claude-home", claudeHome, "--json"]));
  assert.equal(doctor.ok, true, doctor.errors.join("\n"));
});

test("hook no-hit succeeds without additionalContext", () => {
  const dataDir = tmpDir("hook-no-hit");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const hook = json(run(["hook", "run", "--data-dir", dataDir, "--json"], { input: JSON.stringify({ prompt: "unrelated tiny prompt" }) }));
  assert.deepEqual(hook, {});
});

test("hook run applies project applicability from real cwd payload", () => {
  const dataDir = tmpDir("hook-project-context");
  const projectDir = tmpDir("project-context");
  const appDir = path.join(projectDir, "app");
  const otherDir = path.join(projectDir, "other");
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(otherDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "@eval/project" }), "utf8");
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  const retrospective = json(run(["create-reflect", "--data-dir", dataDir, "--json"]));
  const candidate = json(run([
    "reflect", "add", retrospective.runId,
    "--title", "Project cwd browser card",
    "--category", "测试验收",
    "--summary", "Project-specific UI validation was missed.",
    "--rule", "Recall only inside the app module.",
    "--triggers", "project cwd browser",
    "--topics", "ui",
    "--applicability", "project",
    "--project-key", "@eval/project",
    "--module-path", "app",
    "--allow-incomplete-audit",
    "--incomplete-audit-reason", "project applicability fixture",
    "--data-dir", dataDir,
    "--json",
  ]));
  const candidateId = candidate.candidates[0].id;
  json(run(["reflect", "decide", retrospective.runId, candidateId, "--action", "approve", "--data-dir", dataDir, "--json"]));
  const applied = json(run(["reflect", "apply", retrospective.runId, "--data-dir", dataDir, "--json"]));
  const cardId = applied.drafts[0].id;
  json(run(["experience", "approve", cardId, "--data-dir", dataDir, "--json"]));
  const hit = json(run(["hook", "run", "--data-dir", dataDir, "--json"], {
    input: JSON.stringify({ prompt: "project cwd browser", cwd: appDir, session_id: "s1" }),
  }));
  assert.ok(hit.hookSpecificOutput.additionalContext.includes("Project cwd browser card"));
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

test("serve uses configured default UI port", async () => {
  const dataDir = tmpDir("serve-port");
  const port = await freePort();
  json(run(["init", "--data-dir", dataDir, "--no-hook", "--json"]));
  json(run(["config", "set", "ui.port", String(port), "--data-dir", dataDir, "--json"]));
  const child = spawn(process.execPath, [bin, "serve", "--data-dir", dataDir], {
    cwd: root,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome, CODEX_HOME: codexHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server timeout")), 5000);
      child.stdout.on("data", (chunk) => {
        const match = String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.stderr.on("data", (chunk) => reject(new Error(String(chunk))));
    });
    assert.equal(new URL(url).port, String(port));
  } finally {
    child.kill();
  }
});

test("config can point to a custom data directory", () => {
  const dataDir = tmpDir("config-a");
  const nextDir = path.join(os.tmpdir(), `ome-e2e-config-b-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const retrospective = json(run(["create-reflect", "--data-dir", dataDir, "--json"]));
  const candidatesFile = path.join(dataDir, "data-dir-candidates.json");
  fs.writeFileSync(candidatesFile, JSON.stringify({ audit: completeAudit(), candidates: [{ title: "Data directory card", summary: "P", rule: "C", triggers: ["switch config"], topics: ["config"], evidence: ["test"] }] }), "utf8");
  const candidates = json(run(["reflect", "candidates", retrospective.runId, "--from-file", candidatesFile, "--data-dir", dataDir, "--json"]));
  json(run(["reflect", "decide", retrospective.runId, candidates.candidates[0].id, "--action", "approve", "--data-dir", dataDir, "--json"]));
  const applied = json(run(["reflect", "apply", retrospective.runId, "--data-dir", dataDir, "--json"]));
  json(run(["experience", "approve", applied.drafts[0].id, "--data-dir", dataDir, "--json"]));
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

test("spool import reads official list/show JSON through PATH", () => {
  const dataDir = tmpDir("spool-import");
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
  const result = json(run(["source", "import", "spool", "--limit", "1", "--data-dir", dataDir, "--json"], { env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.imported, ["spool-1"]);
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir, "indexes", "sources.json"), "utf8")).sessions;
  assert.equal(sessions[0].provider, "spool:claude");
});

test("server and console expose local API", async () => {
  const dataDir = tmpDir("server");
  json(run(["init", "--data-dir", dataDir, "--json"]));
  const child = spawn(process.execPath, [bin, "serve", "--data-dir", dataDir, "--port", "0"], {
    cwd: root,
    env: { ...process.env, OH_MY_EXPERIENCE_CONFIG_HOME: configHome, CODEX_HOME: codexHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server timeout")), 5000);
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.stderr.on("data", (chunk) => reject(new Error(String(chunk))));
  });
  try {
    const health = await fetch(`${url}/api/health`).then((res) => res.json());
    assert.equal(health.ok, true);
    const blocked = await fetch(`${url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ key: "privacy.saveRawPrompt", value: true }),
    });
    assert.equal(blocked.status, 403);
    const preview = await fetch(`${url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ preview: true, key: "privacy.saveRawPrompt", value: true }),
    }).then((res) => res.json());
    assert.equal(preview.next, true);
    const nextDir = tmpDir("server-next");
    const blockedDataDir = await fetch(`${url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ dataDir: nextDir }),
    });
    assert.equal(blockedDataDir.status, 409);
    const blockedKey = await fetch(`${url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ key: "dataDir", value: nextDir }),
    });
    assert.equal(blockedKey.status, 409);
    const dataDirPreview = await fetch(`${url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ preview: true, dataDir: nextDir }),
    }).then((res) => res.json());
    const applied = await fetch(`${url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ dataDir: nextDir, previewToken: dataDirPreview.previewToken }),
    }).then((res) => res.json());
    assert.equal(applied.next, nextDir);
    const page = await fetch(url).then((res) => res.text());
    assert.match(page, /审批|Experience Approval/);
  } finally {
    child.kill();
  }
});
