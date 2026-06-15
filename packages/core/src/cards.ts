import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ExperienceCardSchema, SourceRefSchema, type CardStatus, type ExperienceCard, type RetrospectiveCandidate } from "./schema.js";
import {
  backupFile,
  layout,
  nowIso,
  operationLog,
  readJson,
  slugify,
  withLock,
  writeJsonAtomic,
  writeTextAtomic,
} from "./storage.js";

export interface CardIndexEntry {
  id: string;
  title: string;
  category: string;
  status: CardStatus;
  path: string;
  summary: string;
  triggers: string[];
  negativeTriggers: string[];
  topics: string[];
  applicability: ExperienceCard["applicability"];
  intentModes: ExperienceCard["intentModes"];
  requiredSignals: string[];
  blockedSignals: string[];
  aliases: Record<string, string[]>;
  language: string;
  recallPolicy: string;
  risk: string;
  confidence: string;
  libraryScope?: "global" | "project";
  libraryPath?: string;
  projectRoot?: string | null;
}

export interface CardIndex {
  version: 1;
  updatedAt: string;
  experiences: CardIndexEntry[];
}

export interface CardReadIssue {
  status: CardStatus;
  path: string;
  message: string;
}

export interface CardInspection {
  cards: ExperienceCard[];
  issues: CardReadIssue[];
}

export interface LegacyCardMigration {
  status: CardStatus;
  path: string;
  id: string;
  title: string;
}

export interface LegacyCardMigrationSkipped {
  status: CardStatus;
  path: string;
  reason: string;
}

const CARD_SCHEMA_NAME = "ome-card";

export function cardPath(dataDir: string, status: CardStatus | string, id: string): string {
  return path.join(layout(dataDir).experiences, status, `${id}.md`);
}

export function serializeCard(card: ExperienceCard): string {
  const parsed = ExperienceCardSchema.parse(card);
  return matter.stringify(renderCardBody(parsed), {
    schema: CARD_SCHEMA_NAME,
    id: parsed.id,
    status: parsed.status,
    title: parsed.title,
    category: parsed.category,
    summary: parsed.summary,
    criteria: compactObject({
      use_when: [...parsed.triggers],
      ignore_when: [...parsed.negativeTriggers],
      ...(parsed.intentModes.include.length || parsed.intentModes.exclude.length ? { intent_modes: parsed.intentModes } : {}),
    }),
    engine_hints: compactObject({
      ...(parsed.requiredSignals.length ? { positive: [...parsed.requiredSignals] } : {}),
      ...(parsed.blockedSignals.length ? { negative: [...parsed.blockedSignals] } : {}),
    }),
    recall: compactObject({
      policy: parsed.recallPolicy,
      risk: parsed.risk,
      confidence: parsed.confidence,
      triggers: [...parsed.triggers],
      topics: [...parsed.topics],
      ...(Object.keys(parsed.aliases || {}).length ? { aliases: parsed.aliases } : {}),
    }),
    ...(Object.keys(parsed.aliases || {}).length ? { aliases: parsed.aliases } : {}),
    scope: compactApplicability(parsed.applicability),
    ...(parsed.sources.length ? { sources: [...parsed.sources] } : {}),
    ...(parsed.origin && parsed.origin.createdBy !== "manual" ? { origin: parsed.origin } : {}),
    ...(parsed.sourceRefs.length ? { source_refs: parsed.sourceRefs } : {}),
    ...(parsed.language !== "auto" ? { language: parsed.language } : {}),
    ...(parsed.archivedReason ? { archived_reason: parsed.archivedReason } : {}),
  });
}

