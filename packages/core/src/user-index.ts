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

export type UserIndexNoiseCounts = {
  subagentRecords: number;
  toolResults: number;
  injectedContext: number;
  interruptionMarkers: number;
};

export type UserIndexSkippedSession = {
  file: string;
  reason: string;
};

export type UserIndexSourceReport = {
  provider: UserIndexProvider;
  root: string;
  files: number;
  messages: number;
  filtered: UserIndexNoiseCounts;
  skippedSessions: UserIndexSkippedSession[];
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
  noise?: string;
};

type JsonRecord = Record<string, any>;

const CONTEXT_ROLES = new Set(["user", "assistant", "tool"]);
const AGENTS_BLOCK_RE = /# AGENTS\.md instructions for[\s\S]*?(?:<\/environment_context>|<\/INSTRUCTIONS>)/g;
const INJECTED_BLOCK_TAGS = [
  "environment_context",
  "skills_instructions",
  "plugins_instructions",
  "collaboration_mode",
  "system-reminder",
  "workspace-context",
  "recommended_plugins",
  "heartbeat",
];
const XML_CONTEXT_BLOCK_RE = new RegExp(`<(?:${INJECTED_BLOCK_TAGS.join("|")})>[\\s\\S]*?</(?:${INJECTED_BLOCK_TAGS.join("|")})>`, "g");
const SESSION_META_PROBE_LINES = 5;

