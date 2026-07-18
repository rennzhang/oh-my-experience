import path from "node:path";
import { buildCardIndex, type CardIndexEntry } from "./cards.js";
import type { ExperienceLibrary } from "./library-stack.js";
import { buildQueryPlan, buildTaskEnvelope } from "./matcher.js";
import { projectFamilyKey } from "./project-context.js";
import { buildScoringCorpus, scoreDocument, type MatchReason, type ScoredCard } from "./retrieval-scoring.js";
import {
  DEFAULT_ADDITIONAL_CONTEXT_MAX_CHARS,
  DEFAULT_DIAGNOSTIC_CANDIDATE_LIMIT,
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_RETRIEVAL_THRESHOLD,
  RETRIEVAL_ENGINE_VERSION,
  RETRIEVAL_SCORER_VERSION,
} from "./retrieval-contract.js";
import { getSignalDefinition, isKnownSignalId } from "./signal-registry.js";
import type { ProjectContext } from "./schema.js";
import { cardSimilarity, type SimilarCardHint } from "./similarity.js";

export interface MatchResult {
  card: CardIndexEntry;
  score: number;
  rawScore: number;
  rankScore: number;
  priorityScore: number;
  postSelectionScore: number;
  evidenceFamilies: string[];
  strongAnchor: boolean;
  reasons: MatchReason[];
  similarCards?: SimilarCardHint[];
  envelope: ReturnType<typeof buildTaskEnvelope>;
  queryVariants: string[];
  durationMs: number;
}

export interface RetrievalCandidateDiagnostic {
  id: string;
  title: string;
  libraryScope: "global" | "project";
  score: number;
  rawScore: number;
  rankScore: number;
  postSelectionScore: number;
  priorityScore: number;
  evidenceFamilies: string[];
  strongAnchor: boolean;
  eligible: boolean;
  selected: boolean;
  rejectionReason: string | null;
  reasons: MatchReason[];
}

export interface RetrievalDiagnostics {
  engineVersion: string;
  scorerVersion: string;
  threshold: number;
  limit: number;
  inputCardCount: number;
  applicableCardCount: number;
  evaluatedCardCount: number;
  timedOut: boolean;
  complete: boolean;
  candidateListTruncated: boolean;
  abstained: boolean;
  abstainReason: string | null;
  selectedCardIds: string[];
  candidates: RetrievalCandidateDiagnostic[];
}

export interface DetailedMatchResult {
  matches: MatchResult[];
  diagnostics: RetrievalDiagnostics;
}

export interface MatchOptions {
  limit?: number;
  threshold?: number;
  timeoutMs?: number;
  failOpenOnTimeout?: boolean;
  projectContext?: ProjectContext | null;
  additionalContextMaxChars?: number;
}

interface ExplainMetadata {
  libraries?: ExperienceLibrary[];
  warnings?: string[];
}

interface ContextOptions {
  maxChars?: number;
}

interface ContextCopy {
  heading: string;
  finalReport: string;
  summary: string;
  scope: string;
  useWhen: string;
  ignoreWhen: string;
  why: string;
  fullCard: string;
  finalLink: string;
  similar: string;
  noSummary: string;
  defaultUse: string;
  defaultIgnore: string;
}

export function matchCards(dataDir: string, prompt: string, options: MatchOptions = {}): MatchResult[] {
  return matchCardsDetailed(dataDir, prompt, options).matches;
}

export function matchCardsDetailed(dataDir: string, prompt: string, options: MatchOptions = {}): DetailedMatchResult {
  const index = buildCardIndex(dataDir);
  return matchCardEntriesDetailed(
    (index.experiences || []).map((card) => ({ ...card, libraryScope: card.libraryScope || "global" })),
    prompt,
    options,
  );
}

export function matchCardEntries(cardsInput: CardIndexEntry[], prompt: string, options: MatchOptions = {}): MatchResult[] {
  return matchCardEntriesDetailed(cardsInput, prompt, options).matches;
}

