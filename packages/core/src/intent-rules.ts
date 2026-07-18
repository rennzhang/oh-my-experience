import {
  SIGNAL_REGISTRY,
  getRoutingSignalIds,
  getSignalDefinition,
  getSignalNegativeTargets,
  getSignalQueryTerms,
  isKnownSignalId,
  listSignalDefinitions,
  matchSignalDefinitions,
  matchesSignalDefinition,
  validateSignalIds,
  type RuleSignal,
  type SignalDefinition,
  type SignalSource,
  type SignalValidationResult,
} from "./signal-registry.js";

export {
  SIGNAL_REGISTRY,
  getRoutingSignalIds,
  getSignalDefinition,
  getSignalNegativeTargets,
  getSignalQueryTerms,
  isKnownSignalId,
  listSignalDefinitions,
  matchSignalDefinitions,
  matchesSignalDefinition,
  validateSignalIds,
};
export type { RuleSignal, SignalDefinition, SignalSource, SignalValidationResult };

export const INTENT_MODES = ["execute", "discuss", "review", "debug", "plan", "explain", "operate"] as const;
export type IntentMode = typeof INTENT_MODES[number];

export interface IntentSegment {
  text: string;
  modes: IntentMode[];
}

interface IntentDefinition {
  mode: IntentMode;
  patterns: readonly RegExp[];
}

