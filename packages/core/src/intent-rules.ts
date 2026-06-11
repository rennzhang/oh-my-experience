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
      /创建目标|使用\s*goal|开始执行目标|创建目标开干|开干|开始处理|跑长任务|一把做完|全部完成|逐一验收/,
    ],
  },
  {
    mode: "explain",
    patterns: [/我想知道|为什么|原理|解释一下|说明一下|怎么理解|what is|why\b|explain/i],
  },
  {
    mode: "discuss",
    patterns: [/怎么看|评判一下|好处坏处|是否可以|要不要|我想了解|讨论|方案|策略|判断一下/],
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
    reason: "explicit Codex goal execution wording",
    patterns: [/\/goal\b/i, /创建目标|使用\s*goal|开始执行目标|创建目标开干|跑长任务|全部完成|逐一验收/],
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
    id: "ome_review_surface",
    polarity: "positive",
    weight: 10,
    reason: "OME AI-first review workflow wording",
    patterns: [
      /\bOME\b.*(?:review|experience)/i,
      /oh-my-experience.*(?:review|experience)/i,
      /AI[-\s]?first.*review/i,
      /experience review flow|manual card creation|avoid user burden/i,
      /经验卡.*(?:审核|review)|复盘.*审核/,
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
    patterns: [/我想知道|为什么|原理|解释一下|只是.*(?:了解|讨论|解释)|不(?:要|用).*执行|先别.*(?:改|做)/],
  },
];

export function detectIntentModes(text: unknown): IntentMode[] {
  const value = String(text || "");
  const modes = INTENT_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
    .map((rule) => rule.mode);
  return Array.from(new Set(modes));
}

export function detectRuleSignals(text: unknown): RuleSignal[] {
  const value = String(text || "");
  return SIGNAL_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
    .map(({ id, polarity, weight, reason }) => ({ id, polarity, weight, reason }));
}
