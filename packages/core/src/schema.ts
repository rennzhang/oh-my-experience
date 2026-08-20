import { z } from "zod";
import { INTENT_MODES } from "./intent-rules.js";
import {
  DEFAULT_ADDITIONAL_CONTEXT_MAX_CHARS,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_RETRIEVAL_THRESHOLD,
} from "./retrieval-contract.js";

export const CardStatusSchema = z.enum(["draft", "active", "archived"]);
export const RecallPolicySchema = z.enum(["must", "should", "summary", "off"]);
export const RiskSchema = z.enum(["low", "medium", "high"]);
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export const IntentModeSchema = z.enum(INTENT_MODES);
export const DecisionActionSchema = z.enum(["approve", "reject", "merge", "rewrite"]);
export const DEFAULT_CATEGORY = "未分类";
export const ApplicabilityLevelSchema = z.enum(["global", "project", "project-family"]);
export const SourceCoverageSchema = z.enum(["all-accessible", "bounded", "user-provided", "manual", "unknown"]);
export const SourceAdapterSchema = z.enum(["codex-sessions", "spool", "manual", "ome-starter", "unknown"]);
export const AgentOriginSchema = z.enum(["codex", "claude", "cursor", "gemini", "opencode", "unknown"]);
export const SourceRefTypeSchema = z.enum(["session", "turn", "file", "retrospective", "starter", "manual"]);

export const HOOK_TELEMETRY_SCHEMA_VERSION = 2;

export const ProjectContextSchema = z.object({
  cwd: z.string().nullable().default(null),
  root: z.string().nullable().default(null),
  projectKey: z.string().nullable().default(null),
  modulePath: z.string().nullable().default(null),
  packageName: z.string().nullable().default(null),
  source: z.enum(["git", "package", "path", "none"]).default("none"),
}).default({});

export const ApplicabilitySchema = z.object({
  level: ApplicabilityLevelSchema.default("global"),
  projectKey: z.string().nullable().default(null),
  modulePath: z.string().nullable().default(null),
  confidence: ConfidenceSchema.default("medium"),
  rationale: z.string().default(""),
}).default({});

export const IntentModeGateSchema = z.object({
  include: z.array(IntentModeSchema).default([]),
  exclude: z.array(IntentModeSchema).default([]),
}).default({});

export const ConfigSchema = z.object({
  version: z.literal(1),
  dataDir: z.string().min(1),
  privacy: z.object({
    saveRawPrompt: z.boolean().default(false),
  }),
  retrieval: z.object({
    maxCards: z.number().int().positive().default(DEFAULT_RETRIEVAL_LIMIT),
    minScore: z.number().min(0).max(100).default(DEFAULT_RETRIEVAL_THRESHOLD),
    additionalContextMaxChars: z.number().int().positive().default(DEFAULT_ADDITIONAL_CONTEXT_MAX_CHARS),
    hookTimeoutMs: z.number().int().positive().default(DEFAULT_HOOK_TIMEOUT_MS),
  }).default({}),
  hooks: z.object({
    providers: z.object({
      codex: z.object({
        enabled: z.boolean().default(false),
      }).default({}),
      claude: z.object({
        enabled: z.boolean().default(false),
      }).default({}),
      cursor: z.object({
        enabled: z.boolean().default(false),
      }).default({}),
    }).default({}),
  }).default({}),
  codex: z.object({
    sessionsDir: z.string().nullable().default(null),
  }),
  sessions: z.object({
    store: z.enum(["pointer", "recent", "full"]).default("pointer"),
    retainDays: z.number().int().positive().default(30),
    keepAppliedEvidence: z.boolean().default(true),
  }).default({}),
  sources: z.object({
    spool: z.object({
      mode: z.enum(["off", "ask", "enabled"]).default("off"),
    }).default({}),
  }).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OriginSchema = z.object({
  adapter: SourceAdapterSchema.default("unknown"),
  agent: AgentOriginSchema.default("unknown"),
  model: z.string().nullable().default(null),
  sessionId: z.string().nullable().default(null),
  projectKey: z.string().nullable().default(null),
  createdBy: z.enum(["retrospective", "starter", "manual", "import"]).default("manual"),
}).default({});

export const SourceRefSchema = z.object({
  type: SourceRefTypeSchema,
  ref: z.string().min(1),
  hash: z.string().optional(),
  label: z.string().optional(),
});

export const ExperienceCardSchema = z.object({
  id: z.string().min(1).refine((value) => !/[\\/]/.test(value), "card id must not contain path separators"),
  status: CardStatusSchema,
  title: z.string().min(1),
  category: z.string().trim().min(1).default(DEFAULT_CATEGORY),
  summary: z.string().min(1),
  rule: z.string().min(1),
  triggers: z.array(z.string()).default([]),
  negativeTriggers: z.array(z.string()).default([]),
  aliases: z.record(z.array(z.string())).default({}),
  topics: z.array(z.string()).default([]),
  applicability: ApplicabilitySchema,
  intentModes: IntentModeGateSchema,
  requiredSignals: z.array(z.string()).default([]),
  requiredAllSignals: z.array(z.string()).default([]),
  blockedSignals: z.array(z.string()).default([]),
  language: z.enum(["auto", "en", "zh", "mixed"]).default("auto"),
  recallPolicy: RecallPolicySchema.default("should"),
  risk: RiskSchema.default("medium"),
  confidence: ConfidenceSchema.default("medium"),
  staleAfter: z.string().nullable().default(null),
  sources: z.array(z.string()).default([]),
  origin: OriginSchema,
  sourceRefs: z.array(SourceRefSchema).default([]),
  body: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedReason: z.string().optional(),
});

export const RetrospectiveCandidateSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().trim().min(1).default(DEFAULT_CATEGORY),
  summary: z.string().min(1),
  rule: z.string().min(1),
  triggers: z.array(z.string()).default([]),
  negativeTriggers: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  applicability: ApplicabilitySchema,
  intentModes: IntentModeGateSchema,
  requiredSignals: z.array(z.string()).default([]),
  requiredAllSignals: z.array(z.string()).default([]),
  blockedSignals: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  origin: OriginSchema,
  sourceRefs: z.array(SourceRefSchema).default([]),
  conflicts: z.array(z.string()).default([]),
  risk: RiskSchema.default("medium"),
  recallPolicy: RecallPolicySchema.default("should"),
});

