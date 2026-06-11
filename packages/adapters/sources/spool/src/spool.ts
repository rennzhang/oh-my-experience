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
};

export function checkSpool() {
  const result = spawnSync("spool", ["--version"], { encoding: "utf8" });
  if (result.error) {
    return {
      available: false,
      message: "Spool is not installed. Install the official Spool CLI to enable optional multi-session import.",
    };
  }
  return {
    available: result.status === 0,
    version: (result.stdout || result.stderr || "").trim(),
    message: result.status === 0 ? "Spool is available." : "Spool command failed.",
  };
}

export function importSpoolSessions(dataDir: string, options: SpoolOptions = {}) {
  const status = checkSpool();
  if (!status.available) {
    return {
      ok: false,
      imported: [] as string[],
      skipped: [] as Array<{ reason: string; item: JsonRecord }>,
      failed: [] as Array<{ uuid: string; error: string }>,
      warnings: [status.message],
    };
  }
  const list = loadSpoolList(options);
  const imported: string[] = [];
  const records: SessionRecord[] = [];
  const skipped: Array<{ reason: string; item: JsonRecord }> = [];
  const failed: Array<{ uuid: string; error: string }> = [];
  for (const item of list) {
    const uuid = item.sessionUuid || item.uuid || item.id;
    if (!uuid) {
      skipped.push({ reason: "missing session uuid", item });
      continue;
    }
    try {
      const record = parseSpoolSession(showSpoolSession(String(uuid)));
      records.push(record);
      imported.push(record.id);
    } catch (error) {
      failed.push({ uuid, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (records.length) writeSessionRecords(dataDir, records);
  return { ok: failed.length === 0, provider: "spool", imported, skipped, failed, warnings: [] as string[] };
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

function showSpoolSession(uuid: string): JsonRecord {
  const result = spawnSync("spool", ["show", uuid, "--json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `spool show failed: ${uuid}`).trim());
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
    summary: String(session.title || messages.slice(0, 2).map((message) => message.text).join(" ")).slice(0, 280),
    messages,
    metadataHash,
  });
}
