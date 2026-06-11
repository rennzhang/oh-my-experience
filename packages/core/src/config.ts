import fs from "node:fs";
import path from "node:path";
import { ConfigSchema, type Config } from "./schema.js";
import { ensureStarterCards } from "./cards.js";
import {
  backupFile,
  defaultConfigHome,
  defaultDataDir,
  ensureBaseDirs,
  layout,
  nowIso,
  operationLog,
  readJson,
  withLock,
  writeJsonAtomic,
} from "./storage.js";
import { runDoctor } from "./doctor.js";

type JsonRecord = Record<string, any>;

export function createDefaultConfig(dataDir: string): Config {
  const now = nowIso();
  return {
    version: 1,
    dataDir,
    privacy: {
      saveRawPrompt: false,
      debugRawPromptTtlHours: 24,
    },
    retrieval: {
      maxCards: 8,
      minScore: 40,
      additionalContextMaxChars: 6000,
      hookTimeoutMs: 4000,
    },
    hooks: {
      providers: {
        codex: { enabled: false },
        claude: { enabled: false },
      },
    },
    codex: {
      sessionsDir: null,
    },
    sessions: {
      store: "pointer",
      retainDays: 30,
      keepAppliedEvidence: true,
    },
    sources: {
      spool: {
        mode: "off",
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function initializeDataDir({ dataDir = defaultDataDir(), dryRun = false, configHome = defaultConfigHome(), writePointer = false, resetConfig = false }: {
  dataDir?: string;
  dryRun?: boolean;
  configHome?: string;
  writePointer?: boolean;
  resetConfig?: boolean;
} = {}) {
  const resolved = path.resolve(dataDir);
  const l = layout(resolved);
  const plan = {
    dataDir: resolved,
    resetConfig: Boolean(resetConfig),
    createDirectories: [
      "experiences/draft",
      "experiences/active",
      "experiences/archived",
      "retrospectives",
      "indexes",
    ],
    writeFiles: ["config.json", "indexes/experiences.json", "indexes/sources.json"],
  };
  if (dryRun) return { ok: true, dryRun: true, plan };

  ensureBaseDirs(resolved);
  if (resetConfig && fs.existsSync(l.config)) {
    backupFile(resolved, l.config, "config-reset");
    writeJsonAtomic(l.config, createDefaultConfig(resolved), resolved);
  } else if (!fs.existsSync(l.config)) {
    writeJsonAtomic(l.config, createDefaultConfig(resolved), resolved);
  } else {
    repairConfig(resolved);
  }
  if (!fs.existsSync(l.experienceIndex)) writeJsonAtomic(l.experienceIndex, { version: 1, updatedAt: nowIso(), experiences: [] }, resolved);
  if (!fs.existsSync(l.sourceIndex)) writeJsonAtomic(l.sourceIndex, { version: 1, updatedAt: nowIso(), storage: "sources", sessions: [] }, resolved);
  if (!resetConfig) ensureStarterCards(resolved);
  if (writePointer) writeDataDirPointer(resolved, configHome, { reset: resetConfig });
  operationLog(resolved, "init", { dataDir: resolved });
  return { ok: true, dryRun: false, plan };
}

function repairConfig(dataDir: string): void {
  const configPath = layout(dataDir).config;
  const current = readJson(configPath, null);
  if (!current || typeof current !== "object") return;
  const currentRecord = current as JsonRecord;
  const normalized = ConfigSchema.parse({
    ...currentRecord,
    sources: currentRecord.sources || {
      spool: {
        mode: currentRecord.spool?.enabled ? "enabled" : "off",
      },
    },
    dataDir: path.resolve(dataDir),
  });
  if (JSON.stringify(current) === JSON.stringify(normalized)) return;
  writeJsonAtomic(configPath, { ...normalized, updatedAt: nowIso() }, dataDir);
}

export function loadConfig(dataDir = defaultDataDir()): Config {
  const resolved = path.resolve(dataDir);
  const config = readJson(layout(resolved).config);
  if (!config) return createDefaultConfig(resolved);
  return ConfigSchema.parse({ ...config, dataDir: config.dataDir || resolved });
}

export function saveConfig(dataDir: string, config: Config | JsonRecord): Config {
  const resolved = path.resolve(dataDir);
  const next = ConfigSchema.parse({ ...config, updatedAt: nowIso() });
  return withLock(resolved, "config", () => {
    backupFile(resolved, layout(resolved).config, "config");
    writeJsonAtomic(layout(resolved).config, next, resolved);
    operationLog(resolved, "config.save", { dataDir: resolved });
    return next;
  });
}

export function setConfigValue(dataDir: string, key: string, value: string, { configHome = defaultConfigHome() }: { configHome?: string } = {}) {
  const config = loadConfig(dataDir);
  if (key !== "dataDir") {
    const next = setNestedConfig(config, key, parseConfigValue(value));
    const saved = saveConfig(dataDir, next);
    writeDataDirPointer(saved.dataDir, configHome);
    return {
      ok: true,
      changed: JSON.stringify(config) !== JSON.stringify(saved),
      key,
      previous: getNestedConfig(config, key),
      next: getNestedConfig(saved, key),
    };
  }
  const previous = config.dataDir;
  const nextDataDir = path.resolve(value);
  if (nextDataDir === previous) {
    return { ok: true, changed: false, previous, next: nextDataDir };
  }
  const report = migrateDataDir(previous, nextDataDir);
  const next = { ...config, dataDir: nextDataDir, updatedAt: nowIso() };
  saveConfig(nextDataDir, next);
  writeDataDirPointer(nextDataDir, configHome);
  return { ok: true, changed: true, previous, next: nextDataDir, migration: report };
}

export function previewConfigValue(dataDir: string, key: string, value: string) {
  const config = loadConfig(dataDir);
  if (key === "dataDir") {
    const next = path.resolve(value);
    return {
      ok: true,
      key,
      previous: config.dataDir,
      next,
      requiresMigration: next !== path.resolve(config.dataDir),
      warnings: inspectDataDirTarget(next),
    };
  }
  const next = setNestedConfig(config, key, parseConfigValue(value));
  return {
    ok: true,
    key,
    previous: getNestedConfig(config, key),
    next: getNestedConfig(next, key),
    diff: diffConfig(config, next),
  };
}

function inspectDataDirTarget(target: string): string[] {
  const warnings: string[] = [];
  if (fs.existsSync(path.join(target, ".obsidian"))) {
    warnings.push("target appears to be an Obsidian vault root; prefer a subdirectory such as Oh My Experience/ unless you intentionally want root-level files");
  }
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    warnings.push("target exists but is not a directory");
  }
  return warnings;
}

export function migrateDataDir(previous: string, nextDataDir: string) {
  const source = path.resolve(previous);
  const target = path.resolve(nextDataDir);
  if (!fs.existsSync(source)) throw new Error(`source dataDir does not exist: ${source}`);
  const targetInsideSource = path.relative(source, target);
  if (targetInsideSource && !targetInsideSource.startsWith("..") && !path.isAbsolute(targetInsideSource)) {
    throw new Error(`target dataDir cannot be inside the current dataDir: ${target}`);
  }
  if (fs.existsSync(target) && !isDirectoryEmpty(target)) {
    throw new Error(`target dataDir is not empty; choose an empty directory or run an explicit import: ${target}`);
  }
  fs.mkdirSync(target, { recursive: true });
  const counts = { files: 0, directories: 0 };
  const written: string[] = [];
  const createdDirs: string[] = [];
  try {
    copyTree(source, target, counts, new Set(["locks"]), written, createdDirs);
    initializeDataDir({ dataDir: target, writePointer: false });
    const doctor = runDoctor(target);
    if (!doctor.ok) {
      throw new Error(`migrated dataDir failed doctor: ${doctor.errors.join("; ")}`);
    }
    return { ...counts, doctor };
  } catch (error) {
    rollbackWrittenFiles(written, createdDirs);
    throw error;
  }
}

function copyTree(source: string, target: string, counts: { files: number; directories: number }, skipNames: Set<string>, written: string[], createdDirs: string[]): void {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
        createdDirs.push(to);
        counts.directories += 1;
      }
      copyTree(from, to, counts, skipNames, written, createdDirs);
    } else if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      written.push(to);
      counts.files += 1;
    }
  }
}

