import { listCards } from "./cards.js";
import { StatsReportSchema } from "./schema.js";
import { appendJsonl, layout, nowIso, readJsonl } from "./storage.js";

export function generateStats(dataDir: string, { persist = false }: { persist?: boolean } = {}) {
  const events = readJsonl<Record<string, any>>(layout(dataDir).hookLog)
    .filter((event) => event.kind === "hook" || Array.isArray(event.matchedCards));
  const activeCards = listCards(dataDir, "active");
  const total = events.length;
  const covered = events.filter((event) => (event.matchedCards || []).length > 0).length;
  const injected = events.filter((event) => event.injected).length;
  const cardRecallCount: Record<string, number> = {};
  for (const card of activeCards) cardRecallCount[card.id] = 0;
  for (const event of events) {
    for (const card of event.matchedCards || []) {
      cardRecallCount[card.id] = (cardRecallCount[card.id] || 0) + 1;
    }
  }
  const staleCards = total ? Object.entries(cardRecallCount)
    .filter(([, count]) => count === 0)
    .map(([id]) => id) : [];
  const report = StatsReportSchema.parse({
    generatedAt: nowIso(),
    coverageRate: total ? covered / total : 0,
    injectionRate: total ? injected / total : 0,
    cardRecallCount,
    noHitRate: total ? (total - covered) / total : 0,
    staleCards,
    maintenanceActions: buildActions(staleCards, total, covered),
  });
  if (persist) {
    appendJsonl(layout(dataDir).events, { kind: "stats", report, createdAt: nowIso() }, dataDir);
  }
  return report;
}

function buildActions(staleCards: string[], total: number, covered: number): string[] {
  const actions: string[] = [];
  if (!total) actions.push("No hook events yet. Run recall simulation or install the hook.");
  if (total && covered === 0) actions.push("No prompts matched active cards. Review triggers and create missing candidates.");
  if (staleCards.length) actions.push(`Review stale cards: ${staleCards.join(", ")}`);
  return actions;
}