export function parseCardMarkdown(text: string): ExperienceCard {
  const parsed = matter(text);
  const data = parsed.data || {};
  if (data.schema !== CARD_SCHEMA_NAME) {
    throw new Error(`unsupported experience card schema: ${data.schema || "missing"}; expected ${CARD_SCHEMA_NAME}`);
  }
  const criteria = data.criteria && typeof data.criteria === "object" ? data.criteria : {};
  const engineHints = data.engine_hints && typeof data.engine_hints === "object" ? data.engine_hints : {};
  const recall = data.recall && typeof data.recall === "object" ? data.recall : {};
  const scope = data.scope && typeof data.scope === "object" && !Array.isArray(data.scope) ? data.scope : {};
  const body = parsed.content.trim();
  const card = ExperienceCardSchema.parse({
    id: String(data.id || ""),
    status: data.status || "draft",
    title: data.title || data.id || "Untitled",
    category: data.category,
    summary: String(data.summary || ""),
    rule: extractRuleSection(body),
    triggers: toArray(recall.triggers).length ? toArray(recall.triggers) : toArray(criteria.use_when),
    negativeTriggers: toArray(criteria.ignore_when),
    aliases: parseAliases(data.aliases || recall.aliases),
    topics: toArray(recall.topics),
    applicability: normalizeApplicabilityInput(scope),
    intentModes: criteria.intent_modes,
    requiredSignals: toArray(engineHints.positive),
    blockedSignals: toArray(engineHints.negative),
    language: data.language || "auto",
    recallPolicy: recall.policy || "should",
    risk: recall.risk || "medium",
    confidence: recall.confidence || "medium",
    staleAfter: null,
    sources: toArray(data.sources),
    origin: data.origin || {},
    sourceRefs: parseSourceRefs(data.source_refs || data.sourceRefs),
    body,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    archivedReason: data.archived_reason || data.archivedReason,
  });
  return ExperienceCardSchema.parse({
    ...card,
    body: card.body || renderCardBody(card),
  });
}

export function readCardFile(filePath: string): ExperienceCard {
  return parseCardMarkdown(fs.readFileSync(filePath, "utf8"));
}

export function listCards(dataDir: string, status: CardStatus | null = null): ExperienceCard[] {
  const inspection = inspectCards(dataDir, status);
  if (inspection.issues.length) {
    const first = inspection.issues[0];
    throw new Error(`invalid experience card ${path.relative(dataDir, first.path)}: ${first.message}`);
  }
  return inspection.cards;
}