export function matchCardEntriesDetailed(
  cardsInput: CardIndexEntry[],
  prompt: string,
  options: MatchOptions = {},
): DetailedMatchResult {
  const started = Date.now();
  const threshold = options.threshold ?? DEFAULT_RETRIEVAL_THRESHOLD;
  const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const envelope = buildTaskEnvelope(prompt);
  const plan = buildQueryPlan(envelope);
  const cards = cardsInput.filter((card) =>
    card.status === "active"
    && card.recallPolicy !== "off"
    && isApplicable(card, options.projectContext || null)
  );
  const corpus = buildScoringCorpus(cards);
  const evaluated: ScoredCard[] = [];
  let timedOut = false;
  for (const doc of corpus) {
    if (options.timeoutMs && Date.now() - started > options.timeoutMs) {
      timedOut = true;
      break;
    }
    const result = scoreDocument(doc, plan, corpus.length);
    evaluated.push(result);
  }
  const admitted = evaluated.map((result) => applyAdmissionContract(result, threshold));
  const ranked = applyReciprocalRankFusion(admitted.filter((result) => result.eligible));
  const collapsed = collapseSimilar(ranked.sort(compareMatchScore));
  const diversified = diversify(collapsed.results);
  const selection = timedOut && options.failOpenOnTimeout
    ? {
        selected: [],
        rejected: diversified.results.map((result) => withSelectionRejection(result, "post-selection:timeout-fail-open")),
      }
    : dynamicSelection(diversified.results, limit, threshold, diversified.penalizedKeys);
  const selected = selection.selected;
  const matches = selected.map((match) => ({
    ...match,
    envelope,
    queryVariants: plan.queryVariants.map((variant) => variant.text),
    durationMs: Date.now() - started,
  }));
  const selectedKeys = new Set(matches.map((match) => candidateIdentity(match.card)));
  const candidateStates = mergeCandidateStates(
    admitted,
    ranked,
    collapsed.rejected,
    diversified.results,
    selection.rejected,
    selected,
  );
  const candidateRows = [...admitted]
    .map((candidate) => candidateStates.get(candidateIdentity(candidate.card)) || candidate)
    .sort(compareDiagnosticCandidate)
    .slice(0, DEFAULT_DIAGNOSTIC_CANDIDATE_LIMIT)
    .map((candidate) => candidateDiagnostic(candidate, selectedKeys.has(candidateIdentity(candidate.card))));
  const abstainReason = matches.length
    ? null
    : timedOut && options.failOpenOnTimeout
      ? "timeout-fail-open"
      : admitted.some((candidate) => candidate.eligible)
        ? limit <= 0 ? "selection-limit" : "selection-confidence-gap"
        : "no-candidate-passed-evidence-contract";
  return {
    matches,
    diagnostics: {
      engineVersion: RETRIEVAL_ENGINE_VERSION,
      scorerVersion: RETRIEVAL_SCORER_VERSION,
      threshold,
      limit,
      inputCardCount: cardsInput.length,
      applicableCardCount: cards.length,
      evaluatedCardCount: evaluated.length,
      timedOut,
      complete: !timedOut && evaluated.length === cards.length,
      candidateListTruncated: admitted.length > candidateRows.length,
      abstained: matches.length === 0,
      abstainReason,
      selectedCardIds: matches.map((match) => match.card.id),
      candidates: candidateRows,
    },
  };
}

export function explainMatch(dataDir: string, prompt: string, options: MatchOptions = {}) {
  const index = buildCardIndex(dataDir);
  const cards = (index.experiences || []).map((card) => ({ ...card, libraryScope: card.libraryScope || "global" as const }));
  const detailed = matchCardEntriesDetailed(cards, prompt, options);
  return explainMatchedCards(prompt, detailed, options, {
    libraries: [{
      scope: "global",
      dataDir,
      projectRoot: null,
      exists: true,
      readable: true,
      warnings: [],
    }],
    warnings: [],
  }, cards);
}

