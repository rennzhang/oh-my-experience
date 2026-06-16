import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { nowIso } from "./storage.js";

export type UserIndexProvider = "codex" | "claude" | "spool" | string;

export type UserIndexSourceInput = {
  provider: UserIndexProvider;
  root: string;
};

export type UserIndexMessage = {
  id: string;
  provider: UserIndexProvider;
  sessionId: string;
  sourcePath: string;
  line: number;
  role: "user";
  text: string;
  createdAt: string | null;
  cwd: string | null;
};

export type UserIndexSourceReport = {
  provider: UserIndexProvider;
  root: string;
  files: number;
  messages: number;
  failed: Array<{ file: string; error: string }>;
  warnings: string[];
};

export type UserMessageIndex = {
  version: 1;
  createdAt: string;
  ephemeral: true;
  sources: UserIndexSourceReport[];
  messages: UserIndexMessage[];
};

export type UserIndexSearchHit = Omit<UserIndexMessage, "text"> & {
  snippet: string;
  score: number;
};

type VisibleMessage = {
  id?: string;
  provider: UserIndexProvider;
  sessionId: string;
  sourcePath: string;
  line: number;
  role: string;
  text: string;
  createdAt: string | null;
  cwd: string | null;
};

type JsonRecord = Record<string, any>;

const CONTEXT_ROLES = new Set(["user", "assistant", "tool"]);
const AGENTS_BLOCK_RE = /# AGENTS\.md instructions for[\s\S]*?(?:<\/environment_context>|<\/INSTRUCTIONS>)/g;
const XML_CONTEXT_BLOCK_RE = /<(?:environment_context|skills_instructions|plugins_instructions|collaboration_mode)>[\s\S]*?<\/(?:environment_context|skills_instructions|plugins_instructions|collaboration_mode)>/g;

export function buildUserMessageIndex(sources: UserIndexSourceInput[]): UserMessageIndex {
  const sourceReports: UserIndexSourceReport[] = [];
  const messages: UserIndexMessage[] = [];
  for (const source of sources) {
    const report: UserIndexSourceReport = {
      provider: source.provider,
      root: path.resolve(source.root),
      files: 0,
      messages: 0,
      failed: [],
      warnings: [],
    };
    if (!fs.existsSync(report.root)) {
      report.warnings.push(`source root not found: ${report.root}`);
      sourceReports.push(report);
      continue;
    }
    for (const file of collectJsonl(report.root)) {
      report.files += 1;
      try {
        const parsed = parseVisibleMessages(source.provider, file);
        const userMessages = parsed.filter((message): message is UserIndexMessage => message.role === "user");
        messages.push(...userMessages);
        report.messages += userMessages.length;
      } catch (error) {
        report.failed.push({ file, error: error instanceof Error ? error.message : String(error) });
      }
    }
    sourceReports.push(report);
  }
  return {
    version: 1,
    createdAt: nowIso(),
    ephemeral: true,
    sources: sourceReports,
    messages: messages.sort(compareMessages),
  };
}

export function writeUserMessageIndex(index: UserMessageIndex, outputPath: string) {
  ensurePrivateDir(path.dirname(outputPath));
  const tmp = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writePrivateFile(tmp, `${JSON.stringify(index, null, 2)}\n`);
    fs.renameSync(tmp, outputPath);
    fs.chmodSync(outputPath, 0o600);
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
  return {
    ok: true,
    indexPath: outputPath,
    ephemeral: true,
    messages: index.messages.length,
    sources: index.sources,
  };
}

export function readUserMessageIndex(indexPath: string): UserMessageIndex {
  const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return {
    version: 1,
    createdAt: String(parsed.createdAt || ""),
    ephemeral: true,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages.map(normalizeIndexMessage).filter(Boolean) : [],
  };
}

