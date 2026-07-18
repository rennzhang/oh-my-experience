import type { CardIndexEntry } from "./cards.js";
import { buildQueryPlan, matchesLexicalTerm, normalize, tokenize, tokenizeSequence } from "./matcher.js";
import { getSignalNegativeTargets, isKnownSignalId } from "./signal-registry.js";

export interface MatchReason {
  field: string;
  term: string;
  weight: number;
  kind: string;
}

export interface ScoredCard {
  card: CardIndexEntry;
  /** Library-size-independent evidence score used for admission. */
  score: number;
  /** BM25F score used as one ranking channel, never as an admission threshold. */
  rawScore: number;
  /** Filled by the selection pipeline after rank fusion. */
  rankScore: number;
  /** Non-relevance tie breaker derived from policy, risk, and confidence. */
  priorityScore: number;
  postSelectionScore: number;
  evidenceFamilies: string[];
  strongAnchor: boolean;
  eligible: boolean;
  rejectionReason: string | null;
  reasons: MatchReason[];
}

interface CorpusDocument {
  card: CardIndexEntry;
  fields: Record<string, string>;
  fieldTokenCounts: Record<string, Map<string, number>>;
  fieldLengths: Record<string, number>;
  avgFieldLengths: Record<string, number>;
  allTokens: Set<string>;
  documentFrequency: Map<string, number>;
}

interface EvidenceContribution {
  family: string;
  value: number;
  strong: boolean;
  reasons: MatchReason[];
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const FIELD_WEIGHTS: Record<string, number> = {
  title: 4.2,
  triggers: 6,
  aliases: 5.2,
  topics: 3,
  intentModes: 2.2,
  requiredSignals: 2.4,
  category: 1.8,
  summary: 1.5,
};
const FIELD_EXACT_SCORE: Record<string, number> = {
  title: 38,
  triggers: 48,
  aliases: 46,
  topics: 22,
};
const FIELD_PARTIAL_SCORE: Record<string, number> = {
  title: 32,
  triggers: 52,
  aliases: 48,
  topics: 18,
};
const SINGLE_TERM_SCORE: Record<string, number> = {
  title: 22,
  triggers: 24,
  aliases: 24,
  topics: 12,
};
const POLICY_PRIORITY: Record<string, number> = { must: 4, should: 2, summary: 1, off: 0 };
const RISK_PRIORITY: Record<string, number> = { high: 2, medium: 1, low: 0 };
const CONFIDENCE_PRIORITY: Record<string, number> = { high: 1, medium: 0, low: -1 };

export function buildScoringCorpus(cards: CardIndexEntry[]): CorpusDocument[] {
  const docs = cards.map((card) => {
    const fields = buildFields(card);
    const fieldTokenCounts: Record<string, Map<string, number>> = {};
    const fieldLengths: Record<string, number> = {};
    const allTokens = new Set<string>();
    for (const [field, text] of Object.entries(fields)) {
      const sequence = tokenizeSequence(text);
      fieldLengths[field] = sequence.length;
      fieldTokenCounts[field] = countTokens(sequence);
      for (const token of new Set(sequence)) allTokens.add(token);
    }
    return {
      card,
      fields,
      fieldTokenCounts,
      fieldLengths,
      avgFieldLengths: {},
      allTokens,
      documentFrequency: new Map<string, number>(),
    };
  });

  const documentFrequency = new Map<string, number>();
  const avgFieldLengths: Record<string, number> = {};
  for (const doc of docs) {
    for (const token of doc.allTokens) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      avgFieldLengths[field] = (avgFieldLengths[field] || 0) + (doc.fieldLengths[field] || 0);
    }
  }
  for (const field of Object.keys(FIELD_WEIGHTS)) {
    avgFieldLengths[field] = Math.max((avgFieldLengths[field] || 0) / Math.max(docs.length, 1), 1);
  }
  for (const doc of docs) {
    doc.documentFrequency = documentFrequency;
    doc.avgFieldLengths = avgFieldLengths;
  }
  return docs;
}

