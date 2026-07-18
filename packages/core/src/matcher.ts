import { detectIntentModes, detectRuleSignals, type IntentMode, type RuleSignal } from "./intent-rules.js";
import { getSignalQueryTerms } from "./signal-registry.js";
import { matchSemanticSignalComposition } from "./semantic-signals.js";

const EN_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "with", "that", "this", "from", "then", "than", "for", "are", "was", "were", "you", "your",
  "to", "of", "in", "on", "by", "as", "be", "is", "it", "into", "out", "context",
]);
const ZH_STOPWORDS = new Set(["我们", "这个", "那个", "然后", "需要", "一下", "一个", "这些", "已经", "可以", "就是", "但是"]);
const STOPWORDS = new Set([...EN_STOPWORDS, ...ZH_STOPWORDS]);

const TASK_TYPES = {
  ui: ["ui", "frontend", "front-end", "console", "page", "页面", "界面", "浏览器", "组件", "交互"],
  hook: ["hook", "userpromptsubmit", "additionalcontext", "钩子", "注入", "召回"],
  git: ["git", "commit", "push", "branch", "submodule", "worktree", "diff"],
  review: ["review", "复盘", "审核", "审查", "roadmap", "决策"],
  runtime: ["deploy", "deployment", "runtime", "server", "logs", "日志", "timeout", "部署"],
  test: ["test", "tests", "e2e", "playwright", "验证", "测试", "冒烟"],
  storage: ["storage", "datadir", "config", "migration", "lock", "backup", "index", "配置", "迁移", "备份"],
  security: ["secret", "token", "permission", "auth", "cors", "权限", "安全", "隐私", "不可逆"],
  docs: ["docs", "markdown", "roadmap", "文档", "口径", "溯源"],
  package: ["npm", "npx", "pypi", "package", "install", "tarball", "安装", "打包"],
  source: ["source scan", "spool scan", "codex session", "session jsonl", "来源扫描", "扫描会话", "索引来源"],
};
const OPERATIONS = {
  implement: ["implement", "build", "write", "新增", "实现", "开发", "做完"],
  review: ["review", "audit", "审查"],
  fix: ["fix", "repair", "debug", "修复", "排查", "打穿", "打稳"],
  install: ["install", "setup", "init", "安装", "初始化", "配置"],
  package: ["publish", "pack", "npx", "npm", "pypi", "发布", "打包", "注册"],
  dispatch: ["dispatch", "multi-model", "多模型", "派发"],
};
const SURFACES = ["codex", "claude", "spool", "obsidian", "console", "ui", "cli", "hook", "github", "npm", "pypi"];
const CONSTRAINT_TERMS = ["must", "should", "never", "no", "not", "不要", "必须", "不能", "禁止", "暂不", "先不做", "真实", "完整"];

export interface TaskEnvelope {
  summary: string;
  language: "en" | "zh" | "mixed";
  taskTypes: string[];
  operations: string[];
  files: string[];
  commands: string[];
  constraints: string[];
  risks: string[];
  surfaces: string[];
  intentModes: IntentMode[];
  ruleSignals: RuleSignal[];
  keywords: string[];
  /** Full negated spans kept out of positive retrieval evidence. */
  negatives: string[];
  negativeKeywords: string[];
  segments: string[];
  length: number;
}

export interface QueryVariant {
  kind: string;
  text: string;
  weight: number;
}

export interface QueryPlan {
  envelope: TaskEnvelope;
  queryVariants: QueryVariant[];
  tokens: Map<string, number>;
}