export function inspectCards(dataDir: string, status: CardStatus | null = null): CardInspection {
  const statuses: CardStatus[] = status ? [status] : ["draft", "active", "archived"];
  const cards: ExperienceCard[] = [];
  const issues: CardReadIssue[] = [];
  for (const state of statuses) {
    const dir = path.join(layout(dataDir).experiences, state);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((candidate) => candidate.endsWith(".md"))) {
      const filePath = path.join(dir, file);
      try {
        cards.push(readCardFile(filePath));
      } catch (error: any) {
        issues.push({ status: state, path: filePath, message: error.message || String(error) });
      }
    }
  }
  return {
    cards: cards.sort((a, b) => a.id.localeCompare(b.id)),
    issues: issues.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function migrateLegacyCards(dataDir: string, options: { backup?: boolean; dryRun?: boolean; status?: CardStatus | null } = {}) {
  return withLock(dataDir, "cards", () => {
    const plans = legacyCardMigrationPlans(dataDir, options.status || null);
    const migrated: LegacyCardMigration[] = plans.migrations.map((item) => ({
      status: item.card.status,
      path: item.path,
      id: item.card.id,
      title: item.card.title,
    }));
    if (options.dryRun) {
      return { ok: true, dryRun: true, backup: Boolean(options.backup), migrated, skipped: plans.skipped };
    }
    const backups: string[] = [];
    for (const item of plans.migrations) {
      if (options.backup) {
        const backup = backupFile(dataDir, item.path, `legacy-card-${item.card.id}`);
        if (backup) backups.push(backup);
      }
      writeTextAtomic(item.path, serializeCard(item.card), dataDir);
    }
    const activeInspection = inspectCards(dataDir, "active");
    const warnings = activeInspection.issues.length
      ? [`active index was not rebuilt because ${activeInspection.issues.length} active card(s) are still invalid`]
      : [];
    if (!activeInspection.issues.length) rebuildCardIndex(dataDir);
    operationLog(dataDir, "cards.migrateLegacy", { backup: Boolean(options.backup), migrated: migrated.map((item) => item.id), skipped: plans.skipped.length });
    return { ok: true, dryRun: false, backup: Boolean(options.backup), backups, migrated, skipped: plans.skipped, warnings };
  });
}

function legacyCardMigrationPlans(dataDir: string, status: CardStatus | null) {
  const inspection = inspectCards(dataDir, status);
  const migrations: Array<{ path: string; card: ExperienceCard }> = [];
  const skipped: LegacyCardMigrationSkipped[] = [];
  for (const issue of inspection.issues) {
    try {
      migrations.push({ path: issue.path, card: parseLegacyCardFile(issue.path, issue.status) });
    } catch (error: any) {
      skipped.push({ status: issue.status, path: issue.path, reason: error.message || String(error) });
    }
  }
  return { migrations, skipped };
}

function parseLegacyCardFile(filePath: string, fallbackStatus: CardStatus): ExperienceCard {
  const parsed = matter(fs.readFileSync(filePath, "utf8"));
  const data = parsed.data || {};
  if (data.schema) throw new Error(`card already declares unsupported schema: ${data.schema}`);
  const criteria = data.criteria && typeof data.criteria === "object" ? data.criteria : {};
  const engineHints = data.engine_hints && typeof data.engine_hints === "object" ? data.engine_hints : {};
  const recall = data.recall && typeof data.recall === "object" ? data.recall : {};
  const body = parsed.content.trim();
  const now = nowIso();
  return ExperienceCardSchema.parse({
    id: String(data.id || ""),
    status: data.status || fallbackStatus,
    title: data.title || data.id || "Untitled",
    category: data.category,
    summary: String(data.summary || ""),
    rule: String(data.rule || extractRuleSection(body) || ""),
    triggers: firstArray(recall.triggers, data.triggers, criteria.use_when),
    negativeTriggers: firstArray(criteria.ignore_when, data.negative_triggers, data.negativeTriggers),
    aliases: parseAliases(data.aliases || recall.aliases),
    topics: firstArray(recall.topics, data.topics),
    applicability: normalizeApplicabilityInput(data.scope || data.applicability),
    intentModes: data.intentModes || criteria.intent_modes,
    requiredSignals: firstArray(engineHints.positive, data.requiredSignals, data.required_signals),
    blockedSignals: firstArray(engineHints.negative, data.blockedSignals, data.blocked_signals),
    language: data.language || "auto",
    recallPolicy: data.recall_policy || data.recallPolicy || recall.policy || "should",
    risk: data.risk || recall.risk || "medium",
    confidence: data.confidence || recall.confidence || "medium",
    staleAfter: null,
    sources: toArray(data.sources),
    origin: data.origin || {},
    sourceRefs: parseSourceRefs(data.source_refs || data.sourceRefs),
    body,
    createdAt: normalizeDateField(data.createdAt || data.created, () => now),
    updatedAt: normalizeDateField(data.updatedAt || data.updated, () => now),
    archivedReason: data.archived_reason || data.archivedReason,
  });
}

export function getCard(dataDir: string, id: string): ExperienceCard {
  const source = findCardPath(dataDir, id);
  if (!source) throw new Error(`card not found: ${id}`);
  return readCardFile(source);
}

export function writeCard(dataDir: string, card: ExperienceCard | Record<string, any>): ExperienceCard {
  const input = ExperienceCardSchema.parse(card);
  const parsed = ExperienceCardSchema.parse({
    ...input,
    body: renderCardBody(input),
  });
  const target = cardPath(dataDir, parsed.status, parsed.id);
  backupFile(dataDir, target, `card-${parsed.id}`);
  writeTextAtomic(target, serializeCard(parsed), dataDir);
  if (parsed.status === "active") rebuildCardIndex(dataDir);
  operationLog(dataDir, "card.write", { id: parsed.id, status: parsed.status });
  return parsed;
}

export function updateCard(dataDir: string, id: string, patch: Record<string, any>): ExperienceCard {
  return withLock(dataDir, "cards", () => {
    const source = findCardPath(dataDir, id);
    if (!source) throw new Error(`card not found: ${id}`);
    const current = readCardFile(source);
    const next = ExperienceCardSchema.parse({
      ...current,
      ...pickCardPatch(patch),
      id: current.id,
      status: current.status,
      updatedAt: nowIso(),
    });
    const rendered = ExperienceCardSchema.parse({ ...next, body: renderCardBody(next) });
    backupFile(dataDir, source, `card-${id}`);
    writeTextAtomic(source, serializeCard(rendered), dataDir);
    if (rendered.status === "active") rebuildCardIndex(dataDir);
    operationLog(dataDir, "card.update", { id });
    return rendered;
  });
}

export function createDraftFromCandidate(dataDir: string, candidate: RetrospectiveCandidate, sourceRunId: string): ExperienceCard {
  const id = slugify(candidate.id || candidate.title);
  const now = nowIso();
  return writeCard(dataDir, {
    id,
    status: "draft",
    title: candidate.title,
    category: candidate.category,
    summary: candidate.summary,
    rule: candidate.rule,
    triggers: candidate.triggers,
    negativeTriggers: candidate.negativeTriggers,
    topics: candidate.topics,
    applicability: candidate.applicability,
    intentModes: candidate.intentModes,
    requiredSignals: candidate.requiredSignals,
    blockedSignals: candidate.blockedSignals,
    recallPolicy: candidate.recallPolicy,
    risk: candidate.risk,
    sources: [`retrospective:${sourceRunId}`],
    origin: candidate.origin.adapter === "unknown"
      ? { adapter: "manual", agent: "unknown", createdBy: "retrospective" }
      : { ...candidate.origin, createdBy: "retrospective" },
    sourceRefs: [
      { type: "retrospective", ref: sourceRunId },
      ...candidate.sourceRefs,
    ],
    createdAt: now,
    updatedAt: now,
  });
}

export function ensureStarterCards(dataDir: string): ExperienceCard[] {
  const marker = path.join(layout(dataDir).indexes, "starter.json");
  const state = readJson<{ removedAt?: string } | null>(marker, null);
  if (state?.removedAt) return [];
  const existing = new Set(listCards(dataDir, "active").map((card) => card.id));
  const created: ExperienceCard[] = [];
  for (const starter of starterCardDefinitions()) {
    if (existing.has(starter.id)) continue;
    created.push(writeCard(dataDir, starter));
  }
  if (created.length) rebuildCardIndex(dataDir);
  if (!fs.existsSync(marker)) writeJsonAtomic(marker, { installedAt: nowIso(), ids: starterCardDefinitions().map((card) => card.id) }, dataDir);
  return created;
}

export function listStarterCards(dataDir: string): ExperienceCard[] {
  const marker = readJson<{ ids?: string[] } | null>(path.join(layout(dataDir).indexes, "starter.json"), null);
  const starterIds = new Set((marker?.ids || []).map(String));
  return inspectCards(dataDir).cards.filter((card) => card.origin.adapter === "ome-starter" || starterIds.has(card.id));
}

export function removeStarterCards(dataDir: string): { ok: true; removed: string[] } {
  return withLock(dataDir, "cards", () => {
    const removed: string[] = [];
    for (const card of listStarterCards(dataDir)) {
      const source = findCardPath(dataDir, card.id);
      if (!source) continue;
      backupFile(dataDir, source, `starter-${card.id}`);
      fs.rmSync(source);
      removed.push(card.id);
    }
    rebuildCardIndex(dataDir);
    writeJsonAtomic(path.join(layout(dataDir).indexes, "starter.json"), { removedAt: nowIso(), removed }, dataDir);
    operationLog(dataDir, "starter.remove", { removed });
    return { ok: true, removed };
  });
}

function starterCardDefinitions(): ExperienceCard[] {
  const now = nowIso();
  const base: Pick<ExperienceCard,
    "status" | "language" | "confidence" | "staleAfter" | "sources" | "origin" | "sourceRefs" | "intentModes" | "requiredSignals" | "blockedSignals" | "createdAt" | "updatedAt"
  > = {
    status: "active" as const,
    language: "en" as const,
    confidence: "medium" as const,
    staleAfter: null,
    sources: ["starter:ome"],
    origin: {
      adapter: "ome-starter" as const,
      agent: "unknown" as const,
      model: null,
      sessionId: null,
      projectKey: null,
      createdBy: "starter" as const,
    },
    sourceRefs: [{ type: "starter" as const, ref: "ome-starter" }],
    intentModes: { include: [], exclude: [] },
    requiredSignals: [],
    blockedSignals: [],
    createdAt: now,
    updatedAt: now,
  };
  return [
    {
      ...base,
      id: "starter-agent-goal-execution",
      title: "Enter full-closure delivery mode when a goal starts",
      category: "Execution Protocol",
      summary: "When the user starts real execution with /goal, create a goal, or start now, the agent should execute and verify the full scope instead of only writing goal text or doing a small slice.",
      rule: [
        "When the user says `/goal`, `create a goal`, `use goal`, `start now`, `start executing the goal`, `run a long task`, or asks to move a set of requirements into goal execution, treat it as an execution startup protocol, not ordinary goal copy. Default execution rules:",
        "",
        "1. Before starting, clarify the goal, scope, non-scope, real completion criteria, and itemized acceptance checklist. If the goal is cut too small, call out the scope risk and include the user-confirmed requirements in the same goal.",
        "2. Execute systematically from the full plan, anchored to the source of truth, story, roadmap, design plan, or user wording. Do not drift in direction or stop after the first visible slice.",
        "3. Close every planned feature end to end. Do not ship half-finished work, happy paths only, UI shells, partial APIs, placeholders, fake routes, hidden test entries, in-memory substitutes, fake external actions, or fallbacks that create two versions of the truth.",
        "4. Keep implementation maintainable, extensible, robust, and resilient. Split modules on real boundaries, keep responsibilities clear, and clean directly related dead or dirty logic when needed. Do not add abstract layers for an imagined future.",
        "5. Validate through real entries and real user paths. Commands, features, states, docs, and evidence must cover the checklist. A successful command, local smoke test, or finished code change is not completion by itself.",
        "6. For complex or high-risk goals, run a self-review after implementation. When needed, dispatch an external model or review flow to check direction drift, feature completeness, real usability, architecture quality, and maintainability.",
        "7. Completion must fail closed. If any planned feature is unfinished, acceptance evidence is missing, validation failed, environment blockers are unexplained, or risks are not stated, do not mark the goal complete. Continue fixing it or clearly mark it blocked.",
        "8. Final delivery should explain the user-facing change, verified evidence, risks or limits, and open confirmations.",
        "",
        "Ignore this card when goal wording appears only in docs, examples, explanations, OKRs, or business-goal discussion.",
      ].join("\n"),
      triggers: ["/goal", "create a goal", "start now", "use goal", "finish end to end", "verify it yourself"],
      negativeTriggers: ["goal docs example", "explain goal", "discuss goal", "business goal", "OKR"],
      aliases: {},
      topics: ["goal", "execution", "delivery", "validation"],
      applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "Starter lesson for OME recall." },
      intentModes: { include: ["execute"], exclude: ["discuss", "explain"] },
      requiredSignals: ["goal_execute"],
      blockedSignals: ["goal_example_discussion", "business_goal_discussion", "explain_only"],
      recallPolicy: "must",
      risk: "high",
      body: "",
    },
    {
      ...base,
      id: "starter-product-design-real-workflow",
      title: "Build Linear-style tool screens around workflow, not decoration",
      category: "Product Design",
      summary: "When building internal tools, the user values workflow clarity and operational density over decorative Linear-inspired skin.",
      rule: [
        "Borrow Linear's workflow logic rather than its surface style: clear object model, stable columns, dense but readable task cards, quiet colors, strong status hierarchy, obvious next actions, and minimal busy work.",
        "Avoid landing pages, decorative heroes, nested card showcases, generic demo dashboards, large gradients, and UI that looks polished but does not help users scan work, compare state, and act quickly.",
      ].join("\n"),
      triggers: [
        "kanban board",
        "Linear-inspired UI",
        "Linear style",
        "internal tool",
        "dashboard",
        "HTML page",
        "workflow-focused UI",
        "low visual noise",
        "task board",
      ],
      negativeTriggers: ["pure visual branding only", "write marketing copy only", "public landing page"],
      aliases: {},
      topics: ["product-design", "ui-ux", "workflow", "linear", "kanban"],
      applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "Starter lesson for OME recall." },
      recallPolicy: "should",
      risk: "medium",
      body: "",
    },
    {
      ...base,
      id: "starter-ai-first-review-surface",
      title: "Keep OME AI-first and draft-approval focused",
      category: "Product Design",
      summary: "OME should reduce repeated teaching by letting agents extract experience drafts from real work and letting users approve or refine them, not manually author a taxonomy.",
      rule: "Let the agent generate experience drafts from real work. Keep draft approval in a low-friction Markdown or CLI flow, and avoid adding product surfaces before repeated user evidence shows they are needed.",
      triggers: ["make manual card creation simpler", "design experience draft approval", "avoid user burden", "AI first draft approval"],
      negativeTriggers: ["bulk manual data entry app", "generic CMS workflow"],
      aliases: {},
      topics: ["ai-first", "draft-approval", "low-friction"],
      applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "Starter lesson for OME recall." },
      requiredSignals: ["ome_review_surface"],
      recallPolicy: "should",
      risk: "medium",
      body: "",
    },
    {
      ...base,
      id: "starter-delivery-real-entry-validation",
      title: "Validate through the real user entry",
      category: "Delivery Validation",
      summary: "Delivery is not proven by internal calls; the user expects validation through the same entry they will use.",
      rule: "Do not call internal functions and claim the product works. Exercise the same entry the user will use, check visible output, confirm side effects, and keep fixtures isolated from the user's real data.",
      triggers: ["verify this end to end", "test the CLI setup", "is this actually usable", "validate user flow"],
      negativeTriggers: ["unit-only helper change", "static copy edit"],
      aliases: {},
      topics: ["validation", "e2e", "delivery"],
      applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "Starter lesson for OME recall." },
      recallPolicy: "should",
      risk: "high",
      body: "",
    },
    {
      ...base,
      id: "starter-code-kiss-root-cause",
      title: "Prefer KISS and root-cause fixes",
      category: "Coding Principles",
      summary: "The user prefers removing stale branches and fixing the real cause over adding compatibility clutter or fallback layers.",
      rule: "Keep modules cohesive, remove stale branches, and fix the reason an issue exists instead of adding another fallback. Before release, delete dirty compatibility paths rather than preserving two truths.",
      triggers: [
        "refactor this cleanly",
        "avoid compatibility clutter",
        "make the architecture maintainable",
        "fix the root cause",
        "高内聚低耦合",
        "根因修复",
        "逻辑干净",
        "不要历史包袱",
      ],
      negativeTriggers: ["temporary local experiment", "throwaway script"],
      aliases: {},
      topics: ["kiss", "architecture", "maintenance"],
      applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "Starter lesson for OME recall." },
      requiredSignals: ["architecture_quality"],
      recallPolicy: "should",
      risk: "medium",
      body: "",
    },
  ];
}

