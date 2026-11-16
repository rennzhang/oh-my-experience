import fs from "node:fs";
import path from "node:path";
import { readCardFile, updateCard, type CardIndexEntry } from "./cards.js";
import { readLibraryCards, type ExperienceLibrary, type LibraryStack } from "./library-stack.js";
import {
  DEFAULT_BASELINE_MAX_CHARS,
  DEFAULT_BASELINE_REFRESH_TURNS,
  DEFAULT_BASELINE_SET_MAX_CHARS,
} from "./retrieval-contract.js";
import { hashText, layout, nowIso, readJson, withLock, writeJsonAtomic } from "./storage.js";

export interface BaselineOptions {
  enabled: boolean;
  maxChars: number;
  setMaxChars: number;
  refreshEveryTurns: number;
}

export interface BaselineCard {
  id: string;
  title: string;
  rule: string;
  appliesTo: string[];
  libraryScope: "global" | "project";
}

export interface BaselineDelivery {
  enabled: boolean;
  available: boolean;
  text: string;
  cardIds: string[];
  omittedCardIds: string[];
  chars: number;
  setFingerprint: string | null;
  sessionTurns: number | null;
  skipReason: string | null;
}

interface BaselineStateFile {
  version?: number;
  sessions?: Record<string, { turns: number; fingerprint: string; updatedAt: string }>;
}

export const BASELINE_FRAMING = [
  "# OME Baseline Experience",
  "",
  "Standing reminders summarised from earlier sessions. They are not instructions for this turn: if the current request conflicts with one, the request wins.",
  "They are also not a reason to start working. When the user is only asking, discussing, or reviewing, do not turn a reminder into an action.",
  "Apply only the parts that change this turn's judgment; ignore the rest without replying to it.",
].join("\n");

export function baselineOptionsFromConfig(retrieval: { baseline?: Partial<BaselineOptions> } | null | undefined): BaselineOptions {
  const baseline = retrieval?.baseline || {};
  return {
    enabled: baseline.enabled ?? true,
    maxChars: baseline.maxChars ?? DEFAULT_BASELINE_MAX_CHARS,
    setMaxChars: baseline.setMaxChars ?? DEFAULT_BASELINE_SET_MAX_CHARS,
    refreshEveryTurns: baseline.refreshEveryTurns ?? DEFAULT_BASELINE_REFRESH_TURNS,
  };
}

// Baseline membership follows the card; delivery cadence follows the session.
// Entries come from the caller's already-read library stack, so this never
// re-reads indexes or duplicates library warnings. Order is project -> global
// -> id, and a project card wins over a global card with the same id.
export function readBaselineCards(stack: LibraryStack, entries: CardIndexEntry[]): BaselineCard[] {
  return resolveBaselineMembers(entries, (message) => stack.warnings.push(message));
}

interface BaselineCandidate {
  entry: CardIndexEntry;
  scope: "global" | "project";
}

// One id resolves once: project priority, then the first candidate that is
// actually deliverable. An inactive or recall-off project card falls back to the
// global card instead of silently dropping the reminder.
function resolveBaselineMembers(
  entries: CardIndexEntry[],
  onReadError?: (message: string) => void,
): BaselineCard[] {
  const groups = new Map<string, BaselineCandidate[]>();
  for (const entry of entries) {
    if (!entry.baseline) continue;
    const scope = (entry.libraryScope || "global") as "global" | "project";
    const list = groups.get(entry.id) || [];
    list.push({ entry, scope });
    groups.set(entry.id, list);
  }
  const cards: BaselineCard[] = [];
  for (const [id, candidates] of groups) {
    candidates.sort((left, right) => libraryOrder(left.scope) - libraryOrder(right.scope));
    for (const candidate of candidates) {
      const file = candidate.entry.libraryPath
        ? path.join(candidate.entry.libraryPath, candidate.entry.path)
        : candidate.entry.path;
      try {
        const card = readCardFile(file);
        if (card.status !== "active" || card.recallPolicy === "off") continue;
        cards.push({
          id: card.id,
          title: card.title,
          rule: card.rule,
          appliesTo: card.appliesTo,
          libraryScope: candidate.scope,
        });
        break;
      } catch {
        // An unreadable baseline card must not take down recall; `ome doctor`
        // reports the schema error separately.
        onReadError?.(`failed to read baseline card ${id} in ${candidate.scope} library`);
      }
    }
  }
  return cards.sort((left, right) =>
    libraryOrder(left.libraryScope) - libraryOrder(right.libraryScope)
    || left.id.localeCompare(right.id)
  );
}

export function baselineBudgetWarnings(
  cards: Array<{ id: string; title: string; rule: string; appliesTo: string[]; status: string; baseline: boolean; recallPolicy: string }>,
  options: BaselineOptions,
  libraryScope: "global" | "project" = "global",
): string[] {
  const members = cards
    .filter((card) => card.status === "active" && card.baseline && card.recallPolicy !== "off")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((card) => ({
      id: card.id,
      title: card.title,
      rule: card.rule,
      appliesTo: card.appliesTo,
      libraryScope,
    }));
  return baselineWarningMessages(members, options);
}

