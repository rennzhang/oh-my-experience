import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ExperienceCardSchema, type CardStatus, type ExperienceCard, type RetrospectiveCandidate } from "./schema.js";
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
  rule: string;
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
  staleAfter: string | null;
  bodyExcerpt: string;
  sources: string[];
  origin: ExperienceCard["origin"];
  sourceRefs: ExperienceCard["sourceRefs"];
  updatedAt: string;
}

export interface CardIndex {
  version: 1;
  updatedAt: string;
  experiences: CardIndexEntry[];
}

export function cardPath(dataDir: string, status: CardStatus | string, id: string): string {
  return path.join(layout(dataDir).experiences, status, `${id}.md`);
}

export function serializeCard(card: ExperienceCard): string {
  const parsed = ExperienceCardSchema.parse(card);
  return matter.stringify(parsed.body || "", {
    id: parsed.id,
    status: parsed.status,
    title: parsed.title,
    category: parsed.category,
    summary: parsed.summary,
    rule: parsed.rule,
    triggers: parsed.triggers,
    negative_triggers: parsed.negativeTriggers,
    ...(Object.keys(parsed.aliases || {}).length ? { aliases: parsed.aliases } : {}),
    topics: parsed.topics,
    applicability: parsed.applicability,
    ...(parsed.intentModes.include.length || parsed.intentModes.exclude.length ? { intent_modes: parsed.intentModes } : {}),
    ...(parsed.requiredSignals.length ? { required_signals: parsed.requiredSignals } : {}),
    ...(parsed.blockedSignals.length ? { blocked_signals: parsed.blockedSignals } : {}),
    language: parsed.language,
    recall_policy: parsed.recallPolicy,
    risk: parsed.risk,
    confidence: parsed.confidence,
    ...(parsed.staleAfter ? { stale_after: parsed.staleAfter } : {}),
    sources: parsed.sources,
    origin: parsed.origin,
    source_refs: parsed.sourceRefs,
    created: parsed.createdAt,
    updated: parsed.updatedAt,
    ...(parsed.archivedReason ? { archived_reason: parsed.archivedReason } : {}),
  });
}

export function parseCardMarkdown(text: string): ExperienceCard {
  const parsed = matter(text);
  const data = parsed.data || {};
  return ExperienceCardSchema.parse({
    id: String(data.id || ""),
    status: data.status || "draft",
    title: data.title || data.id || "Untitled",
    category: data.category,
    summary: String(data.summary || ""),
    rule: String(data.rule || ""),
    triggers: toArray(data.triggers),
    negativeTriggers: toArray(data.negative_triggers || data.negativeTriggers),
    aliases: parseAliases(data.aliases),
    topics: toArray(data.topics).length ? toArray(data.topics) : toArray(data.scope),
    applicability: data.applicability,
    intentModes: data.intent_modes || data.intentModes,
    requiredSignals: toArray(data.required_signals || data.requiredSignals),
    blockedSignals: toArray(data.blocked_signals || data.blockedSignals),
    language: data.language || "auto",
    recallPolicy: data.recall_policy || data.recallPolicy || "should",
    risk: data.risk || "medium",
    confidence: data.confidence || "medium",
    staleAfter: data.stale_after || data.staleAfter || null,
    sources: toArray(data.sources),
    origin: data.origin,
    sourceRefs: data.source_refs || data.sourceRefs || [],
    body: parsed.content.trim(),
    createdAt: normalizeDateField(data.created || data.createdAt, nowIso),
    updatedAt: normalizeDateField(data.updated || data.updatedAt, nowIso),
    archivedReason: data.archived_reason || data.archivedReason,
  });
}

export function readCardFile(filePath: string): ExperienceCard {
  return parseCardMarkdown(fs.readFileSync(filePath, "utf8"));
}

export function listCards(dataDir: string, status: CardStatus | null = null): ExperienceCard[] {
  const statuses: CardStatus[] = status ? [status] : ["draft", "active", "archived"];
  const cards: ExperienceCard[] = [];
  for (const state of statuses) {
    const dir = path.join(layout(dataDir).experiences, state);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((candidate) => candidate.endsWith(".md"))) {
      cards.push(readCardFile(path.join(dir, file)));
    }
  }
  return cards.sort((a, b) => a.id.localeCompare(b.id));
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
    body: input.body || renderCardBody(input),
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
    backupFile(dataDir, source, `card-${id}`);
    writeTextAtomic(source, serializeCard(next), dataDir);
    if (next.status === "active") rebuildCardIndex(dataDir);
    operationLog(dataDir, "card.update", { id });
    return next;
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
    body: renderCardBody(candidate),
    createdAt: now,
    updatedAt: now,
  });
}