export function promoteDraft(dataDir: string, id: string): ExperienceCard {
  return withLock(dataDir, "cards", () => {
    const source = cardPath(dataDir, "draft", id);
    const target = cardPath(dataDir, "active", id);
    if (!fs.existsSync(source)) throw new Error(`draft card not found: ${id}`);
    if (fs.existsSync(target)) throw new Error(`active card already exists: ${id}`);
    const card = readCardFile(source);
    const next = ExperienceCardSchema.parse({ ...card, status: "active", updatedAt: nowIso() });
    const rendered = ExperienceCardSchema.parse({ ...next, body: renderCardBody(next) });
    writeTextAtomic(target, serializeCard(rendered), dataDir);
    fs.rmSync(source);
    rebuildCardIndex(dataDir);
    operationLog(dataDir, "card.enable", { id });
    return rendered;
  });
}

export function archiveCard(dataDir: string, id: string, reason = "archived"): ExperienceCard {
  return withLock(dataDir, "cards", () => {
    const active = cardPath(dataDir, "active", id);
    const draft = cardPath(dataDir, "draft", id);
    const source = fs.existsSync(active) ? active : fs.existsSync(draft) ? draft : null;
    if (!source) throw new Error(`card not found: ${id}`);
    const card = readCardFile(source);
    const next = ExperienceCardSchema.parse({ ...card, status: "archived", archivedReason: reason, updatedAt: nowIso() });
    const rendered = ExperienceCardSchema.parse({ ...next, body: renderCardBody(next) });
    writeTextAtomic(cardPath(dataDir, "archived", id), serializeCard(rendered), dataDir);
    fs.rmSync(source);
    rebuildCardIndex(dataDir);
    operationLog(dataDir, "card.archive", { id, reason });
    return rendered;
  });
}