// Doctor-level check for one resolved library stack: the same membership and
// render order as delivery, so a warning always matches an actual omission.
export function baselineStackWarnings(libraries: ExperienceLibrary[], options: BaselineOptions): string[] {
  const entries = libraries.filter((library) => library.readable).flatMap((library) => readLibraryCards(library));
  return baselineWarningMessages(resolveBaselineMembers(entries), options);
}

function baselineWarningMessages(members: BaselineCard[], options: BaselineOptions): string[] {
  if (!options.enabled || !members.length) return [];
  const warnings: string[] = [];
  if (members.length > 5) {
    warnings.push(`${members.length} baseline cards are always-on; keep the standing set small so it stays readable`);
  }
  for (const row of members) {
    if (renderBaselineCardBlock(row).length > options.setMaxChars || renderBaselineCardBlock(row).length > options.maxChars) {
      warnings.push(`baseline card is larger than the delivery budget on its own: ${row.id}`);
    }
  }
  for (const omitted of renderBaselineContext(members, options).omittedCardIds) {
    warnings.push(`baseline card never fits the delivery budget and is omitted whole: ${omitted}`);
  }
  return warnings;
}

export function baselineSetFingerprint(cards: BaselineCard[]): string {
  return hashText(JSON.stringify(cards.map((card) => ({
    libraryScope: card.libraryScope,
    id: card.id,
    rule: card.rule,
    appliesTo: card.appliesTo,
  }))));
}

export function renderBaselineCardBlock(card: BaselineCard): string {
  const tag = card.libraryScope === "project" ? "[project]" : "[global]";
  const applies = card.appliesTo.length ? `[applies: ${card.appliesTo.join(", ")}]` : "";
  const heading = `${tag}${applies} ${card.title} (${card.id})`;
  const rule = String(card.rule || "").trim();
  if (!rule) return `- ${heading}`;
  return [`- ${heading}`, ...rule.split("\n").map((line) => `  ${line}`)].join("\n");
}

export function renderBaselineContext(cards: BaselineCard[], options: Partial<BaselineOptions> = {}) {
  const limits = { ...baselineOptionsFromConfig(null), ...options };
  const blocks: string[] = [];
  const deliveredCardIds: string[] = [];
  const omittedCardIds: string[] = [];
  const perSet = new Map<string, number>();
  let chars = 0;
  for (const card of cards) {
    const block = renderBaselineCardBlock(card);
    const used = perSet.get(card.libraryScope) || 0;
    // Whole-card omission only. Half a rule can be worse than no rule.
    if (used + block.length > limits.setMaxChars || chars + block.length > limits.maxChars) {
      omittedCardIds.push(card.id);
      continue;
    }
    perSet.set(card.libraryScope, used + block.length);
    chars += block.length;
    blocks.push(block);
    deliveredCardIds.push(card.id);
  }
  return {
    text: blocks.length ? `${BASELINE_FRAMING}\n\n${blocks.join("\n")}` : "",
    chars,
    deliveredCardIds,
    omittedCardIds,
  };
}

export function deliverBaseline({
  dataDir,
  cards,
  options,
  sessionId,
}: {
  dataDir: string;
  cards: BaselineCard[];
  options: BaselineOptions;
  sessionId: string | null;
}): BaselineDelivery {
  const empty: BaselineDelivery = {
    enabled: options.enabled,
    available: cards.length > 0,
    text: "",
    cardIds: [],
    omittedCardIds: [],
    chars: 0,
    setFingerprint: null,
    sessionTurns: null,
    skipReason: null,
  };
  if (!options.enabled) return { ...empty, skipReason: "disabled" };
  if (!cards.length) return { ...empty, skipReason: "empty" };
  const fingerprint = baselineSetFingerprint(cards);
  const cadence = sessionId
    ? baselineCadence(dataDir, sessionId, fingerprint, options.refreshEveryTurns)
    : { deliver: true, turns: null, skipReason: null };
  if (!cadence.deliver) {
    return {
      ...empty,
      available: true,
      setFingerprint: fingerprint,
      sessionTurns: cadence.turns,
      skipReason: cadence.skipReason,
    };
  }
  const rendered = renderBaselineContext(cards, options);
  return {
    enabled: true,
    available: true,
    text: rendered.text,
    cardIds: rendered.deliveredCardIds,
    omittedCardIds: rendered.omittedCardIds,
    chars: rendered.chars,
    setFingerprint: fingerprint,
    sessionTurns: cadence.turns,
    skipReason: rendered.deliveredCardIds.length ? null : "budget",
  };
}

