import { listCards } from "./cards.js";
import { loadConfig } from "./config.js";
import { HOOK_TELEMETRY_SCHEMA_VERSION, StatsReportSchema } from "./schema.js";
import {
  RETRIEVAL_ENGINE_VERSION,
  RETRIEVAL_SCORER_VERSION,
} from "./retrieval-contract.js";
import { appendJsonl, hashText, layout, nowIso, readJsonl } from "./storage.js";

type TelemetryRecord = Record<string, any>;
type TelemetryCard = { id: string; libraryScope?: "global" | "project" };

interface MetricView {
  eventCount: number;
  matchedEventCount: number;
  renderedEventCount: number;
  matchRate: number;
  renderRate: number;
  noHitRate: number;
  cardRecallCount: Record<string, number>;
  cardRenderedCount: Record<string, number>;
}

export function generateStats(dataDir: string, { persist = false }: { persist?: boolean } = {}) {
  const events = readJsonl<TelemetryRecord>(layout(dataDir).hookLog)
    .filter((event) => event.kind === "hook" || Array.isArray(event.matchedCards));
  const activeCards = listCards(dataDir, "active");
  const activeGlobalIds = new Set(activeCards.map((card) => card.id));
  const globalCardSetFingerprint = buildCardSetFingerprint(activeCards);
  const configFingerprint = buildRetrievalConfigFingerprint(loadConfig(dataDir).retrieval);
  const currentEvents = events.filter((event) =>
    event.schemaVersion === HOOK_TELEMETRY_SCHEMA_VERSION
    && event.engineVersion === RETRIEVAL_ENGINE_VERSION
    && event.scorerVersion === RETRIEVAL_SCORER_VERSION
    && event.globalCardSetFingerprint === globalCardSetFingerprint
    && event.configFingerprint === configFingerprint
  );

  const current = summarizeEvents(currentEvents, {
    seedCardIds: activeGlobalIds,
    // The comparable snapshot is intentionally global-only. Project libraries
    // vary by cwd and remain available in the cumulative event view.
    includeCard: (card) => card.libraryScope !== "project" && activeGlobalIds.has(card.id),
  });
  const cumulative = summarizeEvents(events);
  const staleCards = current.eventCount
    ? Array.from(activeGlobalIds).filter((id) => (current.cardRecallCount[id] || 0) === 0)
    : [];
  const report = StatsReportSchema.parse({
    generatedAt: nowIso(),
    view: "current-snapshot",
    currentSnapshot: {
      schemaVersion: HOOK_TELEMETRY_SCHEMA_VERSION,
      engineVersion: RETRIEVAL_ENGINE_VERSION,
      scorerVersion: RETRIEVAL_SCORER_VERSION,
      globalCardSetFingerprint,
      configFingerprint,
      activeGlobalCardCount: activeCards.length,
    },
    current,
    cumulative,
    excludedEventCount: events.length - currentEvents.length,
    // Compatibility fields now intentionally reflect the clean current view.
    coverageRate: current.matchRate,
    injectionRate: current.renderRate,
    renderRate: current.renderRate,
    cardRecallCount: current.cardRecallCount,
    cardRenderedCount: current.cardRenderedCount,
    noHitRate: current.noHitRate,
    staleCards,
    maintenanceActions: buildActions(staleCards, events.length, current),
  });
  if (persist) {
    appendJsonl(layout(dataDir).events, { kind: "stats", report, createdAt: nowIso() }, dataDir);
  }
  return report;
}

export function buildCardSetFingerprint(cards: Array<Record<string, any>>): string {
  const snapshot = cards.map((card) => ({
    libraryScope: card.libraryScope || "global",
    id: String(card.id || ""),
    status: String(card.status || ""),
    title: String(card.title || ""),
    summary: String(card.summary || ""),
    triggers: sortedStrings(card.triggers),
    negativeTriggers: sortedStrings(card.negativeTriggers),
    aliases: normalizeAliases(card.aliases),
    topics: sortedStrings(card.topics),
    applicability: card.applicability || {},
    intentModes: card.intentModes || {},
    requiredSignals: sortedStrings(card.requiredSignals),
    requiredAllSignals: sortedStrings(card.requiredAllSignals),
    blockedSignals: sortedStrings(card.blockedSignals),
    language: String(card.language || "auto"),
    recallPolicy: String(card.recallPolicy || "should"),
    risk: String(card.risk || "medium"),
    confidence: String(card.confidence || "medium"),
  })).sort((left, right) =>
    left.libraryScope.localeCompare(right.libraryScope) || left.id.localeCompare(right.id)
  );
  return buildTelemetryFingerprint(snapshot);
}