export function buildTaskEnvelope(prompt: unknown): TaskEnvelope {
  const text = String(prompt || "");
  const positiveText = stripNegatedSpans(text);
  const narrative = stripNarrativeNoise(text);
  const positiveNarrative = stripNarrativeNoise(positiveText);
  const searchable = stripSearchNoise(positiveText);
  const normalized = normalize(searchable);
  const tokens = tokenize(searchable);
  const negatives = extractNegatedSpans(narrative);
  const hasCurrentControlPlaneBlock = hasIndependentCurrentControlPlaneBlock(text);
  const needsRawSignalBoundaries = hasCurrentControlPlaneBlock || hasStructuredDispatchFieldBlock(text);
  const rawDetectedSignals = needsRawSignalBoundaries ? detectRuleSignals(text) : [];
  let detectedSignals = detectRuleSignals(narrative);
  if (hasCurrentControlPlaneBlock) {
    const rawCurrentControlSignal = rawDetectedSignals.find((signal) =>
      signal.id === "control_plane_worker_divergence" && signal.polarity === "positive"
    );
    if (rawCurrentControlSignal) {
      // Narrative normalization intentionally collapses line boundaries, but a
      // quoted postmortem followed by an explicit current-state block depends
      // on that boundary. Keep the raw block's positive signal and discard the
      // contextual reference blocker that normalization can otherwise revive.
      detectedSignals = detectedSignals.filter((signal) => signal.id !== "runtime_reference_context");
      if (!detectedSignals.some((signal) =>
        signal.id === rawCurrentControlSignal.id && signal.polarity === rawCurrentControlSignal.polarity
      )) {
        detectedSignals.push(rawCurrentControlSignal);
      }
    }
  }
  const rawDispatchDevelopmentSignal = rawDetectedSignals.find((signal) =>
    signal.id === "dispatch_runtime_development" && signal.polarity === "positive"
  );
  if (
    rawDispatchDevelopmentSignal
    && !detectedSignals.some((signal) =>
      signal.id === rawDispatchDevelopmentSignal.id && signal.polarity === rawDispatchDevelopmentSignal.polarity
    )
  ) {
    // Structured Target/Component/Action prompts need their original line
    // boundaries. Only restore the signal after the raw rule detector has
    // already applied reference and tool-use blockers.
    detectedSignals.push(rawDispatchDevelopmentSignal);
  }
  const affirmativeSignalIds = new Set(
    detectRuleSignals(positiveNarrative)
      .filter((signal) => signal.polarity === "positive")
      .map((signal) => signal.id),
  );
  if (rawDispatchDevelopmentSignal) affirmativeSignalIds.add("dispatch_runtime_development");
  if (
    detectedSignals.some((signal) => signal.id === "high_risk_action")
    && (
      isHighRiskAuthorizationGate(narrative)
      || Boolean(matchSemanticSignalComposition("high_risk_action", narrative))
    )
  ) {
    affirmativeSignalIds.add("high_risk_action");
  }
  // Some routing lessons are expressed as prohibitions ("do not claim this
  // prototype proves production"). Preserve only a complete bounded semantic
  // composition; never restore a signal from a negated keyword alone.
  if (
    detectedSignals.some((signal) => signal.id === "temporary_mock_boundary")
    && matchSemanticSignalComposition("temporary_mock_boundary", narrative)
  ) {
    affirmativeSignalIds.add("temporary_mock_boundary");
  }
  if (
    detectedSignals.some((signal) => signal.id === "long_running_liveness")
    && isLongRunningLivenessGate(narrative)
  ) {
    affirmativeSignalIds.add("long_running_liveness");
  }
  if (
    detectedSignals.some((signal) => signal.id === "control_plane_worker_divergence")
    && (
      isControlPlaneSpareCapacityGate(narrative)
      || hasCurrentControlPlaneBlock
    )
  ) {
    affirmativeSignalIds.add("control_plane_worker_divergence");
  }
  if (
    detectedSignals.some((signal) => signal.id === "dispatch_runtime_development")
    && isExplicitDispatchDevelopmentContrast(narrative)
  ) {
    affirmativeSignalIds.add("dispatch_runtime_development");
  }
  return {
    summary: summarize(positiveNarrative),
    language: detectLanguage(text),
    taskTypes: detectByDictionary(normalized, TASK_TYPES),
    operations: detectByDictionary(normalized, OPERATIONS),
    files: extractPaths(positiveText),
    commands: extractCommands(positiveText),
    constraints: extractPresent(normalized, CONSTRAINT_TERMS),
    risks: extractRisks(normalized),
    surfaces: extractSurfaces(normalized),
    intentModes: detectIntentModes(positiveNarrative),
    ruleSignals: detectedSignals.filter((signal) =>
      signal.polarity === "negative" || affirmativeSignalIds.has(signal.id)
    ),
    keywords: extractKeywords(tokens),
    negatives,
    negativeKeywords: extractKeywords(negatives.flatMap((span) => tokenize(span))),
    segments: segmentPrompt(positiveNarrative),
    length: text.length,
  };
}