export const INTENT_DEFINITIONS: readonly IntentDefinition[] = Object.freeze([
  {
    mode: "execute",
    patterns: [
      /\/goal\b/i,
      /\b(?:implement|build|create|fix|repair|update|change|add|remove|refactor|run|execute|deploy|install|write|handle|investigate|resolve|diagnose|modify|edit)\b/i,
      /创建.{0,6}目标|开干|开始处理|做完|实现|落地|修复|执行|开发|新增|修改|重构|处理|追查|调查|解决|排查/,
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
    patterns: [/报错|失败|排查|追查|调查|根因|debug|修复|为什么不对|不生效|异常|\b(?:troubleshoot|diagnose|investigate|failure|failed|error|exception)\b/i],
  },
  {
    mode: "operate",
    patterns: [/git push|开\s*PR|发布|部署|删除数据|生产配置|重启生产|授权|付费|额度/i],
  },
  {
    mode: "plan",
    patterns: [/计划|roadmap|里程碑|拆解|排期|优化计划|实施方案/i],
  },
]);

const EXECUTION_CONTEXT_BLOCKERS = /(?:(?:只|仅|只是|仅仅).{0,24}(?:了解|讨论|解释|说明|分析)|(?:不要|不用|不需|无需|无须|不必|先别|暂不).{0,24}(?:执行|实现|修改|修复|运行|落地|改代码|动代码)|不(?:执行|实现|修改|修复|运行|落地|改代码|动代码)|\b(?:explain|discuss|analy[sz]e)\s+only\b|\b(?:without|do\s+not|don't|no\s+need\s+to)\s+(?:executing?|implementing?|modifying?|fixing?|running?|changing?)\b)/i;

export function detectIntentModes(text: unknown): IntentMode[] {
  const segments = detectIntentSegments(text);
  const modes = uniqueModes(segments.flatMap((segment) => segment.modes));
  if (!modes.includes("execute")) return modes;
  return modes.filter((mode) => mode !== "explain" && mode !== "discuss");
}

export function detectIntentSegments(text: unknown): IntentSegment[] {
  return splitIntentSegments(text).map((segment) => {
    const modes = detectRawIntentModes(segment);
    return {
      text: segment,
      modes: isActionableExecutionSegment(segment) ? modes : modes.filter((mode) => mode !== "execute"),
    };
  });
}

export function detectRuleSignals(text: unknown): RuleSignal[] {
  const value = String(text || "");
  const matched = matchSignalDefinitions(value);
  if (!matched.length) return [];
  const segments = splitIntentSegments(value);
  const signalContextSegments = uniqueSegments([
    ...splitSignalContextSegments(value),
    ...extractCurrentSignalBlocks(value),
  ]);
  const independentSegments = uniqueSegments([...segments, ...signalContextSegments]);
  const suppressedTargets = new Set<string>();
  const contextualNegatives = new Set<string>();
  const contextuallyNegatedPositives = new Set<string>();

  for (const definition of matched) {
    if (definition.polarity !== "positive") continue;
    const matchingSegments = segments.filter((segment) => matchesSignalDefinition(definition, segment));
    if (matchingSegments.length && matchingSegments.every((segment) => isExplicitlyNegatedSegment(segment, definition.id))) {
      contextuallyNegatedPositives.add(definition.id);
    }
  }

  for (const definition of matched) {
    if (definition.polarity !== "negative" || !definition.suppressTargets || !definition.negativeTargets.length) continue;
    const candidateSegments = definition.id === "runtime_reference_context"
      ? signalContextSegments
      : independentSegments;
    const hasIndependentTarget = definition.negativeTargets.some((targetId) =>
      hasIndependentSignalSegment(candidateSegments, targetId, definition)
    );
    if (hasIndependentTarget) {
      contextualNegatives.add(definition.id);
      continue;
    }
    for (const target of definition.negativeTargets) suppressedTargets.add(target);
  }

  return matched
    .filter((definition) =>
      !suppressedTargets.has(definition.id)
      && !contextualNegatives.has(definition.id)
      && !contextuallyNegatedPositives.has(definition.id)
    )
    .map(({ id, polarity, weight, reason }) => ({ id, polarity, weight, reason }));
}

function isExplicitlyNegatedSegment(segment: string, signalId?: string): boolean {
  if (
    signalId === "control_plane_worker_divergence"
    && /(?:worker\s*pool|worker\s*capacity|capacity|执行容量|worker\s*容量).{0,24}(?:is\s+)?not\s+full|(?:容量未满|还有容量|有余量)/i.test(segment)
  ) return false;
  if (
    signalId === "dispatch_runtime_development"
    && /(?:改|修改)(?:的)?是\s*ai[-\s]?dispatch[^。.!?！？]{0,32}不是(?:调用|使用)/i.test(segment)
  ) return false;
  return /(?:^|[\s:：,，])(?:这|此|当前|本轮|任务)?(?:不是|并非|不属于|不涉及|无关|无需)(?:当前|本轮)?/i.test(segment)
    || /(?:^|\s)(?:this|it|the\s+task|current\s+task)?\s*(?:is\s+not|isn't|does\s+not\s+involve|doesn't\s+involve|not\s+a)\b/i.test(segment);
}

function detectRawIntentModes(value: string): IntentMode[] {
  return uniqueModes(INTENT_DEFINITIONS
    .filter((definition) => definition.patterns.some((pattern) => patternMatches(pattern, value)))
    .map((definition) => definition.mode));
}

function isActionableExecutionSegment(segment: string): boolean {
  if (EXECUTION_CONTEXT_BLOCKERS.test(segment)) return false;
  const definitions = matchSignalDefinitions(segment);
  const executionSignals = definitions.filter((definition) =>
    definition.id === "explicit_execute" || definition.id === "goal_execute"
  );
  if (!executionSignals.length) return false;
  const targetIds = new Set(executionSignals.map((definition) => definition.id));
  return !definitions.some((definition) =>
    definition.polarity === "negative"
    && definition.suppressTargets
    && definition.negativeTargets.some((target) => targetIds.has(target))
  );
}

function hasIndependentSignalSegment(segments: string[], targetId: string, negative: SignalDefinition): boolean {
  const target = getSignalDefinition(targetId);
  if (!target) return false;
  return segments.some((segment) =>
    matchesSignalDefinition(target, segment) && !matchesSignalDefinition(negative, segment)
  );
}

function splitIntentSegments(text: unknown): string[] {
  const value = String(text || "").trim();
  if (!value) return [];
  const parts = value
    .split(/[\n。.!?？；;]+|\b(?:and\s+then|after\s+that|then|but|however|instead)\b|然后|接着|随后|但是|不过|而是/gi)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [value];
}

function splitSignalContextSegments(text: unknown): string[] {
  const value = String(text || "").trim();
  if (!value) return [];
  const parts = value.split(/[。.!?？]+/g).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [value];
}

function extractCurrentSignalBlocks(text: unknown): string[] {
  const value = String(text || "");
  const blocks: string[] = [];
  const pattern = /(?:^|[\n;；]|\|\|)\s*(?:current\s+live(?:\s+state)?(?:\s+follows)?|current\s+runtime|current\s+state|current|当前(?:实时|运行时|状态)?)(?:\s*(?::|：))?[\s\S]{0,360}/gi;
  for (const match of value.matchAll(pattern)) {
    const block = String(match[0] || "").trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

function uniqueSegments(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function patternMatches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function uniqueModes(values: IntentMode[]): IntentMode[] {
  return Array.from(new Set(values));
}