export const RetrospectiveAuditSchema = z.object({
  scope: z.enum(["focused", "broad", "all-history", "manual", "unknown"]).default("unknown"),
  focusLens: z.string().default(""),
  sourceCoverage: SourceCoverageSchema.default("unknown"),
  nativeSourcesCovered: z.array(z.string()).default([]),
  userOnlyIndexBuilt: z.boolean().default(false),
  queryFamilies: z.array(z.string()).default([]),
  contextReplaySamples: z.array(z.string()).default([]),
  spoolSupplement: z.enum(["unknown", "unavailable", "skipped", "used"]).default("unknown"),
  searchedSources: z.array(z.string()).default([]),
  unavailableSources: z.array(z.string()).default([]),
  noiseFilters: z.array(z.string()).default([]),
  evidenceClusters: z.array(z.string()).default([]),
  userCorrections: z.array(z.string()).default([]),
  rejectedInterpretations: z.array(z.string()).default([]),
  activeCardOverlapQa: z.string().default(""),
  remainingEvidenceGaps: z.array(z.string()).default([]),
  incomplete: z.boolean().default(false),
  incompleteReason: z.string().default(""),
}).default({});

export const RetrospectiveDecisionSchema = z.object({
  candidateId: z.string().min(1),
  action: DecisionActionSchema,
  reason: z.string().default(""),
  rewrite: z.record(z.unknown()).optional(),
  targetCardId: z.string().optional(),
  createdAt: z.string(),
});

export const SessionRecordSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  sourcePath: z.string(),
  startedAt: z.string().nullable().default(null),
  cwd: z.string().nullable().default(null),
  summary: z.string().default(""),
  messages: z.array(z.object({
    role: z.string().default("unknown"),
    text: z.string().default(""),
    createdAt: z.string().nullable().default(null),
  })).default([]),
  metadataHash: z.string(),
});

export const SessionIndexRecordSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  sourcePath: z.string(),
  startedAt: z.string().nullable().default(null),
  cwd: z.string().nullable().default(null),
  summary: z.string().default(""),
  metadataHash: z.string(),
  messageCount: z.number().int().nonnegative().default(0),
  sessionFile: z.string().default(""),
  materialized: z.boolean().default(false),
});

const HookMatchReasonSchema = z.union([
  z.string(),
  z.object({
    field: z.string(),
    term: z.string(),
    weight: z.number(),
    kind: z.string(),
  }),
]);

const HookScoredCardSchema = z.object({
  id: z.string(),
  libraryScope: z.enum(["global", "project"]).default("global"),
  score: z.number().optional(),
  rawScore: z.number().nullable().default(null),
  rankScore: z.number().nullable().default(null),
  postSelectionScore: z.number().nullable().default(null),
  priorityScore: z.number().nullable().default(null),
  evidenceFamilies: z.array(z.string()).default([]),
  strongAnchor: z.boolean().default(false),
  eligible: z.boolean().default(false),
  selected: z.boolean().default(false),
  rejectionReason: z.string().nullable().default(null),
  reasons: z.array(HookMatchReasonSchema).default([]),
});

