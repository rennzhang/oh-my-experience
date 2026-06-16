import path from "node:path";
import { buildCardIndex, type CardIndexEntry } from "./cards.js";
import type { ExperienceLibrary } from "./library-stack.js";
import { buildQueryPlan, buildTaskEnvelope } from "./matcher.js";
import { projectFamilyKey } from "./project-context.js";
import { buildScoringCorpus, scoreDocument, type MatchReason, type ScoredCard } from "./retrieval-scoring.js";
import type { ProjectContext } from "./schema.js";
import { cardSimilarity, type SimilarCardHint } from "./similarity.js";

export interface MatchResult {
  card: CardIndexEntry;
  score: number;
  reasons: MatchReason[];
  similarCards?: SimilarCardHint[];
  envelope: ReturnType<typeof buildTaskEnvelope>;
  queryVariants: string[];
  durationMs: number;
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
  const index = buildCardIndex(dataDir);
  return matchCardEntries((index.experiences || []).map((card) => ({ ...card, libraryScope: card.libraryScope || "global" })), prompt, options);
}

export function matchCardEntries(cardsInput: CardIndexEntry[], prompt: string, options: MatchOptions = {}): MatchResult[] {
  const started = Date.now();
  const envelope = buildTaskEnvelope(prompt);
  const plan = buildQueryPlan(envelope);
  const cards = cardsInput.filter((card) =>
    card.status === "active"
    && card.recallPolicy !== "off"
    && isApplicable(card, options.projectContext || null)
  );
  const corpus = buildScoringCorpus(cards);
  const scored: ScoredCard[] = [];
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
  scored.sort(compareMatchScore);
  const matches = diversify(collapseSimilar(scored)).slice(0, options.limit ?? 4);
  return matches.map((match) => ({
    ...match,
    envelope,
    queryVariants: plan.queryVariants.map((variant) => variant.text),
    durationMs: Date.now() - started,
  }));
}

export function explainMatch(dataDir: string, prompt: string, options: MatchOptions = {}) {
  const matches = matchCards(dataDir, prompt, options);
  const index = buildCardIndex(dataDir);
  return explainMatchedCards(prompt, matches, options, {
    libraries: [{
      scope: "global",
      dataDir,
      projectRoot: null,
      exists: true,
      readable: true,
      warnings: [],
    }],
    warnings: [],
  }, index.experiences || []);
}

export function explainMatchFromCards(cards: CardIndexEntry[], prompt: string, options: MatchOptions = {}, metadata: ExplainMetadata = {}) {
  const matches = matchCardEntries(cards, prompt, options);
  return explainMatchedCards(prompt, matches, options, metadata, cards);
}

function explainMatchedCards(prompt: string, matches: MatchResult[], options: MatchOptions, metadata: ExplainMetadata, cards: CardIndexEntry[]) {
  return {
    ok: true,
    threshold: options.threshold ?? 4,
    limit: options.limit ?? 4,
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
      && (
        cardSimilarity(candidate.card, result.card).score >= 64
        || sameStarterReplacementCluster(candidate.card, result.card)
      )
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

function sameStarterReplacementCluster(left: CardIndexEntry, right: CardIndexEntry): boolean {
  if (!isStarterReplacementPair(left, right)) return false;
  const a = new Set((left.requiredSignals || []).filter(isRuleSignalId));
  const b = new Set((right.requiredSignals || []).filter(isRuleSignalId));
  if (!a.size || !b.size) return false;
  return Array.from(a).some((signal) => b.has(signal));
}

function isStarterReplacementPair(left: CardIndexEntry, right: CardIndexEntry): boolean {
  return isStarterCard(left) !== isStarterCard(right);
}

function isStarterCard(card: CardIndexEntry): boolean {
  return String(card.id || "").startsWith("starter-");
}

function isRuleSignalId(value: string): boolean {
  return /^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(String(value || ""));
}

function compareMatchScore(
  a: Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">,
  b: Omit<MatchResult, "envelope" | "queryVariants" | "durationMs">,
): number {
  const scoreDelta = b.score - a.score;
  if (Math.abs(scoreDelta) > 0.01) return scoreDelta;
  return libraryPriority(b.card) - libraryPriority(a.card) || a.card.id.localeCompare(b.card.id);
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
  const labels: Record<string, string> = {
    goal_execute: "task looks like a real goal-execution start",
    ui_surface: "task has a real UI or browser-visible surface",
    worktree_diff_operation: "task involves real worktree, diff, stage, or commit scope",
    historical_session_lookup: "task asks to look up historical session evidence",
    provider_adapter_boundary: "task touches provider hook or runtime adapter boundaries",
    package_install_validation: "task needs package or clean-install validation",
    delivery_gate: "task is at delivery, review, or acceptance gate",
    source_truth_chain: "task needs requirements, design, acceptance, and code source alignment",
    failure_triage: "task needs failure triage across environment, tools, config, and business logic",
    temporary_mock_boundary: "task involves mock, fake data, placeholder, fallback, or temporary implementation boundary",
    external_model_review: "task asks for external or multi-model review",
    rule_governance: "task changes agent rules or rule layering",
    bridge_runtime_validation: "task validates bridge, bot, message service, or watchdog runtime state",
    design_source_alignment: "task needs UI/UX alignment with the design source of truth",
    information_design: "task needs attention hierarchy or lower mental load",
    architecture_quality: "task asks for cohesive architecture, clean logic, or a root-cause fix",
    high_risk_action: "task involves irreversible or high-risk action",
    ome_review_surface: "task is about OME draft approval flow or experience-library governance",
  };
  return labels[signal] || "matched by an internal recall hint";
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
    heading: "OME matched experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.",
    finalReport: "Before acting, if any matched card is applicable, state in one short sentence what OME reminded you to consider, then proceed normally. For OME retrospective or source-scan tasks, matched subject-area cards are not source evidence; record them only as active-card overlap unless you applied a process/governance card. Final report: if you actually used any card, add one final line `**本次使用 N条 OME 经验卡：** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.",
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
