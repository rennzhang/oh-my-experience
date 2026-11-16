import fs from "node:fs";
import path from "node:path";
import { readCardFile, updateCard, type CardIndexEntry } from "./cards.js";
import { readLibraryCards, type ExperienceLibrary, type LibraryStack } from "./library-stack.js";
import {
  DEFAULT_BASELINE_MAX_CHARS,
  DEFAULT_BASELINE_REFRESH_TURNS,
  DEFAULT_BASELINE_SET_MAX_CHARS,
} from "./retrieval-contract.js";
import { hashText, layout, nowIso, readJson, writeJsonAtomic } from "./storage.js";

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
  const cards = new Map<string, BaselineCard>();
  for (const entry of entries) {
    if (!entry.baseline) continue;
    const scope = entry.libraryScope || "global";
    const existing = cards.get(entry.id);
    if (existing && existing.libraryScope === "project") continue;
    const file = entry.libraryPath ? path.join(entry.libraryPath, entry.path) : entry.path;
    try {
      const card = readCardFile(file);
      if (card.status !== "active" || card.recallPolicy === "off") continue;
      cards.set(card.id, {
        id: card.id,
        title: card.title,
        rule: card.rule,
        appliesTo: card.appliesTo,
        libraryScope: scope,
      });
    } catch {
      // An unreadable baseline card must not take down recall; `ome doctor`
      // reports the schema error separately.
      stack.warnings.push(`failed to read baseline card ${entry.id} in ${scope} library`);
    }
  }
  return [...cards.values()].sort((left, right) =>
    libraryOrder(left.libraryScope) - libraryOrder(right.libraryScope)
    || left.id.localeCompare(right.id)
  );
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
// or unwritable, deliver now. Never suppress baseline delivery because state
// bookkeeping failed.
function baselineCadence(
  dataDir: string,
  sessionId: string,
  fingerprint: string,
  refreshEveryTurns: number,
): { deliver: boolean; turns: number; skipReason: string | null } {
  const statePath = layout(dataDir).baselineState;
  const state = readBaselineState(statePath);
  const previous = state.sessions?.[sessionId];
  const setChanged = !previous || previous.fingerprint !== fingerprint;
  const turns = setChanged ? 1 : (previous?.turns || 0) + 1;
  const deliver = (turns - 1) % Math.max(1, refreshEveryTurns) === 0;
  try {
    const now = nowIso();
    const sessions = { ...(state.sessions || {}) };
    sessions[sessionId] = { turns, fingerprint, updatedAt: now };
    writeJsonAtomic(statePath, { version: 1, sessions: pruneSessions(sessions, now) }, dataDir);
  } catch {
    // Ignore: delivery is already decided, and the next turn may succeed.
  }
  return { deliver, turns, skipReason: deliver ? null : "cadence" };
}

function readBaselineState(statePath: string): BaselineStateFile {
  try {
    const parsed = readJson<BaselineStateFile | null>(statePath, null);
    if (!parsed || typeof parsed !== "object" || !parsed.sessions || typeof parsed.sessions !== "object") {
      return { version: 1, sessions: {} };
    }
    return parsed;
  } catch {
    return { version: 1, sessions: {} };
  }
}

function pruneSessions(
  sessions: Record<string, { turns: number; fingerprint: string; updatedAt: string }>,
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
  const rows: Array<{ id: string; title: string; libraryScope: string; chars: number; appliesTo: string[] }> = [];
  let totalChars = 0;
  const perSetChars: Record<string, number> = {};
  for (const library of libraries) {
    if (!library.readable) continue;
    for (const entry of readLibraryCards(library)) {
      if (!entry.baseline) continue;
      const file = path.isAbsolute(entry.path) ? entry.path : path.join(library.dataDir, entry.path);
      const card = readCardFile(file);
      if (card.status !== "active") continue;
      const chars = renderBaselineCardBlock({
        id: card.id,
        title: card.title,
        rule: card.rule,
        appliesTo: card.appliesTo,
        libraryScope: library.scope,
      }).length;
      rows.push({ id: card.id, title: card.title, libraryScope: library.scope, chars, appliesTo: card.appliesTo });
      perSetChars[library.scope] = (perSetChars[library.scope] || 0) + chars;
      totalChars += chars;
    }
  }
  return {
    ok: true,
    enabled: options.enabled,
    refreshEveryTurns: options.refreshEveryTurns,
    budgets: { maxChars: options.maxChars, setMaxChars: options.setMaxChars },
    totalChars,
    perSetChars,
    cards: rows.sort((left, right) =>
      libraryOrder(left.libraryScope) - libraryOrder(right.libraryScope)
      || left.id.localeCompare(right.id)
    ),
    oversized: rows
      .filter((row) => row.chars > options.setMaxChars || row.chars > options.maxChars)
      .map((row) => row.id),
    neverDelivered: rows.length > 0 && totalChars > options.maxChars,
  };
}