export function scoreDocument(
  doc: CorpusDocument,
  plan: ReturnType<typeof buildQueryPlan>,
  totalDocs: number,
): ScoredCard {
  const reasons: MatchReason[] = [];
  const gate = recallGate(doc.card, plan, reasons);
  if (!gate.ok) return rejectedCard(doc.card, reasons, gate.reason);

  const rawScore = bm25fScore(doc, plan, totalDocs, reasons);
  const evidence = evidenceContributions(doc, plan);
  for (const item of evidence) reasons.push(...item.reasons);

  const fuzzyPenalty = fuzzyNegativePenalty(doc, plan, reasons);
  const score = clamp(noisyOr(evidence.map((item) => item.value)) - fuzzyPenalty, 0, 100);
  const evidenceFamilies = evidence.filter((item) => item.value >= 8).map((item) => item.family);
  const strongAnchor = evidence.some((item) => item.strong && item.value >= 36);
  const priorityScore = (POLICY_PRIORITY[doc.card.recallPolicy] || 0)
    + (RISK_PRIORITY[doc.card.risk] || 0)
    + (CONFIDENCE_PRIORITY[doc.card.confidence || "medium"] || 0);

  return {
    card: doc.card,
    score: round(score),
    rawScore: round(rawScore),
    rankScore: 0,
    priorityScore,
    postSelectionScore: round(score),
    evidenceFamilies: unique(evidenceFamilies),
    strongAnchor,
    eligible: true,
    rejectionReason: null,
    reasons: compactReasons(reasons),
  };
}

function bm25fScore(
  doc: CorpusDocument,
  plan: ReturnType<typeof buildQueryPlan>,
  totalDocs: number,
  reasons: MatchReason[],
): number {
  let total = 0;
  for (const [token, queryWeight] of plan.tokens.entries()) {
    const df = doc.documentFrequency.get(token) || 0;
    if (!df) continue;
    let weightedTf = 0;
    const fieldParts: Array<{ field: string; value: number }> = [];
    for (const [field, fieldWeight] of Object.entries(FIELD_WEIGHTS)) {
      const occurrences = doc.fieldTokenCounts[field]?.get(token) || 0;
      if (!occurrences) continue;
      const length = doc.fieldLengths[field] || 0;
      const average = doc.avgFieldLengths[field] || 1;
      const normalizedTf = occurrences / (1 - BM25_B + BM25_B * length / average);
      const part = fieldWeight * normalizedTf;
      weightedTf += part;
      fieldParts.push({ field, value: part });
    }
    if (!weightedTf) continue;
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    const value = queryWeight * idf * ((BM25_K1 + 1) * weightedTf / (BM25_K1 + weightedTf));
    total += value;
    const bestField = fieldParts.sort((a, b) => b.value - a.value)[0]?.field || "document";
    if (value >= 0.2) reasons.push(reason(bestField, token, round(value), "bm25f"));
  }
  return total;
}

function evidenceContributions(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>): EvidenceContribution[] {
  const queryText = normalize(plan.queryVariants.map((variant) => variant.text).join(" "));
  const queryTokens = new Set(plan.tokens.keys());
  const contributions: EvidenceContribution[] = [];
  for (const field of ["triggers", "aliases", "title", "topics"]) {
    const contribution = fieldEvidence(field, doc.fields[field] || "", queryText, queryTokens);
    if (contribution.value > 0) contributions.push(contribution);
  }
  const signalContribution = requiredSignalEvidence(doc.card, plan);
  if (signalContribution.value > 0) contributions.push(signalContribution);
  const lexicalContribution = lexicalSupportEvidence(doc, queryTokens);
  if (lexicalContribution.value > 0) contributions.push(lexicalContribution);
  return contributions;
}

