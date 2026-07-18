export type SignalPolarity = "positive" | "negative";
export type SignalSource = "generic" | "pack";

export interface RuleSignal {
  id: string;
  polarity: SignalPolarity;
  weight: number;
  reason: string;
}

export interface SignalDefinition extends RuleSignal {
  routing: boolean;
  negativeTargets: readonly string[];
  patterns: readonly RegExp[];
  source: SignalSource;
  pack: string | null;
  queryTerms: readonly string[];
  suppressTargets: boolean;
}

export interface SignalValidationResult {
  ok: boolean;
  known: string[];
  unknown: string[];
}

export type SignalInput = Omit<SignalDefinition, "negativeTargets" | "pack" | "queryTerms" | "suppressTargets"> & {
  negativeTargets?: readonly string[];
  pack?: string | null;
  queryTerms?: readonly string[];
  suppressTargets?: boolean;
};

export function defineSignal(input: SignalInput): Readonly<SignalDefinition> {
  return Object.freeze({
    ...input,
    negativeTargets: Object.freeze([...(input.negativeTargets || [])]),
    patterns: Object.freeze([...input.patterns]),
    pack: input.pack || null,
    queryTerms: Object.freeze([...(input.queryTerms || [])]),
    suppressTargets: Boolean(input.suppressTargets),
  });
}