export function searchUserMessageIndex(index: UserMessageIndex, query: string, options: { limit?: number; provider?: string } = {}): UserIndexSearchHit[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const limit = Math.max(1, Number(options.limit || 20));
  const provider = options.provider ? String(options.provider) : "";
  return index.messages
    .filter((message) => !provider || message.provider === provider)
    .map((message) => {
      const haystack = normalizeSearchText(message.text);
      const score = scoreMessage(haystack, normalizedQuery, terms);
      return { message, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || compareMessages(left.message, right.message))
    .slice(0, limit)
    .map(({ message, score }) => ({
      id: message.id,
      provider: message.provider,
      sessionId: message.sessionId,
      sourcePath: message.sourcePath,
      line: message.line,
      role: message.role,
      createdAt: message.createdAt,
      cwd: message.cwd,
      snippet: snippetForQuery(message.text, query),
      score,
    }));
}

export function showUserIndexContext(index: UserMessageIndex, hitId: string, options: { context?: number; maxChars?: number } = {}) {
  const hit = index.messages.find((message) => message.id === hitId);
  if (!hit) throw new Error(`user-index hit not found: ${hitId}`);
  const context = Math.max(0, Number(options.context ?? 4));
  const maxChars = Math.max(100, Number(options.maxChars ?? 4000));
  const messages = parseVisibleMessages(hit.provider, hit.sourcePath);
  const hitIndex = messages.findIndex((message) => message.line === hit.line && message.role === "user");
  if (hitIndex === -1) {
    throw new Error(`user-index hit no longer matches source context: ${hitId}`);
  }
  const start = Math.max(0, hitIndex - context);
  const end = Math.min(messages.length, hitIndex + context + 1);
  return {
    ok: true,
    hit,
    context: messages.slice(start, end).map((message) => ({
      ...message,
      text: truncate(message.text, maxChars),
      isHit: message.line === hit.line && message.role === "user",
    })),
  };
}

export function parseVisibleMessages(provider: UserIndexProvider, filePath: string): VisibleMessage[] {
  const messages: VisibleMessage[] = [];
  const sessionId = sessionIdForFile(provider, filePath);
  let lastCwd: string | null = null;
  let lineNumber = 0;
  for (const line of readLinesSync(filePath)) {
    lineNumber += 1;
    let event: JsonRecord;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const role = normalizeRole(extractRole(event));
    const text = role === "user" ? cleanUserText(extractText(event)) : extractText(event).trim();
    const eventCwd = event.cwd || event.working_directory || event.current_dir || event.session?.cwd || event.message?.cwd || null;
    const cwd: string | null = eventCwd ? String(eventCwd) : lastCwd;
    lastCwd = cwd;
    if (!text || !CONTEXT_ROLES.has(role)) continue;
    const base = {
      provider,
      sessionId,
      sourcePath: path.resolve(filePath),
      line: lineNumber,
      role,
      text,
      createdAt: event.timestamp || event.created_at || event.createdAt || event.message?.createdAt || null,
      cwd,
    };
    if (role === "user") {
      messages.push({
        ...base,
        id: hashHitId(provider, filePath, lineNumber, text),
        role: "user",
      });
    } else {
      messages.push(base);
    }
  }
  return messages;
}

function normalizeIndexMessage(value: unknown): UserIndexMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as JsonRecord;
  const text = String(record.text || "").trim();
  if (!text) return null;
  return {
    id: String(record.id || hashHitId(record.provider || "unknown", record.sourcePath || "", Number(record.line || 0), text)),
    provider: String(record.provider || "unknown"),
    sessionId: String(record.sessionId || ""),
    sourcePath: String(record.sourcePath || ""),
    line: Number(record.line || 0),
    role: "user",
    text,
    createdAt: record.createdAt ? String(record.createdAt) : null,
    cwd: record.cwd ? String(record.cwd) : null,
  };
}

function collectJsonl(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectJsonl(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
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

function extractRole(event: JsonRecord): string {
  return event.role
    || event.item?.role
    || event.payload?.item?.role
    || event.payload?.message?.role
    || event.message?.role
    || event.payload?.role
    || (["user", "assistant", "tool"].includes(String(event.type || "")) ? event.type : "")
    || "unknown";
}

function normalizeRole(role: unknown): string {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "human") return "user";
  if (normalized === "ai") return "assistant";
  return normalized;
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
  for (const key of ["text", "content", "message", "summary", "output_text", "contentText", "arguments", "input", "tool_input", "toolInput", "parameters"]) {
    if (typeof record[key] === "string") parts.push(record[key]);
    else collectText(record[key], parts);
  }
}

function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Some filesystems do not support chmod; file-level 0600 still applies below.
  }
}

function writePrivateFile(filePath: string, content: string): void {
  const fd = fs.openSync(filePath, "w", 0o600);
  try {
    fs.writeFileSync(fd, content, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function cleanUserText(raw: string): string {
  return raw
    .replace(AGENTS_BLOCK_RE, "")
    .replace(XML_CONTEXT_BLOCK_RE, "")
    .trim();
}

function sessionIdForFile(provider: UserIndexProvider, filePath: string): string {
  const base = path.basename(filePath).replace(/\.jsonl$/i, "");
  if (base && base !== "session") return base;
  return `${provider}-${crypto.createHash("sha1").update(path.resolve(filePath)).digest("hex").slice(0, 16)}`;
}

function hashHitId(provider: UserIndexProvider, filePath: string, line: number, text: string): string {
  return crypto.createHash("sha1").update(`${provider}\0${path.resolve(filePath)}\0${line}\0${text}`).digest("hex").slice(0, 16);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreMessage(haystack: string, query: string, terms: string[]): number {
  if (!haystack) return 0;
  if (haystack.includes(query)) return 100 + query.length;
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  return matchedTerms.length === terms.length ? 10 + matchedTerms.join("").length : 0;
}

function snippetForQuery(text: string, query: string): string {
  const lower = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  const index = needle ? lower.indexOf(needle) : -1;
  if (index === -1) return truncate(text, 240);
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + needle.length + 120);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function compareMessages(left: Pick<UserIndexMessage, "createdAt" | "sourcePath" | "line">, right: Pick<UserIndexMessage, "createdAt" | "sourcePath" | "line">): number {
  const leftTime = left.createdAt || "";
  const rightTime = right.createdAt || "";
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
  if (left.sourcePath !== right.sourcePath) return left.sourcePath.localeCompare(right.sourcePath);
  return left.line - right.line;
}
