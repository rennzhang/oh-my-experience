import fs from "node:fs";
import { listCards } from "./cards.js";
import { loadConfig, saveConfig } from "./config.js";
import { SessionIndexRecordSchema, type SessionIndexRecord, type SessionRecord } from "./schema.js";
import { layout, nowIso, operationLog, readJson, withLock, writeJsonAtomic } from "./storage.js";

export type SourceCatalog = {
  version: 1;
  updatedAt: string;
  storage: "sources";
  sessions: SessionSourceRecord[];
};

export type SessionIndex = SourceCatalog;

export type SessionSourceRecord = SessionIndexRecord & {
  sourceExists: boolean;
  recoverable: boolean;
  protected: boolean;
  pruneReason: string;
};

export function writeSessionRecords(dataDir: string, records: SessionRecord[]) {
  return withLock(dataDir, "sources", () => {
    const current = readSessionCatalog(dataDir).sessions;
    const nextRecords = records.map((record) => sourceRecordFromSession(record, protectedSessionIds(dataDir)));
    const merged = mergeSourceRecords(current, nextRecords);
    const catalog = buildCatalog(dataDir, merged);
    writeJsonAtomic(layout(dataDir).sourceIndex, catalog, dataDir);
    operationLog(dataDir, "sources.import", { imported: records.length, sessions: catalog.sessions.length });
    return {
      ok: true,
      sessions: catalog.sessions.length,
      imported: records.map((record) => record.id),
      catalogPath: layout(dataDir).sourceIndex,
    };
  });
}

export function rebuildSessionIndex(dataDir: string, { dryRun = false }: { dryRun?: boolean } = {}) {
  return withLock(dataDir, "sources-index", () => {
    const current = readSessionCatalog(dataDir);
    const beforeBytes = sourceIndexBytes(dataDir);
    const catalog = buildCatalog(dataDir, current.sessions);
    const afterBytes = Buffer.byteLength(JSON.stringify(catalog, null, 2), "utf8");
    const result = {
      ok: true,
      dryRun,
      index: catalog,
      sessions: catalog.sessions.length,
      beforeBytes,
      afterBytes,
      savedBytes: Math.max(0, beforeBytes - afterBytes),
      indexPath: layout(dataDir).sourceIndex,
    };
    if (!dryRun) {
      writeJsonAtomic(layout(dataDir).sourceIndex, catalog, dataDir);
      operationLog(dataDir, "sources.index.rebuild", {
        sessions: catalog.sessions.length,
        beforeBytes,
        afterBytes,
        savedBytes: result.savedBytes,
      });
    }
    return result;
  });
}

export function readSessionIndex(dataDir: string): SessionIndex {
  return readSessionCatalog(dataDir);
}

export function compactSessionIndex(dataDir: string, options: { dryRun?: boolean } = {}) {
  return rebuildSessionIndex(dataDir, options);
}

export function rebuildSessionCatalog(dataDir: string, { dryRun = false }: { dryRun?: boolean } = {}) {
  return withLock(dataDir, "sources-catalog", () => {
    const catalog = buildCatalog(dataDir, readSessionCatalog(dataDir).sessions);
    const result = {
      ok: true,
      dryRun,
      catalog,
      sessions: catalog.sessions.length,
      recoverable: catalog.sessions.filter((session) => session.recoverable).length,
      protected: catalog.sessions.filter((session) => session.protected).length,
      missingSources: catalog.sessions.filter((session) => !session.sourceExists).length,
      catalogPath: layout(dataDir).sourceIndex,
    };
    if (!dryRun) {
      writeJsonAtomic(layout(dataDir).sourceIndex, catalog, dataDir);
      operationLog(dataDir, "sources.catalog.rebuild", {
        sessions: result.sessions,
        recoverable: result.recoverable,
        protected: result.protected,
        missingSources: result.missingSources,
      });
    }
    return result;
  });
}

export function pruneMaterializedSessions(dataDir: string, { dryRun = false, yes = false }: { dryRun?: boolean; yes?: boolean } = {}) {
  if (!dryRun && !yes) throw new Error("pruning source cache requires --yes");
  const catalog = readSessionCatalog(dataDir);
  const prunable = catalog.sessions.filter((session) => session.materialized || session.sessionFile);
  const actions = prunable.map((session) => ({
    action: "rewrite" as const,
    path: layout(dataDir).sourceIndex,
    bytes: 0,
    reason: `remove materialized marker for ${session.provider}:${session.id}`,
    applied: !dryRun,
  }));
  if (!dryRun && prunable.length) {
    const next = buildCatalog(dataDir, catalog.sessions.map((session) => ({
      ...session,
      sessionFile: "",
      materialized: false,
    })));
    writeJsonAtomic(layout(dataDir).sourceIndex, next, dataDir);
    operationLog(dataDir, "sources.materialized.prune", { pruned: prunable.length });
  }
  return {
    ok: true,
    dryRun,
    actions,
    pruned: actions.length,
    savedBytes: 0,
    kept: catalog.sessions.length - actions.length,
    keptMissingSources: catalog.sessions.filter((session) => !session.sourceExists).length,
    keptProtected: catalog.sessions.filter((session) => session.protected).length,
    catalogPath: layout(dataDir).sourceIndex,
  };
}

