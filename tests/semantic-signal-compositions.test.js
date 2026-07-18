import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskEnvelope,
  detectRuleSignals,
  listSemanticSignalCompositions,
  matchSemanticSignalComposition,
  semanticSignalReplacesDirectPatterns,
} from "../dist/packages/core/src/index.js";

function positiveSignalIds(prompt) {
  return detectRuleSignals(prompt)
    .filter((signal) => signal.polarity === "positive")
    .map((signal) => signal.id);
}

function envelopePositiveSignalIds(prompt) {
  return buildTaskEnvelope(prompt).ruleSignals
    .filter((signal) => signal.polarity === "positive")
    .map((signal) => signal.id);
}

test("semantic signal compositions stay bounded to 2-4 atoms", () => {
  const compositions = listSemanticSignalCompositions();
  assert.ok(compositions.length >= 4);
  for (const item of compositions) {
    assert.ok(item.allOf.length >= 2 && item.allOf.length <= 4, item.signalId);
    assert.ok(item.maxSegmentGap >= 1 && item.maxSegmentGap <= 2, item.signalId);
    assert.ok(item.maxSpan <= 420, item.signalId);
  }
});

test("single-truth signal composes legacy path, retirement, and one authority", () => {
  const prompt = "All clients now read canonicalPrefs. Retire the compatibility reader and shadow save hook so only the canonical route can decide the stored value.";
  const match = matchSemanticSignalComposition("single_truth_version", prompt);
  assert.deepEqual(match?.atomIds, ["legacy_fact_path", "retire_or_converge", "single_authority"]);
  assert.ok(positiveSignalIds(prompt).includes("single_truth_version"));

  const closeNegative = "The partner contract requires old and new response shapes to coexist during the announced transition window.";
  assert.equal(matchSemanticSignalComposition("single_truth_version", closeNegative), null);
  assert.ok(!positiveSignalIds(closeNegative).includes("single_truth_version"));

  assert.ok(positiveSignalIds("迁移完成后清理影子 writer、别名入口和旧值 fallback，只保留权威路径").includes("single_truth_version"));
  assert.ok(positiveSignalIds("删除双读写和重复事实入口，让当前行为只有一个真源").includes("single_truth_version"));
});

test("single-truth convergence also accepts completed migrations with no dependent consumer", () => {
  const prompt = "The cutover completed two releases ago. No active clients depend on the old alias endpoint, so retire that compatibility route.";
  assert.deepEqual(
    matchSemanticSignalComposition("single_truth_version", prompt)?.atomIds,
    ["legacy_fact_path", "retire_or_converge", "migration_complete", "no_dependent_consumer"],
  );
  assert.ok(positiveSignalIds(prompt).includes("single_truth_version"));

  const falseFriend = "Keep the legacy endpoint during migration because two external clients still depend on its documented response contract.";
  assert.ok(!positiveSignalIds(falseFriend).includes("single_truth_version"));

  assert.ok(positiveSignalIds("The cutover succeeded; strip out shadow writers and legacy aliases so the service has one canonical source of truth.").includes("single_truth_version"));
  assert.ok(positiveSignalIds("迁移已经切到新存储，清掉老路径、影子写入和别名读接口，只让唯一权威入口决定结果。")
    .includes("single_truth_version"));
});

test("information-design signal requires a decision-first surface and deferred diagnostics", () => {
  const prompt = "Rewrite the incident console for the on-call operator: answer intervene-or-wait first, then put raw lease fields and trace history in an expandable details panel.";
  assert.ok(positiveSignalIds(prompt).includes("information_design"));

  const closeNegative = "Add raw lease fields and trace history to the internal incident export used by the diagnostics team.";
  assert.ok(!positiveSignalIds(closeNegative).includes("information_design"));
});

