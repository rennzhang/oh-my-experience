import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CATEGORY,
  RetrospectiveAuditSchema,
  RetrospectiveCandidateSchema,
  RetrospectiveDecisionSchema,
  type RetrospectiveAudit,
  type RetrospectiveCandidate,
  type RetrospectiveDecision,
} from "./schema.js";
import type { ExperienceCard } from "./schema.js";
import { cardPath, createDraftFromCandidate, readCardFile, writeCard } from "./cards.js";
import { inferCategory, normalizeCategory } from "./categories.js";
import {
  appendJsonl,
  hashText,
  layout,
  nowIso,
  operationLog,
  readJson,
  readJsonl,
  slugify,
  withLock,
  writeJsonAtomic,
  writeTextAtomic,
} from "./storage.js";

type JsonRecord = Record<string, any>;
type WriteCandidatesOptions = {
  audit?: JsonRecord | RetrospectiveAudit | null;
  allowIncompleteAudit?: boolean;
  incompleteAuditReason?: string;
};
const EXPERIENCE_REVIEW_FILE = "experience-review.md";

export function createRetrospectiveRun(dataDir: string, {
  title = "retrospective",
  focus = "",
  guideRef = null,
  guideHash = null,
}: {
  title?: string;
  focus?: string;
  guideRef?: string | null;
  guideHash?: string | null;
} = {}) {
  const reviewFocus = String(focus || "").trim();
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(title).slice(0, 24)}`;
  const runDir = path.join(layout(dataDir).retrospectives, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const input = {
    runId,
    state: "created",
    focus: reviewFocus,
    sources: [],
    guideRef,
    guideHash,
    createdAt: nowIso(),
  };
  writeJsonAtomic(path.join(runDir, "input.json"), input, dataDir);
  writeJsonAtomic(path.join(runDir, "state.json"), { runId, state: "created", updatedAt: nowIso() }, dataDir);
  writeJsonAtomic(path.join(runDir, "candidates.json"), { runId, candidates: [] }, dataDir);
  writeTextAtomic(path.join(runDir, EXPERIENCE_REVIEW_FILE), retrospectiveSkeleton(runId), dataDir);
  operationLog(dataDir, "retrospective.create", { runId });
  return { runId, runDir, state: "created", focus: reviewFocus, sources: [], guideRef, guideHash };
}

export function listRetrospectiveRuns(dataDir: string) {
  const root = layout(dataDir).retrospectives;
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((entry) => fs.existsSync(path.join(root, entry, "input.json")))
    .map((runId) => getRetrospectiveRun(dataDir, runId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRetrospectiveRun(dataDir: string, runId: string) {
  const runDir = path.join(layout(dataDir).retrospectives, runId);
  const input = readJson<JsonRecord>(path.join(runDir, "input.json"), {});
  const candidates = readCandidates(dataDir, runId);
  const decisions = readDecisions(dataDir, runId);
  const audit = readRetrospectiveAudit(dataDir, runId);
  return {
    runId,
    runDir,
    state: deriveRetrospectiveState(runDir, candidates, decisions),
    createdAt: input.createdAt || "",
    focus: String(input.focus || ""),
    sources: Array.isArray(input.sources) ? input.sources : [],
    guideRef: input.guideRef || null,
    guideHash: input.guideHash || null,
    audit,
    auditIncomplete: Boolean(audit?.incomplete),
    candidates,
    decisions,
  };
}

export function writeCandidates(dataDir: string, runId: string, candidates: JsonRecord[], options: WriteCandidatesOptions = {}): RetrospectiveCandidate[] {
  const parsed = candidates.map((candidate) => RetrospectiveCandidateSchema.parse({ ...candidate, runId }));
  const audit = resolveRetrospectiveAudit(dataDir, runId, options);
  assertUniqueCandidateIds(parsed);
  writeJsonAtomic(path.join(layout(dataDir).retrospectives, runId, "candidates.json"), { runId, audit, candidates: parsed }, dataDir);
  writeRetrospectiveState(dataDir, runId, "candidates_generated");
  refreshRetrospectiveMarkdown(dataDir, runId);
  operationLog(dataDir, "retrospective.candidates.write", { runId, candidates: parsed.length, auditIncomplete: audit.incomplete });
  return parsed;
}

function assertUniqueCandidateIds(candidates: RetrospectiveCandidate[]): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) throw new Error(`duplicate retrospective candidate id: ${candidate.id}`);
    seen.add(candidate.id);
  }
}

export function readCandidates(dataDir: string, runId: string): RetrospectiveCandidate[] {
  const raw = readJson<{ runId: string; candidates: JsonRecord[] }>(path.join(layout(dataDir).retrospectives, runId, "candidates.json"), { runId, candidates: [] });
  return raw.candidates.map((candidate) => RetrospectiveCandidateSchema.parse(candidate));
}

export function readRetrospectiveAudit(dataDir: string, runId: string): RetrospectiveAudit | null {
  const raw = readJson<JsonRecord>(path.join(layout(dataDir).retrospectives, runId, "candidates.json"), { runId, candidates: [] });
  if (!raw.audit) return null;
  return RetrospectiveAuditSchema.parse(raw.audit);
}

function resolveRetrospectiveAudit(dataDir: string, runId: string, options: WriteCandidatesOptions): RetrospectiveAudit {
  const explicit = options.audit ? RetrospectiveAuditSchema.parse(options.audit) : null;
  const existing = explicit || readRetrospectiveAudit(dataDir, runId);
  if (existing) {
    validateRetrospectiveAudit(existing, Boolean(options.allowIncompleteAudit));
    return existing;
  }
  if (!options.allowIncompleteAudit) {
    throw new Error("retrospective source audit is required before writing candidates; provide top-level audit or use --allow-incomplete-audit");
  }
  return RetrospectiveAuditSchema.parse({
    scope: "unknown",
    focusLens: "",
    sourceCoverage: "unknown",
    incomplete: true,
    incompleteReason: options.incompleteAuditReason || "candidate write explicitly allowed without a complete source audit",
  });
}

function validateRetrospectiveAudit(audit: RetrospectiveAudit, allowIncomplete: boolean): void {
  const missing = [
    ["sourceCoverage", audit.sourceCoverage !== "unknown" ? 1 : 0],
    ["searchedSources", audit.searchedSources.length],
    ["noiseFilters", audit.noiseFilters.length],
    ["evidenceClusters", audit.evidenceClusters.length],
    ["activeCardOverlapQa", audit.activeCardOverlapQa.trim().length],
  ].filter(([, length]) => !length).map(([field]) => field);
  if (audit.sourceCoverage === "all-accessible") {
    if (!audit.userOnlyIndexBuilt) missing.push("userOnlyIndexBuilt=true");
    if (!audit.nativeSourcesCovered.length) missing.push("nativeSourcesCovered");
    if (!audit.queryFamilies.length) missing.push("queryFamilies");
    if (!audit.contextReplaySamples.length) missing.push("contextReplaySamples");
    if (audit.spoolSupplement === "unknown") missing.push("spoolSupplement");
  }
  if (audit.incomplete) missing.push("incomplete=false");
  if (missing.length && !allowIncomplete) {
    throw new Error(`retrospective source audit is incomplete: ${missing.join(", ")}; complete the audit or use --allow-incomplete-audit`);
  }
}

export function addDecision(dataDir: string, runId: string, decision: JsonRecord): RetrospectiveDecision {
  const parsed = RetrospectiveDecisionSchema.parse({ ...decision, createdAt: decision.createdAt || nowIso() });
  appendJsonl(path.join(layout(dataDir).retrospectives, runId, "decisions.jsonl"), parsed, dataDir);
  writeRetrospectiveState(dataDir, runId, "decisions_recorded", appliedStateExtra(readRetrospectiveState(dataDir, runId)));
  refreshRetrospectiveMarkdown(dataDir, runId);
  operationLog(dataDir, "retrospective.decision", { runId, candidateId: parsed.candidateId, action: parsed.action });
  return parsed;
}

export function readDecisions(dataDir: string, runId: string): RetrospectiveDecision[] {
  return readJsonl(path.join(layout(dataDir).retrospectives, runId, "decisions.jsonl")).map((decision) => RetrospectiveDecisionSchema.parse(decision));
}

export function applyRetrospective(dataDir: string, runId: string) {
  return withLock(dataDir, `retrospective-${slugify(runId)}`, () => applyRetrospectiveLocked(dataDir, runId));
}

export function previewApplyRetrospective(dataDir: string, runId: string) {
  const state = readRetrospectiveState(dataDir, runId);
  const candidates = readCandidates(dataDir, runId);
  const decisions = readDecisions(dataDir, runId);
  const latest = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const applied = appliedCandidateIds(state, candidates);
  const drafts: Array<{ candidateId: string; cardId: string; title: string; action: string }> = [];
  const merges: Array<{ candidateId: string; targetCardId: string }> = [];
  const skipped: Array<{ candidateId: string; reason: string }> = [];
  const errors: Array<{ candidateId: string; error: string }> = [];
  for (const candidate of candidates) {
    if (applied.has(candidate.id)) {
      skipped.push({ candidateId: candidate.id, reason: "already applied" });
      continue;
    }
    const decision = latest.get(candidate.id);
    if (!decision) {
      skipped.push({ candidateId: candidate.id, reason: "no decision" });
      continue;
    }
    if (decision.action === "reject") {
      skipped.push({ candidateId: candidate.id, reason: "rejected" });
      continue;
    }
    if (decision.action === "rewrite" && !decision.rewrite) {
      errors.push({ candidateId: candidate.id, error: "rewrite decision requires rewrite payload" });
      continue;
    }
    const next = candidateWithDecision(candidate, decision);
    if (decision.action === "merge" && !decision.targetCardId) {
      errors.push({ candidateId: candidate.id, error: "merge decision requires targetCardId" });
      continue;
    }
    if (decision.action === "merge" && decision.targetCardId) {
      if (!cardExists(dataDir, decision.targetCardId)) {
        errors.push({ candidateId: candidate.id, error: `merge target card not found: ${decision.targetCardId}` });
        continue;
      }
      merges.push({ candidateId: candidate.id, targetCardId: decision.targetCardId });
      continue;
    }
    drafts.push({
      candidateId: candidate.id,
      cardId: slugify(next.id || next.title),
      title: next.title,
      action: decision.action,
    });
  }
  return { ok: errors.length === 0, runId, dryRun: true, drafts, merges, skipped, errors };
}

function applyRetrospectiveLocked(dataDir: string, runId: string) {
  const state = readRetrospectiveState(dataDir, runId);
  const candidates = readCandidates(dataDir, runId);
  const decisions = readDecisions(dataDir, runId);
  const latest = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const applied = appliedCandidateIds(state, candidates);
  const created: ExperienceCard[] = [];
  const merges: Array<{ candidateId: string; targetCardId: string }> = [];
  const newApplied: JsonRecord[] = [];
  for (const candidate of candidates) {
    if (applied.has(candidate.id)) continue;
    const decision = latest.get(candidate.id);
    if (!decision || decision.action === "reject") continue;
    if (decision.action === "rewrite" && !decision.rewrite) {
      throw new Error(`rewrite decision requires rewrite payload: ${candidate.id}`);
    }
    const next = candidateWithDecision(candidate, decision);
    if (decision.action === "merge" && !decision.targetCardId) {
      throw new Error(`merge decision requires targetCardId: ${candidate.id}`);
    }
    if (decision.action === "merge" && decision.targetCardId) {
      mergeCandidateIntoCard(dataDir, next, decision.targetCardId, runId);
      merges.push({ candidateId: candidate.id, targetCardId: decision.targetCardId });
      newApplied.push({ candidateId: candidate.id, action: "merge", targetCardId: decision.targetCardId });
      continue;
    }
    const card = createDraftFromCandidate(dataDir, next, runId);
    created.push(card);
    newApplied.push({ candidateId: candidate.id, action: "draft", cardId: card.id });
  }
  const previousDrafts = Array.isArray(state?.drafts) ? state.drafts.map(String) : [];
  const previousMerges = Array.isArray(state?.merges) ? state.merges : [];
  const nextDrafts = Array.from(new Set([...previousDrafts, ...created.map((card) => card.id)]));
  const nextMerges = [...previousMerges, ...merges];
  const nextApplied = [
    ...(Array.isArray(state?.applied) ? state.applied : []),
    ...newApplied,
  ].filter((item) => item.candidateId);
  const complete = candidates.every((candidate) => {
    const decision = latest.get(candidate.id);
    return decision?.action === "reject"
      || applied.has(candidate.id)
      || nextApplied.some((item) => item.candidateId === candidate.id);
  });
  writeRetrospectiveState(dataDir, runId, complete ? "applied_to_drafts" : "decisions_recorded", { drafts: nextDrafts, merges: nextMerges, applied: nextApplied });
  refreshRetrospectiveMarkdown(dataDir, runId);
  operationLog(dataDir, "retrospective.apply", { runId, drafts: created.map((card) => card.id), merges });
  return { ok: true, runId, drafts: created, merges };
}

function mergeCandidateIntoCard(dataDir: string, candidate: RetrospectiveCandidate, targetCardId: string, runId: string) {
  const active = cardPath(dataDir, "active", targetCardId);
  const draft = cardPath(dataDir, "draft", targetCardId);
  const source = fs.existsSync(active) ? active : fs.existsSync(draft) ? draft : null;
  if (!source) throw new Error(`merge target card not found: ${targetCardId}`);
  const card = readCardFile(source);
  const next = {
    ...card,
    category: card.category && card.category !== DEFAULT_CATEGORY ? card.category : candidate.category,
    triggers: Array.from(new Set([...card.triggers, ...candidate.triggers])),
    negativeTriggers: Array.from(new Set([...card.negativeTriggers, ...candidate.negativeTriggers])),
    topics: Array.from(new Set([...card.topics, ...candidate.topics])),
    intentModes: mergeIntentModes(card.intentModes, candidate.intentModes),
    requiredSignals: Array.from(new Set([...card.requiredSignals, ...candidate.requiredSignals])),
    blockedSignals: Array.from(new Set([...card.blockedSignals, ...candidate.blockedSignals])),
    applicability: mergeApplicability(card.applicability, candidate.applicability),
    sources: Array.from(new Set([...card.sources, `retrospective:${runId}`])),
    origin: card.origin.createdBy === "manual"
      ? { ...card.origin, adapter: card.origin.adapter === "unknown" ? "manual" : card.origin.adapter, createdBy: "retrospective" as const }
      : card.origin,
    sourceRefs: Array.from(new Map([
      ...card.sourceRefs,
      { type: "retrospective" as const, ref: runId },
      ...candidate.sourceRefs,
    ].map((item) => [`${item.type}:${item.ref}`, item])).values()),
    summary: card.summary || candidate.summary,
    rule: appendUniqueRule(card.rule, candidate.rule),
    body: card.body,
    updatedAt: nowIso(),
  };
  writeCard(dataDir, next);
  return next;
}

function appendUniqueRule(current: string, reusableRule: string): string {
  const next = reusableRule.trim();
  if (!next || current.includes(next)) return current;
  return `${current.trim()}\n\n${next}`.trim();
}

export function candidateFromLesson(runId: string, lesson: JsonRecord): RetrospectiveCandidate {
  const title = lesson.title || "Untitled lesson";
  const criteria = asRecord(lesson.criteria);
  const recall = asRecord(lesson.recall);
  const engineHints = asRecord(lesson.engine_hints);
  return RetrospectiveCandidateSchema.parse({
    id: slugify(`${title}-${hashText(JSON.stringify(lesson)).slice(0, 8)}`),
    runId,
    title,
    category: normalizeCategory(lesson.category || lesson.categoryName || inferCategory(lesson)),
    summary: lesson.summary,
    rule: lesson.rule,
    triggers: toStringArray(recall.triggers).length ? toStringArray(recall.triggers) : toStringArray(criteria.use_when),
    negativeTriggers: toStringArray(criteria.ignore_when),
    topics: toStringArray(recall.topics),
    intentModes: criteria.intent_modes || {},
    requiredSignals: toStringArray(engineHints.positive),
    blockedSignals: toStringArray(engineHints.negative),
    applicability: normalizeScope(lesson.scope || {}),
    evidence: Array.isArray(lesson.evidence) ? lesson.evidence : [],
    origin: lesson.origin || {},
    sourceRefs: Array.isArray(lesson.sourceRefs) ? lesson.sourceRefs : [],
    conflicts: Array.isArray(lesson.conflicts) ? lesson.conflicts : [],
    risk: recall.risk || "medium",
    recallPolicy: recall.policy || "should",
  });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeScope(value: unknown): JsonRecord {
  const input = asRecord(value);
  return {
    ...input,
    projectKey: input.projectKey ?? input.project_key ?? null,
    modulePath: input.modulePath ?? input.module_path ?? null,
  };
}

function deriveRetrospectiveState(runDir: string, candidates: RetrospectiveCandidate[], decisions: RetrospectiveDecision[]): string {
  const state = readJson<JsonRecord | null>(path.join(runDir, "state.json"), null);
  if (state?.state) return state.state;
  if (fs.existsSync(path.join(runDir, "error.json"))) return "failed";
  if (decisions.length > 0) return "decisions_recorded";
  if (candidates.length > 0) return "candidates_generated";
  return "created";
}

function writeRetrospectiveState(dataDir: string, runId: string, state: string, extra: JsonRecord = {}): void {
  writeJsonAtomic(path.join(layout(dataDir).retrospectives, runId, "state.json"), {
    runId,
    state,
    updatedAt: nowIso(),
    ...extra,
  }, dataDir);
}

function readRetrospectiveState(dataDir: string, runId: string): JsonRecord | null {
  return readJson<JsonRecord | null>(path.join(layout(dataDir).retrospectives, runId, "state.json"), null);
}

function appliedStateExtra(state: JsonRecord | null): JsonRecord {
  if (!state) return {};
  return {
    drafts: Array.isArray(state.drafts) ? state.drafts : [],
    merges: Array.isArray(state.merges) ? state.merges : [],
    applied: Array.isArray(state.applied) ? state.applied : [],
  };
}

function appliedCandidateIds(state: JsonRecord | null, candidates: RetrospectiveCandidate[]): Set<string> {
  const ids = new Set<string>();
  for (const item of Array.isArray(state?.applied) ? state.applied : []) {
    if (item?.candidateId) ids.add(String(item.candidateId));
  }
  for (const item of Array.isArray(state?.merges) ? state.merges : []) {
    if (item?.candidateId) ids.add(String(item.candidateId));
  }
  const draftIds = new Set((Array.isArray(state?.drafts) ? state.drafts : []).map(String));
  for (const candidate of candidates) {
    if (draftIds.has(slugify(candidate.id || candidate.title))) ids.add(candidate.id);
  }
  return ids;
}

function cardExists(dataDir: string, id: string): boolean {
  return fs.existsSync(cardPath(dataDir, "active", id)) || fs.existsSync(cardPath(dataDir, "draft", id));
}

function retrospectiveSkeleton(runId: string): string {
  return `# 经验草稿审批