// Fail open in exactly one direction: when the counter is missing, unreadable,
// unwritable, or locked by a concurrent prompt, deliver now. Never suppress
// baseline delivery because state bookkeeping failed.
function baselineCadence(
  dataDir: string,
  sessionId: string,
  fingerprint: string,
  refreshEveryTurns: number,
): { deliver: boolean; turns: number | null; skipReason: string | null } {
  const statePath = layout(dataDir).baselineState;
  try {
    return withLock(dataDir, "baseline-state", () => {
      const state = readBaselineState(statePath);
      const previous = normalizeSessionEntry(state.sessions?.[sessionId]);
      const setChanged = !previous || previous.fingerprint !== fingerprint;
      const turns = setChanged ? 1 : previous.turns + 1;
      const deliver = (turns - 1) % Math.max(1, refreshEveryTurns) === 0;
      const now = nowIso();
      const sessions = { ...(state.sessions || {}), [sessionId]: { turns, fingerprint, updatedAt: now } };
      writeJsonAtomic(statePath, { version: 1, sessions: pruneSessions(sessions, now) }, dataDir);
      return { deliver, turns, skipReason: deliver ? null : "cadence" };
    });
  } catch {
    // Read, lock, or write failure: deliver and repair on the next turn.
    return { deliver: true, turns: null, skipReason: null };
  }
}

function readBaselineState(statePath: string): BaselineStateFile {
  try {
    const parsed = readJson<Record<string, any> | null>(statePath, null);
    const rawSessions = parsed && typeof parsed === "object" && parsed.sessions && typeof parsed.sessions === "object"
      ? parsed.sessions as Record<string, unknown>
      : {};
    const sessions: NonNullable<BaselineStateFile["sessions"]> = {};
    for (const [key, value] of Object.entries(rawSessions)) {
      const entry = normalizeSessionEntry(value);
      if (entry) sessions[key] = entry;
    }
    return { version: 1, sessions };
  } catch {
    return { version: 1, sessions: {} };
  }
}

// Hand-edited or corrupted state is treated as missing, which delivers.
function normalizeSessionEntry(value: unknown): { turns: number; fingerprint: string; updatedAt: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const turns = record.turns;
  if (typeof turns !== "number" || !Number.isSafeInteger(turns) || turns < 0) return null;
  if (typeof record.fingerprint !== "string" || !record.fingerprint) return null;
  return {
    turns,
    fingerprint: record.fingerprint,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

function pruneSessions(
  sessions: NonNullable<BaselineStateFile["sessions"]>,
  now: string,
  retainDays = 30,
) {
  const cutoff = new Date(now).getTime() - retainDays * 24 * 60 * 60 * 1000;
  return Object.fromEntries(Object.entries(sessions).filter(([, value]) => {
    const updated = new Date(value?.updatedAt || 0).getTime();
    return Number.isFinite(updated) && updated >= cutoff;
  }));
}

function libraryOrder(scope: string | undefined): number {
  return scope === "project" ? 0 : 1;
}

export function setBaselineFlag(dataDir: string, id: string, value: boolean): { ok: true; id: string; baseline: boolean } {
  const file = ["active", "draft", "archived"]
    .map((status) => path.join(layout(dataDir).experiences, status, `${id}.md`))
    .find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error(`card not found: ${id}`);
  const card = readCardFile(file);
  if (card.status !== "active") throw new Error(`baseline requires an active card: ${id} is ${card.status}`);
  const updated = updateCard(dataDir, id, { baseline: value });
  return { ok: true, id: updated.id, baseline: updated.baseline };
}

export function baselineStatus(
  libraries: ExperienceLibrary[],
  options: BaselineOptions,
) {
  // Budget accounting must use the same membership rules as delivery, otherwise
  // a recall-off card or a duplicated id reports a budget that never exists.
  const entries = libraries.filter((library) => library.readable).flatMap((library) => readLibraryCards(library));
  const members = resolveBaselineMembers(entries);
  const rows = members.map((card) => ({
    id: card.id,
    title: card.title,
    libraryScope: card.libraryScope,
    chars: renderBaselineCardBlock(card).length,
    appliesTo: card.appliesTo,
  }));
  const perSetChars: Record<string, number> = {};
  let totalChars = 0;
  for (const row of rows) {
    perSetChars[row.libraryScope] = (perSetChars[row.libraryScope] || 0) + row.chars;
    totalChars += row.chars;
  }
  const rendered = renderBaselineContext(members, options);
  return {
    ok: true,
    enabled: options.enabled,
    refreshEveryTurns: options.refreshEveryTurns,
    budgets: { maxChars: options.maxChars, setMaxChars: options.setMaxChars },
    totalChars,
    perSetChars,
    cards: rows,
    oversized: rows
      .filter((row) => row.chars > options.setMaxChars || row.chars > options.maxChars)
      .map((row) => row.id),
    neverDelivered: rendered.omittedCardIds,
  };
}