test("information-design recognizes overloaded hierarchy without requiring a diagnostics drawer", () => {
  const prompt = "The operator dashboard gives every alert panel equal visual weight, so nobody can spot the urgent action. Rebuild it around one decision: intervene or wait.";
  assert.deepEqual(
    matchSemanticSignalComposition("information_design", prompt)?.atomIds,
    ["user_output_surface", "decision_first", "hierarchy_overload"],
  );

  const falseFriend = "Export twelve equally weighted numeric columns for an offline statistics job; there is no operator decision surface.";
  assert.ok(!positiveSignalIds(falseFriend).includes("information_design"));

  assert.ok(positiveSignalIds("值班控制台堆满状态卡和内部字段，第一眼看不出是否健康、影响谁、下一步做什么；请围绕一次状态判断重排层级。")
    .includes("information_design"));
});

test("UI delivery signal composes product surface, real service, and real user-path proof", () => {
  const prompt = "Connect the returns screen to the live backend, submit a return from the running page, and verify the visible result plus network and console failures.";
  assert.ok(positiveSignalIds(prompt).includes("ui_delivery_work"));

  const closeNegative = "Review a wireframe for the returns screen; no frontend implementation or live backend is in scope.";
  assert.ok(!positiveSignalIds(closeNegative).includes("ui_delivery_work"));

  assert.ok(positiveSignalIds("工单列表接入真实服务后，从加载和失败状态一路验到浏览器点击、网络请求与控制台；接口直连不能代替用户路径。")
    .includes("ui_delivery_work"));
  assert.ok(positiveSignalIds("Replace static board cards with real task API data and walk the full browser user path through drag, drop, errors, and console logs.")
    .includes("ui_delivery_work"));
});

test("goal execution composes an agent goal, direct start, and closure evidence", () => {
  const prompt = "Put the importer work into a Codex goal and start working now. Keep going until every acceptance check has fresh evidence.";
  assert.ok(positiveSignalIds(prompt).includes("goal_execute"));

  const closeNegative = "Draft a quarterly growth goal and measurable outcomes; this is planning only and no execution should start.";
  assert.ok(!positiveSignalIds(closeNegative).includes("goal_execute"));

  assert.ok(positiveSignalIds("Run the Codex goal until every acceptance item has fresh evidence.").includes("goal_execute"));
  assert.ok(positiveSignalIds("Create a Codex goal and keep driving it until every acceptance item has post-change evidence.")
    .includes("goal_execute"));
});

test("delivery gate requires readiness layers backed by evidence after the latest change", () => {
  const prompt = "Can this branch ship? Separate the working patch from release gates and the proven user workflow; the old smoke is stale after today's config edit.";
  assert.ok(positiveSignalIds(prompt).includes("delivery_gate"));

  const closeNegative = "Submit the completed vendor form to finance and show me the receipt.";
  assert.ok(!positiveSignalIds(closeNegative).includes("delivery_gate"));

  assert.ok(positiveSignalIds("The final repository changes are in. Is this ready to deploy based on the latest evidence?").includes("delivery_gate"));
  assert.ok(positiveSignalIds("最后一次改完流水线配置后，重新判断是否可以发布，只接受本次变更之后的证据。")
    .includes("delivery_gate"));
});

test("failure triage composes a failure, an external boundary, and cross-layer diagnosis", () => {
  const prompt = "The connector fails in this browser harness although curl works. Distinguish session permission, network, and application behavior before changing product code.";
  assert.ok(positiveSignalIds(prompt).includes("failure_triage"));

  const closeNegative = "A pure calculation function returns the wrong total; reproduce it with a unit test and fix the formula.";
  assert.ok(!positiveSignalIds(closeNegative).includes("failure_triage"));
});

test("failure triage treats browser extensions, network, permission, and product code as candidate layers", () => {
  const prompt = "The browser extension cannot connect. Determine whether network access, account permission, or an extension bug owns the failure before editing product code.";
  assert.ok(positiveSignalIds(prompt).includes("failure_triage"));

  const falseFriend = "The extension icon is misaligned by two pixels; update its local CSS and snapshot test.";
  assert.ok(!positiveSignalIds(falseFriend).includes("failure_triage"));
});

