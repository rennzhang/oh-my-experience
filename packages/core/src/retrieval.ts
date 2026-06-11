import { readCardIndex, type CardIndexEntry } from "./cards.js";
import { buildQueryPlan, buildTaskEnvelope, normalize, tokenize } from "./matcher.js";
import { projectFamilyKey } from "./project-context.js";
import type { ProjectContext } from "./schema.js";
import { cardSimilarity, type SimilarCardHint } from "./similarity.js";

export interface MatchReason {
  field: string;
  term: string;
  weight: number;
  kind: string;
}

export interface MatchResult {
  card: CardIndexEntry;
  score: number;
  reasons: MatchReason[];
  similarCards?: SimilarCardHint[];
  envelope: ReturnType<typeof buildTaskEnvelope>;
  queryVariants: string[];
  durationMs: number;
}

interface MatchOptions {
  limit?: number;
  threshold?: number;
  timeoutMs?: number;
  failOpenOnTimeout?: boolean;
  projectContext?: ProjectContext | null;
  additionalContextMaxChars?: number;
}

interface ContextOptions {
  maxChars?: number;
}

interface ContextCopy {
  heading: string;
  ambiguity: string;
  summary: string;
  useWhen: string;
  ignoreWhen: string;
  why: string;
  fullCard: string;
  instruction: string;
  similar: string;
  noSummary: string;
  defaultUse: string;
  defaultIgnore: string;
}

interface CorpusDocument {
  card: CardIndexEntry;
  fields: Record<string, string>;
  fieldTokenCounts: Record<string, Map<string, number>>;
  fieldLengths: Record<string, number>;
  allTokens: Set<string>;
  avgFieldLength: number;
  documentFrequency: Map<string, number>;
}

const POLICY_WEIGHT: Record<string, number> = { must: 5, should: 2, summary: 1, off: 0 };
const RISK_WEIGHT: Record<string, number> = { high: 2.5, medium: 1, low: 0 };
const CONFIDENCE_WEIGHT: Record<string, number> = { high: 1.08, medium: 1, low: 0.88 };
const POLICY_BOOST_GATE = 2.5;
const FIELD_WEIGHTS: Record<string, number> = {
  title: 5,
  triggers: 7,
  aliases: 6,
  topics: 4,
  intentModes: 4,
  requiredSignals: 4,
  category: 3,
  summary: 2.5,
  body: 1.2,
  sources: 0.8,
  rule: 1.2,
};
export function matchCards(dataDir: string, prompt: string, options: MatchOptions = {}): MatchResult[] {
  const started = Date.now();
  const index = readCardIndex(dataDir);
  const envelope = buildTaskEnvelope(prompt);
  const plan = buildQueryPlan(envelope);
  const cards = (index.experiences || []).filter((card) =>
    card.status === "active"
    && card.recallPolicy !== "off"
    && isApplicable(card, options.projectContext || null)
  );
  const corpus = buildCorpus(cards);
  const scored: Array<Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">> = [];
  let timedOut = false;
  for (const doc of corpus) {
    if (options.timeoutMs && Date.now() - started > options.timeoutMs) {
      timedOut = true;
      break;
    }
    const result = scoreDocument(doc, plan, corpus.length);
    if (result && result.score >= (options.threshold ?? 4)) scored.push(result);
  }
  if (timedOut && options.failOpenOnTimeout) return [];
  scored.sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
  const matches = diversify(collapseSimilar(scored)).slice(0, options.limit ?? 8);
  return matches.map((match) => ({
    ...match,
    envelope,
    queryVariants: plan.queryVariants.map((variant) => variant.text),
    durationMs: Date.now() - started,
  }));
}

export function explainMatch(dataDir: string, prompt: string, options: MatchOptions = {}) {
  const matches = matchCards(dataDir, prompt, options);
  return {
    ok: true,
    threshold: options.threshold ?? 4,
    limit: options.limit ?? 8,
    projectContext: options.projectContext || null,
    envelope: matches[0]?.envelope ?? buildTaskEnvelope(prompt),
    queryVariants: matches[0]?.queryVariants ?? buildQueryPlan(buildTaskEnvelope(prompt)).queryVariants.map((variant) => variant.text),
    matches: matches.map((match, index) => ({
      rank: index + 1,
      id: match.card.id,
      title: match.card.title,
      card: match.card,
      score: match.score,
      recallPolicy: match.card.recallPolicy,
      risk: match.card.risk,
      confidence: match.card.confidence,
      reasons: match.reasons,
      summary: match.card.summary,
      similarCards: match.similarCards || [],
    })),
    additionalContext: renderAdditionalContext(matches, {
      maxChars: options.additionalContextMaxChars,
    }),
  };
}

