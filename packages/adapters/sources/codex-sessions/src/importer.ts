import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SessionRecordSchema, type SessionRecord } from "../../../../core/src/schema.js";
import { writeSessionRecords } from "../../../../core/src/sessions.js";
import { hashText, nowIso } from "../../../../core/src/storage.js";

const USER_VISIBLE_ROLES = new Set(["user", "assistant", "tool"]);

type JsonRecord = Record<string, any>;
type ImportWarning = { file: string; line?: number; warning: string };

export function importCodexSessions(dataDir: string, sessionsDir: string) {
  if (!sessionsDir || !fs.existsSync(sessionsDir)) {
    throw new Error(`Codex sessions directory not found: ${sessionsDir}`);
  }
  const files = collectJsonl(sessionsDir);
  const imported: string[] = [];
  const records: SessionRecord[] = [];
  const failed: Array<{ file: string; error: string }> = [];
  const warnings: ImportWarning[] = [];
  for (const file of files) {
    try {
      const session = parseCodexSession(file, { warnings });
      records.push(session);
      imported.push(session.id);
    } catch (error) {
      failed.push({ file, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (records.length) writeSessionRecords(dataDir, records);
  return { ok: failed.length === 0, provider: "codex", imported, skipped: [] as string[], failed, warnings };
}

export function parseCodexSession(filePath: string, { warnings = [] }: { warnings?: ImportWarning[] } = {}): SessionRecord {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const messages: Array<{ role: string; text: string; createdAt: string | null }> = [];
  let cwd = null;
  let startedAt = null;
  for (const [index, line] of lines.entries()) {
    let event: JsonRecord;
    try {
      event = JSON.parse(line);
    } catch (error: any) {
      warnings.push({ file: filePath, line: index + 1, warning: `invalid JSONL line skipped: ${error.message}` });
      continue;
    }
    const text = extractText(event);
    if (text) {
      const role = extractRole(event);
      if (!USER_VISIBLE_ROLES.has(role)) {
        warnings.push({ file: filePath, line: index + 1, warning: `skipped non-user-visible Codex message role: ${role}` });
        continue;
      }
      messages.push({
        role,
        text,
        createdAt: event.timestamp || event.created_at || null,
      });
    }
    cwd ||= event.cwd || event.working_directory || event.current_dir || null;
    startedAt ||= event.timestamp || event.created_at || null;
  }
  if (messages.length === 0) warnings.push({ file: filePath, warning: "no user-visible messages parsed" });
  const source = path.resolve(filePath);
  const metadataHash = hashText(`${source}:${fs.statSync(filePath).size}:${messages.map((message) => message.text).join("\n")}`);
  return SessionRecordSchema.parse({
    id: crypto.createHash("sha1").update(metadataHash).digest("hex").slice(0, 16),
    provider: "codex",
    sourcePath: source,
    startedAt: startedAt || nowIso(),
    cwd,
    summary: messages.slice(0, 3).map((message) => message.text).join(" ").slice(0, 280),
    messages,
    metadataHash,
  });
}

function collectJsonl(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectJsonl(fullPath));
    else if (entry.name.endsWith(".jsonl")) files.push(fullPath);
  }
  return files;
}

function extractText(event: JsonRecord): string {
  return firstText([
    event.item,
    event.item?.content,
    event.payload?.item,
    event.payload?.message,
    event.payload?.content,
    event.message,
    event.message?.content,
    event.content,
    event.text,
    event.payload,
  ]);
}

function extractRole(event: JsonRecord): string {
  return event.role
    || event.item?.role
    || event.payload?.item?.role
    || event.payload?.message?.role
    || event.message?.role
    || event.payload?.role
    || "unknown";
}

function firstText(values: unknown[]): string {
  const parts: string[] = [];
  for (const value of values) collectText(value, parts);
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join("\n\n");
}

function collectText(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, parts);
    return;
  }
  const record = value as JsonRecord;
  for (const key of ["text", "content", "message", "summary", "output_text"]) {
    if (typeof record[key] === "string") parts.push(record[key]);
    else collectText(record[key], parts);
  }
}