export function buildQueryVariants(prompt: unknown): string[] {
  const envelope = buildTaskEnvelope(prompt);
  return buildQueryPlan(envelope).queryVariants.map((variant) => variant.text);
}

export function buildQueryPlan(envelope: TaskEnvelope): QueryPlan {
  const queryVariants: QueryVariant[] = [];
  addVariant(queryVariants, "summary", envelope.summary, 1);
  addVariant(queryVariants, "keywords", envelope.keywords.join(" "), 1.15);
  addVariant(queryVariants, "taskTypes", envelope.taskTypes.join(" "), 0.8);
  addVariant(queryVariants, "operations", envelope.operations.join(" "), 0.35);
  addVariant(queryVariants, "surfaces", envelope.surfaces.join(" "), 0.9);
  addVariant(queryVariants, "files", envelope.files.join(" "), 1.1);
  addVariant(queryVariants, "commands", envelope.commands.join(" "), 1.2);
  addVariant(queryVariants, "constraints", envelope.constraints.join(" "), 0.9);
  addVariant(queryVariants, "risks", envelope.risks.join(" "), 0.8);
  addVariant(queryVariants, "intentModes", envelope.intentModes.join(" "), 0.6);
  addVariant(queryVariants, "ruleSignals", envelope.ruleSignals.map((signal) => signal.id).join(" "), 0.65);
  addVariant(queryVariants, "ruleSignalExpansions", expandRuleSignals(envelope.ruleSignals), 0.75);
  for (const segment of selectHeadTail(envelope.segments, 4)) addVariant(queryVariants, "segment", segment, 0.85);
  const tokens = new Map<string, number>();
  for (const variant of queryVariants) {
    for (const token of tokenize(variant.text)) {
      tokens.set(token, Math.max(tokens.get(token) || 0, variant.weight));
    }
  }
  return { envelope, queryVariants, tokens };
}

function expandRuleSignals(signals: RuleSignal[]): string {
  return unique((signals || [])
    .filter((signal) => signal.polarity === "positive")
    .flatMap((signal) => getSignalQueryTerms(signal.id).flatMap((term) => tokenize(term))))
    .join(" ");
}

export function normalize(input: unknown): string {
  return stripSearchNoise(String(input || "")).toLowerCase();
}

export function matchesLexicalTerm(input: unknown, termInput: unknown): boolean {
  const normalized = normalize(input);
  const tokenSet = new Set(tokenize(normalized));
  return matchesTerm(normalized, termInput, tokenSet);
}

export function tokenize(input: unknown): string[] {
  return Array.from(new Set(tokenizeSequence(input)));
}

export function tokenizeSequence(input: unknown): string[] {
  const text = normalize(input);
  const tokens: string[] = [];
  for (const match of text.matchAll(/[a-z0-9][a-z0-9._/-]*|[\u4e00-\u9fff]+/g)) {
    const rawValue = match[0];
    const value = /^[\u4e00-\u9fff]+$/.test(rawValue) ? rawValue : rawValue.replace(/[./-]+$/g, "");
    if (!value) continue;
    if (/^[\u4e00-\u9fff]+$/.test(value)) {
      tokens.push(...cjkTokenSequence(value));
    } else if (!STOPWORDS.has(value)) {
      tokens.push(value);
      tokens.push(...splitCodeToken(value));
    }
  }
  return tokens.filter((token) => token && !STOPWORDS.has(token));
}

function summarize(text: string): string {
  return stripNarrativeNoise(text).slice(0, 700);
}