export function setSessionStoreMode(dataDir: string, input: { store: string; retainDays?: number }) {
  const store = normalizeStore(input.store);
  const current = loadConfig(dataDir);
  const next = saveConfig(dataDir, {
    ...current,
    sessions: {
      ...current.sessions,
      store,
      ...(input.retainDays ? { retainDays: input.retainDays } : {}),
    },
  });
  operationLog(dataDir, "sessions.store.set", { store, retainDays: next.sessions.retainDays });
  return { ok: true, sessions: next.sessions };
}

function readSessionCatalog(dataDir: string): SourceCatalog {
  const raw = readJson<Record<string, unknown>>(layout(dataDir).sourceIndex, {
    version: 1,
    updatedAt: nowIso(),
    storage: "sources",
    sessions: [],
  });
  const protectedIds = protectedSessionIds(dataDir);
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map((session) => sourceRecordFromUnknown(session, protectedIds)).filter((session): session is SessionSourceRecord => Boolean(session))
    : [];
  return buildCatalog(dataDir, sessions, String(raw.updatedAt || nowIso()));
}

function buildCatalog(dataDir: string, sessions: SessionSourceRecord[], updatedAt = nowIso()): SourceCatalog {
  const protectedIds = protectedSessionIds(dataDir);
  return {
    version: 1,
    updatedAt,
    storage: "sources",
    sessions: normalizeSourceRecords(sessions, protectedIds).sort(compareSourceRecords),
  };
}

function normalizeSourceRecords(sessions: SessionSourceRecord[], protectedIds: Set<string>) {
  return sessions.map((session) => {
    const sourceExists = Boolean(session.sourcePath && fs.existsSync(session.sourcePath));
    const protectedSession = isProtectedSession(session.id, protectedIds);
    return {
      ...session,
      sessionFile: "",
      materialized: false,
      sourceExists,
      recoverable: sourceExists && !protectedSession,
      protected: protectedSession,
      pruneReason: sessionPruneReason(sourceExists, protectedSession),
    };
  });
}

function mergeSourceRecords(previous: SessionSourceRecord[], next: SessionSourceRecord[]) {
  const byKey = new Map<string, SessionSourceRecord>();
  for (const session of previous) byKey.set(sourceKey(session), session);
  for (const session of next) byKey.set(sourceKey(session), session);
  return Array.from(byKey.values());
}

function sourceRecordFromSession(session: SessionRecord, protectedIds: Set<string>): SessionSourceRecord {
  const indexed = SessionIndexRecordSchema.parse({
    id: session.id,
    provider: session.provider,
    sourcePath: session.sourcePath,
    startedAt: session.startedAt,
    cwd: session.cwd,
    summary: session.summary,
    metadataHash: session.metadataHash,
    messageCount: session.messages.length,
    sessionFile: "",
    materialized: false,
  });
  const sourceExists = Boolean(indexed.sourcePath && fs.existsSync(indexed.sourcePath));
  const protectedSession = isProtectedSession(indexed.id, protectedIds);
  return {
    ...indexed,
    sourceExists,
    recoverable: sourceExists && !protectedSession,
    protected: protectedSession,
    pruneReason: sessionPruneReason(sourceExists, protectedSession),
  };
}

function sourceRecordFromUnknown(value: unknown, protectedIds: Set<string>): SessionSourceRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const parsed = SessionIndexRecordSchema.parse({
    ...record,
    sessionFile: "",
    materialized: false,
    messageCount: Number(record.messageCount ?? (Array.isArray(record.messages) ? record.messages.length : 0)),
  });
  const sourceExists = Boolean(parsed.sourcePath && fs.existsSync(parsed.sourcePath));
  const protectedSession = isProtectedSession(parsed.id, protectedIds);
  return {
    ...parsed,
    sourceExists,
    recoverable: sourceExists && !protectedSession,
    protected: protectedSession,
    pruneReason: sessionPruneReason(sourceExists, protectedSession),
  };
}

function compareSourceRecords(left: SessionIndexRecord, right: SessionIndexRecord) {
  const leftStarted = left.startedAt || "";
  const rightStarted = right.startedAt || "";
  if (leftStarted !== rightStarted) return leftStarted.localeCompare(rightStarted);
  return sourceKey(left).localeCompare(sourceKey(right));
}

function sourceKey(session: Pick<SessionIndexRecord, "provider" | "id">) {
  return `${session.provider}:${session.id}`;
}

function isProtectedSession(sessionId: string, protectedIds: Set<string>) {
  return protectedIds.has(sessionId) || Array.from(protectedIds).some((id) => id && sessionId.includes(id));
}

function sessionPruneReason(sourceExists: boolean, protectedSession: boolean) {
  if (protectedSession) return "session referenced by active experience";
  return sourceExists
    ? "source can be recovered from sourcePath"
    : "sourcePath missing; keep metadata pointer";
}

function normalizeStore(store: string) {
  if (store === "pointer" || store === "recent" || store === "full") return store;
  throw new Error("session store must be pointer, recent, or full");
}

function protectedSessionIds(dataDir: string) {
  const ids = new Set<string>();
  for (const card of listCards(dataDir, "active")) {
    for (const ref of card.sourceRefs || []) {
      if (ref.type !== "session") continue;
      const value = ref.ref.split("#")[0].replace(/^spool:/, "").trim();
      if (value) ids.add(value);
    }
  }
  return ids;
}

function sourceIndexBytes(dataDir: string) {
  const filePath = layout(dataDir).sourceIndex;
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}