export function rebuildCardIndex(dataDir: string): CardIndex {
  const index = buildCardIndex(dataDir);
  backupFile(dataDir, layout(dataDir).experienceIndex, "experiences-index");
  writeJsonAtomic(layout(dataDir).experienceIndex, index, dataDir);
  return index;
}

export function buildCardIndex(dataDir: string): CardIndex {
  const experiences: CardIndexEntry[] = listCards(dataDir, "active").map((card) => ({
    id: card.id,
    title: card.title,
    category: card.category,
    status: card.status,
    path: path.relative(dataDir, cardPath(dataDir, card.status, card.id)),
    triggers: card.triggers,
    negativeTriggers: card.negativeTriggers,
    topics: card.topics,
    applicability: card.applicability,
    intentModes: card.intentModes,
    requiredSignals: card.requiredSignals,
    blockedSignals: card.blockedSignals,
    aliases: card.aliases,
    language: card.language,
    recallPolicy: card.recallPolicy,
    risk: card.risk,
    confidence: card.confidence,
    summary: card.summary,
  }));
  return { version: 1, updatedAt: nowIso(), experiences };
}

export function readCardIndex(dataDir: string): CardIndex {
  return readJson<CardIndex>(layout(dataDir).experienceIndex, { version: 1, updatedAt: nowIso(), experiences: [] });
}

