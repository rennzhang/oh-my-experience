// Closed vocabulary for "which step of the work does this card govern".
// It is an annotation axis, not a recall gate: `intentModes` answers what the
// user asked for, `appliesTo` answers when the agent should apply the lesson.
export const OPERATION_PHASES = ["inspect", "edit", "verify", "deliver", "communicate"] as const;

export type OperationPhase = (typeof OPERATION_PHASES)[number];

const PHASE_SET = new Set<string>(OPERATION_PHASES);

export function isKnownOperationPhase(value: unknown): value is OperationPhase {
  return typeof value === "string" && PHASE_SET.has(value);
}

// Tolerant on read: a hand-edited typo must not take down the whole library.
// `ome doctor` reports unknown values as errors, the same way it reports
// unknown signal ids.
export function normalizeOperationPhases(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;，；|]+/)
      : [];
  const phases: string[] = [];
  for (const item of raw) {
    const phase = String(item ?? "").trim().toLowerCase();
    if (!phase || phases.includes(phase)) continue;
    phases.push(phase);
  }
  return phases;
}

export function unknownOperationPhases(phases: readonly string[] | undefined): string[] {
  return (phases || []).map(String).filter((phase) => !isKnownOperationPhase(phase));
}

export function formatOperationPhases(phases: readonly string[] | undefined): string {
  return (phases || []).map(String).filter(Boolean).join(", ");
}
