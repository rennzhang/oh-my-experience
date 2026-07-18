import { buildTaskEnvelope } from "./matcher.js";
import type { ExperienceCard } from "./schema.js";
import { getSignalNegativeTargets } from "./signal-registry.js";

export type TriggerSignalContractViolationCode =
  | "required-signals-missing"
  | "required-all-signals-missing"
  | "blocked-signal-detected"
  | "targeted-negative-suppression";

export interface TriggerSignalContractViolation {
  code: TriggerSignalContractViolationCode;
  cardId: string;
  triggerIndex: number;
  trigger: string;
  configuredSignals: string[];
  observedPositiveSignals: string[];
  observedNegativeSignals: string[];
  missingSignals: string[];
  matchedSignals: string[];
  message: string;
  action: string;
}

export interface TriggerSignalContractResult {
  ok: boolean;
  cardId: string;
  checkedTriggers: number;
  violations: TriggerSignalContractViolation[];
}

export type TriggerSignalContractCard = Pick<
  ExperienceCard,
  "id" | "triggers" | "requiredSignals" | "requiredAllSignals" | "blockedSignals"
>;

/**
 * Validates only the deterministic signal contract declared by a card.
 * Lexical relevance and ranking remain the responsibility of isolated recall
 * evaluation, so promotion does not depend on the retrieval scorer.
 */
export function validateTriggerSignalContract(card: TriggerSignalContractCard): TriggerSignalContractResult {
  const requiredAny = unique(card.requiredSignals || []);
  const requiredAll = unique(card.requiredAllSignals || []);
  const blocked = unique(card.blockedSignals || []);
  const routedSignals = new Set([...requiredAny, ...requiredAll]);
  const violations: TriggerSignalContractViolation[] = [];

  for (const [triggerIndex, trigger] of (card.triggers || []).entries()) {
    const envelope = buildTaskEnvelope(trigger);
    const observedPositiveSignals = unique(envelope.ruleSignals
      .filter((signal) => signal.polarity === "positive")
      .map((signal) => signal.id));
    const observedNegativeSignals = unique(envelope.ruleSignals
      .filter((signal) => signal.polarity === "negative")
      .map((signal) => signal.id));
    const positiveSet = new Set(observedPositiveSignals);
    const observedSet = new Set(envelope.ruleSignals.map((signal) => signal.id));

    if (requiredAny.length && !requiredAny.some((signal) => positiveSet.has(signal))) {
      violations.push(violation({
        code: "required-signals-missing",
        cardId: card.id,
        triggerIndex,
        trigger,
        configuredSignals: requiredAny,
        observedPositiveSignals,
        observedNegativeSignals,
        missingSignals: requiredAny,
        matchedSignals: [],
        message: `trigger does not emit any configured requiredSignals: ${requiredAny.join(", ")}`,
        action: "Rewrite this positive trigger so buildTaskEnvelope emits at least one engine_hints.positive signal, or correct engine_hints.positive.",
      }));
    }

    const missingAll = requiredAll.filter((signal) => !positiveSet.has(signal));
    if (missingAll.length) {
      violations.push(violation({
        code: "required-all-signals-missing",
        cardId: card.id,
        triggerIndex,
        trigger,
        configuredSignals: requiredAll,
        observedPositiveSignals,
        observedNegativeSignals,
        missingSignals: missingAll,
        matchedSignals: requiredAll.filter((signal) => positiveSet.has(signal)),
        message: `trigger does not emit every configured requiredAllSignals; missing: ${missingAll.join(", ")}`,
        action: "Rewrite this positive trigger so buildTaskEnvelope emits every engine_hints.required_all signal, or correct engine_hints.required_all.",
      }));
    }

    const blockedHits = blocked.filter((signal) => observedSet.has(signal));
    if (blockedHits.length) {
      violations.push(violation({
        code: "blocked-signal-detected",
        cardId: card.id,
        triggerIndex,
        trigger,
        configuredSignals: blocked,
        observedPositiveSignals,
        observedNegativeSignals,
        missingSignals: [],
        matchedSignals: blockedHits,
        message: `positive trigger emits configured blockedSignals: ${blockedHits.join(", ")}`,
        action: "Remove the blocked wording from this positive trigger, or correct engine_hints.negative if the signal should not block recall.",
      }));
    }

    const targetedNegatives = observedNegativeSignals.filter((signal) =>
      getSignalNegativeTargets(signal).some((target) => routedSignals.has(target))
    );
    if (targetedNegatives.length) {
      violations.push(violation({
        code: "targeted-negative-suppression",
        cardId: card.id,
        triggerIndex,
        trigger,
        configuredSignals: [...routedSignals],
        observedPositiveSignals,
        observedNegativeSignals,
        missingSignals: [],
        matchedSignals: targetedNegatives,
        message: `positive trigger emits negative routing signals that suppress its configured route: ${targetedNegatives.join(", ")}`,
        action: "Rewrite the positive trigger to remove the negative/suppression condition; keep near-miss wording in criteria.ignore_when instead.",
      }));
    }
  }

  return {
    ok: violations.length === 0,
    cardId: card.id,
    checkedTriggers: card.triggers.length,
    violations,
  };
}

export class TriggerSignalContractError extends Error {
  readonly code = "OME_TRIGGER_SIGNAL_CONTRACT_INVALID";
  readonly details: TriggerSignalContractResult;

  constructor(result: TriggerSignalContractResult) {
    const preview = result.violations
      .slice(0, 3)
      .map((item) => `trigger[${item.triggerIndex}] ${item.code}: ${item.message} Action: ${item.action}`)
      .join("; ");
    const remainder = result.violations.length > 3 ? `; +${result.violations.length - 3} more violation(s)` : "";
    super(`draft card trigger signal contract invalid: ${result.cardId}: ${preview}${remainder}`);
    this.name = "TriggerSignalContractError";
    this.details = result;
  }
}

function violation(input: TriggerSignalContractViolation): TriggerSignalContractViolation {
  return {
    ...input,
    configuredSignals: [...input.configuredSignals],
    observedPositiveSignals: [...input.observedPositiveSignals],
    observedNegativeSignals: [...input.observedNegativeSignals],
    missingSignals: [...input.missingSignals],
    matchedSignals: [...input.matchedSignals],
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