状态：created
复盘编号：${runId}

生成草稿后，每条经验都会按「经验总结 / 触发时机 / 可复用规则 / 审批意见」展示。确认入库前不会生效。
`;
}

function refreshRetrospectiveMarkdown(dataDir: string, runId: string): void {
  const runDir = path.join(layout(dataDir).retrospectives, runId);
  const candidates = readCandidates(dataDir, runId);
  const audit = readRetrospectiveAudit(dataDir, runId);
  const decisions = readDecisions(dataDir, runId);
  const state = deriveRetrospectiveState(runDir, candidates, decisions);
  writeTextAtomic(path.join(runDir, EXPERIENCE_REVIEW_FILE), renderRetrospectiveMarkdown(runId, state, audit, candidates, decisions), dataDir);
}

function renderRetrospectiveMarkdown(runId: string, state: string, audit: RetrospectiveAudit | null, candidates: RetrospectiveCandidate[], decisions: RetrospectiveDecision[]): string {
  const latestDecision = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const sections = candidates.map((candidate, index) => {
    const triggerText = [
      candidate.triggers.map((trigger) => `- ${trigger}`).join("\n") || "- 待补充",
      candidate.negativeTriggers.length ? ["不触发：", candidate.negativeTriggers.map((trigger) => `- ${trigger}`).join("\n")].join("\n") : "",
    ].filter(Boolean).join("\n\n");
    return [
      `## 经验 ${index + 1}：${candidate.title}`,
      "### 经验总结",
      candidate.summary,
      "### 触发时机",
      triggerText,
      "### 可复用规则",
      "以下内容是激活后会进入 Agent 上下文的规则正文：",
      fencedMarkdownBlock(candidate.rule, "agent-rule"),
      "### 审批意见",
      renderDecisionBlock(latestDecision.get(candidate.id)),
    ].join("\n\n");
  });
  return [
    "# 经验草稿审批",
    `状态：${state}`,
    `复盘编号：${runId}`,
    renderAuditStatus(audit),
    ...sections,
  ].filter(Boolean).join("\n\n").trimEnd() + "\n";
}

