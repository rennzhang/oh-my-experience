import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type JsonRecord = Record<string, any>;

export const DEFAULT_DIR_NAME = ".oh-my-experience";
export const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayStamp(): string {
  return nowIso().replace(/[:.]/g, "-");
}

export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function slugify(input: unknown): string {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now()}`;
}

export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OH_MY_EXPERIENCE_DATA_DIR || env.OME_HOME;
  if (explicit) return path.resolve(explicit);
  const pointer = path.join(defaultConfigHome(env), "config.json");
  try {
    const config = JSON.parse(fs.readFileSync(pointer, "utf8"));
    if (config && typeof config.dataDir === "string" && config.dataDir.trim()) {
      return path.resolve(config.dataDir);
    }
  } catch {
    // No pointer yet; first run falls back to the config home.
  }
  return defaultConfigHome(env);
}

export function defaultConfigHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.OH_MY_EXPERIENCE_CONFIG_HOME || env.OME_CONFIG_HOME || path.join(os.homedir(), DEFAULT_DIR_NAME));
}

export function layout(dataDir: string) {
  const lockRoot = path.join(os.tmpdir(), "oh-my-experience-locks", hashText(path.resolve(dataDir)).slice(0, 16));
  const backupRoot = path.join(os.tmpdir(), "oh-my-experience-backups", hashText(path.resolve(dataDir)).slice(0, 16));
  return {
    root: dataDir,
    config: path.join(dataDir, "config.json"),
    experiences: path.join(dataDir, "experiences"),
    draftExperiences: path.join(dataDir, "experiences", "draft"),
    activeExperiences: path.join(dataDir, "experiences", "active"),
    archivedExperiences: path.join(dataDir, "experiences", "archived"),
    retrospectives: path.join(dataDir, "retrospectives"),
    indexes: path.join(dataDir, "indexes"),
    experienceIndex: path.join(dataDir, "indexes", "experiences.json"),
    categoryIndex: path.join(dataDir, "indexes", "categories.json"),
    sourceIndex: path.join(dataDir, "indexes", "sources.json"),
    events: path.join(dataDir, "events.jsonl"),
    hookLog: path.join(dataDir, "events.jsonl"),
    operationsLog: path.join(dataDir, "events.jsonl"),
    backups: backupRoot,
    locks: lockRoot,
  };
}

export function ensureBaseDirs(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const l = layout(dataDir);
  for (const dir of [
    l.root,
    l.draftExperiences,
    l.activeExperiences,
    l.archivedExperiences,
    l.retrospectives,
    l.indexes,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function assertInsideDataDir(dataDir: string, targetPath: string): string {
  const resolvedRoot = fs.existsSync(dataDir) ? fs.realpathSync(dataDir) : path.resolve(dataDir);
  const resolved = resolveInsideRealpath(targetPath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing to write outside dataDir: ${resolved}`);
  }
  return resolved;
}

export function readJson<T = any>(filePath: string, fallback: T): T;
export function readJson<T = any>(filePath: string): T | null;
export function readJson<T = any>(filePath: string, fallback: T | null = null): T | null {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonAtomic(filePath: string, value: unknown, dataDir = path.dirname(filePath)): void {
  assertInsideDataDir(dataDir, filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

export function writeTextAtomic(filePath: string, value: string, dataDir = path.dirname(filePath)): void {
  assertInsideDataDir(dataDir, filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, value, "utf8");
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

export function appendJsonl(filePath: string, value: unknown, dataDir = path.dirname(filePath)): void {
  assertInsideDataDir(dataDir, filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export function readJsonl<T = any>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function withLock<T>(dataDir: string, name: string, fn: () => T, { staleMs = DEFAULT_LOCK_STALE_MS }: { staleMs?: number } = {}): T {
  const l = layout(dataDir);
  fs.mkdirSync(l.locks, { recursive: true });
  const lockPath = path.join(l.locks, `${name}.lock`);
  const lock = {
    owner: "oh-my-experience",
    pid: process.pid,
    createdAt: nowIso(),
  };
  acquireLock(lockPath, lock, staleMs);
  try {
    return fn();
  } finally {
    releaseLock(lockPath, lock.pid);
  }
}

function acquireLock(lockPath: string, lock: JsonRecord, staleMs: number): void {
  try {
    fs.mkdirSync(lockPath);
    fs.writeFileSync(path.join(lockPath, "lock.json"), JSON.stringify(lock, null, 2), "utf8");
    return;
  } catch (error: any) {
    if (!error || error.code !== "EEXIST") throw error;
  }
  recoverStaleLock(lockPath, staleMs);
  fs.mkdirSync(lockPath);
  fs.writeFileSync(path.join(lockPath, "lock.json"), JSON.stringify(lock, null, 2), "utf8");
}

function recoverStaleLock(lockPath: string, staleMs: number): void {
  const marker = path.join(lockPath, "lock.json");
  if (!fs.existsSync(marker)) {
    fs.rmSync(lockPath, { recursive: true, force: true });
    return;
  }
  const lock = readJson<JsonRecord>(marker, {});
  const stat = fs.statSync(marker);
  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs < staleMs || isProcessAlive(lock.pid)) {
    throw new Error(`resource is locked: ${lockPath}`);
  }
  fs.rmSync(lockPath, { recursive: true, force: true });
}

function releaseLock(lockPath: string, pid: number): void {
  const marker = path.join(lockPath, "lock.json");
  const lock = readJson<JsonRecord>(marker, {});
  if (lock.pid === pid) fs.rmSync(lockPath, { recursive: true, force: true });
}

function isProcessAlive(pid: unknown): boolean {
  if (!Number.isInteger(pid) || Number(pid) <= 0) return false;
  const processId = Number(pid);
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

export function backupFile(dataDir: string, filePath: string, type: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  assertInsideDataDir(dataDir, filePath);
  const backupDir = path.join(layout(dataDir).backups, `${todayStamp()}-${type}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, path.basename(filePath));
  fs.copyFileSync(filePath, target);
  return target;
}

export function operationLog(dataDir: string, operation: string, detail: JsonRecord = {}): void {
  appendJsonl(layout(dataDir).operationsLog, {
    id: crypto.randomUUID(),
    kind: "operation",
    operation,
    detail,
    createdAt: nowIso(),
  }, dataDir);
}

function resolveInsideRealpath(targetPath: string): string {
  const resolvedTarget = path.resolve(targetPath);
  let cursor = resolvedTarget;
  const missing: string[] = [];
  while (!fs.existsSync(cursor)) {
    missing.unshift(path.basename(cursor));
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const realExisting = fs.existsSync(cursor) ? fs.realpathSync(cursor) : path.resolve(cursor);
  return path.resolve(realExisting, ...missing);
}
