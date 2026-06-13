import type { CardIndexEntry } from "./cards.js";
import { buildQueryPlan, matchesLexicalTerm, normalize, tokenize } from "./matcher.js";

export interface MatchReason {
  field: string;
  term: string;
  weight: number;
  kind: string;
}

export interface ScoredCard {
  card: CardIndexEntry;
  score: number;
  reasons: MatchReason[];
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
  requiredSignals: 2,
  category: 3,
  summary: 2.5,
};
const ENGINE_HINT_BOOST_MULTIPLIER = 2.4;
const ROUTING_SIGNAL_IDS = new Set([
  "goal_execute",
  "ui_surface",
  "worktree_diff_operation",
  "historical_session_lookup",
  "provider_adapter_boundary",
  "package_install_validation",
  "delivery_gate",
  "source_truth_chain",
  "failure_triage",
  "temporary_mock_boundary",
  "external_model_review",
  "rule_governance",
  "bridge_runtime_validation",
  "design_source_alignment",
  "information_design",
  "architecture_quality",
  "high_risk_action",
  "ome_review_surface",
]);

export function buildScoringCorpus(cards: CardIndexEntry[]): CorpusDocument[] {
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

export function scoreDocument(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>, totalDocs: number): ScoredCard | null {
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
  score -= negativeRuleSignalPenalty(doc.card, plan.envelope.ruleSignals, reasons);
  score -= missingRequiredSignalPenalty(doc.card, plan.envelope.ruleSignals, reasons);
  score -= negativeKeywordPenalty(doc, plan.envelope.negativeKeywords, reasons);
  score -= negativeTriggerPenalty(doc, plan, reasons);
  if (score >= POLICY_BOOST_GATE) {
    score += POLICY_WEIGHT[doc.card.recallPolicy] || 0;
    score += RISK_WEIGHT[doc.card.risk] || 0;
    score *= CONFIDENCE_WEIGHT[doc.card.confidence || "medium"] || 1;
  }
  return { card: doc.card, score: round(score), reasons: compactReasons(reasons) };
}

function buildFields(card: CardIndexEntry): Record<string, string> {
  const aliases = flattenAliases(card.aliases).join("\n");
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
  };
}

function passesRecallGate(card: CardIndexEntry, envelope: ReturnType<typeof buildQueryPlan>["envelope"], reasons: MatchReason[]): boolean {
  const include = card.intentModes?.include || [];
  const exclude = card.intentModes?.exclude || [];
  const modes = new Set<string>(envelope.intentModes || []);
  const signals = new Set((envelope.ruleSignals || []).map((signal) => signal.id));
  const positiveSignals = new Set((envelope.ruleSignals || []).filter((signal) => signal.polarity === "positive").map((signal) => signal.id));
  const blockedSignals = card.blockedSignals || [];
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
  const requiredRoutingSignals = (card.requiredSignals || []).filter((signal) => ROUTING_SIGNAL_IDS.has(signal));
  if (requiredRoutingSignals.length && !requiredRoutingSignals.some((signal) => positiveSignals.has(signal))) {
    reasons.push(reason("requiredSignals", requiredRoutingSignals.join("+"), -999, "gate"));
    return false;
  }
  return true;
}

function ruleSignalBoost(card: CardIndexEntry, signals: ReturnType<typeof buildQueryPlan>["envelope"]["ruleSignals"], reasons: MatchReason[]): number {
  const required = new Set(card.requiredSignals || []);
  let score = 0;
  for (const signal of signals || []) {
    if (!required.has(signal.id)) continue;
    const value = signal.weight * ENGINE_HINT_BOOST_MULTIPLIER;
    score += value;
    reasons.push(reason("ruleSignals", signal.id, round(value), signal.reason));
  }
  return score;
}

function negativeRuleSignalPenalty(card: CardIndexEntry, signals: ReturnType<typeof buildQueryPlan>["envelope"]["ruleSignals"], reasons: MatchReason[]): number {
  const required = new Set(card.requiredSignals || []);
  const negativeSignals = (signals || []).filter((signal) =>
    signal.polarity === "negative" && negativeSignalTargetsCard(signal.id, required)
  );
  if (!negativeSignals.length) return 0;
  const value = Math.min(120, negativeSignals.reduce((sum, signal) => sum + Math.abs(signal.weight), 0) * 1.4);
  reasons.push(reason("ruleSignals.negative", negativeSignals.map((signal) => signal.id).join("+"), -round(value), "penalty"));
  return value;
}

function negativeSignalTargetsCard(signalId: string, requiredSignals: Set<string>): boolean {
  const targets: Record<string, string[]> = {
    goal_example_discussion: ["goal_execute"],
    business_goal_discussion: ["goal_execute"],
    ui_surface_noise: ["ui_surface"],
    git_source_noise: ["git_operation", "worktree_diff_operation"],
  };
  return (targets[signalId] || []).some((target) => requiredSignals.has(target));
}

function missingRequiredSignalPenalty(card: CardIndexEntry, signals: ReturnType<typeof buildQueryPlan>["envelope"]["ruleSignals"], reasons: MatchReason[]): number {
  const positiveSignals = (signals || []).filter((signal) =>
    signal.polarity === "positive" && ROUTING_SIGNAL_IDS.has(signal.id)
  );
  const required = new Set((card.requiredSignals || []).filter(isRuleSignalId));
  if (!required.size || !positiveSignals.length) return 0;
  if (positiveSignals.some((signal) => required.has(signal.id))) return 0;
  const value = Math.min(72, 24 + positiveSignals.length * 12);
  reasons.push(reason("requiredSignals", Array.from(required).join("+"), -round(value), "missing-signal"));
  return value;
}

function isRuleSignalId(value: string): boolean {
  return /^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(String(value || ""));
}

function phraseBoost(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>, reasons: MatchReason[]): number {
  let boost = 0;
  const queryText = normalize(plan.queryVariants.map((variant) => variant.text).join(" "));
  for (const field of ["title", "triggers", "aliases", "topics"]) {
    const phrases = splitPhrases(doc.fields[field]);
    for (const phrase of phrases) {
      if (phrase.length < 2) continue;
      if (/^[\u4e00-\u9fff]+$/.test(phrase) && phrase.length < 3) continue;
      if (matchesLexicalTerm(queryText, phrase)) {
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
  const penalty = hits.length * 36;
  reasons.push(reason("negativeTriggers", hits.join("+"), round(-penalty), "penalty"));
  return penalty;
}

function negativeTriggerHit(queryText: string, trigger: string): boolean {
  const normalized = normalize(trigger);
  if (!normalized) return false;
  if (matchesLexicalTerm(queryText, normalized)) return true;
  const tokens = tokenize(normalized).filter((token) => token.length > 1);
  if (tokens.length < 2) return false;
  const queryTokens = new Set(tokenize(queryText));
  const hits = tokens.filter((token) => queryTokens.has(token)).length;
  return hits >= Math.min(tokens.length, 3) || hits / tokens.length >= 0.72;
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