function isDirectoryEmpty(dir: string): boolean {
  return fs.readdirSync(dir).length === 0;
}

function writeDataDirPointer(dataDir: string, configHome: string, { reset = false }: { reset?: boolean } = {}): void {
  const home = path.resolve(configHome);
  const resolved = path.resolve(dataDir);
  fs.mkdirSync(home, { recursive: true });
  const pointerPath = path.join(home, "config.json");
  if (path.resolve(pointerPath) === path.resolve(layout(resolved).config)) return;
  const existing = readJson(pointerPath, null);
  const pointer = ConfigSchema.parse({
    ...createDefaultConfig(resolved),
    ...(reset ? {} : (existing || {})),
    dataDir: resolved,
    updatedAt: nowIso(),
  });
  writeJsonAtomic(pointerPath, pointer, home);
}

function setNestedConfig(config: Config, key: string, value: unknown): Config {
  const parts = String(key).split(".").filter(Boolean);
  if (!parts.length) throw new Error("config key cannot be empty");
  const next = structuredClone(config);
  let cursor: JsonRecord = next as JsonRecord;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      throw new Error(`unsupported config key: ${key}`);
    }
    cursor = cursor[part];
  }
  const leaf = parts.at(-1);
  if (!leaf) throw new Error("config key cannot be empty");
  if (!(leaf in cursor)) throw new Error(`unsupported config key: ${key}`);
  cursor[leaf] = value;
  return ConfigSchema.parse(next);
}

function getNestedConfig(config: Config | JsonRecord, key: string): unknown {
  return String(key).split(".").filter(Boolean).reduce<any>((value, part) => value?.[part], config);
}

function parseConfigValue(value: unknown): unknown {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(String(value))) return Number(value);
  return value;
}

function diffConfig(previous: Config, next: Config) {
  const changes: Array<{ key: string; previous: unknown; next: unknown }> = [];
  collectDiff("", previous, next, changes);
  return changes;
}

function collectDiff(prefix: string, previous: JsonRecord, next: JsonRecord, changes: Array<{ key: string; previous: unknown; next: unknown }>): void {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    const before = previous?.[key];
    const after = next?.[key];
    if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
      collectDiff(pathKey, before, after, changes);
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ key: pathKey, previous: before, next: after });
    }
  }
}

function rollbackWrittenFiles(files: string[], dirs: string[]): void {
  for (const file of [...files].reverse()) {
    try {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    } catch {
      // Preserve the original migration failure.
    }
  }
  for (const dir of [...dirs].reverse()) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // Preserve the original migration failure.
    }
  }
}