export function renderAdditionalContext(matches: MatchResult[], options: ContextOptions = {}): string {
  const maxChars = options.maxChars ?? 6000;
  if (!matches.length || maxChars <= 0) return "";
  const copy = contextCopy();
  const lines = [copy.heading, copy.ambiguity];
  let used = lines.join("\n").length;
  for (const [index, result] of matches.entries()) {
    const block = contextBlock(result, index + 1, copy);
    if (used + block.length + 1 > maxChars) break;
    lines.push(block);
    used += block.length + 1;
  }
  return lines.length === 2 ? "" : lines.join("\n");
}

export function buildContextPlan(matches: MatchResult[], options: ContextOptions = {}) {
  const additionalContext = renderAdditionalContext(matches, options);
  return {
    cards: matches.map((match) => match.card.id),
    additionalContext,
    truncated: matches.length > 0 && !matches.every((match) => additionalContext.includes(match.card.id)),
    budgetUsedChars: additionalContext.length,
  };
}

function scoreDocument(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>, totalDocs: number): Omit<MatchResult, "envelope" | "queryVariants" | "durationMs"> | null {
  const reasons: MatchReason[] = [];
  if (!passesRecallGate(doc.card, plan.envelope, reasons)) return null;
  let score = 0;
  for (const [token, queryWeight] of plan.tokens.entries()) {
    const df = doc.documentFrequency.get(token) || 0;
    if (!df) continue;
    const idf = Math.max(0.8, Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5)));
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const occurrences = doc.fieldTokenCounts[field]?.get(token) || 0;
      if (!occurrences) continue;
      const fieldLength = Math.max(doc.fieldLengths[field] || 1, 1);
      const tf = occurrences / (occurrences + 1.2 * (0.25 + 0.75 * fieldLength / doc.avgFieldLength));
      const weighted = queryWeight * FIELD_WEIGHTS[field] * idf * tf;
      score += weighted;
      if (weighted >= 0.25) reasons.push(reason(field, token, round(weighted), "bm25"));
    }
  }
  score += phraseBoost(doc, plan, reasons);
  score += overlapBoost(doc.card.topics || [], plan.envelope.taskTypes, "topics", reasons, 1.2);
  score += overlapBoost(doc.card.triggers || [], plan.envelope.surfaces, "surface", reasons, 0.9);
  score += ruleSignalBoost(doc.card, plan.envelope.ruleSignals, reasons);
  score -= negativeKeywordPenalty(doc, plan.envelope.negativeKeywords, reasons);
  score -= negativeTriggerPenalty(doc, plan, reasons);
  if (score >= POLICY_BOOST_GATE) {
    score += POLICY_WEIGHT[doc.card.recallPolicy] || 0;
    score += RISK_WEIGHT[doc.card.risk] || 0;
    score *= CONFIDENCE_WEIGHT[doc.card.confidence || "medium"] || 1;
    if (isStale(doc.card)) score *= 0.82;
  }
  return { card: doc.card, score: round(score), reasons: compactReasons(reasons) };
}

function buildCorpus(cards: CardIndexEntry[]): CorpusDocument[] {
  const docs = cards.map((card) => {
    const fields = buildFields(card);
    const fieldTokenCounts: Record<string, Map<string, number>> = {};
    const fieldLengths: Record<string, number> = {};
    const allTokens = new Set<string>();
    for (const [field, text] of Object.entries(fields)) {
      const tokens = tokenize(text);
      fieldLengths[field] = tokens.length;
      fieldTokenCounts[field] = countTokens(tokens);
      for (const token of tokens) allTokens.add(token);
    }
    return { card, fields, fieldTokenCounts, fieldLengths, allTokens, avgFieldLength: 1, documentFrequency: new Map<string, number>() };
  });
  const docFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const token of doc.allTokens) docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
  }
  for (const doc of docs) {
    doc.documentFrequency = docFrequency;
    const lengths = Object.values(doc.fieldLengths).filter(Boolean);
    doc.avgFieldLength = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 1;
  }
  return docs;
}