export function ensureStarterCards(dataDir: string): ExperienceCard[] {
  const marker = path.join(layout(dataDir).indexes, "starter.json");
  const state = readJson<{ removedAt?: string } | null>(marker, null);
  if (state?.removedAt) return [];
  const existing = new Set(listCards(dataDir).map((card) => card.id));
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
  return listCards(dataDir).filter((card) => card.origin.adapter === "ome-starter");
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
      title: "Keep OME AI-first and review-focused",
      category: "Product Design",
      summary: "OME should reduce repeated teaching by letting agents extract lessons from real work and letting users review, not manually author a taxonomy.",
      rule: "Let the agent generate candidate lessons from real work. Keep review in a low-friction Markdown or CLI flow, and avoid adding product surfaces before repeated user evidence shows they are needed.",
      triggers: ["make manual card creation simpler", "design experience review flow", "avoid user burden", "AI first review"],
      negativeTriggers: ["bulk manual data entry app", "generic CMS workflow"],
      aliases: {},
      topics: ["ai-first", "review", "low-friction"],
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
      triggers: ["refactor this cleanly", "avoid compatibility clutter", "make the architecture maintainable", "fix the root cause"],
      negativeTriggers: ["temporary local experiment", "throwaway script"],
      aliases: {},
      topics: ["kiss", "architecture", "maintenance"],
      applicability: { level: "global", projectKey: null, modulePath: null, confidence: "medium", rationale: "Starter lesson for OME recall." },
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
    writeTextAtomic(target, serializeCard(next), dataDir);
    fs.rmSync(source);
    rebuildCardIndex(dataDir);
    operationLog(dataDir, "card.approve", { id });
    return next;
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
    writeTextAtomic(cardPath(dataDir, "archived", id), serializeCard(next), dataDir);
    fs.rmSync(source);
    rebuildCardIndex(dataDir);
    operationLog(dataDir, "card.archive", { id, reason });
    return next;
  });
}

export function rebuildCardIndex(dataDir: string): CardIndex {
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
    staleAfter: card.staleAfter,
    summary: card.summary,
    rule: card.rule,
    bodyExcerpt: card.body.slice(0, 3000),
    sources: card.sources,
    origin: card.origin,
    sourceRefs: card.sourceRefs,
    updatedAt: card.updatedAt,
  }));
  const index: CardIndex = { version: 1, updatedAt: nowIso(), experiences };
  backupFile(dataDir, layout(dataDir).experienceIndex, "experiences-index");
  writeJsonAtomic(layout(dataDir).experienceIndex, index, dataDir);
  return index;
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
  for (const key of ["title", "category", "summary", "rule", "triggers", "negativeTriggers", "aliases", "topics", "applicability", "intentModes", "requiredSignals", "blockedSignals", "language", "recallPolicy", "risk", "confidence", "staleAfter", "sources", "origin", "sourceRefs", "body", "archivedReason"]) {
    if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
  }
  if (Object.hasOwn(patch, "recall_policy")) allowed.recallPolicy = patch.recall_policy;
  if (Object.hasOwn(patch, "intent_modes")) allowed.intentModes = patch.intent_modes;
  if (Object.hasOwn(patch, "required_signals")) allowed.requiredSignals = patch.required_signals;
  if (Object.hasOwn(patch, "blocked_signals")) allowed.blockedSignals = patch.blocked_signals;
  return allowed;
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function parseAliases(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, toArray(items)]));
}

function normalizeDateField(value: unknown, fallback: () => string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback();
}

function renderCardBody(card: Pick<ExperienceCard, "title" | "summary" | "triggers" | "negativeTriggers" | "rule">): string {
  const triggers = card.triggers.length ? card.triggers.map((trigger) => `- ${trigger}`).join("\n") : "- 待补充";
  const negativeTriggers = card.negativeTriggers.length
    ? ["", "## 不触发", card.negativeTriggers.map((trigger) => `- ${trigger}`).join("\n")]
    : [];
  return [
    `# ${card.title}`,
    "",
    "## 经验总结",
    card.summary,
    "",
    "## 触发时机",
    triggers,
    ...negativeTriggers,
    "",
    "## 可复用规则",
    card.rule,
  ].join("\n");
}