function fieldEvidence(field: string, text: string, queryText: string, queryTokens: Set<string>): EvidenceContribution {
  const phraseScores = splitPhrases(text).map((phrase) => {
    const phraseTokens = tokenize(phrase);
    if (!phraseTokens.length) return null;
    const hitCount = phraseTokens.filter((token) => queryTokens.has(token)).length;
    const coverage = hitCount / phraseTokens.length;
    const exact = matchesLexicalTerm(queryText, phrase);
    const multiTerm = phraseTokens.length >= 2 || isStrongCjkPhrase(phrase);
    const exactShortQuery = exact && !multiTerm && queryTokens.size <= 2;
    let value = 0;
    let kind = "phrase-overlap";
    if (exact) {
      value = multiTerm
        ? (FIELD_EXACT_SCORE[field] || 0) + Math.min(10, phraseTokens.length * 2)
        : exactShortQuery
          ? Math.max(SINGLE_TERM_SCORE[field] || 0, field === "topics" ? 30 : 44)
          : SINGLE_TERM_SCORE[field] || 0;
      kind = "phrase-exact";
    } else if (hitCount >= 2 && coverage >= 0.5) {
      value = (FIELD_PARTIAL_SCORE[field] || 0) * coverage;
    } else if (hitCount === 1 && phraseTokens.length === 2) {
      value = (FIELD_PARTIAL_SCORE[field] || 0) * 0.28;
    }
    if (!value) return null;
    return {
      phrase,
      value,
      strong: (exact && multiTerm)
        || exactShortQuery
        || (hitCount >= 2 && coverage >= 0.58 && (field === "triggers" || field === "aliases")),
      reason: reason(field, phrase, round(value), kind),
    };
  }).filter(nonNull).sort((a, b) => b.value - a.value);

  const best = phraseScores[0];
  if (!best) return { family: field, value: 0, strong: false, reasons: [] };
  const support = phraseScores.slice(1, 3).reduce((sum, item) => sum + item.value * 0.22, 0);
  return {
    family: field,
    value: round(Math.min(best.value + support, 62)),
    strong: best.strong,
    reasons: phraseScores.slice(0, 3).map((item) => item.reason),
  };
}

function requiredSignalEvidence(doc: CardIndexEntry, plan: ReturnType<typeof buildQueryPlan>): EvidenceContribution {
  const required = unique([
    ...effectiveRequiredSignals(doc),
    ...effectiveRequiredAllSignals(doc),
  ]).filter(isKnownSignalId);
  const positives = new Map(
    (plan.envelope.ruleSignals || [])
      .filter((signal) => signal.polarity === "positive")
      .map((signal) => [signal.id, signal]),
  );
  const hits = required.map((id) => positives.get(id)).filter(nonNull);
  if (!hits.length) return { family: "signals", value: 0, strong: false, reasons: [] };
  const strongest = Math.max(...hits.map((signal) => Math.abs(signal.weight)));
  const value = Math.min(58, 40 + strongest);
  return {
    family: "signals",
    value,
    strong: true,
    reasons: hits.map((signal) => reason("ruleSignals", signal.id, round(value), signal.reason)),
  };
}

function lexicalSupportEvidence(doc: CorpusDocument, queryTokens: Set<string>): EvidenceContribution {
  const anchorTokens = new Set([
    ...tokenize(doc.fields.title),
    ...tokenize(doc.fields.triggers),
    ...tokenize(doc.fields.aliases),
    ...tokenize(doc.fields.topics),
  ]);
  const hits = Array.from(anchorTokens).filter((token) => queryTokens.has(token));
  if (hits.length < 2) return { family: "lexical", value: 0, strong: false, reasons: [] };
  const value = Math.min(18, 6 + hits.length * 2.5);
  return {
    family: "lexical",
    value,
    strong: false,
    reasons: [reason("lexical", hits.slice(0, 6).join("+"), round(value), "multi-token-support")],
  };
}

