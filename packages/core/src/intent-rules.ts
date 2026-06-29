export const INTENT_MODES = ["execute", "discuss", "review", "debug", "plan", "explain", "operate"] as const;
export type IntentMode = typeof INTENT_MODES[number];

export interface RuleSignal {
  id: string;
  polarity: "positive" | "negative";
  weight: number;
  reason: string;
}

interface IntentRule {
  mode: IntentMode;
  patterns: RegExp[];
}

interface SignalRule {
  id: string;
  polarity: RuleSignal["polarity"];
  weight: number;
  reason: string;
  patterns: RegExp[];
}

const INTENT_RULES: IntentRule[] = [
  {
    mode: "execute",
    patterns: [
      /\/goal\b/i,
      /\bgoal\b.*(?:跑|执行|run|start|create)/i,
      /创建.{0,6}目标.{0,24}(?:开始|开干|执行|处理|优化|做完|全部完成|验证)|创建目标|使用\s*goal|开始执行目标|创建目标开干|开干|开始处理|跑长任务|一把做完|全部完成|逐一验收/,
    ],
  },
  {
    mode: "explain",
    patterns: [/我想知道|为什么|原理|解释一下|说明一下|怎么理解|what is|what\b.*\bmeans?\b|why\b|explain/i],
  },
  {
    mode: "discuss",
    patterns: [/\bdiscuss\b|怎么看|评判一下|好处坏处|是否可以|要不要|我想了解|讨论|方案|策略|判断一下/],
  },
  {
    mode: "review",
    patterns: [/\breview\b|审查|评审|帮我看|风险|复盘/i],
  },
  {
    mode: "debug",
    patterns: [/报错|失败|排查|debug|修复|为什么不对|不生效|异常/i],
  },
  {
    mode: "operate",
    patterns: [/git push|开\s*PR|发布|部署|删除数据|生产配置|重启生产|授权|付费|额度/i],
  },
  {
    mode: "plan",
    patterns: [/计划|roadmap|里程碑|拆解|排期|优化计划|实施方案/i],
  },
];