function findCardPath(dataDir: string, id: string): string | undefined {
  return ["draft", "active", "archived"]
    .map((status) => cardPath(dataDir, status, id))
    .find((candidate) => fs.existsSync(candidate));
}

function pickCardPatch(patch: Record<string, any> = {}): Record<string, any> {
  const allowed: Record<string, any> = {};
  if (Object.hasOwn(patch, "scope")) allowed.applicability = normalizeApplicabilityInput(patch.scope);
  for (const key of ["title", "category", "summary", "rule", "triggers", "negativeTriggers", "aliases", "topics", "intentModes", "requiredSignals", "blockedSignals", "language", "recallPolicy", "risk", "confidence", "archivedReason"]) {
    if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
  }
  return allowed;
}

function renderCardBody(card: ExperienceCard): string {
  const lines = [
    "## 这张卡解决什么问题",
    "",
    card.summary.trim(),
    "",
    "## 使用标准",
    "",
    "使用：",
    ...listItems(card.triggers, "当前任务与这张卡的工作流语义直接匹配。"),
    "",
    "不要使用：",
    ...listItems(card.negativeTriggers, "当前任务只是概念讨论、文档举例，或与这张卡的工作流无关。"),
    "",
    `召回策略：${card.recallPolicy}。`,
    `风险级别：${card.risk}。`,
    "",
    "## 完整规则",
    "",
    fencedText(card.rule.trim()),
  ];
  return lines.join("\n").trim();
}

