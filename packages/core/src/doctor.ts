import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listCards, rebuildCardIndex, type CardIndex } from "./cards.js";
import { ConfigSchema, type Config } from "./schema.js";
import { defaultDataDir, layout, readJson } from "./storage.js";

type DoctorOptions = { codexHome?: string; claudeHome?: string };
type HookEntry = { hooks?: Array<{ command?: string }> };

export function runDoctor(dataDir: string, { codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), claudeHome = path.join(os.homedir(), ".claude") }: DoctorOptions = {}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const l = layout(dataDir);
  checkDir(l.root, "dataDir", errors);
  checkWritable(l.root, "dataDir", errors);
  for (const [name, dir] of Object.entries({
    experiences: l.experiences,
    retrospectives: l.retrospectives,
    indexes: l.indexes,
  })) {
    checkDir(dir, name, errors);
  }
  checkCards(dataDir, errors, warnings);
  checkIndex(dataDir, errors);
  checkJsonl(l.events, "events", warnings);
  const config = checkConfig(dataDir, errors, warnings);
  checkHook(config, { codexHome, claudeHome }, errors, warnings);
  checkPackage(errors, warnings);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checked: {
      dataDir,
      experiences: listCards(dataDir).length,
      layers: ["storage", "schema", "index", "hook", "config", "package"],
    },
  };
}

export function repairIndex(dataDir: string) {
  return rebuildCardIndex(dataDir);
}

function checkDir(dir: string, label: string, errors: string[]): void {
  if (!fs.existsSync(dir)) errors.push(`missing ${label}: ${dir}`);
  else if (!fs.statSync(dir).isDirectory()) errors.push(`${label} is not a directory: ${dir}`);
}

function checkWritable(dir: string, label: string, errors: string[]): void {
  if (!fs.existsSync(dir)) return;
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    errors.push(`${label} is not writable: ${dir}`);
  }
}

function checkCards(dataDir: string, errors: string[], warnings: string[]): void {
  const seen = new Set<string>();
  let cards;
  try {
    cards = listCards(dataDir);
  } catch (error: any) {
    errors.push(`card schema invalid: ${error.message}`);
    return;
  }
  for (const card of cards) {
    if (seen.has(card.id)) errors.push(`duplicate card id: ${card.id}`);
    seen.add(card.id);
    if (!card.triggers.length) errors.push(`card has no triggers: ${card.id}`);
    if (!card.topics.length) warnings.push(`card has no topics: ${card.id}`);
    if (card.status === "active" && card.recallPolicy === "off") warnings.push(`active card recall is off: ${card.id}`);
  }
}

function checkIndex(dataDir: string, errors: string[]): void {
  const index = readJson<CardIndex | null>(layout(dataDir).experienceIndex, null);
  if (!index) {
    errors.push("missing indexes/experiences.json");
    return;
  }
  const activeIds = new Set(listCards(dataDir, "active").map((card) => card.id));
  const indexedIds = new Set((index.experiences || []).map((card) => card.id));
  for (const id of activeIds) {
    if (!indexedIds.has(id)) errors.push(`active card missing from index: ${id}`);
  }
  for (const id of indexedIds) {
    if (!activeIds.has(id)) errors.push(`index references missing active card: ${id}`);
  }
}

function checkConfig(dataDir: string, errors: string[], warnings: string[]): Config | null {
  const raw = readJson(layout(dataDir).config, null);
  if (!raw) {
    errors.push("missing config.json");
    return null;
  }
  let config: Config | null = null;
  try {
    config = ConfigSchema.parse(raw);
  } catch (error: any) {
    errors.push(`config schema invalid: ${error.message}`);
    return null;
  }
  if (path.resolve(config.dataDir) !== path.resolve(dataDir)) {
    warnings.push(`config dataDir points elsewhere: ${config.dataDir}`);
  }
  const defaultDir = defaultDataDir();
  if (defaultDir !== path.resolve(dataDir)) {
    warnings.push(`default dataDir pointer resolves to ${defaultDir}`);
  }
  return config;
}

function checkHook(config: Config | null, { codexHome, claudeHome }: Required<DoctorOptions>, errors: string[], warnings: string[]): void {
  const codexEnabled = config?.hooks?.providers?.codex?.enabled;
  if (codexEnabled) {
    checkProviderHook("Codex", path.join(codexHome, "hooks.json"), errors, warnings);
  }
  if (config?.hooks?.providers?.claude?.enabled) {
    checkProviderHook("Claude", path.join(claudeHome, "settings.json"), errors, warnings);
  }
}

function checkProviderHook(provider: string, hookFile: string, errors: string[], warnings: string[]): void {
  if (!fs.existsSync(hookFile)) {
    errors.push(`${provider} hook enabled but hook config not found: ${hookFile}`);
    return;
  }
  const hooks = readJson<{ hooks?: { UserPromptSubmit?: HookEntry[] } } | null>(hookFile, null);
  const entries: HookEntry[] = Array.isArray(hooks?.hooks?.UserPromptSubmit) ? hooks.hooks.UserPromptSubmit : [];
  const installed = Boolean(entries.some((entry: HookEntry) =>
    (entry.hooks || []).some((hook: { command?: string }) => isMachineReadableOmeHookCommand(hook.command)),
  ));
  if (!installed) errors.push(`${provider} hook enabled but machine-readable ome hook command missing: ${hookFile}`);
}

function isMachineReadableOmeHookCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  if (!command.includes("ome hook run") && !command.includes("oh-my-experience hook run")) return false;
  return /(?:^|\s)--json(?:\s|$)/.test(command) || /(?:^|\s)--format(?:=|\s+)json(?:\s|$)/.test(command);
}

function checkPackage(errors: string[], warnings: string[]): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) errors.push(`Node.js >=20 required, current ${process.version}`);
  const pathBins = String(process.env.PATH || "").split(path.delimiter);
  const omeBins = Array.from(new Set(pathBins.map((dir) => path.join(dir, "ome")).filter((candidate) => fs.existsSync(candidate))));
  const realBins = Array.from(new Set(omeBins.map((candidate) => {
    try {
      return fs.realpathSync(candidate);
    } catch {
      return candidate;
    }
  })));
  if (realBins.length > 1) warnings.push(`multiple ome binaries on PATH: ${omeBins.join(", ")}`);
}

function checkJsonl(filePath: string, label: string, warnings: string[]): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch {
      warnings.push(`invalid JSONL in ${label} at line ${index + 1}`);
    }
  }
}