function fencedMarkdownBlock(content: string, info = ""): string {
  const text = content.trimEnd();
  const backtickRuns = text.match(/`{3,}/g) || [];
  const longestRun = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  const suffix = info ? info : "";
  return `${fence}${suffix}\n${text}\n${fence}`;
}

function renderAuditStatus(audit: RetrospectiveAudit | null): string {
  if (!audit) return "";
  if (audit.incomplete) {
    const reason = audit.incompleteReason ? `：${audit.incompleteReason}` : "";
    return `审计：不完整${reason}`;
  }
  const focusLens = audit.focusLens.trim() || legacyFocusLens(audit.scope);
  const sourceCoverage = audit.sourceCoverage !== "unknown" ? audit.sourceCoverage : legacySourceCoverage(audit.scope);
  const userIndex = audit.userOnlyIndexBuilt ? "user-index=yes" : "user-index=no";
  const nativeSources = audit.nativeSourcesCovered.length ? `native=${audit.nativeSourcesCovered.join(",")}` : "native=none";
  return `审计：coverage=${sourceCoverage} / focus=${focusLens} / ${userIndex} / ${nativeSources} / sources=${audit.searchedSources.length} / gaps=${audit.remainingEvidenceGaps.length}`;
}

function legacyFocusLens(scope: RetrospectiveAudit["scope"]): string {
  if (scope === "focused") return "focused (legacy)";
  return "none";
}

function legacySourceCoverage(scope: RetrospectiveAudit["scope"]): RetrospectiveAudit["sourceCoverage"] | "legacy-broad" | "legacy-focused" {
  if (scope === "all-history") return "all-accessible";
  if (scope === "manual") return "manual";
  if (scope === "broad") return "legacy-broad";
  if (scope === "focused") return "legacy-focused";
  return "unknown";
}

function renderDecisionBlock(decision: RetrospectiveDecision | undefined): string {
  if (!decision) {
    return [
      "> 审批：待定",
      ">",
      "> 可写：通过 / 不通过 / 修改为…… / 合并到……",
    ].join("\n");
  }
  return [
    `> 审批：${decision.action}`,
    decision.reason ? `> 意见：${decision.reason}` : "",
    decision.targetCardId ? `> 合并目标：${decision.targetCardId}` : "",
    decision.rewrite ? `> 改写：${JSON.stringify(decision.rewrite)}` : "",
  ].filter(Boolean).join("\n");
}

function candidateWithDecision(candidate: RetrospectiveCandidate, decision: RetrospectiveDecision): RetrospectiveCandidate {
  const rewrite = decision.rewrite || {};
  return RetrospectiveCandidateSchema.parse({
    ...candidate,
    ...rewrite,
    runId: candidate.runId,
    category: normalizeCategory(rewrite.category || candidate.category),
    applicability: rewrite.scope ? normalizeScope(rewrite.scope) : candidate.applicability,
  });
}

function mergeApplicability(current: ExperienceCard["applicability"], next: RetrospectiveCandidate["applicability"]): ExperienceCard["applicability"] {
  if (current.level !== "global") return current;
  return next;
}

function mergeIntentModes(current: ExperienceCard["intentModes"], next: RetrospectiveCandidate["intentModes"]): ExperienceCard["intentModes"] {
  return {
    include: Array.from(new Set([...(current?.include || []), ...(next?.include || [])])),
    exclude: Array.from(new Set([...(current?.exclude || []), ...(next?.exclude || [])])),
  };
}