test("retrieval architecture composes recall symptoms, pipeline stages, and localization", () => {
  const prompt = "Unrelated experiences leak into context for one natural request. Reproduce it, then localize whether applicability, ranking, or context assembly owns the fault.";
  assert.ok(positiveSignalIds(prompt).includes("retrieval_engine_architecture"));

  const closeNegative = "Teach ranking and filtering for a general information-retrieval lecture; there is no failing matcher to diagnose.";
  assert.ok(!positiveSignalIds(closeNegative).includes("retrieval_engine_architecture"));

  assert.ok(positiveSignalIds("Recall eval regressed: positive cases miss and near-misses leak into top-k. Diagnose signal, applicability, scoring, or ranking and fix the responsible stage.")
    .includes("retrieval_engine_architecture"));
});

test("truth-chain signal reconciles a requirement source with live implementation evidence", () => {
  const prompt = "Before implementing, reconcile the signed-off specification with the deployed feature flag and current request traces; surface every disagreement and its precedence.";
  assert.ok(positiveSignalIds(prompt).includes("source_truth_chain"));

  const closeNegative = "There is no specification or running system yet; brainstorm several unrelated product directions.";
  assert.ok(!positiveSignalIds(closeNegative).includes("source_truth_chain"));
});

test("truth-chain reconciles PRD behavior with code and production logs", () => {
  const prompt = "The PRD requires a retry response, code throws immediately, and production logs show the exception. Reconcile which source is authoritative before changing behavior.";
  assert.ok(positiveSignalIds(prompt).includes("source_truth_chain"));

  const falseFriend = "Summarize the PRD, code sample, and production log in three independent appendix sections without deciding precedence.";
  assert.ok(!positiveSignalIds(falseFriend).includes("source_truth_chain"));

  assert.ok(positiveSignalIds("实际实现和 PRD 对不上；先把线上日志与 AC 对齐，判断哪边才是当前该遵守的 truth。").includes("source_truth_chain"));
});

test("clean-refactor signal uses traced flow, real consumers, and a final boundary choice", () => {
  const prompt = "Map the event flow from both webhook adapters through the core into persistence, then decide what to retire or migrate from active consumers and deployment facts.";
  assert.ok(positiveSignalIds(prompt).includes("architecture_quality"));

  const closeNegative = "Rename a private helper and update its unit test; no runtime flow, deployed caller, or migration boundary changes.";
  assert.ok(!positiveSignalIds(closeNegative).includes("architecture_quality"));
});

test("clean-refactor maps entry points to outcomes and uses external consumers to choose the final state", () => {
  const prompt = "Map every auth entry point to its actual outcome, verify the real external callers, then decide the final state and which compatibility branch can be removed.";
  assert.ok(positiveSignalIds(prompt).includes("architecture_quality"));

  const falseFriend = "List the public entry points in a glossary and keep all compatibility branches for hypothetical future callers.";
  assert.ok(!positiveSignalIds(falseFriend).includes("architecture_quality"));
});

test("high-risk signal recognizes an explicit authorization stop around irreversible operations", () => {
  const prompt = "Finish every reversible release check, then stop there before git push and the production restart because explicit approval is still missing.";
  assert.ok(positiveSignalIds(prompt).includes("high_risk_action"));

  const closeNegative = "Read git log and assess whether the diff is ready for review; do not modify, stage, commit, or push the worktree.";
  const ids = detectRuleSignals(closeNegative).map((signal) => signal.id);
  assert.ok(!ids.includes("high_risk_action"));
  assert.ok(!ids.includes("worktree_diff_operation"));

  const preflight = envelopePositiveSignalIds("The script will drop a production table and git push; before acting, map the blast radius and affected data.");
  assert.ok(preflight.includes("high_risk_action"));
  assert.ok(preflight.includes("worktree_diff_operation"));

  const pastFact = envelopePositiveSignalIds("The bot was redeployed a minute ago; now only verify message logs and single-instance receive/send behavior.");
  assert.ok(!pastFact.includes("high_risk_action"));

  assert.ok(envelopePositiveSignalIds("The staging database must be truncated and paid quota topped up; pause for explicit confirmation before either action.")
    .includes("high_risk_action"));
});

