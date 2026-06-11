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
  buildQueryVariants,
  buildTaskEnvelope,
  type TaskEnvelope,
} from "../../core/src/matcher.js";
import { detectProjectContext, sanitizeProjectContext } from "../../core/src/project-context.js";
import { matchCards, renderAdditionalContext } from "../../core/src/retrieval.js";

type HookPayload = Record<string, any>;

export async function runHook({ dataDir = defaultDataDir(), input = null }: { dataDir?: string; input?: HookPayload | null } = {}) {
  const started = Date.now();
  let payload = input;
  try {
    if (!payload) payload = JSON.parse(await readStdin());
    const normalized = normalizeHookPayload(payload || {});
    const prompt = normalized.prompt || "";
    if (!prompt) return successOutput("");
    if (isOmeMaintenancePrompt(prompt)) return successOutput("");
    const config = loadConfig(dataDir);
    const projectContext = detectProjectContext(normalized.cwd || process.cwd());
    const envelope = buildTaskEnvelope(prompt);
    const queryVariants = buildQueryVariants(prompt);
    const matches = matchCards(dataDir, prompt, {
      limit: config.retrieval.maxCards,
      threshold: config.retrieval.minScore,
      timeoutMs: config.retrieval.hookTimeoutMs,
      failOpenOnTimeout: true,
      projectContext,
    });
    const additionalContext = renderAdditionalContext(matches, {
      maxChars: config.retrieval.additionalContextMaxChars,
    });
    const event = {
      id: crypto.randomUUID(),
      kind: "hook",
      provider: normalized.provider,
      event: normalized.event,
      sessionId: normalized.sessionId,
      turnId: normalized.turnId,
      promptHash: crypto.createHash("sha256").update(prompt).digest("hex"),
      taskEnvelope: sanitizeEnvelope(envelope),
      projectContext: sanitizeProjectContext(projectContext),
      queryVariants: queryVariants.map((variant) => hashText(variant)),
      matchedCards: matches.map((match) => ({ id: match.card.id, score: match.score, reasons: match.reasons })),
      injected: Boolean(additionalContext),
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
        provider: "unknown",
        event: "prompt.submit",
        sessionId: null,
        turnId: null,
        promptHash: "",
        taskEnvelope: {},
        projectContext: { source: "none" },
        queryVariants: [],
        matchedCards: [],
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

function isOmeMaintenancePrompt(prompt: string): boolean {
  const text = prompt.toLowerCase();
  return [
    "oh-my-experience",
    "ome init",
    "ome create-reflect",
    "retrospective run",
    "ome import",
    "ome source",
    "ome starter",
    "ome doctor",
    "ome config",
    "ome experience",
    "ome hook",
    "experience library",
    "经验库",
    "复盘",
  ].some((needle) => text.includes(needle));
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
