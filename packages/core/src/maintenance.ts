import fs from "node:fs";
import path from "node:path";
import { compactSessionIndex, pruneMaterializedSessions, rebuildSessionCatalog } from "./sessions.js";
import { ensureBaseDirs, layout, nowIso, operationLog } from "./storage.js";

type CompactOptions = {
  dryRun?: boolean;
  sessions?: boolean;
  hygiene?: boolean;
  pruneSessions?: boolean;
  yes?: boolean;
  retainDays?: number;
};

type StorageEntry = {
  path: string;
  kind: "file" | "directory";
  bytes: number;
  files: number;
  role: string;
  required: boolean;
};

type CompactAction = {
  action: "delete" | "move" | "rewrite";
  path: string;
  target?: string;
  bytes: number;
  reason: string;
  applied: boolean;
};

export function auditStorage(dataDir: string) {
  const l = layout(dataDir);
  const entries = [
    entry(dataDir, l.config, "runtime config", true),
    entry(dataDir, l.experiences, "experience library", true),
    entry(dataDir, l.retrospectives, "review runs", true),
    entry(dataDir, l.indexes, "indexes", true),
    entry(dataDir, l.experienceIndex, "active experience recall cache", true),
    entry(dataDir, l.sourceIndex, "source pointer catalog", true),
    entry(dataDir, l.events, "event stream", false),
  ].filter(Boolean) as StorageEntry[];
  const sessionIndex = inspectSessionIndex(l.sourceIndex);
  const sessionCatalog = inspectSessionCatalog(l.sourceIndex);
  const totalBytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  return {
    ok: true,
    dataDir,
    generatedAt: nowIso(),
    totalBytes,
    entries,
    sessionIndex,
    sessionCatalog,
    recommendations: storageRecommendations(sessionIndex),
  };
}

export function compactStorage(dataDir: string, options: CompactOptions = {}) {
  ensureBaseDirs(dataDir);
  const dryRun = Boolean(options.dryRun);
  const retainDays = options.retainDays ?? 30;
  const actions: CompactAction[] = [];
  if (options.sessions !== false) {
    const result = compactSessionIndex(dataDir, { dryRun });
    actions.push({
      action: "rewrite",
      path: layout(dataDir).sourceIndex,
      bytes: result.savedBytes,
      reason: "rewrite source index without embedded messages",
      applied: !dryRun,
    });
    const catalog = rebuildSessionCatalog(dataDir, { dryRun });
    actions.push({
      action: "rewrite",
      path: layout(dataDir).sourceIndex,
      bytes: 0,
      reason: `rebuild source catalog (${catalog.sessions} records, ${catalog.recoverable} recoverable)`,
      applied: !dryRun,
    });
  }
  if (options.pruneSessions) actions.push(...pruneMaterializedSessions(dataDir, { dryRun, yes: Boolean(options.yes) }).actions);
  if (options.hygiene !== false) {
    actions.push(...cleanupRootHygiene(dataDir, dryRun));
  }
  const savedBytes = actions.filter((action) => action.action !== "move").reduce((sum, action) => sum + action.bytes, 0);
  const result = {
    ok: true,
    dryRun,
    retainDays,
    savedBytes,
    actions,
    audit: auditStorage(dataDir),
  };
  if (!dryRun) operationLog(dataDir, "storage.compact", { actions: actions.length, savedBytes, retainDays });
  return result;
}

function entry(dataDir: string, filePath: string, role: string, required: boolean): StorageEntry | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const size = stat.isDirectory() ? dirSize(filePath) : { bytes: stat.size, files: 1 };
  return {
    path: path.relative(dataDir, filePath) || ".",
    kind: stat.isDirectory() ? "directory" : "file",
    bytes: size.bytes,
    files: size.files,
    role,
    required,
  };
}

function dirSize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  for (const item of walk(dir)) {
    const stat = fs.statSync(item);
    if (stat.isFile()) {
      bytes += stat.size;
      files += 1;
    }
  }
  return { bytes, files };
}

