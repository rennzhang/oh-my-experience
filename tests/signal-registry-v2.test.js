import test from "node:test";
import assert from "node:assert/strict";
import {
  SIGNAL_REGISTRY,
  getRoutingSignalIds,
  getSignalDefinition,
  getSignalNegativeTargets,
  listSignalDefinitions,
  validateSignalIds,
} from "../dist/packages/core/src/signal-registry.js";
import {
  detectIntentModes,
  detectIntentSegments,
  detectRuleSignals,
} from "../dist/packages/core/src/intent-rules.js";
import {
  buildQueryPlan,
  buildTaskEnvelope,
  tokenize,
  tokenizeSequence,
} from "../dist/packages/core/src/matcher.js";
import { matchCardEntriesDetailed } from "../dist/packages/core/src/retrieval.js";

function signalIds(text) {
  return detectRuleSignals(text).map((signal) => signal.id);
}

function envelopeSignalIds(text) {
  return buildTaskEnvelope(text).ruleSignals.map((signal) => signal.id);
}

function routedCard(id, requiredSignal, blockedSignals = []) {
  return {
    id,
    title: `Synthetic ${id}`,
    category: "test",
    status: "active",
    path: `experiences/active/${id}.md`,
    summary: `Synthetic routing card for ${id}.`,
    triggers: [`unrelated-${id}`],
    negativeTriggers: [],
    topics: ["synthetic-routing"],
    applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "" },
    intentModes: { include: [], exclude: [] },
    requiredSignals: [requiredSignal],
    requiredAllSignals: [],
    blockedSignals,
    aliases: {},
    language: "auto",
    recallPolicy: "should",
    risk: "medium",
    confidence: "medium",
    libraryScope: "global",
  };
}

test("signal registry is the complete typed source for routing and negative-target metadata", () => {
  const ids = SIGNAL_REGISTRY.map((definition) => definition.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SIGNAL_REGISTRY.every((definition) =>
    typeof definition.routing === "boolean"
    && definition.patterns.length > 0
    && ["generic", "pack"].includes(definition.source)
    && (definition.source === "generic" || Boolean(definition.pack))
  ));
  assert.ok(getRoutingSignalIds().includes("ui_surface"));
  assert.equal(getRoutingSignalIds().includes("explicit_execute"), false);
  assert.deepEqual(getSignalNegativeTargets("git_source_noise"), ["git_operation", "worktree_diff_operation"]);
  assert.equal(getSignalDefinition("architecture_quality")?.queryTerms.includes("clean-refactor"), true);
  assert.ok(listSignalDefinitions({ source: "pack", pack: "agent-goal" }).every((definition) =>
    definition.source === "pack" && definition.pack === "agent-goal"
  ));
});

test("unknown signal validation reports drift without changing valid legacy signal ids", () => {
  assert.deepEqual(validateSignalIds(["ui_surface", "unknown_pack_signal", "ui_surface"]), {
    ok: false,
    known: ["ui_surface"],
    unknown: ["unknown_pack_signal"],
  });
  assert.deepEqual(validateSignalIds(["goal_execute", "architecture_quality"]), {
    ok: true,
    known: ["goal_execute", "architecture_quality"],
    unknown: [],
  });
});