const SIGNAL_RULES: SignalRule[] = [
  {
    id: "goal_execute",
    polarity: "positive",
    weight: 18,
    reason: "explicit agent goal execution wording",
    patterns: [
      /\/goal\b/i,
      /\b(?:create|start|use)\s+(?:a\s+)?goal\b/i,
      /\bgoal\s+(?:and\s+)?(?:start|execute|run|finish|verify)\b/i,
      /创建.{0,6}目标.{0,24}(?:开始|开干|执行|处理|优化|做完|全部完成|验证)|创建目标|使用\s*goal|开始执行目标|创建目标开干|跑长任务|全部完成|逐一验收/,
    ],
  },
  {
    id: "goal_example_discussion",
    polarity: "negative",
    weight: -34,
    reason: "goal wording is discussed as documentation or an example, not used as an execution trigger",
    patterns: [
      /(?:文档|README|readme|docs?|documentation|guide|tutorial|案例|示例|例子|examples?|展示|说明).{0,80}(?:\/goal\b|创建目标|使用\s*goal|\bcreate\s+(?:a\s+)?goal\b|\buse\s+goal\b)/i,
      /(?:\/goal\b|创建目标|使用\s*goal|\bcreate\s+(?:a\s+)?goal\b|\buse\s+goal\b).{0,80}(?:文档|README|readme|docs?|documentation|guide|tutorial|案例|示例|例子|examples?|展示|说明|给用户看)/i,
      /(?:比如|例如|当我说).{0,40}(?:\/goal\b|创建目标|使用\s*goal)/i,
      /\b(?:discuss|explain)\b.{0,80}(?:\/goal\b|\bcreate\s+(?:a\s+)?goal\b|\buse\s+goal\b)/i,
      /(?:\/goal\b|\bcreate\s+(?:a\s+)?goal\b|\buse\s+goal\b).{0,80}\b(?:means?|explained|explaining|discussion|without\s+executing)\b/i,
    ],
  },
  {
    id: "explicit_execute",
    polarity: "positive",
    weight: 8,
    reason: "explicit execution wording",
    patterns: [/开干|开始处理|做完|实现|落地|修复|执行/i],
  },
  {
    id: "real_validation",
    polarity: "positive",
    weight: 6,
    reason: "real-path validation wording",
    patterns: [/真实入口|真实路径|浏览器验证|自己验证|逐项验证|e2e|smoke|验收/i],
  },
  {
    id: "ui_surface",
    polarity: "positive",
    weight: 8,
    reason: "UI, frontend, or browser surface wording",
    patterns: [
      /\b(?:UI|UX|frontend|front-end|browser|viewport)\b/i,
      /前端|界面|页面|浏览器|视口|移动端布局|用户路径点击/,
    ],
  },
  {
    id: "ui_surface_noise",
    polarity: "negative",
    weight: -30,
    reason: "UI or browser wording is explicitly described as noise",
    patterns: [
      /\b(?:UI|UX|frontend|front-end|browser|viewport)\b.{0,32}(?:noise|噪声)/i,
      /(?:noise|噪声).{0,32}\b(?:UI|UX|frontend|front-end|browser|viewport)\b/i,
      /(?:前端|界面|页面|浏览器|视口).{0,32}噪声|噪声.{0,32}(?:前端|界面|页面|浏览器|视口)/,
    ],
  },
  {
    id: "ui_example_discussion",
    polarity: "negative",
    weight: -30,
    reason: "UI or browser wording is discussed as documentation or an example, not used as a real UI task",
    patterns: [
      /(?:文档|README|readme|docs?|案例|示例|例子|examples?|展示|说明).{0,80}\b(?:UI|UX|frontend|front-end|browser|viewport)\b/i,
      /\b(?:UI|UX|frontend|front-end|browser|viewport)\b.{0,80}(?:文档|README|readme|docs?|案例|示例|例子|examples?|展示|说明)/i,
      /(?:文档|README|readme|docs?|案例|示例|例子|展示|说明).{0,80}(?:前端|界面|页面|浏览器|视口)/,
      /(?:前端|界面|页面|浏览器|视口).{0,80}(?:文档|README|readme|docs?|案例|示例|例子|展示|说明)/,
      /(?:不运行|不用运行|不执行|只解释|只是解释|只说明).{0,40}(?:UI|浏览器|页面|前端|browser)/i,
    ],
  },
  {
    id: "ome_review_surface",
    polarity: "positive",
    weight: 10,
    reason: "OME AI-first draft approval workflow wording",
    patterns: [
      /\bOME\b.*(?:draft approval|experience)/i,
      /oh-my-experience.*(?:draft approval|experience)/i,
      /AI[-\s]?first.*(?:draft approval|review)/i,
      /experience draft approval|manual card creation|avoid user burden/i,
      /经验草稿审批|经验卡.*(?:审核|审批|review)|复盘.*(?:审核|审批)/,
    ],
  },
  {
    id: "provider_adapter_boundary",
    polarity: "positive",
    weight: 12,
    reason: "provider adapter or shared hook runtime boundary wording",
    patterns: [
      /(?:Claude\s+UserPromptSubmit|Codex\s+hook|provider[-\s]?neutral|additionalContext|fork\s+retrieval|retrieval\s+scoring)/i,
      /(?:不同\s*Agent|多入口适配|适配层|provider).{0,60}(?:召回|hook|runtime|运行时|分叉|同一套)/i,
      /(?:不要|不能|绝不能).{0,40}(?:分叉|fork).{0,40}(?:召回|retrieval|scoring)/i,
    ],
  },
  {
    id: "package_install_validation",
    polarity: "positive",
    weight: 12,
    reason: "package, tarball, or clean install validation wording",
    patterns: [
      /\bnpm\s+pack\b|\btarball\s+install\b|\bpackage\s+install\s+smoke\b|\bnpx\s+smoke\b/i,
      /(?:临时目录|临时项目|clean\s+temp).{0,40}(?:安装|install)|(?:安装|install).{0,40}(?:tarball|npm\s+包|安装包)/i,
      /(?:发布|release|pack).{0,40}(?:验收|验证|smoke|安装包)/i,
    ],
  },
  {
    id: "delivery_gate",
    polarity: "positive",
    weight: 12,
    reason: "delivery, final review, pre-submit, or acceptance gate wording",
    patterns: [
      /(?:交付|收尾|提交前|pre[-\s]?submit|final\s+review|delivery).{0,50}(?:验收|review|检查|gate|自检|验证)/i,
      /(?:验收|验证|自检).{0,40}(?:交付|收尾|提交前|final\s+review|delivery)/i,
    ],
  },
  {
    id: "source_truth_chain",
    polarity: "positive",
    weight: 12,
    reason: "source-of-truth, requirement, design, acceptance, and implementation chain wording",
    patterns: [
      /(?:source\s+of\s+truth|真源|事实源|需求|设计|验收).{0,80}(?:实现|方案|链|闭环|roadmap|原话)/i,
      /(?:方案|实现|改动).{0,60}(?:需求|设计|验收|真源|source\s+of\s+truth|用户原话)/i,
    ],
  },
  {
    id: "failure_triage",
    polarity: "positive",
    weight: 12,
    reason: "debugging requires separating environment failure from business failure",
    patterns: [
      /(?:排障|debug|失败|不生效|报错|异常).{0,60}(?:环境|业务|工具|配置|根因)/i,
      /(?:环境|业务|工具|配置).{0,40}(?:失败|问题|根因|排障)/i,
    ],
  },
  {
    id: "temporary_mock_boundary",
    polarity: "positive",
    weight: 12,
    reason: "temporary mock, fake data, fallback, or reverse data boundary wording",
    patterns: [
      /(?:mock|fake|placeholder|fallback|临时|反向数据|假数据|内存替代).{0,60}(?:阶段|接线|边界|真实|验收|替代)/i,
      /(?:真实路径|真实数据|真实入口).{0,50}(?:mock|fake|placeholder|fallback|临时|反向数据)/i,
    ],
  },
  {
    id: "external_model_review",
    polarity: "positive",
    weight: 12,
    reason: "external or multi-model review with source anchors and decision boundary",
    patterns: [
      /(?:外部模型|多模型|dispatch|party[-\s]?review|model\s+review).{0,70}(?:审查|review|真源|source|锚点|裁决|边界)/i,
      /(?:审查|review).{0,50}(?:外部模型|多模型|dispatch|source\s+anchor|真源锚点)/i,
    ],
  },
  {
    id: "rule_governance",
    polarity: "positive",
    weight: 12,
    reason: "agent rule, AGENTS, CLAUDE, or rule-layer governance wording",
    patterns: [
      /(?:AGENTS\.md|CLAUDE\.md|agents\.md|rules?|规则|入口规则).{0,70}(?:分层|归位|治理|常驻|能力|skill|OME|下沉)/i,
      /(?:分层|归位|治理).{0,50}(?:规则|AGENTS|CLAUDE|入口|常驻)/i,
    ],
  },
  {
    id: "bridge_runtime_validation",
    polarity: "positive",
    weight: 12,
    reason: "bridge, bot, message service, watchdog, or runtime status validation wording",
    patterns: [
      /(?:bridge|bot|机器人|消息服务|watchdog|runtime|服务状态).{0,70}(?:验收|验证|状态|一致|日志|重启|运行时)/i,
      /(?:状态一致|服务状态|运行时).{0,50}(?:bridge|bot|机器人|消息|watchdog)/i,
    ],
  },
  {
    id: "design_source_alignment",
    polarity: "positive",
    weight: 12,
    reason: "UI/UX or product design work must align with DESIGN.md or design source",
    patterns: [
      /(?:UI\/UX|UX|产品设计|交互设计|视觉设计|信息架构|DESIGN\.md|design\s+source).{0,70}(?:对齐|体验判断|设计判断|评审|设计|布局)/i,
      /(?:对齐|判断|优化).{0,50}(?:DESIGN\.md|UI|UX|产品设计|交互|视觉|信息架构)/i,
    ],
  },
  {
    id: "information_design",
    polarity: "positive",
    weight: 12,
    reason: "attention hierarchy, concept slimming, or low mental-load information design wording",
    patterns: [
      /(?:低心智|心智负担|注意力分层|概念瘦身|信息分层|progressive\s+disclosure|mental\s+load).{0,60}(?:设计|文档|CLI|页面|体验|简化)/i,
      /(?:简化|压缩|瘦身|分层).{0,50}(?:概念|信息|注意力|心智|文档|CLI)/i,
    ],
  },
  {
    id: "architecture_quality",
    polarity: "positive",
    weight: 13,
    reason: "cohesive architecture, clean logic, or root-cause implementation wording",
    patterns: [
      /(?:高内聚|低耦合|根因|source\s+of\s+truth|KISS|clean\s+architecture|maintainable|cohesive|coupling).{0,80}(?:优化|修复|实现|重构|治理|逻辑|架构|模块|clean|refactor)/i,
      /(?:优化|修复|实现|重构|治理|逻辑|架构|模块|clean|refactor).{0,80}(?:高内聚|低耦合|根因|source\s+of\s+truth|KISS|maintainable|cohesive|coupling)/i,
      /(?:不要|不能|避免|删除).{0,50}(?:兼容包袱|历史包袱|fallback|两套真相|stale branches|compatibility clutter)/i,
      /(?:干净改法|干净重构|最干净有效的改法|链路清理|清理链路|最终态重构).{0,80}(?:现有实现|代码变更|实现|链路|重构|清理|优化|改法)/i,
      /(?:现有实现|代码变更|实现|链路|重构|清理|优化|改法).{0,80}(?:干净改法|干净重构|最干净有效的改法|链路清理|清理链路|最终态重构)/i,
      /(?:链路).{0,16}(?:干净|清洗|清理|残留|无残留)|(?:干净|清洗|清理|残留|无残留).{0,16}(?:链路)/i,
    ],
  },
  {
    id: "high_risk_action",
    polarity: "positive",
    weight: 14,
    reason: "high-risk irreversible action requires explicit authorization",
    patterns: [
      /(?:git\s+push|push|开\s*PR|pull\s+request|发布|部署|生产|删除|授权|付费|额度|高风险|不可逆|production).{0,70}(?:确认|授权|先问|审批|执行|操作)/i,
      /(?:确认|授权|先问|审批).{0,50}(?:push|PR|发布|部署|生产|删除|付费|高风险|不可逆)/i,
    ],
  },
  {
    id: "git_operation",
    polarity: "positive",
    weight: 14,
    reason: "explicit Git, diff, stage, commit, or worktree operation",
    patterns: [
      /\bgit\s+(?:status|diff|add|commit|push|checkout|switch|branch|restore|reset|worktree|merge|rebase|stash|show|log)\b/i,
      /\b(?:commit|push|stage|staged|unstaged|dirty\s+worktree|worktree|diff)\b/i,
      /脏工作区|暂存|提交前|提交|推送|回滚|未提交|无关改动|本任务\s*diff|只处理.{0,20}diff|工作区.{0,20}diff|开\s*PR/i,
    ],
  },
  {
    id: "git_source_noise",
    polarity: "negative",
    weight: -34,
    reason: "Git, GitHub, commit, or diff wording is only a source/background mention, not a local worktree operation",
    patterns: [
      /(?:GitHub|github|PR|issue|commit|diff|git).{0,50}(?:只是|仅仅|只作为|资料来源|背景|source|reference)/i,
      /(?:只是|仅仅|只作为|资料来源|背景|source|reference).{0,50}(?:GitHub|github|PR|issue|commit|diff|git)/i,
      /(?:不涉及|不要|不需要|无需).{0,40}(?:git\s+)?(?:diff|提交|commit|stage|暂存|push|工作区|worktree)/i,
      /(?:读|阅读|查看|研究).{0,30}(?:GitHub|github|PR|issue|commit).{0,40}(?:背景|资料|讨论|历史)/i,
    ],
  },
  {
    id: "worktree_diff_operation",
    polarity: "positive",
    weight: 14,
    reason: "dirty worktree, diff, stage, or commit-scope operation",
    patterns: [
      /\bgit\s+(?:status|diff|add|commit|restore|worktree|stash)\b/i,
      /\b(?:dirty\s+worktree|worktree|staged|unstaged|stage|diff|unrelated\s+dirty|commit\s+scope)\b/i,
      /脏工作区|暂存|未提交|无关改动|本任务\s*diff|只处理.{0,20}diff|工作区.{0,20}diff/i,
    ],
  },
  {
    id: "historical_session_lookup",
    polarity: "positive",
    weight: 12,
    reason: "explicit historical session, Spool UUID, or cross-session evidence lookup",
    patterns: [
      /\bspool\b.{0,80}(?:uuid|session|show|search|list|查|搜索|回溯|历史|旧线程|会话|证据|sourceRefs|messageId|turn\s*id|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      /(?:历史会话|旧线程|跨会话|会话交接|本机会话扫描|sourceRefs|messageId|turn\s*id|session\s*UUID|Spool\s*UUID)/i,
      /(?:spool|会话|历史).{0,80}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    ],
  },
  {
    id: "business_goal_discussion",
    polarity: "negative",
    weight: -36,
    reason: "business or OKR goal discussion, not agent goal execution",
    patterns: [/公司.{0,12}目标|业务.{0,12}目标|OKR|指标|增长目标|用户规模目标|拿下\d+.*用户|今年.{0,8}目标/],
  },
  {
    id: "explain_only",
    polarity: "negative",
    weight: -24,
    reason: "explanation or discussion only",
    patterns: [/我想知道|为什么|原理|解释一下|只是.*(?:了解|讨论|解释)|不(?:要|用).*执行|先别.*(?:改|做)|\b(?:explain|discuss)\b|without\s+executing|do\s+not\s+execute/i],
  },
];

export function detectIntentModes(text: unknown): IntentMode[] {
  const value = String(text || "");
  const modes = INTENT_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
    .map((rule) => rule.mode);
  const uniqueModes = Array.from(new Set(modes));
  if (signalRuleMatches(value, "goal_example_discussion") && !signalRuleMatches(value, "explicit_execute")) {
    return uniqueModes.filter((mode) => mode !== "execute");
  }
  return uniqueModes;
}

export function detectRuleSignals(text: unknown): RuleSignal[] {
  const value = String(text || "");
  const signals = SIGNAL_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
    .map(({ id, polarity, weight, reason }) => ({ id, polarity, weight, reason }));
  return suppressConflictingSignals(signals);
}

function suppressConflictingSignals(signals: RuleSignal[]): RuleSignal[] {
  const ids = new Set(signals.map((signal) => signal.id));
  const suppressed = new Set<string>();
  if (ids.has("goal_example_discussion")) suppressed.add("goal_execute");
  if (ids.has("ui_surface_noise")) suppressed.add("ui_surface");
  if (ids.has("ui_example_discussion")) suppressed.add("ui_surface");
  if (ids.has("git_source_noise")) {
    suppressed.add("git_operation");
    suppressed.add("worktree_diff_operation");
  }
  return signals.filter((signal) => !suppressed.has(signal.id));
}

function signalRuleMatches(value: string, id: string): boolean {
  const rule = SIGNAL_RULES.find((candidate) => candidate.id === id);
  return Boolean(rule?.patterns.some((pattern) => pattern.test(value)));
}
