import { spawnSync } from "node:child_process";
import { SessionRecordSchema, type SessionRecord } from "../../../../core/src/schema.js";
import { writeSessionRecords } from "../../../../core/src/sessions.js";
import { hashText, nowIso } from "../../../../core/src/storage.js";

const USER_VISIBLE_ROLES = new Set(["user", "assistant", "tool"]);

type JsonRecord = Record<string, any>;
type ParsedMessage = { role: string; text: string; createdAt: string | null };
type SpoolOptions = {
  limit?: number;
  source?: string;
  project?: string;
  query?: string;
  since?: string;
  maxSessionBytes?: number;
};
class SpoolSessionTooLargeError extends Error {
  constructor(readonly uuid: string, readonly maxBytes: number) {
    super(`spool show output exceeded ${maxBytes} bytes for ${uuid}; use a narrower query or inspect the session manually`);
    this.name = "SpoolSessionTooLargeError";
  }
}

export function checkSpool() {
  const result = spawnSync("spool", ["--version"], { encoding: "utf8" });
  if (result.error) {
    return {
      available: false,
      message: "Spool is not installed. Install the official Spool CLI to enable optional multi-session source scanning.",
    };
  }
  return {
    available: result.status === 0,
    version: (result.stdout || result.stderr || "").trim(),
    message: result.status === 0 ? "Spool is available." : "Spool command failed.",
  };
}

export function scanSpoolSessions(dataDir: string, options: SpoolOptions = {}) {
  const status = checkSpool();
  if (!status.available) {
    return {
      ok: false,
      indexed: [] as string[],
      skipped: [] as Array<{ reason: string; item: JsonRecord }>,
      failed: [] as Array<{ uuid: string; error: string }>,
      warnings: [status.message],
    };
  }
  const list = loadSpoolList(options);
  const indexed: string[] = [];
  const records: SessionRecord[] = [];
  const skipped: Array<{ reason: string; item: JsonRecord }> = [];
  const failed: Array<{ uuid: string; error: string }> = [];
  const maxSessionBytes = options.maxSessionBytes ?? 2 * 1024 * 1024;
  for (const item of list) {
    const uuid = item.sessionUuid || item.uuid || item.id;
    if (!uuid) {
      skipped.push({ reason: "missing session uuid", item });
      continue;
    }
    try {
      const record = parseSpoolSession(showSpoolSession(String(uuid), maxSessionBytes));
      records.push(record);
      indexed.push(record.id);
    } catch (error) {
      if (error instanceof SpoolSessionTooLargeError) skipped.push({ reason: error.message, item });
      else failed.push({ uuid, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (records.length) writeSessionRecords(dataDir, records);
  return { ok: failed.length === 0, provider: "spool", indexed, skipped, failed, warnings: [] as string[] };
}

function loadSpoolList(options: SpoolOptions): JsonRecord[] {
  const args = options.query ? ["search", options.query] : ["list"];
  args.push("--json");
  if (options.limit) args.push("-n", String(options.limit));
  if (options.source) args.push("-s", String(options.source));
  if (!options.query && options.project) args.push("-p", String(options.project));
  if (options.query && options.since) args.push("--since", String(options.since));
  const result = spawnSync("spool", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "spool list failed").trim());
  const parsed = JSON.parse(result.stdout || "[]");
  return Array.isArray(parsed) ? parsed : parsed.results || parsed.sessions || [];
}

function showSpoolSession(uuid: string, maxSessionBytes: number): JsonRecord {
  const result = spawnSync("spool", ["show", uuid, "--json"], { encoding: "utf8", maxBuffer: maxSessionBytes });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOBUFS") throw new SpoolSessionTooLargeError(uuid, maxSessionBytes);
  if (result.status !== 0) {
    const output = (result.stderr || result.stdout || `spool show failed: ${uuid}`).trim();
    if (/maxBuffer|ENOBUFS|stdout maxBuffer length exceeded/i.test(output)) throw new SpoolSessionTooLargeError(uuid, maxSessionBytes);
    throw new Error(output);
  }
  return JSON.parse(result.stdout || "{}");
}

function parseSpoolSession(raw: JsonRecord): SessionRecord {
  const session = raw.session || raw;
  const messages: ParsedMessage[] = (raw.messages || session.messages || [])
    .map((message: JsonRecord) => ({
      role: String(message.role || "user"),
      text: String(message.contentText || message.text || message.content || ""),
      createdAt: message.createdAt || message.timestamp || null,
    }))
    .filter((message: ParsedMessage) => message.text && USER_VISIBLE_ROLES.has(message.role));
  const sourcePath = session.filePath || session.sourcePath || "";
  const metadataHash = hashText(`${session.sessionUuid || session.uuid || session.id}:${sourcePath}:${messages.map((message) => message.text).join("\n")}`);
  return SessionRecordSchema.parse({
    id: String(session.sessionUuid || session.uuid || hashText(metadataHash).slice(0, 16)),
    provider: `spool:${session.source || "unknown"}`,
    sourcePath,
    startedAt: session.startedAt || session.createdAt || nowIso(),
    cwd: session.cwd || session.projectDisplayPath || null,
    summary: "",
    messages: messages.map((message) => ({ ...message, text: "" })),
    metadataHash,
  });
}