test("single-truth routing is narrow and independent from generic architecture work", () => {
  for (const prompt of [
    "不要搞一堆软连接了，只保留真源。",
    "Schema 迁移要清掉双读双写，只保留当前事实版本。",
    "保持单一事实版本，不要继续兼容旧逻辑。",
    "把 current 和 legacy 两套 reader 收敛成一套，删掉 compatibility shim。",
    "Remove the legacy compatibility shim and converge dual readers on the current schema.",
    "收敛 legacy 事实路径和 fallback 到 current 真源。",
    "Remove the legacy factual path and compatibility fallback into the current source of truth.",
    "清理旧事实字段与兼容 fallback。",
    "迁移后删除旧事实路径并保留当前入口。",
    "迁移时清理 currentStatus 和 legacyStatus 的双读 fallback，只保留 currentStatus。",
    "Converge on one source of truth; remove the legacy alias and dual-write path.",
    "迁移完成后只保留一个真实入口。",
    "把 schema 迁移彻底做干净，只留 currentStatus，删掉 legacyStatus 的双读和 fallback。",
    "不要再做 backup copy 和 compatibility shim，现有调用方迁完后只保留一个真实入口。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("single_truth_version"), prompt);
  }

  for (const prompt of [
    "解释一下语义化版本号。",
    "整理第三方 API v2 升级说明。",
    "高内聚低耦合地重构这个模块。",
    "保留 current 和 legacy 标签用于展示版本历史。",
    "Remove the compatibility layer from this helper.",
    "重构这个 helper 时移除兼容层。",
    "公共 API v1 和 v2 有已批准的六个月兼容窗口，请制定迁移计划。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("single_truth_version"), false, prompt);
  }
});

test("goal execution requires a goal, objective, or long-task execution context", () => {
  for (const prompt of [
    "创建目标并开始执行这个长任务，全部完成后逐项验收。",
    "Start a goal for this long-running migration and execute it to completion.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("goal_execute"), prompt);
  }

  for (const prompt of [
    "把这批测试全部完成并逐一验收。",
    "逐一验收前端页面的响应式布局。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("goal_execute"), false, prompt);
  }
});

test("mixed prompts keep actionable later segments instead of letting explanation context suppress the whole prompt", () => {
  const prompt = "先解释一下合成迁移原则，然后创建目标开干：把合成缓存迁移做完并自己验证。";
  const segments = detectIntentSegments(prompt);
  const modes = detectIntentModes(prompt);
  const signals = signalIds(prompt);

  assert.ok(segments[0].modes.includes("explain"));
  assert.ok(segments.at(-1).modes.includes("execute"));
  assert.ok(modes.includes("execute"));
  assert.equal(modes.includes("explain"), false);
  assert.ok(signals.includes("goal_execute"));
  assert.ok(signals.includes("explicit_execute"));
  assert.equal(signals.includes("explain_only"), false);
});

test("same-segment why wording keeps explicit debugging and execution intent", () => {
  for (const prompt of [
    "帮我处理并追查根因，为什么测试环境又失败。",
    "Fix the provider failure and investigate why it happened.",
  ]) {
    const envelope = buildTaskEnvelope(prompt);
    const modes = envelope.intentModes;
    const signals = envelope.ruleSignals.map((signal) => signal.id);

    assert.ok(modes.includes("execute"), prompt);
    assert.ok(modes.includes("debug"), prompt);
    assert.ok(signals.includes("explicit_execute"), prompt);
    assert.ok(signals.includes("failure_triage"), prompt);
    assert.equal(signals.includes("explain_only"), false, prompt);
  }
});

test("explicit explanation-only constraints still suppress execution", () => {
  for (const prompt of [
    "为什么测试环境失败？只解释原因，不要修复。",
    "Explain why the provider failed without modifying or fixing code.",
  ]) {
    const envelope = buildTaskEnvelope(prompt);
    const modes = envelope.intentModes;
    const signals = envelope.ruleSignals.map((signal) => signal.id);

    assert.equal(modes.includes("execute"), false, prompt);
    assert.ok(signals.includes("explain_only"), prompt);
    assert.equal(signals.includes("explicit_execute"), false, prompt);
  }
});

test("explanation-only and documentation examples still suppress execution signals", () => {
  const explanation = "我想知道 Codex goal 的原理是什么，只是解释一下，不要开始执行。";
  const example = "文档里要增加实际案例，比如当我说创建目标或者使用 /goal 斜杠命令时会加载什么经验，并展示给用户看。";

  assert.equal(detectIntentModes(explanation).includes("execute"), false);
  assert.deepEqual(signalIds(explanation), ["explain_only"]);
  assert.equal(detectIntentModes(example).includes("execute"), false);
  assert.ok(signalIds(example).includes("goal_example_discussion"));
  assert.equal(signalIds(example).includes("goal_execute"), false);
});

test("segment-local negative context does not erase an independent later operation", () => {
  const prompt = "GitHub 这里只是资料来源。Then update the current worktree and stage only its diff.";
  const signals = signalIds(prompt);

  assert.ok(detectIntentModes(prompt).includes("execute"));
  assert.ok(signals.includes("git_operation"));
  assert.ok(signals.includes("worktree_diff_operation"));
  assert.equal(signals.includes("git_source_noise"), false);
});

test("worktree routing distinguishes read-only review from mutation and delivery scope", () => {
  for (const prompt of [
    "Read-only review the current Git diff; do not modify, stage, commit, or push.",
    "只读查看当前 git diff 并给 findings，不修改工作区。",
    "Review 这个小 bug 的 diff 有没有过度设计、无依据抽象或 scope creep。",
    "合并两个数组并回滚数据库事务。",
    "只读查看 git diff 和 status，不修改、不暂存、不提交。",
  ]) {
    const signals = buildTaskEnvelope(prompt).ruleSignals.map((signal) => signal.id);
    assert.equal(signals.includes("worktree_diff_operation"), false, prompt);
  }

  for (const prompt of [
    "Before commit, run git status and keep unrelated dirty files out of the staged diff.",
    "继续修改当前 git diff，但不要提交。",
    "继续修改当前 git diff 但不要提交。",
    "git stage 前区分用户改动。",
    "git commit 前检查工作区。",
    "git push 前确认本任务范围。",
    "把当前 git 分支合并到 main 前先检查工作区。",
    "回滚当前 worktree 的本任务 diff。",
    "继续修改代码，先看 git status，保留用户脏改动，只处理本任务 diff，不要提交。",
    "Check git status before editing code; preserve dirty user changes and isolate the current-task diff without committing.",
    "继续改代码但不要提交；先看 git status，把用户已有脏改和本任务 diff 分开。",
  ]) {
    const signals = buildTaskEnvelope(prompt).ruleSignals.map((signal) => signal.id);
    assert.ok(signals.includes("worktree_diff_operation"), prompt);
    assert.equal(signals.includes("git_source_noise"), false, prompt);
  }

  const fileCleanupSignals = buildTaskEnvelope("清理临时测试文件，保留真实数据。").ruleSignals.map((signal) => signal.id);
  assert.equal(fileCleanupSignals.includes("worktree_diff_operation"), false);
});

test("bridge routing requires a message-service entity and supports Chinese and English", () => {
  for (const prompt of [
    "检查 tg bridge 日志和消息收发状态是否一致。",
    "Restart the Telegram bridge and verify message send/receive.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("bridge_runtime_validation"), prompt);
  }

  for (const prompt of [
    "普通 runtime 服务状态和日志是否一致。",
    "Check ordinary server runtime logs after restart.",
    "这个项目没有消息通道，也不存在消息收发，不需要 bridge 验收。",
    "There is no message channel or send/receive path, so bridge validation is not needed.",
    "只看一下 bridge pid 和运行状态，不做消息收发验收。",
    "Only check the bridge process status; do not validate message delivery.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("bridge_runtime_validation"), false, prompt);
  }
});

test("long-running liveness separates progress from wall-clock timeout and empty heartbeats", () => {
  for (const prompt of [
    "coding agent 持续有工具结果和阶段输出，不要按总墙钟时间杀掉，按 activity 续租。",
    "worker heartbeat 还活着但长期没有 progress，要进入 stalled 而不是无限续命。",
    "Use a progress stall window for the provider stream instead of a hard wall-clock timeout.",
    "heartbeat 仍在但长时间没有 progress。",
    "provider stream 仍在运行不要硬超时。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("long_running_liveness"), prompt);
  }

  for (const prompt of [
    "给普通 HTTP 请求设置 10 秒连接和读取 deadline。",
    "The user explicitly capped this offline job at five minutes.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("long_running_liveness"), false, prompt);
  }
});

test("control-plane worker divergence requires an actual split or explicit truth reconciliation", () => {
  for (const prompt of [
    "Kanban 有空槽但 Run 仍然 queued。",
    "heartbeat expired 以后 worker 还活着，控制面没有收敛。",
    "dispatch lease 与 worker report 状态不一致。",
    "核对 dispatch、lease 和 worker report 是否对齐。",
    "A slot is available but the run is still queued.",
    "Run 一直排队，但明明还有空槽。",
    "The run remains queued even though a slot is available.",
    "worker 还活着，但它的 heartbeat 已经过期。",
    "The lease disagrees with the worker report.",
    "worker report mismatch against the lease.",
    "Capacity is 3 and only 2 workers are active, but this run stays queued.",
    "The worker pool is not full, yet the run remains pending.",
    "The worker remains alive after heartbeat expiry.",
    "Heartbeat timed out while the worker process keeps running.",
    "Heartbeats expired, yet the worker is alive.",
    "There is a mismatch between the dispatch lease and the worker report.",
    "Mismatch: the lease says expired while the worker report says running.",
    "Out of sync: dispatch lease versus worker report.",
    "lease=expired, worker report=active.",
    "The dispatch lease says released, but the worker report says the process is running.",
    "Reconcile the worker report against the dispatch lease.",
    "Cross-check worker report, lease, and dispatch before releasing the slot.",
    "不一致的是 dispatch lease 和 worker report。",
    "核对 worker report、lease、dispatch 是否对齐。",
    "租约显示已释放，但 worker 报告进程还活着。",
    "The postmortem records a past mismatch between the dispatch lease and worker report. Current dispatch lease and worker report are out of sync; investigate the live state.",
    "Heartbeat has gone stale while the worker process keeps running.",
    "README example says an empty slot can look queued. In production now a slot is free yet this run remains queued.",
    "Rename the test name 'capacity not full but pending'. Separately, current worker capacity has room but the live run is pending.",
    "测试名称写着有空槽仍排队。当前页面现在确实还有空槽，但这个 Run 一直 queued。",
    "Capacity is not full; the live run remains pending.",
    "当前 worker 容量未满；这个任务还在排队。",
    "Postmortem:\n> lease expired\n> worker report active\n\nCurrent live state: lease is expired and worker report is active.",
    "Postmortem: lease mismatch; current live state: lease expired while worker report is active.",
    "Current live state:\nheartbeat: stale\nworker: alive",
    "Postmortem: lease mismatch || Current live: lease=released, workerReport=running",
    "Current live state follows. Capacity is not full. The run remains queued.",
    "Historical note:\n- lease expired\n- worker report active\nCurrent:\n- lease released\n- worker report running",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("control_plane_worker_divergence"), prompt);
  }

  for (const prompt of [
    "两个槽位都被健康任务占用，新 Run 正常排队，不存在 lease 或 worker 分裂。",
    "没有空槽，Run 仍然 queued，这是正常排队。",
    "当前没有空槽但任务还在排队，不存在状态分裂。",
    "There is no available slot, so the run is normally queued.",
    "Heartbeat expired? No—the worker is alive and the heartbeat is current.",
    "Lease mismatch with the worker report has been ruled out.",
    "Explain what “worker report mismatch against the lease” means; do not change anything.",
    "The dispatch lease and worker report have no mismatch.",
    "Worker report matches the dispatch lease; there is no divergence.",
    "Cross-check dispatch lease and worker report examples in README, not runtime.",
    "Change the lease mismatch warning text that mentions worker report; runtime is fine.",
    "The worker report fixture says 'lease mismatch'; do not inspect runtime.",
    "Heartbeat expired, but no worker is alive.",
    "Docs say heartbeat expired while worker alive; no actual incident exists.",
    "Rename the heartbeatExpired and workerAlive fields in the UI.",
    "The heartbeat expired check asserts that worker alive is false.",
    "The worker is alive in simulation; heartbeat expired is only a test case.",
    "文档里写了核对 dispatch、lease、worker report，不执行运行时排查。",
    "A slot is available, but the run is still queued until scheduledAt as designed.",
    "The run remains queued while waiting for approval; this is normal.",
    "We fixed the mismatch between lease and worker report yesterday; states now align.",
    "Update the historical incident note: mismatch between dispatch lease and worker report.",
    "Rename the test case for mismatch between dispatch lease and worker report.",
    "Fix the UI. The postmortem says the dispatch lease and worker report mismatched.",
    "更新历史故障记录：dispatch lease 与 worker report 状态不一致。",
    "只整理历史记录：以前 Kanban 出现过空槽仍排队以及 dispatch lease 与 worker report 不一致，不做运行时恢复。",
    "重命名描述 lease 与 worker report 不一致的测试用例。",
    "Postmortem: the dispatch lease and worker report were out of sync.",
    "Historical incident note: lease=expired, worker report=active.",
    "Test name: heartbeat expired while worker is still alive.",
    "Reference only — capacity is not full, yet the run remains pending.",
    "事故复盘：租约已释放，但 worker 报告仍是 active。",
    "Reference: the lease and worker report disagree.",
    "Fixture: {\"lease\":\"expired\",\"workerReport\":\"active\"}",
    "Test fixture:\n- worker capacity: not full\n- run status: queued",
    "UI copy payload: {\"warning\":\"lease and worker report are out of sync\"}",
    "只修改排队状态的文案和颜色。",
    "只读查看 worktree 和 branch-env，不做资源回收。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("control_plane_worker_divergence"), false, prompt);
  }
});

test("resource lifecycle cleanup requires both a resource and a lifecycle action", () => {
  for (const prompt of [
    "用户没有丢弃，失败后仍要保留 worktree 和 branch-env。",
    "Clean up only the run-owned container and release its branch-env resources.",
    "Kanban 丢弃结果只清资源，不新增 RunStatus。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("resource_lifecycle_cleanup"), prompt);
  }

  for (const prompt of [
    "核对 dispatch history、lease、worker report 和 branch-env 状态。",
    "只查看容器 CPU 和内存使用量。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("resource_lifecycle_cleanup"), false, prompt);
  }
});

test("cosmetic-only UI wording emits a card-blocking signal", () => {
  for (const prompt of [
    "只调整告警页面卡片的颜色和间距。",
    "Only tweak the dashboard colors and spacing.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("ui_cosmetic_only"), prompt);
  }

  assert.equal(
    envelopeSignalIds("实现告警页面并接入真实 detector 与 incident 数据。").includes("ui_cosmetic_only"),
    false,
  );
});

test("delivery routing recognizes readiness questions without matching ordinary submit wording", () => {
  for (const prompt of [
    "这个代码 diff 现在是不是可以提交 PR 了，还有什么问题吗？",
    "Can this be committed? Any blockers?",
    "Is the release build ready to ship, or are there blockers?",
    "P0/P1/P2 检查后，最终 READY 还是 NOT READY？",
    "能不能上线或交付？",
    "发布 READY / NOT READY。",
    "代码最后变更后重新做交付验收。",
    "这个改动能合并吗？还有 blocker 吗？证据够不够？",
    "修复完成不等于发布就绪，需要分别判断 release gate 和真实用户路径。",
    "最后看一遍，这个改动现在能合并吗？列出剩余 blocker 和可信证据。",
    "修复做完不等于能发布，分别判断功能完成、发布 gate 和真实用户链路。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("delivery_gate"), prompt);
  }

  for (const prompt of [
    "修改提交表单按钮文案。",
    "这个订单现在可以提交了吗？",
    "用户填写完表单后能不能提交？",
    "数据库事务提交失败。",
    "Read this historical commit and summarize it.",
    "建目标并完成实现、验证和交付。",
    "先阅读中间实现继续开发，暂时不要做最终验收或 readiness 判断。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("delivery_gate"), false, prompt);
  }
});

test("temporary mock routing requires substitute-implementation semantics", () => {
  for (const prompt of [
    "临时 mock 只能用于接线，交付前要接真实 API。",
    "测试用内存 store 不能作为交付，E2E 前必须接真实持久化。",
    "placeholder 原型验证完就退出，浏览器验收前替换为真实服务。",
    "A placeholder cannot be treated as final delivery; wire the real API.",
    "The in-memory test store must be replaced by real persistence before E2E.",
    "This page is wired to a mock store and fake API data; either replace them with real persistence before claiming delivery, or clearly mark the boundary as a stage bridge—do not pass it off as end-to-end validated.",
    "A test-only in-memory store is substituting for the production database; make it an explicit stage boundary rather than claiming the whole feature is fully delivered.",
    "fallback 隐藏未完成链路。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("temporary_mock_boundary"), prompt);
  }

  for (const prompt of [
    "清理临时测试文件，保留真实数据。",
    "Delete temporary fixture files after the test.",
    "这是明确的一次性原型和测试 fixture。",
    "单元测试使用内存对象，不涉及交付或真实持久化。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("temporary_mock_boundary"), false, prompt);
  }
});

test("stage and bridge metaphors do not become Git or message-runtime operations", () => {
  const signals = envelopeSignalIds(
    "Clearly mark the mock boundary as a stage bridge; do not pass it off as end-to-end validated.",
  );
  assert.equal(signals.includes("bridge_runtime_validation"), false);
  assert.equal(signals.includes("git_operation"), false);
  assert.equal(signals.includes("worktree_diff_operation"), false);
  assert.ok(signals.includes("temporary_mock_boundary"));

  for (const prompt of [
    "This page is wired to a mock store and fake API data; either replace them with real persistence before claiming delivery, or clearly mark the boundary as a stage bridge—do not pass it off as end-to-end validated.",
    "A test-only in-memory store is substituting for the production database; make it an explicit stage boundary rather than claiming the whole feature is fully delivered.",
  ]) {
    const routed = envelopeSignalIds(prompt);
    assert.ok(routed.includes("temporary_mock_boundary"), prompt);
    assert.equal(routed.includes("git_operation"), false, prompt);
    assert.equal(routed.includes("worktree_diff_operation"), false, prompt);
    assert.equal(routed.includes("bridge_runtime_validation"), false, prompt);
    assert.equal(routed.includes("delivery_gate"), false, prompt);
  }

  assert.ok(envelopeSignalIds("Stage these changed files before commit.").includes("git_operation"));
  assert.ok(envelopeSignalIds("Restart the message bridge and verify logs plus receipt.").includes("bridge_runtime_validation"));
});

test("information-design routing requires a user-visible hierarchy or cognitive-load concern", () => {
  for (const prompt of [
    "把页面的用户可见信息层级理清，降低认知负担。",
    "控制台卡片嵌套太多，打平信息层级，只保留状态、风险和下一步。",
    "控制台字段和概念太多，把状态、影响和下一步放在第一层，其余内容下沉。",
    "Simplify the user-visible information hierarchy and reduce cognitive load in this UI.",
    "Simplify the dashboard fields so status, impact, and next step form the visible hierarchy.",
    "页面卡片嵌套太多。",
    "用户页只保留状态风险和下一步。",
    "用户可见信息架构太重。",
    "控制面板概念太多，用户第一眼只看状态、影响和操作，内部字段下沉详情。",
    "The control panel has too many concepts; show status, impact, and actions first, and put internal fields in details.",
    "这个控制台概念太多，让用户先看到状态、影响和可行动作，内部字段放详情。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("information_design"), prompt);
  }

  for (const prompt of [
    "简化后端服务的依赖链。",
    "数据库字段太多，整理 schema 和索引。",
    "Simplify the backend control flow and service dependencies.",
    "简化后端数据模型，把三张内部表合并成一张，不涉及用户界面。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("information_design"), false, prompt);
  }
});

test("source-truth routing requires a concrete source object and a verification action", () => {
  for (const prompt of [
    "先核对 tasks.yaml、运行时日志和 API 实际返回，再确认当前配置真源。",
    "先核对 PRD、DESIGN、验收标准和当前代码，再给实施方案。",
    "先看 PRD、设计稿和当前实现有没有对上，再动手。",
    "以当前代码和运行时日志为准，别信旧总结。",
    "Verify the migration and current database schema against the API response before implementation.",
    "需求设计验收实现真源冲突。",
    "用户原话与日志冲突时裁决。",
    "对齐 AC 与真实实现证据。",
    "Reconcile spec, code, and runtime evidence.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("source_truth_chain"), prompt);
  }

  for (const prompt of [
    "讨论需求、设计和验收方案。",
    "整理 PRD、DESIGN 和验收标准的目录。",
    "列出当前代码和日志文件的位置。",
    "Implement the design proposal and acceptance plan.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("source_truth_chain"), false, prompt);
  }
});

test("failure triage recognizes concrete provider, auth, plugin, MCP, browser, and tool symptoms", () => {
  for (const prompt of [
    "MCP tool 一直 timeout，帮我诊断是 provider 还是 auth 失败。",
    "浏览器插件连不上，排查权限还是运行时问题。",
    "The provider returned 401; diagnose whether auth or the tool integration failed.",
    "provider 或 auth 登录失败。",
    "plugin 或 MCP 不生效。",
    "browser harness 无法连接，排查根因。",
    "The browser harness cannot connect; investigate the root cause.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("failure_triage"), prompt);
  }

  for (const prompt of [
    "比较 provider、MCP 和 browser plugin 的架构。",
    "The browser plugin release completed successfully.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("failure_triage"), false, prompt);
  }
});

test("architecture-quality routing requires an existing chain or clean final-state refactor", () => {
  for (const prompt of [
    "基于现有实现梳理调用链，做一次无兼容残留的最终态重构。",
    "Map the current implementation chain before a clean final-state refactor.",
    "重构后不留旧兼容链路。",
    "Clean existing-chain final-state refactor.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("architecture_quality"), prompt);
  }

  for (const prompt of [
    "修复这个报错的根因。",
    "Keep this helper simple and follow KISS.",
    "Refactor this helper with KISS and fix the root cause.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("architecture_quality"), false, prompt);
  }
});

test("external-model routing recognizes independent multi-model review without matching model shopping", () => {
  for (const prompt of [
    "让多个模型分别独立 review 这些改动，再交叉裁决。",
    "请 Claude 和 Grok 各自独立审查这个实现。",
    "再让 Claude 独立 review 一遍这个 diff，专门找反例。",
    "找 Grok 看一下这个方案有没有回退风险。",
    "Claude 和 Grok 独立 review。",
    "多模型独立会诊改动。",
    "Independent multi-model review.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("external_model_review"), prompt);
  }

  for (const prompt of [
    "比较 Claude 和 Grok 的模型价格与上下文窗口。",
    "Compare model pricing and token limits before choosing a provider.",
    "Have multiple models independently review provider pricing and token limits.",
    "Compare current list prices and rate limits for Claude, Grok, and GPT for next-quarter budgeting; no code review or dispatch.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("external_model_review"), false, prompt);
  }
});

test("historical-session routing recognizes Spool repair lookup but not Spool explanation", () => {
  for (const prompt of [
    "用 Spool 看看上次这个问题是怎么修的。",
    "去 Spool 翻一下之前那轮是怎么处理的。",
    "从历史会话找回上次修复这个问题的证据。",
    "Use Spool to find how we fixed this in the previous session.",
    "用 Spool 查之前的失败记录。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("historical_session_lookup"), prompt);
  }

  for (const prompt of [
    "解释一下 Spool 是怎么工作的。",
    "Explain Spool's historical session index architecture.",
    "Show how the Spool historical session index works.",
    "清理 Spool 导出的临时文件。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("historical_session_lookup"), false, prompt);
  }
});

test("design-source alignment accepts supplied mockups and screenshots", () => {
  for (const prompt of [
    "对照设计稿和截图检查页面布局、间距是否一致。",
    "只评审设计稿和信息架构，先不实现前端。",
    "对照用户给的设计稿和 Linear 风格参考评审页面。",
    "Compare the implemented UI against the supplied mockup and screenshot.",
    "Review the UI against the supplied screenshot and Apple style reference.",
    "按设计稿实现页面。",
    "Linear 风格设计页面。",
    "Apple 风格设计页面。",
    "先以现有截图和项目 design system 为准，再改 UX。",
    "Use the existing screenshot and project design system as sources before changing the UX.",
    "这个列表页体验怎么改？先看现有截图和项目设计系统，不要直接套个人审美。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("design_source_alignment"), prompt);
  }

  for (const prompt of [
    "压缩截图文件后上传。",
    "优化 UI 性能和 bundle 大小。",
    "判断 UI 自动化测试是否通过。",
    "Convert this screenshot to WebP.",
    "修复前端页面的提交按钮并接入真实 API，在浏览器跑完错误态；没有设计判断。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("design_source_alignment"), false, prompt);
  }
});

test("retrieval-engine architecture has a dedicated narrow routing signal", () => {
  for (const prompt of [
    "优化 OME 召回引擎的信号注册、匹配和评分链路。",
    "OME match 漏召回，定位是 signal、scoring、filter 还是 render 的责任。",
    "经验卡又串卡了，跑 recall eval 定位 matcher 和 scorer 的责任层。",
    "OME 的 signal score filter render 分层需要重新核对。",
    "Refactor the Oh My Experience retrieval engine scoring and routing architecture.",
    "OME match 漏召回。",
    "OME signal-score eval。",
    "OME retrieval recall eval。",
    "OME 经验卡误召回或串卡。",
    "OME recall eval non-inferiority。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("retrieval_engine_architecture"), prompt);
  }

  for (const prompt of [
    "提高商品搜索结果的召回率。",
    "Tune the database index for faster product search.",
    "给电商搜索跑一次 recall 指标评估。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("retrieval_engine_architecture"), false, prompt);
  }
});

test("ai-dispatch development routing excludes ordinary dispatch usage", () => {
  for (const prompt of [
    "在 ai-dispatch 中新增 provider adapter，并验证目标模型没有被 fallback 冒充。",
    "修复 ai-dispatch fallback 路由和模型 registry 后做发布前验收。",
    "Refactor the ai-dispatch model resolver and streaming runtime.",
    "在 ai-dispatch 中实现新的 provider adapter，并从真实 send 入口验证 requested target、provider_used、model_used 和 route_trace。",
    "Action: implement\nComponent: route resolver\nTarget: ai-dispatch",
    '{"target":"ai-dispatch","component":"provider adapter","action":"implement"}',
    "Target is ai-dispatch. Component is model registry. Refactor it.",
    "给 ai-dispatch 加一个新的 provider adapter。",
    "ai-dispatch 的 model resolver 有 bug，帮我修一下。",
    "Make ai-dispatch support a new model resolver.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
  }

  for (const prompt of [
    "用 ai-dispatch 派 Grok review，并读取 provider_used、model_used 和 route_trace。",
    "ai-dispatch send opus 做架构审查，等待流式结果。",
    "resume 上一次 ai-dispatch session，让模型补测试建议。",
    "查看一次普通 ai-dispatch 调用的 degraded 和 route_trace。",
    "只更新 ai-dispatch preferences 里的模型倾向。",
    "用 ai-dispatch send Grok，修复另一个项目里的 provider adapter。",
    "Use ai-dispatch to ask Grok to fix the provider adapter in another repository.",
    "让 ai-dispatch 派模型调试另一个项目的 model resolver。",
    "用 ai-dispatch review 一份 model registry 修改方案。",
    "用 ai-dispatch 排障一次 provider integration 调用。",
    "Expected prompt:\n- Implement ai-dispatch provider adapter\nExpected signal: false",
    "Fixture input:\nFix ai-dispatch model registry",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("dispatch_runtime_development"), false, prompt);
  }
});

test("UI implementation is distinct from an explicit design-only review", () => {
  for (const prompt of [
    "按设计稿实现设置页面 UI，并修改组件交互。",
    "Implement the frontend layout and fix the React component interaction.",
  ]) {
    const signals = envelopeSignalIds(prompt);
    assert.ok(signals.includes("ui_implementation"), prompt);
    assert.equal(signals.includes("ui_design_only"), false, prompt);
  }

  for (const prompt of [
    "对齐 DESIGN.md 评审 UI 布局；这里只做设计判断，不改代码。",
    "只评审设计稿和信息架构，先不实现前端。",
    "Review the UX mockup as design-only; do not implement or change code.",
  ]) {
    const signals = envelopeSignalIds(prompt);
    assert.ok(signals.includes("ui_design_only"), prompt);
    assert.equal(signals.includes("ui_implementation"), false, prompt);
  }

  for (const prompt of [
    "重构后端组件的依赖注入。",
    "Refactor a backend service component with no frontend changes.",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("ui_implementation"), false, prompt);
  }
});

test("UI delivery work requires a visible surface plus implementation or real-path delivery semantics", () => {
  for (const prompt of [
    "前端设置页实现完成后，接真实 API 并按用户路径做浏览器验收。",
    "Ship the implemented UI with real data and browser E2E through the user path.",
    "前端检查 console 和 network error。",
    "dashboard 接入实时数据后，用真实浏览器覆盖 loading、empty 和 error 状态。",
    "把 runtime events 接到 UI，再检查 network、console 和移动端交互。",
    "Wire runtime events into the UI, then verify network, console, and mobile interactions.",
    "Implement the dashboard against live data, then validate loading, failure, and permission states through the real browser flow.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("ui_delivery_work"), prompt);
  }

  for (const prompt of [
    "只评审 UI 设计稿，不改代码。",
    "实现后端 API 并跑集成测试。",
    "只评审这张设计稿的布局和视觉层级，不改代码、不实现页面。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("ui_delivery_work"), false, prompt);
  }
});

test("design-only work suppresses implementation and information-delivery routing", () => {
  const signals = envelopeSignalIds("只评审页面信息层级和状态字段，不改代码，也不做浏览器交付。");

  assert.ok(signals.includes("ui_design_only"));
  assert.equal(signals.includes("ui_implementation"), false);
  assert.equal(signals.includes("information_design"), false);
  assert.equal(signals.includes("ui_delivery_work"), false);
});

test("comprehension failure is a dedicated first-person understanding signal", () => {
  for (const prompt of [
    "我还是没听懂，换个更简单的方式解释。",
    "这个我看不懂，能不能用一个具体例子再讲一遍？",
    "This still doesn't make sense to me; explain it more simply.",
    "没看明白。",
    "太啰嗦了，讲人话。",
    "再通俗一点。",
    "没理解，请换个说法。",
    "我还是没看懂，请按五岁小孩能懂的方式讲。",
    "I am lost—explain like I'm five.",
    "太绕了，讲人话。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("comprehension_failure"), prompt);
  }

  for (const prompt of [
    "检查文档里的‘用户没听懂’示例文案。",
    "模型没有理解这个 API 的返回结构。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("comprehension_failure"), false, prompt);
  }

  const ordinaryNegation = envelopeSignalIds("This doesn't involve UI work; implement the backend only.");
  assert.equal(ordinaryNegation.includes("ui_surface"), false);
});

test("overengineering review requires a concrete diff, patch, plan, or implementation under review", () => {
  for (const prompt of [
    "Review 这个小 bug 的 diff 有没有过度设计、无依据抽象或 scope creep。",
    "Is this patch over-engineered for the current requirement?",
    "Review diff 是否过度设计。",
    "评审方案是否有无依据抽象。",
    "Review implementation for scope creep.",
    "review 当前实现是否存在过度抽象或无依据 fallback。",
    "is this implementation under review over-engineered。",
    "这个小修复引入了没有消费者的预留抽象，review 是否过度设计。",
    "For this tiny fix, review the speculative abstraction that has no consumer.",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("overengineering_review"), prompt);
  }

  for (const prompt of [
    "解释一下 over-engineering 这个概念。",
    "我们明确要做平台化公共抽象。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("overengineering_review"), false, prompt);
  }
});

test("rule governance requires cleanup, layering, or relocation of agent rules", () => {
  for (const prompt of [
    "清理 AGENTS.md 里的重复规则，把具体流程下沉到 skill。",
    "把 CLAUDE.md 的能力说明移动到正确分层。",
    "Move the Claude rules into the right layer instead of keeping them at the entrypoint.",
    "Merge duplicate agent rules into the correct layer.",
    "合并 CLAUDE.md 冲突规则。",
    "CLAUDE rules 要分开常驻事实、能力流程和 docs。",
    "agent rule 的根规则和 skill 流程要分层，并合并旧口径。",
    "Refactor CLAUDE.md rules by separating always-on repository facts from capability workflows and long docs.",
    "这条 agent 规则到底该放根规则还是 skill？顺便合并旧口径。",
  ]) {
    assert.ok(envelopeSignalIds(prompt).includes("rule_governance"), prompt);
  }

  for (const prompt of [
    "修复 AGENTS.md 的错别字。",
    "读取 CLAUDE.md 了解项目。",
    "这段 AGENTS.md 内容只是提示词上下文，不要求修改或治理规则。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("rule_governance"), false, prompt);
  }
});

test("high-risk authorization suppresses only an already authorized exact action", () => {
  for (const prompt of [
    "准备删除生产数据，执行前先确认授权。",
    "Ask for approval before pushing the release branch.",
    "git push 当前分支到 origin，执行前先等授权。",
    "把 release 部署到生产环境，执行之前先列一下影响范围。",
    "删除生产数据库里的测试数据前先确认授权。",
    "修改生产配置并重启服务前先确认授权。",
    "购买 100 美元的 API 额度前先确认授权。",
    "删除数据或变更生产配置前确认。",
    "修改生产配置前必须先得到授权。",
    "未经授权不要删除线上数据。",
    "Do not delete online data until explicitly authorized.",
    "Before changing production config, ask for my explicit approval.",
    "先不要删这批线上数据，拿到授权再动手。",
  ]) {
    const signals = envelopeSignalIds(prompt);
    assert.ok(signals.includes("high_risk_action"), prompt);
    assert.equal(signals.includes("high_risk_authorized"), false, prompt);
  }

  for (const prompt of [
    "我明确授权你现在 push 当前 release 分支。",
    "I explicitly authorize you to delete the staging dataset now.",
  ]) {
    const signals = envelopeSignalIds(prompt);
    assert.ok(signals.includes("high_risk_authorized"), prompt);
    assert.equal(signals.includes("high_risk_action"), false, prompt);
  }

  for (const prompt of [
    "删除本地临时测试文件。",
    "修改提交按钮文案。",
    "回滚本地数据库测试事务。",
    "不要删除本地临时测试文件。",
    "我已经明确授权你现在发布生产服务，直接执行。",
    "飞书 bot 服务刚刚重新部署完，现在只验收日志、单实例和真实收发。",
  ]) {
    assert.equal(envelopeSignalIds(prompt).includes("high_risk_action"), false, prompt);
  }
});

test("protected counterfactuals pass through the full envelope and retrieval gate", () => {
  const cases = [
    {
      card: routedCard("single-truth", "single_truth_version"),
      positive: "不要搞一堆软连接了，只保留真源。",
      negative: "高内聚低耦合地重构这个模块。",
    },
    {
      card: routedCard("failure-triage", "failure_triage", ["explain_only"]),
      positive: "帮我处理并追查根因，为什么测试环境又失败。",
      negative: "为什么测试环境失败？只解释原因，不要修复。",
    },
    {
      card: routedCard("worktree-mutation", "worktree_diff_operation"),
      positive: "继续修改当前 git diff，但不要提交。",
      negative: "Read-only review the current Git diff; do not modify, stage, commit, or push.",
    },
    {
      card: routedCard("bridge-runtime", "bridge_runtime_validation"),
      positive: "Restart the Telegram bridge and verify message send/receive.",
      negative: "普通 runtime 服务状态和日志是否一致。",
    },
    {
      card: routedCard("delivery-readiness", "delivery_gate"),
      positive: "这个代码 diff 现在是不是可以提交 PR 了，还有什么问题吗？",
      negative: "修改提交表单按钮文案。",
    },
    {
      card: routedCard("mock-boundary", "temporary_mock_boundary"),
      positive: "临时 mock 只能用于接线，交付前要接真实 API。",
      negative: "清理临时测试文件，保留真实数据。",
    },
    {
      card: routedCard("ui-delivery", "ui_delivery_work", ["ui_design_only"]),
      positive: "前端设置页接真实 API 后按用户路径做浏览器验收。",
      negative: "只评审 UI 设计稿，不改代码。",
    },
    {
      card: routedCard("comprehension", "comprehension_failure"),
      positive: "我还是没听懂，换个简单例子再讲一次。",
      negative: "检查文档里的‘用户没听懂’示例文案。",
    },
    {
      card: routedCard("overengineering", "overengineering_review"),
      positive: "Review 这个小 bug 的 diff 有没有过度设计。",
      negative: "解释 over-engineering 这个概念。",
    },
  ];

  for (const item of cases) {
    const positive = matchCardEntriesDetailed([item.card], item.positive, { threshold: 40 });
    const negative = matchCardEntriesDetailed([item.card], item.negative, { threshold: 40 });
    assert.deepEqual(positive.diagnostics.selectedCardIds, [item.card.id], item.positive);
    assert.deepEqual(negative.matches, [], item.negative);
  }
});

test("generic segment negation suppresses a routed signal but not an independent later segment", () => {
  const negated = signalIds("这不是 provider adapter、hook、Claude 或 Codex 边界任务。");
  const mixed = signalIds([
    "This is not a provider adapter or hook boundary task.",
    "Then support Claude UserPromptSubmit through the shared provider-neutral runtime.",
  ].join(" "));

  assert.equal(negated.includes("provider_adapter_boundary"), false);
  assert.ok(mixed.includes("provider_adapter_boundary"));
});

test("Chinese standalone 别 negation does not split ordinary words", () => {
  for (const prompt of [
    "修复完成不等于发布就绪，需要分别判断 release gate 和用户路径。",
    "说明区别、性别、类别和级别，特别关注兼容性。",
    "迁移完成后清理影子 writer、别名入口和旧值 fallback，只保留权威路径。",
  ]) {
    assert.deepEqual(buildTaskEnvelope(prompt).negatives, [], prompt);
  }

  assert.ok(buildTaskEnvelope("先别修改代码。").negatives.some((span) => span.includes("别修改代码")));
});

test("fenced prose stays out of summaries while useful diagnostic terms remain searchable", () => {
  const prompt = [
    "Fix this:",
    "```text",
    "ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY",
    "pnpm install",
    "src/app.ts",
    "UserPromptSubmit",
    "```",
  ].join("\n");
  const envelope = buildTaskEnvelope(prompt);
  const variants = buildQueryPlan(envelope).queryVariants.map((variant) => variant.text).join(" ");

  assert.equal(envelope.summary.includes("ERR_PNPM"), false);
  assert.equal(envelope.summary.includes("pnpm install"), false);
  assert.ok(envelope.keywords.includes("err_pnpm_aborted_remove_modules_dir_no_tty"));
  assert.ok(envelope.keywords.includes("userpromptsubmit"));
  assert.deepEqual(envelope.commands, ["pnpm install"]);
  assert.deepEqual(envelope.files, ["src/app.ts"]);
  assert.match(variants, /err_pnpm_aborted_remove_modules_dir_no_tty/);

  const inline = buildTaskEnvelope("Fix ```ERR_INLINE_FAILURE``` now");
  assert.ok(inline.keywords.includes("err_inline_failure"));
  assert.equal(inline.summary.includes("ERR_INLINE_FAILURE"), false);
});

test("long prompts retain both head and tail evidence in segments and keywords", () => {
  const segments = Array.from({ length: 12 }, (_, index) =>
    index === 11
      ? "Final verification requires tail_anchor_signal before delivery"
      : `Context segment ${index} describes background material only`
  );
  const prompt = segments.join(". ");
  const envelope = buildTaskEnvelope(prompt);
  const planText = buildQueryPlan(envelope).queryVariants.map((variant) => variant.text).join(" ");

  assert.ok(envelope.segments.some((segment) => segment.includes("Context segment 0")));
  assert.ok(envelope.segments.some((segment) => segment.includes("tail_anchor_signal")));
  assert.ok(envelope.keywords.includes("tail_anchor_signal"));
  assert.match(planText, /tail_anchor_signal/);

  const manyKeywords = Array.from({ length: 60 }, (_, index) => `prefix_token_${index}`).join(" ");
  const keywordEnvelope = buildTaskEnvelope(`${manyKeywords} tail_keyword_anchor`);
  assert.ok(keywordEnvelope.keywords.includes("prefix_token_0"));
  assert.ok(keywordEnvelope.keywords.includes("tail_keyword_anchor"));
});

test("tokenizeSequence preserves term frequency and order while tokenize stays deduplicated", () => {
  const sequence = tokenizeSequence("alpha alpha foo.bar foo.bar");
  const unique = tokenize("alpha alpha foo.bar foo.bar");

  assert.equal(sequence.filter((token) => token === "alpha").length, 2);
  assert.equal(sequence.filter((token) => token === "foo.bar").length, 2);
  assert.deepEqual(sequence.slice(0, 2), ["alpha", "alpha"]);
  assert.equal(unique.filter((token) => token === "alpha").length, 1);
  assert.equal(unique.filter((token) => token === "foo.bar").length, 1);
  assert.ok(tokenizeSequence("验证 验证").filter((token) => token === "验证").length >= 2);
});