const HookCandidateStageSchema = z.object({
  available: z.boolean().default(false),
  complete: z.boolean().default(false),
  count: z.number().int().nonnegative().nullable().default(null),
  truncated: z.boolean().default(false),
  unavailableReason: z.string().nullable().default(null),
  cards: z.array(HookScoredCardSchema).default([]),
}).default({});

const HookSelectionStageSchema = z.object({
  selectedCardIds: z.array(z.string()).default([]),
  cards: z.array(HookScoredCardSchema).default([]),
}).default({});

export const HookEventSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("hook").default("hook"),
  schemaVersion: z.number().int().positive().default(1),
  engineVersion: z.string().default("legacy-unknown"),
  scorerVersion: z.string().default("legacy-unknown"),
  libraryFingerprint: z.string().nullable().default(null),
  cardSetFingerprint: z.string().nullable().default(null),
  globalCardSetFingerprint: z.string().nullable().default(null),
  configFingerprint: z.string().nullable().default(null),
  provider: z.string().default("unknown"),
  event: z.string().default("prompt.submit"),
  sessionId: z.string().nullable().default(null),
  turnId: z.string().nullable().default(null),
  promptHash: z.string(),
  rawPrompt: z.string().optional(),
  taskEnvelope: z.record(z.unknown()),
  projectContext: z.record(z.unknown()).default({}),
  libraries: z.array(z.record(z.unknown())).default([]),
  queryVariants: z.array(z.string()).default([]),
  candidateStage: HookCandidateStageSchema,
  selectionStage: HookSelectionStageSchema,
  matchedCards: z.array(HookScoredCardSchema).default([]),
  matched: z.boolean().default(false),
  renderedCardIds: z.array(z.string()).default([]),
  rendered: z.boolean().default(false),
  contextTruncated: z.boolean().default(false),
  deliveryStatus: z.enum(["unknown"]).default("unknown"),
  // Deprecated compatibility alias. It means context was rendered, not that a
  // host or model consumed it.
  injected: z.boolean().default(false),
  durationMs: z.number(),
  budgetUsedChars: z.number().default(0),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
});

const StatsMetricViewSchema = z.object({
  eventCount: z.number().int().nonnegative(),
  matchedEventCount: z.number().int().nonnegative(),
  renderedEventCount: z.number().int().nonnegative(),
  matchRate: z.number(),
  renderRate: z.number(),
  noHitRate: z.number(),
  cardRecallCount: z.record(z.number()),
  cardRenderedCount: z.record(z.number()),
}).default({
  eventCount: 0,
  matchedEventCount: 0,
  renderedEventCount: 0,
  matchRate: 0,
  renderRate: 0,
  noHitRate: 0,
  cardRecallCount: {},
  cardRenderedCount: {},
});

export const StatsReportSchema = z.object({
  generatedAt: z.string(),
  view: z.literal("current-snapshot").default("current-snapshot"),
  currentSnapshot: z.object({
    schemaVersion: z.number().int().positive(),
    engineVersion: z.string(),
    scorerVersion: z.string(),
    globalCardSetFingerprint: z.string(),
    configFingerprint: z.string(),
    activeGlobalCardCount: z.number().int().nonnegative(),
  }).default({
    schemaVersion: 1,
    engineVersion: "legacy-unknown",
    scorerVersion: "legacy-unknown",
    globalCardSetFingerprint: "",
    configFingerprint: "",
    activeGlobalCardCount: 0,
  }),
  current: StatsMetricViewSchema,
  cumulative: StatsMetricViewSchema,
  excludedEventCount: z.number().int().nonnegative().default(0),
  coverageRate: z.number(),
  injectionRate: z.number(),
  renderRate: z.number().default(0),
  cardRecallCount: z.record(z.number()),
  cardRenderedCount: z.record(z.number()).default({}),
  noHitRate: z.number(),
  staleCards: z.array(z.string()),
  maintenanceActions: z.array(z.string()),
});

export const CategoryRecordSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  source: z.enum(["manual", "card"]).default("manual"),
  count: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CardStatus = z.infer<typeof CardStatusSchema>;
export type RecallPolicy = z.infer<typeof RecallPolicySchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type ProjectContext = z.infer<typeof ProjectContextSchema>;
export type Applicability = z.infer<typeof ApplicabilitySchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Origin = z.infer<typeof OriginSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type ExperienceCard = z.infer<typeof ExperienceCardSchema>;
export type RetrospectiveCandidate = z.infer<typeof RetrospectiveCandidateSchema>;
export type RetrospectiveAudit = z.infer<typeof RetrospectiveAuditSchema>;
export type RetrospectiveDecision = z.infer<typeof RetrospectiveDecisionSchema>;
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type SessionIndexRecord = z.infer<typeof SessionIndexRecordSchema>;
export type HookEvent = z.infer<typeof HookEventSchema>;
export type StatsReport = z.infer<typeof StatsReportSchema>;
export type CategoryRecord = z.infer<typeof CategoryRecordSchema>;