export function buildUserMessageIndex(sources: UserIndexSourceInput[]): UserMessageIndex {
  const sourceReports: UserIndexSourceReport[] = [];
  const messages: UserIndexMessage[] = [];
  for (const source of sources) {
    const report: UserIndexSourceReport = {
      provider: source.provider,
      root: path.resolve(source.root),
      files: 0,
      messages: 0,
      filtered: { subagentRecords: 0, toolResults: 0, injectedContext: 0, interruptionMarkers: 0 },
      skippedSessions: [],
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
        const exclusion = classifySessionExclusion(file);
        if (exclusion) {
          report.skippedSessions.push({ file, reason: exclusion });
          continue;
        }
        const parsed = parseSessionMessages(source.provider, file);
        const userMessages = parsed.messages.filter((message): message is UserIndexMessage => message.role === "user" && !message.noise);
        messages.push(...userMessages);
        report.messages += userMessages.length;
        report.filtered.subagentRecords += parsed.filtered.subagentRecords;
        report.filtered.toolResults += parsed.filtered.toolResults;
        report.filtered.injectedContext += parsed.filtered.injectedContext;
        report.filtered.interruptionMarkers += parsed.filtered.interruptionMarkers;
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

export type EvidenceCheckStatus = "verified" | "unverified" | "not-a-quote";

export type EvidenceCheck = {
  cardId: string;
  evidence: string;
  status: EvidenceCheckStatus;
  missingFragments: string[];
};

export type EvidenceCheckReport = {
  counts: Record<EvidenceCheckStatus, number>;
  checks: EvidenceCheck[];
};

// Evidence is authored as "[direct|codex] quote" and sometimes carries a nested
// role marker, a trailing note in parentheses, or several messages stitched with
// an ellipsis. Only the quoted fragments can be looked up in the corpus.
const EVIDENCE_TAG_PATTERN = /^\s*\[[^\]]*\]\s*/;
const EVIDENCE_TRAILING_NOTE_PATTERN = /[（(][^）)]*[）)]\s*$/;
const EVIDENCE_FRAGMENT_SEPARATOR = /……|\.\.\.|…|\s\/\s/;
const EVIDENCE_MIN_FRAGMENT_LENGTH = 6;

function normalizeEvidenceText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function evidenceFragments(evidence: string): { quoted: boolean; fragments: string[] } {
  let body = evidence;
  let quoted = true;
  while (EVIDENCE_TAG_PATTERN.test(body)) {
    const tag = EVIDENCE_TAG_PATTERN.exec(body)?.[0] || "";
    if (/signal/i.test(tag)) quoted = false;
    body = body.slice(tag.length);
  }
  if (!quoted) return { quoted: false, fragments: [] };
  const stripped = body.replace(EVIDENCE_TRAILING_NOTE_PATTERN, "").trim();
  const fragments = stripped
    .split(EVIDENCE_FRAGMENT_SEPARATOR)
    .map(normalizeEvidenceText)
    .filter((fragment) => fragment.length >= EVIDENCE_MIN_FRAGMENT_LENGTH);
  return { quoted: fragments.length > 0, fragments };
}

export function verifyEvidenceAgainstIndex(
  cards: Array<{ id: string; evidence: string[] }>,
  index: UserMessageIndex
): EvidenceCheckReport {
  const haystack = index.messages.map((message) => normalizeEvidenceText(message.text));
  const counts: Record<EvidenceCheckStatus, number> = { verified: 0, unverified: 0, "not-a-quote": 0 };
  const checks: EvidenceCheck[] = [];
  for (const card of cards) {
    for (const evidence of card.evidence || []) {
      const { quoted, fragments } = evidenceFragments(String(evidence));
      if (!quoted) {
        counts["not-a-quote"] += 1;
        checks.push({ cardId: card.id, evidence: String(evidence), status: "not-a-quote", missingFragments: [] });
        continue;
      }
      const missingFragments = fragments.filter((fragment) => !haystack.some((text) => text.includes(fragment)));
      const status: EvidenceCheckStatus = missingFragments.length ? "unverified" : "verified";
      counts[status] += 1;
      checks.push({ cardId: card.id, evidence: String(evidence), status, missingFragments });
    }
  }
  return { counts, checks };
}

export type UserIndexMarkerKind = "abort" | "tool_rejected" | "repeated_user_message";

export type UserIndexMarkerHit = {
  kind: UserIndexMarkerKind;
  provider: UserIndexProvider;
  sessionId: string;
  sourcePath: string;
  line: number;
  hitId: string;
  snippet: string;
};

const MARKER_PATTERNS: Array<{ kind: UserIndexMarkerKind; pattern: RegExp }> = [
  { kind: "abort", pattern: /turn_aborted|Request interrupted by user/ },
  { kind: "tool_rejected", pattern: /doesn't want to proceed with this tool use|does not want to proceed with this tool use/ },
];

export function findPainpointMarkers(index: UserMessageIndex, options: { provider?: string; limit?: number } = {}): {
  markers: UserIndexMarkerHit[];
  counts: Record<UserIndexMarkerKind, number>;
  sessionsScanned: number;
} {
  const provider = options.provider ? String(options.provider) : "";
  const messages = index.messages.filter((message) => !provider || message.provider === provider);
  const bySource = new Map<string, UserIndexMessage[]>();
  for (const message of messages) {
    const bucket = bySource.get(message.sourcePath);
    if (bucket) bucket.push(message);
    else bySource.set(message.sourcePath, [message]);
  }
  const markers: UserIndexMarkerHit[] = [];
  for (const [sourcePath, sessionMessages] of bySource) {
    const ordered = [...sessionMessages].sort((left, right) => left.line - right.line);
    markers.push(...repeatedMessageMarkers(ordered));
    markers.push(...transcriptMarkers(sourcePath, ordered));
  }
  markers.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.line - right.line);
  const counts: Record<UserIndexMarkerKind, number> = { abort: 0, tool_rejected: 0, repeated_user_message: 0 };
  for (const marker of markers) counts[marker.kind] += 1;
  const limit = options.limit ? Math.max(1, Number(options.limit)) : markers.length;
  return { markers: markers.slice(0, limit), counts, sessionsScanned: bySource.size };
}

function repeatedMessageMarkers(ordered: UserIndexMessage[]): UserIndexMarkerHit[] {
  const markers: UserIndexMarkerHit[] = [];
  for (let position = 1; position < ordered.length; position += 1) {
    const previous = normalizeSearchText(ordered[position - 1].text);
    const current = ordered[position];
    if (!previous || previous !== normalizeSearchText(current.text)) continue;
    markers.push({
      kind: "repeated_user_message",
      provider: current.provider,
      sessionId: current.sessionId,
      sourcePath: current.sourcePath,
      line: current.line,
      hitId: current.id,
      snippet: truncate(current.text, 240),
    });
  }
  return markers;
}

function transcriptMarkers(sourcePath: string, ordered: UserIndexMessage[]): UserIndexMarkerHit[] {
  if (!ordered.length || !fs.existsSync(sourcePath)) return [];
  const markers: UserIndexMarkerHit[] = [];
  let lineNumber = 0;
  for (const line of readLinesSync(sourcePath)) {
    lineNumber += 1;
    for (const { kind, pattern } of MARKER_PATTERNS) {
      if (!pattern.test(line)) continue;
      const anchor = nearestUserMessage(ordered, lineNumber);
      if (!anchor) continue;
      markers.push({
        kind,
        provider: anchor.provider,
        sessionId: anchor.sessionId,
        sourcePath,
        line: lineNumber,
        hitId: anchor.id,
        snippet: truncate(anchor.text, 240),
      });
    }
  }
  return markers;
}

function nearestUserMessage(ordered: UserIndexMessage[], line: number): UserIndexMessage | null {
  const following = ordered.find((message) => message.line > line);
  if (following) return following;
  return ordered[ordered.length - 1] || null;
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
  return parseSessionMessages(provider, filePath).messages;
}

export function parseSessionMessages(provider: UserIndexProvider, filePath: string): { messages: VisibleMessage[]; filtered: UserIndexNoiseCounts } {
  const messages: VisibleMessage[] = [];
  const filtered: UserIndexNoiseCounts = { subagentRecords: 0, toolResults: 0, injectedContext: 0, interruptionMarkers: 0 };
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
    const raw = extractText(event);
    const text = role === "user" ? cleanUserText(raw) : raw.trim();
    const eventCwd = event.cwd || event.working_directory || event.current_dir || event.session?.cwd || event.message?.cwd || null;
    const cwd: string | null = eventCwd ? String(eventCwd) : lastCwd;
    lastCwd = cwd;
    if (!CONTEXT_ROLES.has(role)) continue;
    const noise = role === "user" ? classifyUserNoise(event, raw, text) : null;
    if (noise) countNoise(filtered, noise);
    if (!text) continue;
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
        ...(noise ? { noise } : {}),
      });
    } else {
      messages.push(base);
    }
  }
  return { messages, filtered };
}