function buildFields(card: CardIndexEntry): Record<string, string> {
  const aliases = flattenAliases(card.aliases).join("\n");
  const body = (card as any).body || card.bodyExcerpt || "";
  return {
    title: card.title || "",
    category: card.category || "",
    triggers: (card.triggers || []).join("\n"),
    aliases,
    topics: (card.topics || []).join("\n"),
    intentModes: [
      ...(card.intentModes?.include || []),
      ...(card.intentModes?.exclude || []),
    ].join("\n"),
    requiredSignals: (card.requiredSignals || []).join("\n"),
    summary: card.summary || "",
    rule: card.rule || "",
    body,
    sources: (card.sources || []).join(" "),
  };
}

function passesRecallGate(card: CardIndexEntry, envelope: ReturnType<typeof buildTaskEnvelope>, reasons: MatchReason[]): boolean {
  const include = effectiveIntentInclude(card);
  const exclude = effectiveIntentExclude(card);
  const modes = new Set<string>(envelope.intentModes || []);
  const signals = new Set((envelope.ruleSignals || []).map((signal) => signal.id));
  const blockedSignals = effectiveBlockedSignals(card);
  const requiredSignals = effectiveRequiredSignals(card);
  const excludedModes = exclude.filter((mode) => modes.has(mode));
  if (excludedModes.length) {
    reasons.push(reason("intentModes.exclude", excludedModes.join("+"), -999, "gate"));
    return false;
  }
  if (include.length && !include.some((mode) => modes.has(mode))) {
    reasons.push(reason("intentModes.include", include.join("+"), -999, "gate"));
    return false;
  }
  const blockedHits = blockedSignals.filter((signal) => signals.has(signal));
  if (blockedHits.length) {
    reasons.push(reason("blockedSignals", blockedHits.join("+"), -999, "gate"));
    return false;
  }
  if (requiredSignals.length && !requiredSignals.some((signal) => signals.has(signal))) {
    reasons.push(reason("requiredSignals", requiredSignals.join("+"), -999, "gate"));
    return false;
  }
  return true;
}

function ruleSignalBoost(card: CardIndexEntry, signals: ReturnType<typeof buildTaskEnvelope>["ruleSignals"], reasons: MatchReason[]): number {
  const required = new Set(effectiveRequiredSignals(card));
  let score = 0;
  for (const signal of signals || []) {
    if (!required.has(signal.id)) continue;
    score += signal.weight;
    reasons.push(reason("ruleSignals", signal.id, round(signal.weight), signal.reason));
  }
  return score;
}

function effectiveIntentInclude(card: CardIndexEntry): string[] {
  const explicit = card.intentModes?.include || [];
  if (explicit.length) return explicit;
  return isCodexGoalExecutionCard(card) ? ["execute"] : [];
}

function effectiveIntentExclude(card: CardIndexEntry): string[] {
  const explicit = card.intentModes?.exclude || [];
  return isCodexGoalExecutionCard(card)
    ? Array.from(new Set([...explicit, "discuss", "explain"]))
    : explicit;
}

function effectiveRequiredSignals(card: CardIndexEntry): string[] {
  const explicit = card.requiredSignals || [];
  if (explicit.length) return explicit;
  if (isBrowserValidationCard(card)) return ["ui_surface"];
  return isCodexGoalExecutionCard(card) ? ["goal_execute"] : [];
}

function effectiveBlockedSignals(card: CardIndexEntry): string[] {
  const explicit = card.blockedSignals || [];
  return isCodexGoalExecutionCard(card)
    ? Array.from(new Set([...explicit, "business_goal_discussion", "explain_only"]))
    : explicit;
}

function isCodexGoalExecutionCard(card: CardIndexEntry): boolean {
  const terms = [
    card.id,
    card.title,
    ...(card.triggers || []),
    ...(card.topics || []),
  ].map((value) => normalize(value)).join(" ");
  return /(?:\/goal|创建目标|codex[-\s]?goal|execution[-\s]?start)/i.test(terms);
}

function isBrowserValidationCard(card: CardIndexEntry): boolean {
  const terms = [
    card.id,
    card.title,
    card.category,
  ].map((value) => normalize(value)).join(" ");
  return /browser[-\s]?validation|浏览器验证|真实浏览器|前端验收|ui\s*验收/i.test(terms);
}