function recallGate(
  card: CardIndexEntry,
  plan: ReturnType<typeof buildQueryPlan>,
  reasons: MatchReason[],
): { ok: true } | { ok: false; reason: string } {
  const envelope = plan.envelope;
  const modes = new Set<string>(envelope.intentModes || []);
  const signals = new Set((envelope.ruleSignals || []).map((signal) => signal.id));
  const positiveSignals = new Set(
    (envelope.ruleSignals || []).filter((signal) => signal.polarity === "positive").map((signal) => signal.id),
  );
  const configuredBlocked = unique(card.blockedSignals || []);
  const unknownBlocked = configuredBlocked.filter((signal) => !isKnownSignalId(signal));
  if (unknownBlocked.length) {
    return reject(reasons, "blockedSignals.unknown", unknownBlocked, "unknown-blocked-signal");
  }
  const blockedHits = configuredBlocked.filter((signal) => signals.has(signal));
  if (blockedHits.length) return reject(reasons, "blockedSignals", blockedHits, "blocked-signal");

  const configuredRequiredAny = effectiveRequiredSignals(card);
  const configuredRequiredAll = effectiveRequiredAllSignals(card);
  const unknownRequiredAny = configuredRequiredAny.filter((signal) => !isKnownSignalId(signal));
  if (unknownRequiredAny.length) {
    return reject(reasons, "requiredSignals.unknown", unknownRequiredAny, "unknown-required-signal");
  }
  const unknownRequiredAll = configuredRequiredAll.filter((signal) => !isKnownSignalId(signal));
  if (unknownRequiredAll.length) {
    return reject(reasons, "requiredAllSignals.unknown", unknownRequiredAll, "unknown-required-signal");
  }
  const requiredAny = configuredRequiredAny;
  const requiredAll = configuredRequiredAll;
  const matchedRequired = requiredAny.filter((signal) => positiveSignals.has(signal));
  if (requiredAny.length && !matchedRequired.length) {
    return reject(reasons, "requiredSignals", requiredAny, "missing-required-any");
  }
  const missingAll = requiredAll.filter((signal) => !positiveSignals.has(signal));
  if (missingAll.length) return reject(reasons, "requiredAllSignals", missingAll, "missing-required-all");

  const include = card.intentModes?.include || [];
  const exclude = card.intentModes?.exclude || [];
  const excludedModes = exclude.filter((mode) => modes.has(mode));
  const includedModes = include.filter((mode) => modes.has(mode));
  const explicitPositiveRoute = matchedRequired.length > 0 || requiredAll.some((signal) => positiveSignals.has(signal));
  if (excludedModes.length && !(includedModes.length && explicitPositiveRoute)) {
    return reject(reasons, "intentModes.exclude", excludedModes, "excluded-intent");
  }
  if (include.length && !includedModes.length) {
    return reject(reasons, "intentModes.include", include, "missing-included-intent");
  }

  const exactMatchTexts = [
    ...plan.queryVariants.map((variant) => variant.text),
    ...(envelope.segments || []),
    ...(envelope.negatives || []),
  ];
  const exactNegative = (card.negativeTriggers || []).find((trigger) =>
    exactMatchTexts.some((text) => matchesLexicalTerm(text, trigger))
  );
  if (exactNegative) return reject(reasons, "negativeTriggers", [exactNegative], "negative-exact");

  const negativeSignals = envelope.ruleSignals.filter((signal) => signal.polarity === "negative");
  const routedSignals = new Set([...requiredAny, ...requiredAll]);
  const targeted = negativeSignals.filter((signal) =>
    getSignalNegativeTargets(signal.id).some((target) => routedSignals.has(target))
  );
  if (targeted.length) return reject(reasons, "ruleSignals.negative", targeted.map((signal) => signal.id), "negative-route");
  return { ok: true };
}