function extractRuleSection(body: string): string {
  const match = String(body || "").match(/(^|\n)##\s+完整规则\s*\n+```(?:text|markdown|md|agent-rule)?\s*\n([\s\S]*?)\n```/i);
  return match?.[2]?.trim() || "";
}

function fencedText(value: string): string {
  const fence = value.includes("```") ? "````" : "```";
  return `${fence}text\n${value}\n${fence}`;
}

function listItems(values: string[], fallback: string, code = false): string[] {
  const items = unique(values.map((value) => String(value || "").trim()).filter(Boolean));
  if (!items.length) return [`- ${fallback}`];
  return items.map((item) => `- ${code ? `\`${item}\`` : item}`);
}

function compactApplicability(applicability: ExperienceCard["applicability"]) {
  return compactObject({
    level: applicability.level,
    ...(applicability.projectKey ? { project_key: applicability.projectKey } : {}),
    ...(applicability.modulePath ? { module_path: applicability.modulePath } : {}),
  });
}

function normalizeApplicabilityInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  return {
    ...input,
    projectKey: input.projectKey ?? input.project_key ?? null,
    modulePath: input.modulePath ?? input.module_path ?? null,
  };
}

function compactObject<T extends Record<string, any>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === "object") return Object.keys(item).length > 0;
    return item !== undefined && item !== null && item !== "";
  })) as Partial<T>;
}

function firstArray(...values: unknown[]): string[] {
  for (const value of values) {
    const items = toArray(value);
    if (items.length) return items;
  }
  return [];
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseAliases(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, toArray(items)]));
}

function parseSourceRefs(value: unknown): ExperienceCard["sourceRefs"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => SourceRefSchema.parse(item));
}

function normalizeDateField(value: unknown, fallback: () => string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback();
}