test("a precise user imperative authorizes that irreversible action without hiding worktree mutation", () => {
  const authorized = envelopePositiveSignalIds("Please deploy the verified release candidate to production now.");
  assert.ok(!authorized.includes("high_risk_action"));
  assert.ok(buildTaskEnvelope("Please deploy the verified release candidate to production now.").ruleSignals.some((signal) => signal.id === "high_risk_authorized"));

  const explanationOnly = buildTaskEnvelope("Please explain how a production deployment works; do not deploy anything.").ruleSignals.map((signal) => signal.id);
  assert.ok(!explanationOnly.includes("high_risk_authorized"));

  const pushSignals = envelopePositiveSignalIds("代码已经验完，帮我 push 到 main 分支。");
  assert.ok(pushSignals.includes("worktree_diff_operation"));
  assert.ok(!pushSignals.includes("high_risk_action"));
});

test("overengineering review needs a concrete change, complexity, and present evidence", () => {
  const prompt = "Audit this small patch: it added two wrappers, a registry, and a fallback layer. Keep only pieces with a current caller or an identified threat model.";
  assert.ok(positiveSignalIds(prompt).includes("overengineering_review"));

  const closeNegative = "Explain the general idea of over-engineering with an invented classroom example.";
  assert.ok(!positiveSignalIds(closeNegative).includes("overengineering_review"));

  assert.ok(positiveSignalIds("Review the last commit for this tiny requirement: it introduced wrappers and a factory. Keep them only if a real caller needs the abstraction.").includes("overengineering_review"));
  assert.ok(positiveSignalIds("This small PR added a registry and three wrappers; review which pieces have current callers and which should leave the patch.")
    .includes("overengineering_review"));
});

test("mock-boundary signal requires a substitute seam, exit boundary, and real-proof disclaimer", () => {
  const prompt = "The demo route returns a canned response. Keep it as a temporary prototype seam with an exit condition, but do not claim it proves production persistence or permissions.";
  assert.ok(positiveSignalIds(prompt).includes("temporary_mock_boundary"));

  const closeNegative = "Use a stub inside an isolated unit test and remove it when the test ends.";
  assert.ok(!positiveSignalIds(closeNegative).includes("temporary_mock_boundary"));

  assert.ok(positiveSignalIds("This placeholder fallback is a test-only store for the prototype; rip it out before calling the feature real delivery.").includes("temporary_mock_boundary"));
  assert.ok(positiveSignalIds("The fallback report calls a placeholder production-ready; never use it as evidence of a closed user journey.")
    .includes("temporary_mock_boundary"));
  assert.ok(!positiveSignalIds("The completed migration can now remove its compatibility fallback and keep one authoritative read path.").includes("temporary_mock_boundary"));
});

test("external-model review composes independent reviewers, evidence, and primary adjudication", () => {
  const prompt = "Have Gemini and Claude independently inspect the authorization patch. Give them the contract, diff, and logs, then reconcile disagreements against current code instead of voting.";
  assert.ok(positiveSignalIds(prompt).includes("external_model_review"));

  const closeNegative = "Compare Gemini and Claude prices and context windows for a procurement note.";
  assert.ok(!positiveSignalIds(closeNegative).includes("external_model_review"));
});