function fuzzyNegativePenalty(doc: CorpusDocument, plan: ReturnType<typeof buildQueryPlan>, reasons: MatchReason[]): number {
  const queryTokens = new Set([
    ...plan.tokens.keys(),
    ...(plan.envelope.negatives || []).flatMap((span) => tokenize(span)),
  ]);
  const hits = (doc.card.negativeTriggers || []).filter((trigger) => {
    const tokens = tokenize(trigger).filter((token) => token.length > 1);
    if (tokens.length < 2) return false;
    const count = tokens.filter((token) => queryTokens.has(token)).length;
    // Fuzzy ignore criteria must describe nearly the same condition. Three
    // shared workflow nouns (for example git/diff/current) are not enough to
    // turn an affirmative mutation into a read-only near miss.
    return count >= 2 && count / tokens.length >= 0.72;
  });
  if (!hits.length) return 0;
  const value = Math.min(45, 24 + (hits.length - 1) * 8);
  reasons.push(reason("negativeTriggers", hits.slice(0, 3).join("+"), -value, "negative-fuzzy"));
  return value;
}

function buildFields(card: CardIndexEntry): Record<string, string> {
  return {
    title: card.title || "",
    category: card.category || "",
    triggers: (card.triggers || []).join("\n"),
    aliases: flattenAliases(card.aliases).join("\n"),
    topics: (card.topics || []).join("\n"),
    intentModes: [...(card.intentModes?.include || []), ...(card.intentModes?.exclude || [])].join("\n"),
    requiredSignals: [...effectiveRequiredSignals(card), ...effectiveRequiredAllSignals(card)].join("\n"),
    summary: card.summary || "",
  };
}

function effectiveRequiredSignals(card: CardIndexEntry): string[] {
  return unique(card.requiredSignals || []);
}

function effectiveRequiredAllSignals(card: CardIndexEntry): string[] {
  return unique([...(card as CardIndexEntry & { requiredAllSignals?: string[] }).requiredAllSignals || []]);
}

function rejectedCard(card: CardIndexEntry, reasons: MatchReason[], rejectionReason: string): ScoredCard {
  return {
    card,
    score: 0,
    rawScore: 0,
    rankScore: 0,
    priorityScore: 0,
    postSelectionScore: 0,
    evidenceFamilies: [],
    strongAnchor: false,
    eligible: false,
    rejectionReason,
    reasons: compactReasons(reasons),
  };
}

function reject(
  reasons: MatchReason[],
  field: string,
  values: string[],
  kind: string,
): { ok: false; reason: string } {
  const term = values.join("+");
  reasons.push(reason(field, term, -100, kind));
  return { ok: false, reason: `${field}:${term}` };
}

function noisyOr(values: number[]): number {
  const remainder = values.reduce((product, value) => product * (1 - clamp(value, 0, 100) / 100), 1);
  return 100 * (1 - remainder);
}

function splitPhrases(text: string): string[] {
  return unique(String(text || "").split(/[\n,，;；|]+/).map((item) => normalize(item)).filter(Boolean));
}

function isStrongCjkPhrase(value: string): boolean {
  const cjk = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return cjk >= 3;
}

function flattenAliases(aliases: Record<string, string[]>): string[] {
  if (!aliases || typeof aliases !== "object") return [];
  return Object.values(aliases).flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)]);
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function compactReasons(reasons: MatchReason[]): MatchReason[] {
  const seen = new Set<string>();
  const uniqueReasons = reasons.filter((item) => {
    const key = `${item.field}:${item.term}:${item.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const negatives = uniqueReasons.filter((item) => item.weight < 0).sort((a, b) => a.weight - b.weight).slice(0, 8);
  const positives = uniqueReasons.filter((item) => item.weight >= 0).sort((a, b) => b.weight - a.weight).slice(0, 12);
  return [...negatives, ...positives];
}

function reason(field: string, term: string, weight: number, kind: string): MatchReason {
  return { field, term, weight, kind };
}

function nonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
