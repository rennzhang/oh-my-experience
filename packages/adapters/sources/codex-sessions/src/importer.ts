import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { SessionRecordSchema, type SessionRecord } from "../../../../core/src/schema.js";
import { writeSessionRecords } from "../../../../core/src/sessions.js";
import { nowIso } from "../../../../core/src/storage.js";

const USER_VISIBLE_ROLES = new Set(["user", "assistant", "tool"]);

type JsonRecord = Record<string, any>;
type ImportWarning = { file: string; line?: number; warning: string };

export function scanCodexSessions(dataDir: string, sessionsDir: string) {
  if (!sessionsDir || !fs.existsSync(sessionsDir)) {
    throw new Error(`Codex sessions directory not found: ${sessionsDir}`);
  }
  const files = collectJsonl(sessionsDir);
  const indexed: string[] = [];
  const records: SessionRecord[] = [];
  const failed: Array<{ file: string; error: string }> = [];
  const warnings: ImportWarning[] = [];
  for (const file of files) {
    try {
      const session = parseCodexSession(file, { warnings });
      records.push(session);
      indexed.push(session.id);
    } catch (error) {
      failed.push({ file, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (records.length) writeSessionRecords(dataDir, records);
  return { ok: failed.length === 0, provider: "codex", indexed, skipped: [] as string[], failed, warnings };
}

export function parseCodexSession(filePath: string, { warnings = [] }: { warnings?: ImportWarning[] } = {}): SessionRecord {
  const messages: Array<{ role: string; text: string; createdAt: string | null }> = [];
  const metadata = crypto.createHash("sha256");
  let cwd = null;
  let startedAt = null;
  metadata.update(`${path.resolve(filePath)}:${fs.statSync(filePath).size}:`);
  let lineNumber = 0;
  for (const line of readLinesSync(filePath)) {
    lineNumber += 1;
    let event: JsonRecord;
    try {
      event = JSON.parse(line);
    } catch (error: any) {
      warnings.push({ file: filePath, line: lineNumber, warning: `invalid JSONL line skipped: ${error.message}` });
      continue;
    }
    const text = extractText(event);
    if (text) {
      const role = extractRole(event);
      if (!USER_VISIBLE_ROLES.has(role)) {
        warnings.push({ file: filePath, line: lineNumber, warning: `skipped non-user-visible Codex message role: ${role}` });
        continue;
      }
      metadata.update(`${role}\0${text}\n`);
      messages.push({
        role,
        text: "",
        createdAt: event.timestamp || event.created_at || null,
      });
    }
    cwd ||= event.cwd || event.working_directory || event.current_dir || null;
    startedAt ||= event.timestamp || event.created_at || null;
  }
  if (messages.length === 0) warnings.push({ file: filePath, warning: "no user-visible messages parsed" });
  const source = path.resolve(filePath);
  const metadataHash = metadata.digest("hex");
  return SessionRecordSchema.parse({
    id: crypto.createHash("sha1").update(metadataHash).digest("hex").slice(0, 16),
    provider: "codex",
    sourcePath: source,
    startedAt: startedAt || nowIso(),
    cwd,
    summary: "",
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

function* readLinesSync(filePath: string): Generator<string> {
  const fd = fs.openSync(filePath, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let remainder = "";
  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const text = remainder + decoder.write(buffer.subarray(0, bytesRead));
      const lines = text.split(/\r?\n/);
      remainder = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) yield line;
      }
    }
    const tail = remainder + decoder.end();
    if (tail.trim()) yield tail;
  } finally {
    fs.closeSync(fd);
  }
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
