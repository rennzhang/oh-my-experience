import fs from "node:fs";
import crypto from "node:crypto";
import {
  appendJsonl,
  defaultDataDir,
  hashText,
  layout,
  nowIso,
} from "../../core/src/storage.js";
import { loadConfig } from "../../core/src/config.js";
import {
  readLibraryStackCards,
  resolveLibraryStack,
} from "../../core/src/library-stack.js";
import {
  buildQueryVariants,
  buildTaskEnvelope,
  type TaskEnvelope,
} from "../../core/src/matcher.js";
import { sanitizeProjectContext } from "../../core/src/project-context.js";
import {
  matchCardEntriesDetailed,
  renderAdditionalContext,
  type RetrievalCandidateDiagnostic,
} from "../../core/src/retrieval.js";
import { HOOK_TELEMETRY_SCHEMA_VERSION } from "../../core/src/schema.js";
import {
  RETRIEVAL_ENGINE_VERSION,
  RETRIEVAL_SCORER_VERSION,
} from "../../core/src/retrieval-contract.js";
import {
  buildCardSetFingerprint,
  buildRetrievalConfigFingerprint,
  buildTelemetryFingerprint,
} from "../../core/src/stats.js";

type HookPayload = Record<string, any>;

export async function runHook({ dataDir = defaultDataDir(), input = null }: { dataDir?: string; input?: HookPayload | null } = {}) {
  const started = Date.now();
  let payload = input;
  let rawPrompt = "";
  let saveRawPrompt = false;
  try {
    if (!payload) payload = JSON.parse(await readStdin());
    const normalized = normalizeHookPayload(payload || {});
    const prompt = normalized.prompt || "";
    rawPrompt = prompt;
    if (!prompt) return successOutput("");
    if (isOmeMaintenancePrompt(prompt)) return successOutput("");
    const config = loadConfig(dataDir);
    saveRawPrompt = config.privacy.saveRawPrompt;
    const stack = resolveLibraryStack(dataDir, normalized.cwd || process.cwd());
    const projectContext = stack.projectContext;
    const envelope = buildTaskEnvelope(prompt);
    const queryVariants = buildQueryVariants(prompt);
    const cards = safeReadLibraryStackCards(stack);
    const retrieval = matchCardEntriesDetailed(cards, prompt, {
      limit: config.retrieval.maxCards,
      threshold: config.retrieval.minScore,
      timeoutMs: config.retrieval.hookTimeoutMs,
      failOpenOnTimeout: true,
      projectContext,
    });
    const matches = retrieval.matches;
    const additionalContext = renderAdditionalContext(matches, {
      maxChars: config.retrieval.additionalContextMaxChars,
    });
    const selectedCards = matches.map((match) => scoredCardTelemetry(match));
    const renderedCardIds = detectRenderedCardIds(matches, additionalContext);
    const cardSetFingerprint = buildCardSetFingerprint(cards);
    const globalCardSetFingerprint = buildCardSetFingerprint(
      cards.filter((card) => (card.libraryScope || "global") === "global"),
    );
    const configFingerprint = buildRetrievalConfigFingerprint(config.retrieval);
    const event = {
      id: crypto.randomUUID(),
      kind: "hook",
      schemaVersion: HOOK_TELEMETRY_SCHEMA_VERSION,
      engineVersion: RETRIEVAL_ENGINE_VERSION,
      scorerVersion: RETRIEVAL_SCORER_VERSION,
      libraryFingerprint: buildTelemetryFingerprint({
        cardSetFingerprint,
        libraries: stack.libraries.map((library) => ({
          scope: library.scope,
          exists: library.exists,
          readable: library.readable,
        })),
      }),
      cardSetFingerprint,
      globalCardSetFingerprint,
      configFingerprint,
      provider: normalized.provider,
      event: normalized.event,
      sessionId: normalized.sessionId,
      turnId: normalized.turnId,
      promptHash: crypto.createHash("sha256").update(prompt).digest("hex"),
      ...(saveRawPrompt ? { rawPrompt: prompt } : {}),
      taskEnvelope: sanitizeEnvelope(envelope),
      projectContext: sanitizeProjectContext(projectContext),
      libraries: stack.libraries.map((library) => ({
        scope: library.scope,
        exists: library.exists,
        readable: library.readable,
        warningCount: library.warnings.length,
        warningHashes: library.warnings.map((warning) => hashText(warning)),
        warningMessages: library.warnings.map((warning) => sanitizeLibraryWarning(warning, library.dataDir)).slice(0, 3),
      })),
      queryVariants: queryVariants.map((variant) => hashText(variant)),
      candidateStage: {
        available: true,
        complete: retrieval.diagnostics.complete,
        count: retrieval.diagnostics.evaluatedCardCount,
        truncated: retrieval.diagnostics.candidateListTruncated,
        unavailableReason: null,
        cards: retrieval.diagnostics.candidates.map(candidateTelemetry),
      },
      selectionStage: {
        selectedCardIds: selectedCards.map((card) => card.id),
        cards: selectedCards,
      },
      matchedCards: selectedCards,
      matched: selectedCards.length > 0,
      renderedCardIds,
      rendered: renderedCardIds.length > 0,
      contextTruncated: renderedCardIds.length < selectedCards.length,
      deliveryStatus: "unknown",
      // Compatibility only: this never means the host or model consumed it.
      injected: renderedCardIds.length > 0,
      durationMs: Date.now() - started,
      budgetUsedChars: additionalContext.length,
      error: null as string | null,
      createdAt: nowIso(),
    };
    try {
      appendJsonl(layout(dataDir).hookLog, event, dataDir);
    } catch {
      // Hook must fail open if logging is unavailable.
    }
    return successOutput(additionalContext);
  } catch (error) {
    try {
      appendJsonl(layout(dataDir).hookLog, {
        id: crypto.randomUUID(),
        kind: "hook",
        schemaVersion: HOOK_TELEMETRY_SCHEMA_VERSION,
        engineVersion: RETRIEVAL_ENGINE_VERSION,
        scorerVersion: RETRIEVAL_SCORER_VERSION,
        libraryFingerprint: null,
        cardSetFingerprint: null,
        globalCardSetFingerprint: null,
        configFingerprint: null,
        provider: "unknown",
        event: "prompt.submit",
        sessionId: null,
        turnId: null,
        promptHash: "",
        ...(saveRawPrompt && rawPrompt ? { rawPrompt } : {}),
        taskEnvelope: {},
        projectContext: { source: "none" },
        libraries: [],
        queryVariants: [],
        candidateStage: {
          available: false,
          complete: false,
          count: null,
          truncated: false,
          unavailableReason: "hook-failed-before-candidate-telemetry",
          cards: [],
        },
        selectionStage: { selectedCardIds: [], cards: [] },
        matchedCards: [],
        matched: false,
        renderedCardIds: [],
        rendered: false,
        contextTruncated: false,
        deliveryStatus: "unknown",
        injected: false,
        durationMs: Date.now() - started,
        budgetUsedChars: 0,
        error: error instanceof Error ? error.message : String(error),
        createdAt: nowIso(),
      }, dataDir);
    } catch {
      // ignore logging errors
    }
    return successOutput("");
  }
}