type UserNoiseKind = "subagent record" | "tool result stored under the user role" | "injected context only" | "provider interruption marker";

const INTERRUPTION_MARKER_RE = /^\[Request interrupted by user[^\]]*\]$/;

function classifyUserNoise(event: JsonRecord, raw: string, cleaned: string): UserNoiseKind | null {
  if (event.isSidechain === true) return "subagent record";
  if (isToolResultRecord(event)) return "tool result stored under the user role";
  if (!cleaned && raw.trim()) return "injected context only";
  if (INTERRUPTION_MARKER_RE.test(cleaned)) return "provider interruption marker";
  return null;
}

function countNoise(counts: UserIndexNoiseCounts, kind: UserNoiseKind): void {
  if (kind === "subagent record") counts.subagentRecords += 1;
  else if (kind === "tool result stored under the user role") counts.toolResults += 1;
  else if (kind === "provider interruption marker") counts.interruptionMarkers += 1;
  else counts.injectedContext += 1;
}

function isToolResultRecord(event: JsonRecord): boolean {
  if (event.toolUseResult !== undefined) return true;
  const content = event.message?.content ?? event.content ?? event.payload?.content;
  if (!Array.isArray(content)) return false;
  let hasToolResult = false;
  let hasAuthoredText = false;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const type = String((item as JsonRecord).type || "");
    if (type === "tool_result" || type === "tool_use") hasToolResult = true;
    if ((type === "text" || type === "input_text") && String((item as JsonRecord).text || "").trim()) hasAuthoredText = true;
  }
  return hasToolResult && !hasAuthoredText;
}

export function classifySessionExclusion(filePath: string): string | null {
  const sidecar = sessionSidecarExclusion(path.dirname(filePath));
  if (sidecar) return sidecar;
  return sessionMetaExclusion(filePath);
}

function sessionSidecarExclusion(dir: string): string | null {
  const summary = readJsonFileSafe(path.join(dir, "summary.json"));
  if (summary && String(summary.session_kind || "") === "subagent") return "subagent session (summary.session_kind)";
  const promptContext = readJsonFileSafe(path.join(dir, "prompt_context.json"));
  if (!promptContext) return null;
  if (promptContext.is_non_interactive === true) return "non-interactive session (prompt_context.is_non_interactive)";
  if (String(promptContext.audience || "") === "subagent") return "subagent session (prompt_context.audience)";
  return null;
}

function sessionMetaExclusion(filePath: string): string | null {
  let scanned = 0;
  for (const line of readLinesSync(filePath)) {
    scanned += 1;
    if (scanned > SESSION_META_PROBE_LINES) break;
    let event: JsonRecord;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const originator = String(event.payload?.originator || event.originator || "");
    if (originator === "codex_exec") return "headless session (originator=codex_exec)";
  }
  return null;
}

function readJsonFileSafe(filePath: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
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

function collectJsonl(root: string, visited: Set<string> = new Set()): string[] {
  const realRoot = realPathSafe(root);
  if (visited.has(realRoot)) return [];
  visited.add(realRoot);
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    const kind = entryKind(entry, fullPath);
    if (kind === "dir") files.push(...collectJsonl(fullPath, visited));
    else if (kind === "file" && entry.name.endsWith(".jsonl")) files.push(fullPath);
  }
  return files;
}

function entryKind(entry: fs.Dirent, fullPath: string): "dir" | "file" | "other" {
  if (entry.isDirectory()) return "dir";
  if (entry.isFile()) return "file";
  if (!entry.isSymbolicLink()) return "other";
  try {
    const stats = fs.statSync(fullPath);
    return stats.isDirectory() ? "dir" : stats.isFile() ? "file" : "other";
  } catch {
    return "other";
  }
}

function realPathSafe(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
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

// Some providers name every session file identically (Grok writes chat_history.jsonl
// per session directory), so the filename cannot identify the session. The owning
// directory carries the real id in that layout.
const SHARED_SESSION_FILENAMES = new Set(["session", "chat_history"]);

function sessionIdForFile(provider: UserIndexProvider, filePath: string): string {
  const resolved = path.resolve(filePath);
  const base = path.basename(resolved).replace(/\.jsonl$/i, "");
  if (base && !SHARED_SESSION_FILENAMES.has(base.toLowerCase())) return base;
  const parent = path.basename(path.dirname(resolved));
  if (parent && !SHARED_SESSION_FILENAMES.has(parent.toLowerCase())) return parent;
  return `${provider}-${crypto.createHash("sha1").update(resolved).digest("hex").slice(0, 16)}`;
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