function phraseBoost(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>, reasons: MatchReason[]): number {
  let boost = 0;
  const queryText = normalize(plan.queryVariants.map((variant) => variant.text).join(" "));
  for (const field of ["title", "triggers", "aliases", "topics"]) {
    const phrases = splitPhrases(doc.fields[field]);
    for (const phrase of phrases) {
      if (phrase.length < 2) continue;
      if (/^[\u4e00-\u9fff]+$/.test(phrase) && phrase.length < 3) continue;
      if (queryText.includes(phrase)) {
        const multiplier = field === "triggers" ? triggerPhraseMultiplier(phrase) : field === "title" ? 1.8 : 0.9;
        const value = FIELD_WEIGHTS[field] * multiplier;
        boost += value;
        reasons.push(reason(field, phrase, round(value), "phrase"));
      }
    }
  }
  return boost;
}

function triggerPhraseMultiplier(phrase: string): number {
  return tokenize(phrase).length <= 1 ? 2.5 : 5;
}

function overlapBoost(values: string[], queryValues: string[], field: string, reasons: MatchReason[], weight: number): number {
  const normalizedValues = new Set(values.flatMap((value) => tokenize(value)));
  const hits = queryValues.filter((value) => normalizedValues.has(normalize(value)));
  if (!hits.length) return 0;
  const value = hits.length * weight;
  reasons.push(reason(field, hits.join("+"), round(value), "overlap"));
  return value;
}

function negativeKeywordPenalty(doc: CorpusDocument, negativeKeywords: string[], reasons: MatchReason[]): number {
  const hits = negativeKeywords.filter((keyword) => doc.allTokens.has(keyword));
  if (!hits.length) return 0;
  const value = Math.min(180, hits.length * 24);
  reasons.push(reason("negative", hits.slice(0, 4).join("+"), -round(value), "negation"));
  return value;
}

function negativeTriggerPenalty(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>, reasons: MatchReason[]): number {
  const queryText = normalize(plan.queryVariants.map((variant) => variant.text).join(" "));
  const hits = (doc.card.negativeTriggers || []).filter((trigger) => negativeTriggerHit(queryText, trigger));
  if (!hits.length) return 0;
  const penalty = hits.length * 14;
  reasons.push(reason("negativeTriggers", hits.join("+"), round(-penalty), "penalty"));
  return penalty;
}

function negativeTriggerHit(queryText: string, trigger: string): boolean {
  const normalized = normalize(trigger);
  if (!normalized) return false;
  if (queryText.includes(normalized)) return true;
  return false;
}

function diversify(results: Array<Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">>): Array<Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">> {
  const seenTopics = new Map<string, number>();
  return results.map((result) => {
    const topic = primaryTopic(result.card);
    const count = seenTopics.get(topic) || 0;
    seenTopics.set(topic, count + 1);
    return count ? { ...result, score: round(result.score * Math.max(0.72, 1 - count * 0.12)) } : result;
  }).sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
}

function collapseSimilar(
  results: Array<Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">>,
): Array<Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">> {
  const selected: Array<Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">> = [];
  for (const result of results) {
    const existing = selected.find((candidate) =>
      sameApplicabilityScope(candidate.card, result.card)
      && cardSimilarity(candidate.card, result.card).score >= 64
    );
    if (!existing) {
      selected.push({ ...result, similarCards: [] });
      continue;
    }
    const similarity = cardSimilarity(existing.card, result.card);
    existing.similarCards = [
      ...(existing.similarCards || []),
      { id: result.card.id, title: result.card.title, score: similarity.score, reason: similarity.reason },
    ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4);
  }
  return selected;
}

function sameApplicabilityScope(left: CardIndexEntry, right: CardIndexEntry): boolean {
  const a = left.applicability || { level: "global" };
  const b = right.applicability || { level: "global" };
  return a.level === b.level
    && (a.projectKey || "") === (b.projectKey || "")
    && (a.modulePath || "") === (b.modulePath || "");
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function splitPhrases(text: string): string[] {
  return unique(String(text || "").split(/[\n,，;；|]+/).map((item) => normalize(item)).filter(Boolean));
}

function flattenAliases(aliases: Record<string, string[]>): string[] {
  if (!aliases || typeof aliases !== "object") return [];
  return Object.values(aliases).flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)]);
}