function inspectSessionIndex(filePath: string) {
  if (!fs.existsSync(filePath)) return { exists: false, bytes: 0, records: 0, embedsMessages: false };
  const bytes = fs.statSync(filePath).size;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {
      exists: true,
      bytes,
      records: sessions.length,
      embedsMessages: sessions.some((session: Record<string, unknown>) => Array.isArray(session.messages)),
      storage: raw.storage || "legacy",
    };
  } catch (error) {
    return { exists: true, bytes, records: 0, embedsMessages: false, invalid: error instanceof Error ? error.message : String(error) };
  }
}

function inspectSessionCatalog(filePath: string) {
  if (!fs.existsSync(filePath)) return { exists: false, bytes: 0, records: 0, recoverable: 0, materialized: 0 };
  const bytes = fs.statSync(filePath).size;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {
      exists: true,
      bytes,
      records: sessions.length,
      recoverable: sessions.filter((session: Record<string, unknown>) => session.recoverable === true).length,
      materialized: sessions.filter((session: Record<string, unknown>) => session.materialized === true).length,
    };
  } catch (error) {
    return { exists: true, bytes, records: 0, recoverable: 0, materialized: 0, invalid: error instanceof Error ? error.message : String(error) };
  }
}

function storageRecommendations(sessionIndex: ReturnType<typeof inspectSessionIndex>): string[] {
  const recommendations: string[] = [];
  if (sessionIndex.embedsMessages) recommendations.push("Run ome compact to rewrite indexes/sources.json without embedded messages.");
  if (sessionIndex.bytes > 10 * 1024 * 1024) recommendations.push("Source index is large; keep only source pointers, summaries, and counts.");
  return recommendations;
}

function cleanupRootHygiene(dataDir: string, dryRun: boolean): CompactAction[] {
  const actions: CompactAction[] = [];
  for (const dsStore of walk(dataDir).filter((file) => path.basename(file) === ".DS_Store")) {
    actions.push(deleteFile(dsStore, dryRun, "macOS Finder metadata"));
  }
  for (const file of fs.readdirSync(dataDir).filter((name) => /^config\.json\.bak-/.test(name))) {
    const source = path.join(dataDir, file);
    const targetDir = path.join(osBackupRoot(dataDir), "config");
    const target = path.join(targetDir, file);
    const bytes = fs.statSync(source).size;
    if (!dryRun) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.renameSync(source, uniqueTarget(target));
    }
    actions.push({ action: "move", path: source, target, bytes, reason: "move config backup out of root", applied: !dryRun });
  }
  const cleanupDir = path.join(dataDir, "_cleanup");
  if (fs.existsSync(cleanupDir)) {
    const target = uniqueTarget(path.join(osBackupRoot(dataDir), "legacy", "_cleanup"));
    const size = dirSize(cleanupDir);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(cleanupDir, target);
    }
    actions.push({ action: "move", path: cleanupDir, target, bytes: size.bytes, reason: "move legacy cleanup artifacts out of root", applied: !dryRun });
  }
  const reviewsDir = path.join(dataDir, "reviews");
  if (fs.existsSync(reviewsDir) && fs.statSync(reviewsDir).isDirectory() && fs.readdirSync(reviewsDir).length === 0) {
    if (!dryRun) fs.rmSync(reviewsDir, { recursive: true, force: true });
    actions.push({ action: "delete", path: reviewsDir, bytes: 0, reason: "remove empty legacy reviews directory", applied: !dryRun });
  }
  return actions;
}

function deleteFile(filePath: string, dryRun: boolean, reason: string): CompactAction {
  const bytes = fs.statSync(filePath).size;
  if (!dryRun) fs.rmSync(filePath, { force: true });
  return { action: "delete", path: filePath, bytes, reason, applied: !dryRun };
}

function osBackupRoot(dataDir: string): string {
  return layout(dataDir).backups;
}

function uniqueTarget(target: string): string {
  if (!fs.existsSync(target)) return target;
  const parsed = path.parse(target);
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return [root];
  const results: string[] = [];
  for (const entryName of fs.readdirSync(root)) {
    const fullPath = path.join(root, entryName);
    const entryStat = fs.statSync(fullPath);
    if (entryStat.isDirectory()) results.push(...walk(fullPath));
    else results.push(fullPath);
  }
  return results;
}
