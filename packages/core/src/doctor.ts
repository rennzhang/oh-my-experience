import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ompHookStatus } from "../../adapters/agents/omp/src/hook-install.js";
import { inspectCards, listCards, rebuildCardIndex, type CardIndex } from "./cards.js";
import { ConfigSchema, type Config } from "./schema.js";
import { validateSignalIds } from "./signal-registry.js";
import { defaultDataDir, layout, readJson } from "./storage.js";
import { validateTriggerSignalContract, type TriggerSignalContractViolation } from "./trigger-signal-contract.js";
import { baselineOptionsFromConfig, renderBaselineCardBlock } from "./baseline.js";
import { unknownOperationPhases } from "./operation-phases.js";

type DoctorOptions = { codexHome?: string; claudeHome?: string; cursorHome?: string; ompHome?: string };
type HookHomes = Required<Omit<DoctorOptions, "ompHome">> & Pick<DoctorOptions, "ompHome">;
type HookFileFormat = "nested-user-prompt-submit" | "flat-before-submit-prompt";
type HookEntry = { hooks?: Array<{ command?: string }>; command?: string };

export function runDoctor(dataDir: string, {
  codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  claudeHome = path.join(os.homedir(), ".claude"),
  cursorHome = process.env.CURSOR_HOME || path.join(os.homedir(), ".cursor"),
  ompHome,
}: DoctorOptions = {}) {
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
  const cardInspection = checkCards(dataDir, errors, warnings);
  checkIndex(dataDir, errors);
  checkJsonl(l.events, "events", warnings);
  const config = checkConfig(dataDir, errors, warnings);
  checkBaseline(config, cardInspection.cards, warnings);
  checkHook(config, { codexHome, claudeHome, cursorHome, ompHome }, dataDir, errors, warnings);
  checkPackage(errors, warnings);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checked: {
      dataDir,
      experiences: cardInspection.cards.length,
      invalidCards: cardInspection.issues.length,
      triggerContractViolations: cardInspection.triggerContractViolations,
      layers: ["storage", "schema", "trigger-contract", "index", "hook", "config", "package"],
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

function checkCards(dataDir: string, errors: string[], warnings: string[]) {
  const seen = new Set<string>();
  let triggerContractViolations = 0;
  const inspection = inspectCards(dataDir);
  for (const issue of inspection.issues) {
    const message = `card schema invalid: ${path.relative(dataDir, issue.path)}: ${issue.message}`;
    if (issue.status === "archived") warnings.push(`archived ${message}`);
    else errors.push(message);
  }
  for (const card of inspection.cards) {
    if (seen.has(card.id)) errors.push(`duplicate card id: ${card.id}`);
    seen.add(card.id);
    if (!card.triggers.length) errors.push(`card has no triggers: ${card.id}`);
    if (!card.topics.length) warnings.push(`card has no topics: ${card.id}`);
    if (card.status === "active" && card.recallPolicy === "off") warnings.push(`active card recall is off: ${card.id}`);
    if (card.applicability.projectKey && card.applicability.projectKeys.length) {
      errors.push(`card sets both scope.project_key and scope.project_keys: ${card.id}; keep one`);
    }
    const cardModulePath = String(card.applicability.modulePath || "").trim();
    if (card.applicability.projectKeys.length > 1 && cardModulePath && cardModulePath !== ".") {
      errors.push(`card combines scope.project_keys with scope.module_path: ${card.id}; one module path cannot span several repositories, so the card never applies`);
    }
    const unknownPhases = unknownOperationPhases(card.appliesTo);
    if (unknownPhases.length) {
      const message = `card uses unknown applies_to values: ${card.id}: ${unknownPhases.join(", ")}`;
      if (card.status === "archived") warnings.push(message);
      else errors.push(message);
    }
    if (card.appliesTo.length > 3) warnings.push(`card lists ${card.appliesTo.length} applies_to phases: ${card.id}; narrow it or split the card`);
    if (card.baseline && card.status !== "active") warnings.push(`baseline flag on a ${card.status} card is ignored: ${card.id}`);
    const signalValidation = validateSignalIds([
      ...card.requiredSignals,
      ...card.requiredAllSignals,
      ...card.blockedSignals,
    ]);
    if (!signalValidation.ok) {
      const message = `card references unknown signal ids: ${card.id}: ${signalValidation.unknown.join(", ")}`;
      if (card.status === "archived") warnings.push(message);
      else errors.push(message);
      continue;
    }
    const triggerContract = validateTriggerSignalContract(card);
    triggerContractViolations += triggerContract.violations.length;
    for (const violation of triggerContract.violations) {
      const message = formatTriggerContractViolation(card.status, violation);
      if (card.status === "archived") warnings.push(message);
      else errors.push(message);
    }
  }
  const activeCards = inspection.cards.filter((card) => card.status === "active");
  const unlabeled = activeCards.filter((card) => !card.appliesTo.length);
  if (unlabeled.length) {
    warnings.push(`${unlabeled.length}/${activeCards.length} active cards have no applies_to; the model cannot tell which step they govern`);
  }
  return {
    ...inspection,
    triggerContractViolations,
  };
}

function checkBaseline(config: Config | null, cards: Array<{ id: string; title: string; rule: string; appliesTo: string[]; status: string; baseline: boolean; recallPolicy: string }>, warnings: string[]): void {
  if (!config) return;
  const options = baselineOptionsFromConfig(config.retrieval);
  if (!options.enabled) return;
  const baselineCards = cards.filter((card) => card.status === "active" && card.baseline && card.recallPolicy !== "off");
  if (!baselineCards.length) return;
  if (baselineCards.length > 5) {
    warnings.push(`${baselineCards.length} baseline cards are always-on; keep the standing set small so it stays readable`);
  }
  let total = 0;
  for (const card of baselineCards) {
    const chars = renderBaselineCardBlock({
      id: card.id,
      title: card.title,
      rule: card.rule,
      appliesTo: card.appliesTo,
      libraryScope: "global",
    }).length;
    total += chars;
    if (chars > options.setMaxChars || chars > options.maxChars) {
      warnings.push(`baseline card exceeds the delivery budget and is never delivered: ${card.id} (${chars} chars)`);
    }
  }
  if (total > options.maxChars) {
    warnings.push(`baseline set uses ${total} chars, above maxChars ${options.maxChars}; later cards are omitted whole`);
  }
}

function formatTriggerContractViolation(status: string, violation: TriggerSignalContractViolation): string {
  return [
    `${status} card trigger signal contract invalid: ${violation.cardId} trigger[${violation.triggerIndex}]`,
    `${violation.code}: ${violation.message}`,
    `Action: ${violation.action}`,
  ].join(": ");
}

function checkIndex(dataDir: string, errors: string[]): void {
  const index = readJson<CardIndex | null>(layout(dataDir).experienceIndex, null);
  if (!index) {
    errors.push("missing indexes/experiences.json");
    return;
  }
  let activeIds: Set<string>;
  try {
    activeIds = new Set(listCards(dataDir, "active").map((card) => card.id));
  } catch (error: any) {
    errors.push(`active card schema invalid: ${error.message}`);
    return;
  }
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

function checkHook(config: Config | null, { codexHome, claudeHome, cursorHome, ompHome }: HookHomes, dataDir: string, errors: string[], warnings: string[]): void {
  const codexEnabled = config?.hooks?.providers?.codex?.enabled;
  if (codexEnabled) {
    checkProviderHook("Codex", path.join(codexHome, "hooks.json"), "nested-user-prompt-submit", errors);
  }
  if (config?.hooks?.providers?.claude?.enabled) {
    checkProviderHook("Claude", path.join(claudeHome, "settings.json"), "nested-user-prompt-submit", errors);
  }
  if (config?.hooks?.providers?.cursor?.enabled) {
    checkProviderHook("Cursor", path.join(cursorHome, "hooks.json"), "flat-before-submit-prompt", errors);
  }
  if (config?.hooks?.providers?.omp?.enabled) checkOmpHook(ompHome, dataDir, errors);
  checkDuplicateCursorClaudeHooks(cursorHome, claudeHome, warnings);
}

function checkOmpHook(ompHome: string | undefined, dataDir: string, errors: string[]): void {
  try {
    const options = { ompHome, dataDir };
    const status = ompHookStatus(options);
    if (status.conflict || status.installed && !status.owned) {
      errors.push(`OMP hook enabled but extension is foreign or not OME-managed: ${status.target}`);
    } else if (!status.installed) {
      errors.push(`OMP hook enabled but extension not found: ${status.target}`);
    } else {
      // The installer may legitimately use a custom binary. Reuse only its
      // structured metadata, then compare the complete current template; a
      // retained ownership header alone never proves that code is unchanged.
      const installedBin = status.installedBin;
      const current = installedBin ? ompHookStatus({ ...options, bin: installedBin }) : status;
      if (!installedBin || !current.matchesExpectedCommand) {
        errors.push(`OMP hook enabled but managed extension does not match current expected content or dataDir: ${status.target}`);
      }
    }
  } catch {
    errors.push("OMP hook enabled but extension inspection failed; check its permissions and installation metadata");
  }
}

function checkProviderHook(provider: string, hookFile: string, format: HookFileFormat, errors: string[]): void {
  if (!fs.existsSync(hookFile)) {
    errors.push(`${provider} hook enabled but hook config not found: ${hookFile}`);
    return;
  }
  const installed = readOmeHookCommands(hookFile, format).some((command) => isMachineReadableOmeHookCommand(command));
  if (!installed) errors.push(`${provider} hook enabled but machine-readable ome hook command missing: ${hookFile}`);
}

function checkDuplicateCursorClaudeHooks(cursorHome: string, claudeHome: string, warnings: string[]): void {
  const cursorHas = readOmeHookCommands(path.join(cursorHome, "hooks.json"), "flat-before-submit-prompt").some((command) => isMachineReadableOmeHookCommand(command));
  const claudeHas = readOmeHookCommands(path.join(claudeHome, "settings.json"), "nested-user-prompt-submit").some((command) => isMachineReadableOmeHookCommand(command));
  if (cursorHas && claudeHas) {
    warnings.push("Cursor and Claude both have OME prompt-time hooks. Cursor may run both and inject duplicate recall context. Keep the Cursor native hook as the Cursor path, or remove one of them.");
  }
}

function readOmeHookCommands(hookFile: string, format: HookFileFormat): string[] {
  if (!fs.existsSync(hookFile)) return [];
  const hooks = readJson<{ hooks?: { UserPromptSubmit?: HookEntry[]; beforeSubmitPrompt?: HookEntry[] } } | null>(hookFile, null);
  if (format === "flat-before-submit-prompt") {
    const entries: HookEntry[] = Array.isArray(hooks?.hooks?.beforeSubmitPrompt) ? hooks.hooks.beforeSubmitPrompt : [];
    return entries.map((entry) => entry.command).filter((command): command is string => typeof command === "string");
  }
  const entries: HookEntry[] = Array.isArray(hooks?.hooks?.UserPromptSubmit) ? hooks.hooks.UserPromptSubmit : [];
  return entries.flatMap((entry) => (entry.hooks || []).map((hook) => hook.command)).filter((command): command is string => typeof command === "string");
}

function isMachineReadableOmeHookCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  if (!isOmeRuntimeHookCommand(command)) return false;
  return /(?:^|\s)--json(?:\s|$)/.test(command) || /(?:^|\s)--format(?:=|\s+)json(?:\s|$)/.test(command);
}

function isOmeRuntimeHookCommand(command: string): boolean {
  const normalized = command.replace(/\\/g, "/");
  return /(?:^|[\s/"'])(?:ome|oh-my-experience)(?:\.js)?['"]?\s+hook\s+run(?:\s|$)/i.test(normalized);
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
  if (realBins.length > 1 && hasConflictingOmeBinaries(realBins)) warnings.push(`multiple ome binaries on PATH: ${omeBins.join(", ")}`);
}

function hasConflictingOmeBinaries(realBins: string[]): boolean {
  const identities = new Set(realBins.map((bin) => readPackageIdentityForBin(bin) || `unknown:${bin}`));
  return identities.size > 1;
}

function readPackageIdentityForBin(binPath: string): string | null {
  let current = path.dirname(binPath);
  for (let depth = 0; depth < 5; depth += 1) {
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
        if (pkg?.name && pkg?.version) return `${pkg.name}@${pkg.version}`;
      } catch {
        return null;
      }
    }
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return null;
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