function isStale(card: CardIndexEntry): boolean {
  if (!card.staleAfter) return false;
  const time = Date.parse(card.staleAfter);
  return Number.isFinite(time) && time < Date.now();
}

function primaryTopic(card: CardIndexEntry): string {
  return (card.topics || [])[0] || (card.triggers || [])[0] || card.id;
}

function isApplicable(card: CardIndexEntry, context: ProjectContext | null): boolean {
  const applicability = card.applicability || { level: "global" };
  if (applicability.level === "global") return true;
  if (!context?.projectKey || !applicability.projectKey) return false;
  if (applicability.level === "project") {
    return context.projectKey === applicability.projectKey && modulePathMatches(applicability.modulePath, context.modulePath);
  }
  if (applicability.level === "project-family") {
    return projectFamilyKey(context.projectKey) === projectFamilyKey(applicability.projectKey)
      && modulePathMatches(applicability.modulePath, context.modulePath);
  }
  return false;
}

function modulePathMatches(expected: string | null | undefined, actual: string | null | undefined): boolean {
  const target = normalizeModulePath(expected);
  if (!target || target === ".") return true;
  const current = normalizeModulePath(actual);
  if (!current) return false;
  return current === target || current.startsWith(`${target}/`);
}

function normalizeModulePath(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/g, "")
    .trim();
  return normalized || ".";
}

function compactReasons(reasons: MatchReason[]): MatchReason[] {
  const seen = new Set();
  return reasons
    .sort((a, b) => b.weight - a.weight)
    .filter((item) => {
      const key = `${item.field}:${item.term}:${item.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function reason(field: string, term: string, weight: number, kind: string): MatchReason {
  return { field, term, weight, kind };
}

function formatReason(reasonItem: MatchReason | string | undefined): string {
  if (!reasonItem) return "";
  if (typeof reasonItem === "string") return reasonItem;
  return `${reasonItem.field}:${reasonItem.term}`;
}

function contextBlock(result: MatchResult, index: number, copy: ContextCopy): string {
  const card = result.card;
  const marker = `[${card.risk || "medium"} risk][${card.recallPolicy || "should"}]`;
  const summary = card.summary || copy.noSummary;
  const useWhen = compactList(card.triggers, 3) || compactList(card.topics, 3) || copy.defaultUse;
  const notWhen = compactList(card.negativeTriggers, 2) || copy.defaultIgnore;
  const why = formatReason(result.reasons[0]) || `score ${Math.round(result.score)}`;
  const command = `ome experience show ${card.id} --section rule`;
  const similar = result.similarCards?.length
    ? `\n   ${copy.similar}: ${result.similarCards.map((item) => `${item.title} (${item.id})`).join(", ")}`
    : "";
  return [
    `${index}. ${marker} ${card.title} (${card.id})`,
    `   ${copy.summary}: ${oneLine(summary, 220)}`,
    `   ${copy.useWhen}: ${useWhen}`,
    `   ${copy.ignoreWhen}: ${notWhen}`,
    `   ${copy.why}: ${why}`,
    `   ${copy.fullCard}: ${command}`,
    `   ${copy.instruction}${similar}`,
  ].join("\n");
}

function contextCopy(): ContextCopy {
  return {
    heading: "Potentially relevant OME lessons. Use only when directly applicable; ignore unrelated or conflicting lessons.",
    ambiguity: "Keyword matches can be ambiguous; compare each lesson's workflow meaning, use cases, and ignore cases before applying it. At the end, briefly list only the OME lessons you actually used. Do not mention OME when no lesson was used.",
    summary: "Summary",
    useWhen: "Use when",
    ignoreWhen: "Ignore when",
    why: "Why recalled",
    fullCard: "Full experience",
    instruction: "If this lesson applies, fetch the full card before acting.",
    similar: "Similar cards omitted",
    noSummary: "No summary.",
    defaultUse: "directly matches this task",
    defaultIgnore: "unrelated to the task",
  };
}

function compactList(values: string[] | undefined, limit: number): string {
  return (values || []).slice(0, limit).map((value) => oneLine(value)).join("; ");
}

function oneLine(value: unknown, maxLength = 120): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}