function stripNarrativeNoise(text: unknown): string {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\bat\s+[\w.$/:-]+\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSearchNoise(text: unknown): string {
  return String(text || "")
    .replace(/```[^\n`]*\n([\s\S]*?)```|```([\s\S]*?)```/g, (_match, blockBody: string, inlineBody: string) =>
      ` ${extractCodeBlockTerms(blockBody ?? inlineBody ?? "").join(" ")} `)
    .replace(/\bat\s+[\w.$/:-]+\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguage(text: unknown): "en" | "zh" | "mixed" {
  const cjk = (String(text).match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (String(text).match(/[a-zA-Z]/g) || []).length;
  if (cjk && latin) return "mixed";
  if (cjk) return "zh";
  return "en";
}

function detectByDictionary(normalized: string, dictionary: Record<string, string[]>): string[] {
  const hits: string[] = [];
  const tokenSet = new Set(tokenize(normalized));
  for (const [label, terms] of Object.entries(dictionary)) {
    if (terms.some((term) => matchesTerm(normalized, term, tokenSet))) hits.push(label);
  }
  return hits;
}

function extractPaths(text: string): string[] {
  return unique(String(text).match(/(?:~|\.{1,2}|\/)?[\w./@-]+\.(?:js|jsx|ts|tsx|json|md|toml|yaml|yml|py|go|rs|css|html|lock)/g) || []);
}

function extractCommands(text: string): string[] {
  const commands: string[] = [];
  const commandNames = String.raw`(?:npm|npx|pnpm|bun|node|git|ome|oh-my-experience|spool|codex|claude)`;
  for (const match of String(text).matchAll(/`([^`]+)`/g)) {
    const value = (match[1] || "").trim();
    if (new RegExp(`^${commandNames}\\s+(?=[A-Za-z0-9_./:@=-])`, "i").test(value)) commands.push(value);
  }
  const bareCommand = new RegExp(
    String.raw`(?:^|[\n;]|\b(?:run|execute|use|using|call|invoke|运行|执行|使用|通过|调用)\s+)(${commandNames}\s+(?=[A-Za-z0-9_./:@=-])[^。\n;` + "`" + String.raw`，,]+)`,
    "gi",
  );
  for (const match of String(text).matchAll(bareCommand)) commands.push(match[1] || "");
  return unique(commands).map((command) => command.trim().slice(0, 180));
}

function extractPresent(normalized: string, terms: string[]): string[] {
  const tokenSet = new Set(tokenize(normalized));
  return terms.filter((term) => matchesTerm(normalized, term, tokenSet));
}

function extractRisks(normalized: string): string[] {
  return extractPresent(normalized, ["不要", "必须", "push", "真实", "secret", "token", "全局", "生产", "不可逆", "external", "permission"]);
}

function extractSurfaces(normalized: string): string[] {
  const tokenSet = new Set(tokenize(normalized));
  return SURFACES.filter((term) => matchesTerm(normalized, term, tokenSet));
}

function extractKeywords(tokens: string[]): string[] {
  const values = unique(tokens.filter((token) => token.length > 1 && !STOPWORDS.has(token)));
  return selectHeadTail(values, 36);
}

function segmentPrompt(text: string): string[] {
  return unique(String(text).split(/[\n。.!?？；;]/).map((item) => item.trim()).filter((item) => item.length > 8));
}

const NEGATED_SPAN_PATTERN = /(?:\b(?:do\s+not|don't|does\s+not(?!\s+make\s+sense\s+to\s+me\b)|doesn't(?!\s+make\s+sense\s+to\s+me\b)|not(?!\s+only\b)(?:\s+(?:a|an|the))?|no\s+need(?:\s+(?:to|for))?|no\s+(?:code\s+)?(?:review|dispatch|multi[-\s]?model\s+audit|audit|diff)|need\s+not|without)\b|(?:(?<!是)不是|并非|不属于|不涉及|不要|不用|不需|无需|无须|不必|别(?:再|先|急着|直接|继续|马上|立刻|随便)?(?=(?:执行|实现|修改|修复|运行|落地|改|动|删|清|推|提交|部署|发布|重启|覆盖|用|做|跑|开|写|读|碰|安装|调用|声称|把|将|认为|假设))))[^\n。.!?？；;,，]*?(?=\b(?:but|however|instead)\b|(?:但是|但|不过|而是|改为|换成)|[\n。.!?？；;,，]|$)/gi;

const HIGH_RISK_AUTHORIZATION_GATE_PATTERNS = [
  /(?:未(?:经|获)|没有|缺少).{0,12}(?:授权|批准|确认).{0,24}(?:不要|不得|禁止).{0,24}(?:(?:删除|清空).{0,24}(?:线上|生产).{0,12}(?:数据|记录)|(?:修改|变更).{0,20}生产配置)/i,
  /(?:先)?不要.{0,12}(?:删|删除|清空).{0,24}(?:这批)?线上数据.{0,40}(?:拿到|获得).{0,12}(?:授权|批准).{0,20}(?:再动手|再执行)/i,
  /(?:生产配置).{0,24}(?:未(?:经|获)|没有|缺少).{0,12}(?:授权|批准|确认).{0,24}(?:不要|不得|禁止).{0,16}(?:修改|变更)/i,
  /\b(?:do\s+not|don't|must\s+not)\b.{0,24}(?:delete|remove).{0,24}(?:online|production).{0,12}(?:data|records?).{0,40}(?:until|without).{0,20}(?:explicitly\s+)?(?:authorized|approval|authorization|permission)/i,
  /\bproduction\s+config(?:uration)?\b.{0,30}\b(?:do\s+not|don't|must\s+not)\b.{0,16}(?:change|update).{0,30}(?:until|without).{0,20}(?:authorized|approval|authorization|permission)/i,
] as const;

function isHighRiskAuthorizationGate(text: string): boolean {
  return HIGH_RISK_AUTHORIZATION_GATE_PATTERNS.some((pattern) => pattern.test(text));
}

const LONG_RUNNING_LIVENESS_GATE_PATTERNS = [
  /(?:coding\s+agent|\bagent\b|worker|provider|bridge|长任务|模型任务).{0,100}(?:activity|heartbeat|progress|stream|流式输出|阶段(?:输出|推进|进展|变化)|工具结果|状态推进).{0,100}(?:不要|不能|避免|do\s+not|don't).{0,30}(?:硬?超时|总墙钟|wall[-\s]?clock|kill|杀掉|误杀)/i,
  /heartbeat.{0,100}(?:没有|无|without|no).{0,30}(?:progress|输出|进展|状态推进).{0,60}(?:stalled?|卡住|续命|stall\s+window|长时间|长期|半小时)?/i,
  /(?:inactivity\s+window|progress\s+stall\s+window).{0,60}(?:agent|worker|provider|bridge|任务|失活|stalled?)/i,
] as const;

function isLongRunningLivenessGate(text: string): boolean {
  return LONG_RUNNING_LIVENESS_GATE_PATTERNS.some((pattern) => pattern.test(text));
}

function isControlPlaneSpareCapacityGate(text: string): boolean {
  return /(?=[^\n.!?。！？]{0,180}(?:capacity|worker\s*pool|执行容量|worker\s*容量))(?=[^\n.!?。！？]{0,180}(?:not\s+full|has\s+room|available\s+capacity|容量未满|还有容量|有余量))(?=[^\n.!?。！？]{0,180}(?:queued|pending|排队))/i.test(text);
}

function hasIndependentCurrentControlPlaneBlock(text: string): boolean {
  const pattern = /(?:^|[\n;；]|\|\|)\s*(?:current\s+live(?:\s+state)?(?:\s+follows)?|current\s+runtime|current\s+state|current|当前(?:实时|运行时|状态)?)(?:\s*(?::|：))?[\s\S]{0,360}/gi;
  for (const match of text.matchAll(pattern)) {
    if (detectRuleSignals(match[0]).some((signal) =>
      signal.id === "control_plane_worker_divergence" && signal.polarity === "positive"
    )) return true;
  }
  return false;
}

function hasStructuredDispatchFieldBlock(text: string): boolean {
  return /(?:^|[\n;；{,]\s*)["']?target["']?\s*(?::|=|\bis\b)/i.test(text);
}

function isExplicitDispatchDevelopmentContrast(text: string): boolean {
  return /(?:改|修改)(?:的)?是\s*ai[-\s]?dispatch[^。.!?！？]{0,32}不是(?:调用|使用)[^。.!?！？]{0,32}(?:provider\s*(?:adapter|适配器)|(?:model|provider)\s*(?:registry|注册表)|model\s*alias(?:es)?|模型别名|model\s*resolver|模型解析器|route\s*resolver|路由解析器|(?:routing|route)\s*table|路由表|fallback\s*(?:chain|routing|链|路由)|resume\s*(?:runtime|运行时)|stream(?:ing)?\s*(?:runtime|运行时))/i.test(text);
}

function extractNegatedSpans(text: unknown): string[] {
  const value = String(text || "");
  const spans: string[] = [];
  for (const match of value.matchAll(new RegExp(NEGATED_SPAN_PATTERN.source, NEGATED_SPAN_PATTERN.flags))) {
    const span = String(match[0] || "").trim();
    if (span) spans.push(span);
  }
  return unique(spans);
}

function stripNegatedSpans(text: unknown): string {
  return String(text || "")
    .replace(new RegExp(NEGATED_SPAN_PATTERN.source, NEGATED_SPAN_PATTERN.flags), " ")
    .trim();
}

function splitCodeToken(token: string): string[] {
  if (!/[._/-]/.test(token)) return [];
  return token.split(/[._/-]+/).filter((part) => part.length > 1 && !STOPWORDS.has(part));
}

function cjkTokenSequence(value: string): string[] {
  if (value.length <= 2) return [value];
  const tokens = [value, ...segmentCjkWords(value)];
  for (let index = 0; index < value.length - 1; index += 1) tokens.push(value.slice(index, index + 2));
  return tokens;
}

function segmentCjkWords(value: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: string | string[], options: { granularity: "word" }) => {
      segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>;
    };
  }).Segmenter;
  if (!Segmenter) return [];
  try {
    return Array.from(new Segmenter(["zh-CN", "en"], { granularity: "word" }).segment(value))
      .filter((item) => item.isWordLike !== false)
      .map((item) => item.segment.trim())
      .filter((item) => item.length > 1 && !STOPWORDS.has(item));
  } catch {
    return [];
  }
}

function addVariant(variants: QueryVariant[], kind: string, text: unknown, weight: number): void {
  const value = String(text || "").trim();
  if (value) variants.push({ kind, text: value, weight });
}

function extractCodeBlockTerms(body: string): string[] {
  const terms = [
    ...extractPaths(body),
    ...extractCommands(body),
  ];
  const patterns = [
    /\bERR_[A-Z0-9_]+\b/g,
    /\b[A-Z][A-Z0-9_]{3,}\b/g,
    /\b[A-Za-z_$][A-Za-z0-9_$]*(?:[._:/-][A-Za-z0-9_$@-]+)+\b/g,
    /\b(?:[a-z]+[A-Z][A-Za-z0-9_$]*|[A-Z][a-z]+(?:[A-Z][A-Za-z0-9_$]*)+)\b/g,
    /\b[A-Za-z_$][A-Za-z0-9_$]*(?=\s*\()/g,
  ];
  for (const pattern of patterns) terms.push(...Array.from(body.matchAll(pattern), (match) => match[0]));
  return unique(terms).slice(0, 48);
}

function selectHeadTail<T>(values: T[], limit: number): T[] {
  if (values.length <= limit) return [...values];
  const headCount = Math.ceil(limit / 2);
  const tailCount = Math.floor(limit / 2);
  return [...values.slice(0, headCount), ...values.slice(-tailCount)];
}

function matchesTerm(normalizedText: string, rawTerm: unknown, tokenSet: Set<string>): boolean {
  const term = normalize(rawTerm);
  if (!term) return false;
  if (/[\u4e00-\u9fff]/.test(term)) return normalizedText.includes(term);
  const termTokens = tokenize(term);
  if (!termTokens.length) return false;
  if (/^[a-z0-9][a-z0-9._/-]*$/.test(term)) return tokenSet.has(term);
  const boundary = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term).replace(/\s+/g, "\\s+")}($|[^a-z0-9])`, "i");
  return boundary.test(normalizedText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}