function candidateTelemetry(candidate: RetrievalCandidateDiagnostic) {
  return {
    id: candidate.id,
    libraryScope: candidate.libraryScope,
    score: candidate.score,
    rawScore: candidate.rawScore,
    rankScore: candidate.rankScore,
    postSelectionScore: candidate.postSelectionScore,
    priorityScore: candidate.priorityScore,
    evidenceFamilies: candidate.evidenceFamilies,
    strongAnchor: candidate.strongAnchor,
    eligible: candidate.eligible,
    selected: candidate.selected,
    rejectionReason: candidate.rejectionReason,
    reasons: candidate.reasons,
  };
}

function scoredCardTelemetry(match: ReturnType<typeof matchCardEntriesDetailed>["matches"][number]) {
  return {
    id: match.card.id,
    libraryScope: match.card.libraryScope || "global",
    score: match.score,
    rawScore: match.rawScore,
    rankScore: match.rankScore,
    postSelectionScore: match.postSelectionScore,
    priorityScore: match.priorityScore,
    evidenceFamilies: match.evidenceFamilies,
    strongAnchor: match.strongAnchor,
    eligible: true,
    selected: true,
    rejectionReason: null,
    reasons: match.reasons,
  };
}

function detectRenderedCardIds(
  matches: ReturnType<typeof matchCardEntriesDetailed>["matches"],
  additionalContext: string,
): string[] {
  if (!additionalContext) return [];
  return matches
    .filter((match) => additionalContext.includes(`ome experience show ${match.card.id} `))
    .map((match) => match.card.id);
}

function sanitizeLibraryWarning(warning: string, dataDir: string): string {
  return warning.replaceAll(dataDir, "$OME_LIBRARY").slice(0, 300);
}

function safeReadLibraryStackCards(stack: ReturnType<typeof resolveLibraryStack>) {
  try {
    return readLibraryStackCards(stack);
  } catch {
    return readLibraryStackCards({
      ...stack,
      libraries: stack.libraries.filter((library) => library.scope === "global"),
      warnings: stack.warnings,
    });
  }
}

function isOmeMaintenancePrompt(prompt: string): boolean {
  const command = /^(?:(?:please|请|帮我)\s*)?(?:(?:run|execute|运行|执行)\s*)?[`$>\s]*(?:(?:npx\s+)?(?:ome|oh-my-experience)\s+(?:init|uninstall|source|doctor|config|experience|hook|project|reflect)|retrospective\s+run)\b/i;
  return prompt.split(/\r?\n/).some((line) => command.test(line.trim()));
}

export function normalizeHookPayload(payload: HookPayload = {}) {
  const eventName = payload.hook_event_name || payload.hookEventName || payload.event || "UserPromptSubmit";
  const provider = payload.provider || inferProvider(payload);
  return {
    provider,
    event: eventName === "Stop" ? "agent.stop" : "prompt.submit",
    prompt: payload.prompt || payload.userPrompt || payload.input || payload.user_prompt || "",
    sessionId: payload.session_id || payload.sessionId || payload.session?.id || null,
    turnId: payload.turn_id || payload.turnId || payload.turn?.id || null,
    cwd: payload.cwd || payload.working_directory || null,
  };
}

function sanitizeEnvelope(envelope: TaskEnvelope) {
  return {
    summaryHash: hashText(envelope.summary || ""),
    taskTypes: envelope.taskTypes || [],
    files: (envelope.files || []).map((file) => hashText(file)),
    commands: (envelope.commands || []).map((command) => hashText(command)),
    risks: (envelope.risks || []).map((risk) => hashText(risk)),
    surfaces: (envelope.surfaces || []).map((surface) => hashText(surface)),
    keywords: (envelope.keywords || []).map((keyword) => hashText(keyword)),
    length: envelope.length || 0,
  };
}

function successOutput(additionalContext: string) {
  if (!additionalContext) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  };
}

function inferProvider(payload: HookPayload): string {
  if (payload.transcript_path || payload.hook_event_name) return "claude";
  if (payload.session_id || payload.turn_id) return "codex";
  return "unknown";
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data || "{}"));
    process.stdin.on("error", reject);
  });
}
