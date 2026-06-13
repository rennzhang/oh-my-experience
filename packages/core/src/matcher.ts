import { detectIntentModes, detectRuleSignals, type IntentMode, type RuleSignal } from "./intent-rules.js";

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
  import: ["import", "spool import", "codex session", "session jsonl", "会话导入", "导入会话", "导入"],
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
  const normalized = normalize(text);
  const stripped = stripNoise(text);
  const tokens = tokenize(stripped);
  return {
    summary: summarize(stripped),
    language: detectLanguage(text),
    taskTypes: detectByDictionary(normalized, TASK_TYPES),
    operations: detectByDictionary(normalized, OPERATIONS),
    files: extractPaths(text),
    commands: extractCommands(text),
    constraints: extractPresent(normalized, CONSTRAINT_TERMS),
    risks: extractRisks(normalized),
    surfaces: extractSurfaces(normalized),
    intentModes: detectIntentModes(stripped),
    ruleSignals: detectRuleSignals(stripped),
    keywords: extractKeywords(tokens),
    negativeKeywords: extractNegativeKeywords(stripped),
    segments: segmentPrompt(stripped),
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
  for (const segment of envelope.segments.slice(0, 4)) addVariant(queryVariants, "segment", segment, 0.85);
  const tokens = new Map<string, number>();
  for (const variant of queryVariants) {
    for (const token of tokenize(variant.text)) {
      tokens.set(token, Math.max(tokens.get(token) || 0, variant.weight));
    }
  }
  return { envelope, queryVariants, tokens };
}

export function normalize(input: unknown): string {
  return stripNoise(String(input || "")).toLowerCase();
}

export function matchesLexicalTerm(input: unknown, termInput: unknown): boolean {
  const normalized = normalize(input);
  const tokenSet = new Set(tokenize(normalized));
  return matchesTerm(normalized, termInput, tokenSet);
}

export function tokenize(input: unknown): string[] {
  const text = normalize(input);
  const tokens: string[] = [];
  for (const match of text.matchAll(/[a-z0-9][a-z0-9._/-]*|[\u4e00-\u9fff]+/g)) {
    const value = match[0];
    if (/^[\u4e00-\u9fff]+$/.test(value)) {
      tokens.push(...cjkTokens(value));
    } else if (!STOPWORDS.has(value)) {
      tokens.push(value);
      tokens.push(...splitCodeToken(value));
    }
  }
  return Array.from(new Set(tokens.filter((token) => token && !STOPWORDS.has(token))));
}

function summarize(text: string): string {
  return stripNoise(text).slice(0, 700);
}

function stripNoise(text: unknown): string {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
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
  return unique(tokens.filter((token) => token.length > 1 && !STOPWORDS.has(token))).slice(0, 36);
}

function extractNegativeKeywords(text: string): string[] {
  const matches = String(text || "").matchAll(/(?:不是|not\s+(?:a|an|the)?\s*)([^。；;,.，\n]{1,80})/gi);
  const tokens: string[] = [];
  for (const match of matches) {
    tokens.push(...tokenize(match[1] || ""));
  }
  return extractKeywords(tokens);
}

function segmentPrompt(text: string): string[] {
  return unique(String(text).split(/[\n。.!?？；;]/).map((item) => item.trim()).filter((item) => item.length > 8)).slice(0, 8);
}

function splitCodeToken(token: string): string[] {
  if (!/[._/-]/.test(token)) return [];
  return token.split(/[._/-]+/).filter((part) => part.length > 1 && !STOPWORDS.has(part));
}

function cjkTokens(value: string): string[] {
  if (value.length <= 2) return [value];
  const tokens = new Set<string>([value]);
  for (const word of segmentCjkWords(value)) tokens.add(word);
  for (let index = 0; index < value.length - 1; index += 1) tokens.add(value.slice(index, index + 2));
  return Array.from(tokens);
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