export function buildRetrievalConfigFingerprint(retrieval: Record<string, any>): string {
  return buildTelemetryFingerprint({
    maxCards: retrieval.maxCards,
    minScore: retrieval.minScore,
    additionalContextMaxChars: retrieval.additionalContextMaxChars,
    hookTimeoutMs: retrieval.hookTimeoutMs,
  });
}

export function buildTelemetryFingerprint(value: unknown): string {
  return hashText(JSON.stringify(stableValue(value)));
}

function summarizeEvents(
  events: TelemetryRecord[],
  options: {
    seedCardIds?: Set<string>;
    includeCard?: (card: TelemetryCard) => boolean;
  } = {},
): MetricView {
  const cardRecallCount: Record<string, number> = {};
  const cardRenderedCount: Record<string, number> = {};
  for (const id of options.seedCardIds || []) {
    cardRecallCount[id] = 0;
    cardRenderedCount[id] = 0;
  }
  let matchedEventCount = 0;
  let renderedEventCount = 0;
  for (const event of events) {
    const cards = selectedCards(event).filter((card) => options.includeCard?.(card) ?? true);
    const selectedIds = new Set(cards.map((card) => card.id));
    if (cards.length) matchedEventCount += 1;
    for (const card of cards) {
      cardRecallCount[card.id] = (cardRecallCount[card.id] || 0) + 1;
    }
    const renderedIds = renderedCardIds(event, cards).filter((id) => selectedIds.has(id));
    if (renderedIds.length) renderedEventCount += 1;
    for (const id of new Set(renderedIds)) {
      cardRenderedCount[id] = (cardRenderedCount[id] || 0) + 1;
    }
  }
  const eventCount = events.length;
  return {
    eventCount,
    matchedEventCount,
    renderedEventCount,
    matchRate: eventCount ? matchedEventCount / eventCount : 0,
    renderRate: eventCount ? renderedEventCount / eventCount : 0,
    noHitRate: eventCount ? (eventCount - matchedEventCount) / eventCount : 0,
    cardRecallCount,
    cardRenderedCount,
  };
}

function selectedCards(event: TelemetryRecord): TelemetryCard[] {
  const stageCards = event.selectionStage?.cards;
  const source = Array.isArray(stageCards) && event.schemaVersion >= 2
    ? stageCards
    : event.matchedCards;
  return Array.isArray(source)
    ? source
      .filter((card) => card && typeof card.id === "string")
      .map((card) => ({ id: card.id, libraryScope: card.libraryScope || "global" }))
    : [];
}

function renderedCardIds(event: TelemetryRecord, cards: TelemetryCard[]): string[] {
  if (event.schemaVersion >= 2 && Array.isArray(event.renderedCardIds)) {
    return event.renderedCardIds.filter((id: unknown): id is string => typeof id === "string");
  }
  return event.injected ? cards.map((card) => card.id) : [];
}

function buildActions(staleCards: string[], cumulativeTotal: number, current: MetricView): string[] {
  const actions: string[] = [];
  if (!cumulativeTotal) actions.push("No hook events yet. Run recall simulation or install the hook.");
  if (cumulativeTotal && !current.eventCount) {
    actions.push("No events match the current telemetry, engine, scorer, card-set, and retrieval-config snapshot yet.");
  }
  if (current.eventCount && current.matchedEventCount === 0) {
    actions.push("No prompts matched cards in the current snapshot. Review criteria and missing experience coverage.");
  }
  if (staleCards.length) actions.push(`Review stale cards in the current snapshot: ${staleCards.join(", ")}`);
  return actions;
}

function sortedStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function normalizeAliases(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, aliases]) => [key, sortedStrings(aliases)]));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, stableValue(child)]));
}