export function explainMatchFromCards(cards: CardIndexEntry[], prompt: string, options: MatchOptions = {}, metadata: ExplainMetadata = {}) {
  const detailed = matchCardEntriesDetailed(cards, prompt, options);
  return explainMatchedCards(prompt, detailed, options, metadata, cards);
}

function explainMatchedCards(prompt: string, detailed: DetailedMatchResult, options: MatchOptions, metadata: ExplainMetadata, cards: CardIndexEntry[]) {
  const { matches, diagnostics } = detailed;
  return {
    ok: true,
    threshold: diagnostics.threshold,
    limit: diagnostics.limit,
    diagnostics,
    projectContext: options.projectContext || null,
    libraries: (metadata.libraries || []).map((library) => ({
      scope: library.scope,
      exists: library.exists,
      readable: library.readable,
      projectRoot: library.projectRoot,
      dataDir: library.dataDir,
      warnings: library.warnings,
    })),
    warnings: metadata.warnings || [],
    filteredByApplicability: filteredByApplicability(cards, options.projectContext || null),
    envelope: matches[0]?.envelope ?? buildTaskEnvelope(prompt),
    queryVariants: matches[0]?.queryVariants ?? buildQueryPlan(buildTaskEnvelope(prompt)).queryVariants.map((variant) => variant.text),
    matches: matches.map((match, index) => ({
      rank: index + 1,
      id: match.card.id,
      title: match.card.title,
      card: match.card,
      score: match.score,
      rawScore: match.rawScore,
      rankScore: match.rankScore,
      postSelectionScore: match.postSelectionScore,
      evidenceFamilies: match.evidenceFamilies,
      strongAnchor: match.strongAnchor,
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
  const maxChars = options.maxChars ?? DEFAULT_ADDITIONAL_CONTEXT_MAX_CHARS;
  if (!matches.length || maxChars <= 0) return "";
  const copy = contextCopy();
  const blocks = matches.map((result, index) => ({
    result,
    block: contextBlock(result, index + 1, copy),
  }));
  for (let count = blocks.length; count > 0; count -= 1) {
    const lines = [
      copy.heading,
      copy.finalReport,
      ...blocks.slice(0, count).map((item) => item.block),
    ];
    const context = lines.join("\n");
    if (context.length <= maxChars) return context;
  }
  return "";
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

type SelectionCard = ScoredCard & { similarCards?: SimilarCardHint[] };

function applyAdmissionContract(result: ScoredCard, threshold: number): ScoredCard {
  if (!result.eligible) return result;
  if (result.score < threshold) {
    return { ...result, eligible: false, rejectionReason: `below-threshold:${result.score}<${threshold}` };
  }
  if (!result.strongAnchor && result.evidenceFamilies.length < 2) {
    return { ...result, eligible: false, rejectionReason: "insufficient-independent-evidence" };
  }
  return result;
}

function applyReciprocalRankFusion(results: ScoredCard[]): ScoredCard[] {
  if (!results.length) return [];
  const rawRanks = rankPositions(results, (item) => item.rawScore);
  const evidenceRanks = rankPositions(results, (item) => item.score);
  return results.map((result) => ({
    ...result,
    rankScore: round(1000 * (
      1 / (60 + (rawRanks.get(candidateIdentity(result.card)) || results.length))
      + 1 / (60 + (evidenceRanks.get(candidateIdentity(result.card)) || results.length))
    )),
  }));
}

function rankPositions(results: ScoredCard[], value: (item: ScoredCard) => number): Map<string, number> {
  return new Map([...results]
    .sort((a, b) => value(b) - value(a) || compareCandidateIdentity(a.card, b.card))
    .map((item, index) => [candidateIdentity(item.card), index + 1]));
}

function diversify(results: SelectionCard[]): { results: SelectionCard[]; penalizedKeys: Set<string> } {
  const seenTopics = new Map<string, number>();
  const penalizedKeys = new Set<string>();
  const diversified = results.map((result) => {
    const topic = primaryTopic(result.card);
    const count = seenTopics.get(topic) || 0;
    seenTopics.set(topic, count + 1);
    if (!count) return result;
    penalizedKeys.add(candidateIdentity(result.card));
    return { ...result, rankScore: round(result.rankScore * Math.max(0.72, 1 - count * 0.12)) };
  }).sort(compareMatchScore);
  return { results: diversified, penalizedKeys };
}

function collapseSimilar(results: ScoredCard[]): { results: SelectionCard[]; rejected: ScoredCard[] } {
  const selected: SelectionCard[] = [];
  const rejected: ScoredCard[] = [];
  for (const result of results) {
    const existingIndex = selected.findIndex((candidate) =>
      sameLogicalCardId(candidate.card, result.card)
      || (
        sameApplicabilityScope(candidate.card, result.card)
        && (
          cardSimilarity(candidate.card, result.card).score >= 64
          || sameStarterReplacementCluster(candidate.card, result.card)
        )
      )
    );
    if (existingIndex === -1) {
      selected.push({ ...result, similarCards: [] });
      continue;
    }
    const existing = selected[existingIndex];
    const similarity = cardSimilarity(existing.card, result.card);
    if (shouldPreferProjectRepresentative(existing, result)) {
      rejected.push(withSelectionRejection(
        existing,
        `post-selection:duplicate:${candidateDisplayIdentity(result.card)}`,
      ));
      selected[existingIndex] = {
        ...result,
        similarCards: [
          ...(existing.similarCards || []),
          { id: existing.card.id, title: existing.card.title, score: similarity.score, reason: similarity.reason },
        ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4),
      };
    } else {
      rejected.push(withSelectionRejection(
        result,
        `post-selection:duplicate:${candidateDisplayIdentity(existing.card)}`,
      ));
      existing.similarCards = [
        ...(existing.similarCards || []),
        { id: result.card.id, title: result.card.title, score: similarity.score, reason: similarity.reason },
      ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4);
    }
  }
  return { results: selected.sort(compareMatchScore), rejected };
}

function shouldPreferProjectRepresentative(existing: SelectionCard, candidate: ScoredCard): boolean {
  if (sameLogicalCardId(existing.card, candidate.card)
    && libraryPriority(existing.card) !== libraryPriority(candidate.card)) {
    return libraryPriority(candidate.card) > libraryPriority(existing.card);
  }
  return libraryPriority(candidate.card) > libraryPriority(existing.card)
    && candidate.score >= existing.score - 8;
}

function dynamicSelection(
  results: SelectionCard[],
  limit: number,
  threshold: number,
  diversityPenalizedKeys: Set<string>,
): { selected: SelectionCard[]; rejected: ScoredCard[] } {
  const selected: SelectionCard[] = [];
  const rejected: ScoredCard[] = [];
  const topScore = results[0]?.score || 0;
  for (const result of results) {
    const diversityPenalized = diversityPenalizedKeys.has(candidateIdentity(result.card));
    if (selected.length >= limit || limit <= 0) {
      rejected.push(withSelectionRejection(
        result,
        diversityPenalized ? "post-selection:limit-after-diversity" : "post-selection:limit",
      ));
      continue;
    }
    if (result.score < threshold) {
      rejected.push(withSelectionRejection(result, "post-selection:below-threshold"));
      continue;
    }
    if (!selected.length || result.strongAnchor || result.score >= Math.max(threshold, topScore - 18)) {
      selected.push({ ...result, postSelectionScore: result.score, rejectionReason: null });
      continue;
    }
    rejected.push(withSelectionRejection(
      result,
      diversityPenalized ? "post-selection:confidence-gap-after-diversity" : "post-selection:confidence-gap",
    ));
  }
  return { selected, rejected };
}

function mergeCandidateStates(base: ScoredCard[], ...stages: ScoredCard[][]): Map<string, ScoredCard> {
  const merged = new Map(base.map((candidate) => [candidateIdentity(candidate.card), candidate]));
  for (const stage of stages) {
    for (const candidate of stage) merged.set(candidateIdentity(candidate.card), candidate);
  }
  return merged;
}

function withSelectionRejection(result: ScoredCard, rejectionReason: string): ScoredCard {
  return { ...result, rejectionReason };
}

function candidateDiagnostic(candidate: ScoredCard, selected: boolean): RetrievalCandidateDiagnostic {
  return {
    id: candidate.card.id,
    title: candidate.card.title,
    libraryScope: candidate.card.libraryScope || "global",
    score: candidate.score,
    rawScore: candidate.rawScore,
    rankScore: candidate.rankScore,
    postSelectionScore: candidate.postSelectionScore,
    priorityScore: candidate.priorityScore,
    evidenceFamilies: candidate.evidenceFamilies,
    strongAnchor: candidate.strongAnchor,
    eligible: candidate.eligible,
    selected,
    rejectionReason: candidate.rejectionReason,
    reasons: candidate.reasons,
  };
}

function compareDiagnosticCandidate(a: ScoredCard, b: ScoredCard): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  return compareMatchScore(a, b);
}

function sameStarterReplacementCluster(left: CardIndexEntry, right: CardIndexEntry): boolean {
  if (!isStarterReplacementPair(left, right)) return false;
  const a = explicitRuleSignals(left);
  const b = explicitRuleSignals(right);
  if (!a.size || !b.size) return false;
  return Array.from(a).some((signal) => b.has(signal));
}

function explicitRuleSignals(card: CardIndexEntry): Set<string> {
  return new Set([
    ...(card.requiredSignals || []),
    ...(card.requiredAllSignals || []),
  ].filter(isKnownSignalId));
}

function isStarterReplacementPair(left: CardIndexEntry, right: CardIndexEntry): boolean {
  return isStarterCard(left) !== isStarterCard(right);
}

function isStarterCard(card: CardIndexEntry): boolean {
  return String(card.id || "").startsWith("starter-");
}

function compareMatchScore(a: ScoredCard, b: ScoredCard): number {
  const rankDelta = b.rankScore - a.rankScore;
  if (Math.abs(rankDelta) > 0.001) return rankDelta;
  const scoreDelta = b.score - a.score;
  if (Math.abs(scoreDelta) > 0.01) return scoreDelta;
  const rawDelta = b.rawScore - a.rawScore;
  if (Math.abs(rawDelta) > 0.001) return rawDelta;
  return b.priorityScore - a.priorityScore
    || libraryPriority(b.card) - libraryPriority(a.card)
    || compareCandidateIdentity(a.card, b.card);
}

function candidateIdentity(card: CardIndexEntry): string {
  return `${card.libraryScope || "global"}\u0000${card.id}`;
}

function candidateDisplayIdentity(card: CardIndexEntry): string {
  return `${card.libraryScope || "global"}:${card.id}`;
}

function compareCandidateIdentity(left: CardIndexEntry, right: CardIndexEntry): number {
  return candidateIdentity(left).localeCompare(candidateIdentity(right));
}

function sameLogicalCardId(left: CardIndexEntry, right: CardIndexEntry): boolean {
  return left.id === right.id;
}

function libraryPriority(card: CardIndexEntry): number {
  return card.libraryScope === "project" ? 2 : 1;
}

function sameApplicabilityScope(left: CardIndexEntry, right: CardIndexEntry): boolean {
  const a = left.applicability || { level: "global" };
  const b = right.applicability || { level: "global" };
  return a.level === b.level
    && (a.projectKey || "") === (b.projectKey || "")
    && (a.modulePath || "") === (b.modulePath || "");
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

function filteredByApplicability(cards: CardIndexEntry[], context: ProjectContext | null) {
  return cards
    .filter((card) => card.status === "active" && card.recallPolicy !== "off" && !isApplicable(card, context))
    .map((card) => ({
      id: card.id,
      title: card.title,
      libraryScope: card.libraryScope || "global",
      applicability: card.applicability,
    }));
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

function formatReason(reasonItem: MatchReason | string | undefined): string {
  if (!reasonItem) return "";
  if (typeof reasonItem === "string") return reasonItem;
  if (reasonItem.field === "ruleSignals") return signalReasonLabel(reasonItem.term);
  return `${reasonItem.field}:${reasonItem.term}`;
}

function signalReasonLabel(signal: string): string {
  return getSignalDefinition(signal)?.reason || "matched by an internal recall hint";
}

function primaryContextReason(reasons: MatchReason[]): MatchReason | undefined {
  return reasons.find((item) => item.field === "ruleSignals") || reasons[0];
}

function contextBlock(result: MatchResult, index: number, copy: ContextCopy): string {
  const card = result.card;
  const marker = `[${card.risk || "medium"} risk][${card.recallPolicy || "should"}]`;
  const summary = card.summary || copy.noSummary;
  const useWhen = compactList(card.triggers, 3) || compactList(card.topics, 3) || copy.defaultUse;
  const notWhen = compactList(card.negativeTriggers, 2) || copy.defaultIgnore;
  const why = formatReason(primaryContextReason(result.reasons)) || `score ${Math.round(result.score)}`;
  const command = card.libraryScope === "project"
    ? `ome experience show ${card.id} --scope project --section rule`
    : `ome experience show ${card.id} --section rule`;
  const similar = result.similarCards?.length
    ? `\n   ${copy.similar}: ${result.similarCards.map((item) => `${item.title} (${item.id})`).join(", ")}`
    : "";
  return [
    `${index}. ${marker} ${card.title} (${card.id})`,
    `   ${copy.summary}: ${oneLine(summary, 220)}`,
    `   ${copy.scope}: ${formatCardScope(card)}`,
    `   ${copy.useWhen}: ${useWhen}`,
    `   ${copy.ignoreWhen}: ${notWhen}`,
    `   ${copy.why}: ${why}`,
    `   ${copy.fullCard}: ${command}`,
    `   ${copy.finalLink}: ${cardMarkdownLink(card)}${similar}`,
  ].join("\n");
}

function contextCopy(): ContextCopy {
  return {
    heading: "# OME Matched Experience Cards\n\nMatched cards are optional reminders, not required reuse.",
    finalReport: "- Choice: You may apply a whole card, use only the useful parts, or ignore any match that does not fit the task.\n- Before acting: If a card helps, say one short sentence about what OME reminded you to consider, then proceed.\n- Final: If any card was used, state how many cards were used and include only the applied `Final link if used` values; omit this line if none.",
    summary: "Summary",
    scope: "Scope",
    useWhen: "Use if",
    ignoreWhen: "Ignore if",
    why: "Matched by",
    fullCard: "Rule",
    finalLink: "Final link if used",
    similar: "Similar cards omitted",
    noSummary: "No summary.",
    defaultUse: "directly matches this task",
    defaultIgnore: "unrelated to the task",
  };
}

function formatCardScope(card: CardIndexEntry): string {
  const applicability = card.applicability || { level: "global" };
  const level = applicability.level || card.libraryScope || "global";
  if (level === "global") return card.libraryScope === "project" ? "project library, global card" : "global";
  const parts: string[] = [level];
  if (applicability.projectKey) parts.push(applicability.projectKey);
  if (applicability.modulePath) parts.push(applicability.modulePath);
  return parts.join(" / ");
}

function cardMarkdownLink(card: CardIndexEntry): string {
  return `[${escapeMarkdownLinkText(card.title || card.id)}](<${escapeMarkdownLinkTarget(cardLinkPath(card))}>)`;
}

function cardLinkPath(card: CardIndexEntry): string {
  const relativePath = card.path || `experiences/active/${card.id}.md`;
  if (path.isAbsolute(relativePath)) return relativePath;
  if (card.libraryPath) return path.join(card.libraryPath, relativePath);
  return relativePath;
}

function escapeMarkdownLinkText(value: string): string {
  return oneLine(value).replace(/([\\[\]])/g, "\\$1");
}

function escapeMarkdownLinkTarget(value: string): string {
  return String(value || "").replace(/>/g, "%3E");
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