test("ai-dispatch runtime development requires product, development action, and subsystem", () => {
  assert.equal(semanticSignalReplacesDirectPatterns("dispatch_runtime_development"), true);
  const positives = [
    "Implement a new ai-dispatch provider adapter and verify the requested target reaches the actual model.",
    "修改 ai-dispatch model registry 和模型别名，证明短名不会落到旧 fallback。",
    "Fix the ai-dispatch fallback chain, then run release validation against the intended provider.",
    "改造 ai-dispatch resume runtime 和 stream runtime，再从真实入口验收 session activity。",
    "给 ai-dispatch 加一个新的 provider adapter。",
    "让 ai-dispatch 支持新的 provider adapter。",
    "ai-dispatch 的 model resolver 有 bug，帮我修一下。",
    "ai-dispatch model registry 要改一下。",
    "在 ai-dispatch 里把 route table 支持上。",
    "在 ai-dispatch 中实现新的 provider adapter，并从真实 send 入口验证 requested target、provider_used、model_used 和 route_trace。",
    "Make ai-dispatch support a new model resolver.",
    "给 ai-dispatch 增加一个 OpenAI-compatible provider adapter，并从真实 send 入口验证 requested target 和 actual model。",
    "在 ai-dispatch 里调试 provider registry，修完跑一遍真实路由验收。",
    "我想重构 ai-dispatch 的 fallback chain 和 streaming runtime，确保 resume 后还是同一个 session。",
    "把 ai-dispatch 的 route table 改一下，新增 grok-4.5 的稳定映射。",
    "ai-dispatch 里的 provider adapter 接 Grok 总失败，定位并修好它。",
    "Implement a new provider adapter inside ai-dispatch and prove the requested target reaches the actual provider.",
    "The ai-dispatch model resolver is broken; debug and fix it before release.",
    "We need to change the route table in ai-dispatch and add a stable model alias.",
    "Please debug why ai-dispatch falls through the fallback chain for a registered model.",
    "Add Grok support to ai-dispatch by wiring a provider adapter and updating the provider registry.",
    "ai-dispatch 的 model registry 要支持一个新别名，直接实现并验证。",
    "修一下 ai-dispatch：resume runtime 在流式响应中断后丢 session。",
    "Can you fix ai-dispatch? Its provider registry resolves Grok to the wrong model.",
    "Within ai-dispatch, migrate the model registry and fallback routing without changing the public CLI.",
    "Refactor ai-dispatch’s model registry and rerun routing acceptance.",
    "Make ai-dispatch use a new route resolver.",
    "ai-dispatch needs to change the provider registry.",
    "Open ai-dispatch. Fix its provider adapter and model alias resolver.",
    "We are working on ai-dispatch. Refactor its provider registry now.",
    "The provider registry inside ai-dispatch must be migrated.",
    "The model resolver in ai-dispatch is buggy; fix it.",
    "打开 ai-dispatch。把它的 fallback chain 修好。",
    "在 ai-dispatch 里面，升级 streaming runtime。",
    "我要改的是 ai-dispatch，不是调用它：provider registry 要新增稳定别名。",
    "ai-dispatch's fallback chain needs refactoring.",
    "A new provider adapter must be integrated into ai-dispatch.",
    "ai-dispatch: implement a stable model alias resolver.",
    "The ai-dispatch provider adapter is broken; investigate and repair it.",
    "Review the proposed fix for ai-dispatch's route table, then apply the approved change.",
    "Integrate support into ai-dispatch by adding a provider adapter.",
    "我要修改的是 ai-dispatch，不是使用它；route resolver 需要重构。",
    "打开 ai-dispatch！把它的 streaming runtime 升级。",
    "Review the approved repair for ai-dispatch's provider adapter, then implement that fix.",
    "先评审 ai-dispatch 的 model registry 修复方案；随后应用该修改。",
    "Target: ai-dispatch\nComponent: provider adapter\nAction: implement and validate",
    "target=ai-dispatch; component=model registry; action=refactor",
    "Action: implement\nComponent: route resolver\nTarget: ai-dispatch",
    '{"target":"ai-dispatch","component":"provider adapter","action":"implement"}',
    "Target is ai-dispatch. Component is model registry. Refactor it.",
    "Target: ai-dispatch provider adapter\n1. Review the proposed repair\n2. Implement the approved fix",
    "The provider adapter (inside ai-dispatch) is broken; investigate and repair it.",
  ];
  for (const prompt of positives) {
    assert.deepEqual(
      matchSemanticSignalComposition("dispatch_runtime_development", prompt)?.atomIds,
      ["dispatch_runtime_entity", "dispatch_development_action", "dispatch_owned_runtime_subsystem"],
      prompt,
    );
    assert.ok(positiveSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
  }

  const ordinaryUse = [
    "Use ai-dispatch to ask Grok for a review, then read provider_used, model_used, and route_trace.",
    "Run ai-dispatch send opus for an architecture review and wait for the streaming result.",
    "Resume the previous ai-dispatch session so the model can add test advice.",
    "Inspect degraded and route_trace from one ordinary ai-dispatch invocation.",
    "Update my ai-dispatch model preferences.",
    "Compare Claude, Grok, and Gemini pricing and context windows.",
    "Use several models to review this diff independently.",
    "Call the Anthropic SDK directly from another project.",
    "ai-dispatch send grok to fix this unrelated application bug and watch the stream.",
    "用 ai-dispatch review provider adapter 开发方案，不修改 runtime。",
    "用 ai-dispatch send Grok，修复另一个项目里的 provider adapter。",
    "Use ai-dispatch to ask Grok to fix the provider adapter in another repository.",
    "让 ai-dispatch 派模型调试另一个项目的 model resolver。",
    "用 ai-dispatch review 一份 model registry 修改方案。",
    "用 ai-dispatch 排障一次 provider integration 调用。",
    "修复这个仓库的问题，用 ai-dispatch 派 Grok 看一下 provider adapter 的方案。",
    "调试当前服务，顺便用 ai-dispatch review model resolver 的修改建议。",
    "实现本项目的新登录流程，再让 ai-dispatch 评审 provider registry 方案。",
    "重构 Nexus 后端，然后用 ai-dispatch send opus 检查 fallback chain。",
    "修改支付服务，用 ai-dispatch 让 Grok 分析 route table 是否合理。",
    "接入第三方 SDK；用 ai-dispatch review provider adapter 设计，不改派发器。",
    "排障业务服务，用 ai-dispatch 派模型分析 streaming runtime 日志。",
    "升级另一个工具，再通过 ai-dispatch 评审 model aliases 迁移计划。",
    "给当前应用加上鉴权，然后用 ai-dispatch 看 provider registry 有没有风险。",
    "先开发这个 feature，用 ai-dispatch 请 Grok 给 model resolver 提建议。",
    "Fix this repository; use ai-dispatch to ask Grok about the provider adapter plan.",
    "Debug our payment service with ai-dispatch reviewing the model resolver design.",
    "Implement the app feature, then use ai-dispatch to review the provider registry proposal.",
    "Refactor Nexus and ask ai-dispatch to inspect the fallback chain.",
    "Change the service; have ai-dispatch ask Grok whether the route table looks sound.",
    "Integrate the third-party SDK and use ai-dispatch to review its provider adapter.",
    "Upgrade another tool, then use ai-dispatch to assess the model alias migration plan.",
    "Build this feature and let ai-dispatch review the streaming runtime logs.",
    "Migrate this application; ask ai-dispatch for feedback on the model registry.",
    "Wire the payment API, then have ai-dispatch analyze the route resolver proposal.",
    "Use ai-dispatch's provider adapter to ask Grok to fix this application bug.",
    "Fix the payment service, then use ai-dispatch's provider adapter to request a review.",
    "修复支付服务时，用 ai-dispatch 的 provider adapter 派 Grok review。",
    "用 ai-dispatch 的 provider adapter 让 Grok 修复另一个项目。",
    "ai-dispatch 的 provider registry 文档能帮我修复当前项目吗？",
    "Let ai-dispatch use a provider adapter to fix this unrelated application.",
    "Make ai-dispatch use the model resolver to debug another repository.",
    "Fix the payment service. The ai-dispatch provider adapter is broken.",
    "Implement the login page. The ai-dispatch model resolver is broken in an unrelated incident note.",
    "Fix this application. The ai-dispatch provider adapter is broken, but don't touch ai-dispatch.",
    "The ai-dispatch provider adapter is broken; investigate the payment service instead.",
    "The ai-dispatch model resolver is failing, but repair the login flow first.",
    "修复支付服务。ai-dispatch 的 provider adapter 有问题，但这轮不要改它。",
    "实现登录页。故障记录里提到 ai-dispatch model resolver 映射错误。",
    "ai-dispatch 的 provider adapter 有问题，但先修支付服务。",
  ];
  for (const prompt of ordinaryUse) {
    assert.equal(matchSemanticSignalComposition("dispatch_runtime_development", prompt), null, prompt);
    assert.ok(!positiveSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
  }

  for (const prompt of [
    "Quote the phrase “implement ai-dispatch provider adapter” in the guide; no runtime change.",
    "We reviewed how to modify ai-dispatch model registry, but no code change is requested.",
    "The README example says 'Fix ai-dispatch's provider adapter', but do not execute it.",
    "Copy the phrase 'fix ai-dispatch's route table' into README.",
    "Should we someday refactor ai-dispatch's fallback chain? Do not start work.",
    "Add the literal text 'ai-dispatch model resolver is broken' to a parser test fixture.",
    "Is ai-dispatch's provider registry broken? No; investigate the payment app instead.",
    "Fix ai-dispatch's provider adapter documentation.",
    "Review how to fix ai-dispatch's provider adapter.",
    "Plan how to modify ai-dispatch's model registry.",
    "Never change ai-dispatch's model resolver.",
    "Ask ai-dispatch: fix the provider adapter in the Nexus repository.",
    "Quote 'change ai-dispatch's model registry' in the proposal.",
    "Copy 'repair ai-dispatch's fallback chain' into the implementation proposal.",
    "In the design proposal, quote 'modify ai-dispatch model registry'.",
    "The incident report quotes 'fix ai-dispatch provider adapter'.",
    "Example prompt:\n- Fix ai-dispatch provider adapter\nExpected result: no execution.",
    "Expected prompt:\n- Implement ai-dispatch provider adapter\nExpected signal: false",
    "Fixture input:\nFix ai-dispatch model registry",
  ]) {
    assert.ok(!positiveSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
    assert.ok(!envelopePositiveSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
  }

  for (const prompt of [
    "Update the README example first. Then fix ai-dispatch’s actual provider registry bug.",
    "Review whether to refactor the fallback chain. Then implement the approved provider adapter inside ai-dispatch.",
    "Review how to fix ai-dispatch's provider adapter, then implement it.",
    "Plan how to modify ai-dispatch's model registry, then make that change.",
    "先评审如何修复 ai-dispatch 的 provider adapter，然后直接实现这个修复。",
    "先规划如何修改 ai-dispatch model registry，然后按方案修改它。",
    "The ai-dispatch provider adapter is broken. Please investigate and repair it.",
    "ai-dispatch 的 model resolver 有 bug，定位并修复它。",
  ]) {
    assert.ok(positiveSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
    assert.ok(envelopePositiveSignalIds(prompt).includes("dispatch_runtime_development"), prompt);
  }
});

test("rule governance includes read-only entry-rule audit but excludes quoted context", () => {
  const prompt = "Audit the repository entry agent instructions without editing files: identify duplicated permission rules across root, project, and skill layers, then recommend what to keep, remove, or relocate.";
  assert.ok(positiveSignalIds(prompt).includes("rule_governance"));

  const closeNegative = "Quote this AGENTS.md paragraph as prompt context; do not review, reorganize, or govern the rules.";
  assert.ok(!envelopePositiveSignalIds(closeNegative).includes("rule_governance"));

  assert.ok(positiveSignalIds("Decide whether agent guidance belongs in root rules, repository rules, skills, OME, or docs.").includes("rule_governance"));
});

test("comprehension repair composes stated confusion with a simpler explanation request", () => {
  const prompt = "That explanation lost me and still feels too jargon-heavy. Use an everyday analogy and give only two key relationships.";
  assert.ok(positiveSignalIds(prompt).includes("comprehension_failure"));

  const closeNegative = "I understand the architecture; preserve every technical term in a formal specification.";
  assert.ok(!positiveSignalIds(closeNegative).includes("comprehension_failure"));
});

test("comprehension repair accepts natural requests to explain more simply", () => {
  assert.ok(positiveSignalIds("这段我没看明白，能不能讲简单点？").includes("comprehension_failure"));
  assert.ok(positiveSignalIds("刚才那段我没听懂，请用一句话结论和日常类比重讲。")
    .includes("comprehension_failure"));
  assert.ok(!positiveSignalIds("把这段已理解的说明改短一点，但保留全部专业术语。").includes("comprehension_failure"));
});

test("design alignment requires a governing design source plus comparison", () => {
  const prompt = "Use the annotated Figma mock as the governing reference, compare it with the current settings page, and let its annotations win any conflict.";
  assert.ok(positiveSignalIds(prompt).includes("design_source_alignment"));

  const closeNegative = "Implement the settings page against the real API and verify its browser error states; no design source or UX review is involved.";
  assert.ok(!envelopePositiveSignalIds(closeNegative).includes("design_source_alignment"));

  for (const trigger of ["按设计稿评审页面", "根据截图还原 UI", "按设计稿实现页面", "Linear 或 Apple 风格设计页面", "评审列表页信息架构"]) {
    assert.ok(positiveSignalIds(trigger).includes("design_source_alignment"), trigger);
  }
  assert.ok(positiveSignalIds("对齐 DESIGN.md 评审 UI/UX 布局；这里只做设计判断，不改代码。").includes("design_source_alignment"));
});

test("test screenshots and branch readiness do not masquerade as design or worktree mutation", () => {
  const prompt = "The old smoke-test screenshot became obsolete after a config edit. Reassess whether the branch can merge, but do not modify, stage, or commit the worktree.";
  const ids = envelopePositiveSignalIds(prompt);
  assert.ok(!ids.includes("design_source_alignment"));
  assert.ok(!ids.includes("worktree_diff_operation"));
});

test("worktree signal requires local change state plus mutation intent", () => {
  const prompt = "Continue editing the parser in this dirty worktree; inspect git status and isolate this task's diff from the user's existing edits.";
  assert.ok(envelopePositiveSignalIds(prompt).includes("worktree_diff_operation"));

  const closeNegative = "Judge whether the branch can merge from fresh test evidence; do not modify, stage, or commit any local files.";
  assert.ok(!envelopePositiveSignalIds(closeNegative).includes("worktree_diff_operation"));

  assert.ok(envelopePositiveSignalIds("只修改本任务 git diff").includes("worktree_diff_operation"));
  assert.ok(envelopePositiveSignalIds("Inspect the task-scoped git diff and stage only task files in the local worktree.").includes("worktree_diff_operation"));
});

test("worktree mutation covers named branch pushes and protects previous user edits", () => {
  assert.ok(envelopePositiveSignalIds("Push the reviewed patch to the release branch.").includes("worktree_diff_operation"));
  assert.ok(envelopePositiveSignalIds("继续编辑配置前先检查我之前的改动，保留它们别覆盖。").includes("worktree_diff_operation"));
  assert.ok(envelopePositiveSignalIds("Before touching the tree, separate my in-progress edits and keep fixing only this task's files.")
    .includes("worktree_diff_operation"));
  assert.ok(!envelopePositiveSignalIds("Read-only assess whether the release branch can merge; do not edit, stage, commit, or push.").includes("worktree_diff_operation"));
});

test("semantic atoms do not compose across unrelated distant clauses", () => {
  const prompt = [
    "Document the legacy reader for an architecture glossary.",
    "Describe the observability dashboard and its raw fields.",
    "Summarize the current release notes.",
    "Propose one authoritative path for a separate greenfield service.",
    "Remove a typo from an unrelated README.",
  ].join(" ");
  assert.equal(matchSemanticSignalComposition("single_truth_version", prompt), null);
});
