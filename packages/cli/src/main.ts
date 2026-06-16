import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  archiveCard,
  auditStorage,
  compareRecallReports,
  compactSessionIndex,
  createRetrospectiveRun,
  defaultDataDir,
  detectProjectContext,
  evaluateRecallSuite,
  generateStats,
  getCard,
  getRetrospectiveRun,
  hashText,
  inspectCards,
  inspectProjectLibrary,
  initializeDataDir,
  initializeProjectLibrary,
  layout,
  listCards,
  listRetrospectiveRuns,
  listStarterCards,
  loadConfig,
  matchCardEntries,
  migrateLegacyCards,
  explainMatchFromCards,
  projectLibraryPath,
  previewConfigValue,
  previewApplyRetrospective,
  promoteDraft,
  renderAdditionalContext,
  pruneMaterializedSessions,
  repairIndex,
  readSessionIndex,
  readLibraryStackCards,
  resolveLibraryStack,
  runDoctor,
  saveConfig,
  setConfigValue,
  writeCandidates,
  addDecision,
  applyRetrospective,
  candidateFromLesson,
} from "../../core/src/index.js";
import { defaultConfigHome } from "../../core/src/storage.js";
import { scanCodexSessions } from "../../adapters/sources/codex-sessions/src/importer.js";
import { hookPlan as codexHookPlan, hookStatus as codexHookStatus, installHook as installCodexHook, uninstallHook as uninstallCodexHook } from "../../adapters/agents/codex/src/hook-install.js";
import { claudeHookPlan, claudeHookStatus, installClaudeHook, uninstallClaudeHook } from "../../adapters/agents/claude/src/hook-install.js";
import { checkSpool, scanSpoolSessions } from "../../adapters/sources/spool/src/spool.js";
import { runHook } from "../../hook-runtime/src/run.js";

type CliFlags = Record<string, any>;
type ParsedArgs = { flags: CliFlags; positionals: string[] };
const RETROSPECTIVE_GUIDE_REF = "skills/oh-my-experience/references/reflect-retrospective.md";
const EXPERIENCE_REVIEW_FILE = "experience-review.md";
const SPOOL_CLI_PACKAGE = "@spool-lab/cli";
const SPOOL_GITHUB_URL = "https://github.com/spool-lab/spool";

const KNOWN_COMMANDS = [
  "experience",
  "config",
  "doctor",
  "eval",
  "help",
  "hook",
  "init",
  "match",
  "project",
  "reflect",
  "source",
  "stats",
  "uninstall",
  "version",
];
const SUGGESTED_COMMANDS = KNOWN_COMMANDS.filter((command) => !["match", "reflect"].includes(command));

export async function runCli(argv: string[]) {
  const args = parseArgs(argv);
  const dataDir = path.resolve(args.flags.dataDir || args.flags["data-dir"] || process.env.OH_MY_EXPERIENCE_DATA_DIR || process.env.OME_HOME || defaultDataDir());
  const [command = "help", subcommand] = args.positionals;

  if (isVersionRequest(command, args)) return printVersion(args);
  if (isHelpRequest(command, subcommand, args)) return printHelp();
  if (command === "init") return initCommand(dataDir, args);
  if (command === "doctor") return doctorCommand(dataDir, args);
  if (command === "config") return configCommand(dataDir, subcommand, args);
  if (command === "reflect") return reflectCommand(scopedExperienceDataDir(dataDir, args), subcommand, args);
  if (command === "source") return sourceCommand(dataDir, subcommand, args);
  if (command === "experience") return experienceCommand(dataDir, subcommand, args);
  if (command === "match") return matchCommand(dataDir, args);
  if (command === "project") return projectCommand(dataDir, subcommand, args);
  if (command === "hook") return hookCommand(dataDir, subcommand, args);
  if (command === "uninstall") return uninstallCommand(dataDir, args);
  if (command === "eval") return evalCommand(dataDir, subcommand, args);
  if (command === "stats") return print(generateStats(dataDir, { persist: true }), args);
  throw new Error(unknownCommandMessage(command));
}

function isVersionRequest(command: string, args: ParsedArgs) {
  return command === "version" || command === "--version" || command === "-v" || Boolean(args.flags.version) || Boolean(args.flags.v);
}

function isHelpRequest(command: string, subcommand: string | undefined, args: ParsedArgs) {
  return command === "help"
    || command === "--help"
    || command === "-h"
    || subcommand === "help"
    || subcommand === "--help"
    || subcommand === "-h"
    || Boolean(args.flags.help)
    || Boolean(args.flags.h);
}

function printVersion(args: ParsedArgs) {
  const info = packageInfo();
  if (args.flags.json || args.flags.format === "json") {
    console.log(JSON.stringify(info, null, 2));
    return;
  }
  console.log(`${info.name} ${info.version}`);
}

function packageInfo() {
  const root = packageRoot();
  if (!root) return { name: "oh-my-experience", version: "unknown" };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return { name: parsed.name || "oh-my-experience", version: parsed.version || "unknown" };
  } catch {
    return { name: "oh-my-experience", version: "unknown" };
  }
}

function packageRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (parsed?.name === "oh-my-experience") return dir;
      } catch {
        // Keep walking up if an unexpected package.json is not parseable.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

function doctorCommand(dataDir: string, args: ParsedArgs) {
  const options = {
    codexHome: args.flags["codex-home"] ? path.resolve(args.flags["codex-home"]) : process.env.CODEX_HOME,
    claudeHome: args.flags["claude-home"] ? path.resolve(args.flags["claude-home"]) : undefined,
  };
  if (!args.flags["repair-index"]) return print(withLocalDiagnostics(runDoctor(dataDir, options), args), args);
  const repairedIndex = repairIndex(dataDir);
  return print({ repairedIndex, doctor: withLocalDiagnostics(runDoctor(dataDir, options), args) }, args);
}

function withLocalDiagnostics(record: any, args: ParsedArgs) {
  const errors = [...(Array.isArray(record.errors) ? record.errors : [])];
  const warnings = [...(Array.isArray(record.warnings) ? record.warnings : [])];
  const projectLibrary = inspectCurrentProjectLibraryHealth(args);
  if (projectLibrary?.exists && projectLibrary.readable) {
    for (const issue of projectLibrary.invalidCards || []) {
      const message = `project card schema invalid: ${path.relative(projectLibrary.dataDir, issue.path)}: ${issue.message}`;
      if (issue.status === "archived") warnings.push(`archived ${message}`);
      else errors.push(message);
    }
  }
  for (const warning of projectLibrary?.warnings || []) warnings.push(warning);
  const agentSkills = inspectAgentSkillsHealth(args, String(record.checked?.dataDir || ""));
  for (const skill of agentSkills) {
    if (skill.warning) warnings.push(skill.warning);
  }
  return {
    ...record,
    ok: errors.length === 0,
    errors,
    warnings,
    checked: {
      ...(record.checked || {}),
      projectLibrary,
      agentSkills,
    },
  };
}

function inspectCurrentProjectLibraryHealth(args: ParsedArgs) {
  const cwd = args.flags.cwd ? path.resolve(args.flags.cwd) : process.cwd();
  const projectContext = detectProjectContext(cwd);
  if (!projectContext.root) return null;
  const library = inspectProjectLibrary(projectContext.root);
  const health: any = {
    projectContext,
    scope: "project",
    dataDir: library.dataDir,
    exists: library.exists,
    readable: library.readable,
    warnings: [...library.warnings],
    experiences: 0,
    invalidCards: [],
    ok: true,
  };
  if (!library.exists || !library.readable) return health;
  const inspection = inspectCards(library.dataDir);
  health.experiences = inspection.cards.length;
  health.invalidCards = inspection.issues;
  health.ok = inspection.issues.every((issue) => issue.status === "archived");
  return health;
}

function inspectAgentSkillsHealth(args: ParsedArgs, dataDir: string) {
  return skillProvidersForHealth(args, dataDir).map((provider) => inspectAgentSkillHealth(planSkill({
    provider,
    codexHome: codexHome(args),
    claudeHome: claudeHome(args),
    dryRun: true,
  })));
}

function skillProvidersForHealth(args: ParsedArgs, dataDir: string): string[] {
  if (args.flags.provider || args.flags.providers) return selectedProviders(args);
  if (!dataDir) return ["codex"];
  try {
    const config = loadConfig(dataDir);
    const enabled = Object.entries(asRecord(config.hooks?.providers))
      .filter(([, value]) => asRecord(value).enabled)
      .map(([provider]) => provider)
      .filter((provider) => provider === "codex" || provider === "claude");
    return enabled.length ? enabled : ["codex"];
  } catch {
    return ["codex"];
  }
}

function inspectAgentSkillHealth(plan: Record<string, any>) {
  if (plan.skipped) {
    return {
      provider: plan.provider,
      skipped: true,
      reason: plan.reason,
      current: null,
      bundled: null,
      inSync: true,
    };
  }
  const health: any = {
    provider: plan.provider,
    target: plan.target,
    source: plan.source,
    installed: plan.installed,
    owned: plan.owned,
    legacyOwned: plan.legacyOwned,
    conflict: plan.conflict,
    current: null,
    bundled: null,
    inSync: true,
  };
  if (!plan.installed || plan.conflict || !fs.existsSync(plan.source) || !fs.existsSync(plan.target)) {
    return health;
  }
  health.current = directoryFingerprint(plan.target, new Set([OME_SKILL_MARKER]));
  health.bundled = directoryFingerprint(plan.source, new Set());
  health.inSync = health.current === health.bundled;
  if (!health.inSync) {
    health.warning = `installed ${providerName(plan.provider)} OME skill differs from bundled package: ${plan.target}. Run \`ome init --provider ${plan.provider}\` to refresh it.`;
  }
  return health;
}

function directoryFingerprint(root: string, skipNames: Set<string>): string {
  const entries: string[] = [];
  collectDirectoryFingerprintEntries(root, root, skipNames, entries);
  return hashText(entries.sort().join("\n"));
}

function collectDirectoryFingerprintEntries(root: string, current: string, skipNames: Set<string>, entries: string[]): void {
  if (!fs.existsSync(current)) return;
  for (const item of fs.readdirSync(current, { withFileTypes: true })) {
    if (skipNames.has(item.name)) continue;
    const absolute = path.join(current, item.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (item.isDirectory()) {
      entries.push(`dir:${relative}`);
      collectDirectoryFingerprintEntries(root, absolute, skipNames, entries);
    } else if (item.isFile()) {
      entries.push(`file:${relative}:${hashText(fs.readFileSync(absolute, "utf8"))}`);
    }
  }
}

function configCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === "get") return print(loadConfig(dataDir), args);
  if (subcommand === "preview") {
    const [key, value] = args.positionals.slice(2);
    if (!key || value === undefined) throw new Error("usage: ome config preview <key> <value>");
    return print(previewConfigValue(dataDir, key, value), args);
  }
  if (subcommand === "set") {
    const [key, value] = args.positionals.slice(2);
    if (!key || !value) throw new Error("usage: ome config set <key> <value>");
    return print(setConfigValue(dataDir, key, value), args);
  }
  throw new Error("usage: ome config get|set");
}

async function initCommand(dataDir: string, args: ParsedArgs) {
  validateInitFlags(args);
  if (shouldRunInteractiveInit(args)) return interactiveInitCommand(dataDir, args);
  return print(runInitSetup(dataDir, args), args);
}

function runInitSetup(dataDir: string, args: ParsedArgs) {
  const result = initializeDataDir({
    dataDir,
    dryRun: Boolean(args.flags["dry-run"]),
    writePointer: true,
    resetConfig: shouldResetInitConfig(args),
  });
  const hookPlan = planInitHooks(dataDir, args, Boolean(args.flags["dry-run"]));
  const skillPlan = planInitSkills(args, Boolean(args.flags["dry-run"]));
  if (!args.flags["dry-run"]) {
    const hooks = installInitHooks(dataDir, args);
    const skills = installInitSkills(args);
    return {
      ...result,
      hooks,
      skills,
      starterCards: listStarterCards(dataDir).map((card) => ({ id: card.id, title: card.title, category: card.category })),
      nextStep: initNextStep(hooks),
    };
  }
  return { ...result, hooks: hookPlan, skills: skillPlan };
}

function initNextStep(hooks: unknown) {
  return hasInstalledRecallHook(hooks)
    ? "Send a real task to your agent; the installed hook will recall relevant active experiences automatically."
    : "Library is ready. Connect an agent later with `ome init --provider codex`, `ome init --provider claude`, or `ome init --provider all` to enable prompt-time recall.";
}

function hasInstalledRecallHook(hooks: unknown) {
  return Array.isArray(hooks) && hooks.some((hook) => Boolean(asRecord(hook).installed));
}

function shouldRunInteractiveInit(args: ParsedArgs) {
  if (args.flags.json || args.flags["dry-run"] || args.flags.yes || args.flags.y) return false;
  if (args.flags.interactive) return true;
  if (args.flags["no-interactive"]) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function validateInitFlags(args: ParsedArgs) {
  const allowed = new Set([
    "bin",
    "claude-home",
    "codex-home",
    "data-dir",
    "dataDir",
    "dry-run",
    "format",
    "force",
    "interactive",
    "json",
    "no-hook",
    "no-interactive",
    "provider",
    "providers",
    "overwrite-config",
    "reset-config",
    "y",
    "yes",
  ]);
  const unknown = Object.keys(args.flags).filter((flag) => !allowed.has(flag));
  if (unknown.length) throw new Error(`unknown init option(s): ${unknown.map((flag) => `--${flag}`).join(", ")}`);
}

function shouldResetInitConfig(args: ParsedArgs) {
  return Boolean(args.flags["reset-config"] || args.flags["overwrite-config"]);
}

async function interactiveInitCommand(defaultDataDirectory: string, args: ParsedArgs) {
  const existingConfig = loadExistingConfig(defaultDataDirectory);
  const copy = initCopy();
  const prompt = createPromptSession();
  try {
    if (args.flags.interactive && !prompt.interactive && !prompt.hasInput) {
      throw new Error(copy.interactiveNeedsTerminal);
    }
    printInitHero(copy, existingConfig ? "existing" : "new");
    const dataDir = path.resolve(expandHome(await askText(prompt, {
      step: "1/2",
      title: copy.dataDirPrompt,
      description: copy.dataDirDescription,
      defaultValue: existingConfig?.dataDir || defaultDataDirectory,
      placeholder: copy.pathPlaceholder,
    })));
    const hookChoice = await chooseHookChoice(copy, prompt, args);
    const spoolChoice = await chooseSpoolChoice(copy, prompt);
    const nextArgs = cloneArgs(args);
    nextArgs.flags["data-dir"] = dataDir;
    if (hookChoice === "none") nextArgs.flags["no-hook"] = true;
    else {
      delete nextArgs.flags["no-hook"];
      nextArgs.flags.provider = hookChoice;
    }

    printInitPlan(copy, { dataDir, hookChoice, spoolChoice }, nextArgs);
    const confirmed = await askYesNo(prompt, {
      title: copy.confirmPrompt,
      description: copy.confirmDescription,
      defaultValue: true,
      invalidMessage: copy.invalidYesNo,
      requireExplicit: true,
    });
    if (!confirmed) {
      console.log(`\n${copy.cancelled}`);
      return;
    }
    const result = runInitSetup(dataDir, nextArgs);
    if (spoolChoice.mode === "enabled") enableSpoolSource(dataDir);
    printInitDone(copy, dataDir, hookChoice, result, spoolChoice);
    await waitForAnyKey(copy, prompt.interactive);
  } finally {
    prompt.close();
  }
}

function loadExistingConfig(dataDir: string) {
  if (!fs.existsSync(layout(dataDir).config)) return null;
  try {
    return loadConfig(dataDir);
  } catch {
    return null;
  }
}

function initHookChoice(args: ParsedArgs) {
  if (args.flags["no-hook"]) return "none";
  const providers = selectedProviders(args);
  if (!providers.length) return "none";
  if (providers.includes("codex") && providers.includes("claude")) return "all";
  if (providers.includes("claude")) return "claude";
  return "codex";
}

function cloneArgs(args: ParsedArgs): ParsedArgs {
  return { flags: { ...args.flags }, positionals: [...args.positionals] };
}

type PromptSession = {
  interactive: boolean;
  hasInput: boolean;
  question(prompt: string): Promise<string>;
  close(): void;
};

function createPromptSession(): PromptSession {
  if (!process.stdin.isTTY) {
    const input = fs.readFileSync(0, "utf8");
    const lines = input.split(/\r?\n/);
    let index = 0;
    return {
      interactive: false,
      hasInput: input.length > 0,
      async question(prompt: string) {
        process.stdout.write(prompt);
        return lines[index++] ?? "";
      },
      close() {},
    };
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    interactive: true,
    hasInput: true,
    question: (prompt: string) => rl.question(prompt),
    close: () => rl.close(),
  };
}

function expandHome(value: string) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function askText(prompt: PromptSession, question: { step: string; title: string; description: string; defaultValue: string; placeholder: string }) {
  printStep(question.step, question.title, question.description);
  console.log(`  ${dim(question.placeholder)} ${question.defaultValue}`);
  const answer = await prompt.question(cyan("  > "));
  return answer.trim() || question.defaultValue;
}

async function chooseHookChoice(copy: InitCopy, prompt: PromptSession, args: ParsedArgs) {
  if (args.flags["no-hook"] || args.flags.provider || args.flags.providers) return initHookChoice(args);
  printStep("2/2", copy.agentStepPrompt, copy.agentStepDescription);
  console.log(`  ${dim(copy.agentChoiceHelp)}`);
  while (true) {
    const answer = (await prompt.question(`${dim("[codex]")} ${cyan("> ")}`)).trim();
    const choice = normalizeHookChoice(answer || "codex");
    if (choice) return choice;
    console.log(dim(copy.invalidAgentChoice));
    if (!prompt.interactive) return "codex";
  }
}

function normalizeHookChoice(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "codex") return "codex";
  if (["claude", "cloud"].includes(normalized)) return "claude";
  if (["all", "both", "codex+claude", "codex,claude"].includes(normalized)) return "all";
  if (["none", "skip", "no", "off"].includes(normalized)) return "none";
  return "";
}

async function askYesNo(prompt: PromptSession, question: { title: string; description?: string; defaultValue: boolean; invalidMessage: string; requireExplicit?: boolean }) {
  const suffix = question.requireExplicit ? "y/n" : (question.defaultValue ? "Y/n" : "y/N");
  console.log(`\n${bold(question.title)}`);
  if (question.description) console.log(dim(question.description));
  while (true) {
    const answer = (await prompt.question(`${dim(`[${suffix}]`)} ${cyan("> ")}`)).trim().toLowerCase();
    if (!answer) {
      if (!question.requireExplicit) return question.defaultValue;
      console.log(dim(question.invalidMessage));
      if (!prompt.interactive) return false;
      continue;
    }
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;
    console.log(dim(question.invalidMessage));
    if (!prompt.interactive) return false;
  }
}

function printStep(step: string, title: string, description: string) {
  const label = /[\u4e00-\u9fa5]/.test(title) ? "步骤" : "Step";
  console.log("");
  console.log(`${cyan("◆")} ${dim(`${label} ${step}`)}  ${bold(title)}`);
  for (const line of wrapText(description, contentWidth() - 4)) console.log(`  ${dim(line)}`);
}

function printInitHero(copy: InitCopy, mode: "new" | "existing") {
  console.log("\x1B[2J\x1B[3J\x1B[H");
  const info = packageInfo();
  printBrandMark(copy, info.version);
  console.log("");
  console.log(`${bold(copy.setupTitle)} ${dim(`(${mode === "existing" ? copy.modeExisting : copy.modeNew})`)}`);
  console.log(dim(copy.controls));
}

function printBrandMark(copy: InitCopy, version: string) {
  const logo = [
    "   ____  __  ___ ______",
    "  / __ \\/  |/  // ____/",
    " / / / / /|_/ // __/   ",
    "/ /_/ / /  / // /___   ",
    "\\____/_/  /_//_____/   ",
  ];
  const label = `${copy.productName} v${version}`;

  console.log("");
  for (const line of logo) console.log(magenta(bold(line)));
  console.log("");
  console.log(bold(label));
  console.log(bold(copy.heroClaim));
  console.log(dim(`${copy.pillarLocal} · ${copy.pillarReview} · ${copy.pillarRecall}`));
}

function printInitPlan(copy: InitCopy, plan: { dataDir: string; hookChoice: string; spoolChoice: SpoolSetupChoice }, args: ParsedArgs) {
  const hookPlan = planInitHooks(plan.dataDir, args, true);
  const hookTargets = Array.isArray(hookPlan)
    ? hookPlan.map((hook) => formatHookPlanTarget(asRecord(hook))).filter(Boolean)
    : [];
  const skillPlans = planInitSkills(args, true);
  printPanel(copy.planTitle, [
    keyValue(copy.doneDataDir, plan.dataDir),
    keyValue(copy.doneHook, formatHookChoice(plan.hookChoice, copy)),
    ...hookTargets,
    ...skillPlans.map((skill) => formatSkillPlanTarget(asRecord(skill))).filter(Boolean),
    keyValue(copy.spoolPlanLabel, plan.spoolChoice.summary),
  ]);
}

function printInitDone(copy: InitCopy, dataDir: string, hookChoice: string, result: unknown, spoolChoice: SpoolSetupChoice) {
  const hooks = Array.isArray((result as any).hooks) ? (result as any).hooks : [];
  const codexHookInstalled = hooks.some((hook: any) => hook.provider === "codex" && hook.installed);
  const recallEnabled = hasInstalledRecallHook(hooks);
  const skills: unknown[] = Array.isArray((result as any).skills) ? (result as any).skills : [];
  printPanel(green(copy.doneTitle), [
    keyValue(copy.doneDataDir, dataDir),
    keyValue(copy.doneConfig, configPointerPath()),
    keyValue(copy.doneHook, formatHookChoice(hookChoice, copy)),
    ...skills.map((skill) => formatSkillPlanTarget(asRecord(skill))).filter(Boolean),
    keyValue(copy.spoolPlanLabel, spoolChoice.done),
    ...(codexHookInstalled ? [copy.doneCodexTrust] : []),
  ]);
  console.log(`\n${bold(copy.heroCta)}`);
  if (recallEnabled) {
    console.log(`${bold(copy.nextSteps)} ${dim(copy.starterPromptIntro)}`);
    console.log("");
    console.log(bold(copy.copyPromptHint));
    printPromptBlock(copy.starterPrompt, copy);
  } else {
    console.log(`${bold(copy.nextSteps)} ${dim(copy.noHookNextStep)}`);
  }
  console.log(`\n${bold(copy.recommendations)}`);
  printRecommendation(1, copy.afterRecallTitle, copy.afterRecallIntro, copy.firstCardGuide);
  printRecommendation(2, copy.sourceScanRecommendation, copy.sourceScanDescription, copy.sourceScanGuide);
}

type SpoolSetupChoice = {
  mode: "off" | "enabled";
  summary: string;
  done: string;
};

async function chooseSpoolChoice(copy: InitCopy, prompt: PromptSession): Promise<SpoolSetupChoice> {
  const before = checkSpool();
  if (before.available) {
    const enable = await askYesNo(prompt, {
      title: copy.spoolEnablePrompt,
      description: copy.spoolEnableDescription.replace("{version}", before.version || copy.unknownVersion),
      defaultValue: false,
      invalidMessage: copy.invalidYesNo,
    });
    return enable
      ? { mode: "enabled", summary: copy.spoolEnabledSummary.replace("{version}", before.version || copy.unknownVersion), done: copy.spoolEnabled }
      : { mode: "off", summary: copy.spoolDetectedSkipped.replace("{version}", before.version || copy.unknownVersion), done: copy.spoolSkipped };
  }

  return {
    mode: "off",
    summary: copy.spoolMissingSummary,
    done: `${copy.spoolMissingSummary} ${copy.spoolInstallLabel} npm install -g ${SPOOL_CLI_PACKAGE}. ${copy.spoolBoundary}`,
  };
}

function enableSpoolSource(dataDir: string) {
  const config = loadConfig(dataDir);
  saveConfig(dataDir, { ...config, sources: { ...config.sources, spool: { mode: "enabled" } } });
}

async function waitForAnyKey(copy: InitCopy, enabled: boolean) {
  if (!enabled || !process.stdin.isTTY || !process.stdin.setRawMode) return;
  console.log(`\n${dim(copy.exitHint)}`);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      stdin.off("data", onData);
      if (!wasRaw) stdin.setRawMode(false);
      stdin.pause();
      resolve();
    };
    const onData = (data: Buffer) => {
      if (data.includes(0x03)) {
        process.exitCode = 130;
        cleanup();
      } else if (data.length) {
        cleanup();
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function formatHookChoice(value: string, copy: InitCopy) {
  if (value === "none") return copy.disabled;
  if (value === "claude") return "Claude";
  if (value === "all") return "Codex + Claude";
  return "Codex";
}

function formatHookPlanTarget(record: Record<string, any>) {
  if (record.skipped) return "";
  const target = String(record.target || "");
  return keyValue(`${providerName(record.provider)} hook:`, target);
}

function formatSkillPlanTarget(record: Record<string, any>) {
  if (record.skipped) return "";
  const target = String(record.target || "");
  return keyValue(`${providerName(record.provider)} skill:`, target);
}

type InitCopy = ReturnType<typeof initCopy>;

function printParagraph(value: string) {
  for (const line of wrapText(value, contentWidth() - 2)) console.log(`  ${line}`);
}

function printPromptBlock(prompt: string, copy: InitCopy) {
  console.log(dim(copy.copyPromptStart));
  for (const line of prompt.split("\n")) console.log(dim(line));
  console.log(dim(copy.copyPromptEnd));
}

function printRecommendation(index: number, title: string, description: string, guide: string) {
  console.log(`  ${index}. ${bold(title)}`);
  for (const line of wrapText(description, contentWidth() - 7)) console.log(`     ${dim(line)}`);
  console.log(`     ${guide}`);
}

function printPanel(title: string, lines: string[]) {
  const width = contentWidth();
  const innerWidth = width - 4;
  const cleanTitle = stripAnsi(title);
  const topRemainder = Math.max(1, width - visibleLength(cleanTitle) - 5);
  console.log("");
  console.log(cyan(`╭─ ${title} ${"─".repeat(topRemainder)}╮`));
  for (const rawLine of lines) {
    const wrapped = rawLine ? wrapText(rawLine, innerWidth) : [""];
    for (const line of wrapped) console.log(`${cyan("│")} ${padVisible(line, innerWidth)} ${cyan("│")}`);
  }
  console.log(cyan(`╰${"─".repeat(width - 2)}╯`));
}

function keyValue(label: string, value: string) {
  return `${label.padEnd(18)} ${value}`;
}

function contentWidth() {
  if (!process.stdout.columns) return 112;
  return Math.min(120, Math.max(72, process.stdout.columns));
}

function wrapText(value: string, width: number) {
  const text = String(value);
  if (visibleLength(text) <= width) return [text];
  const indent = text.match(/^\s*/)?.[0] || "";
  const words = text.trimStart().split(/\s+/);
  const lines: string[] = [];
  let current = indent;
  for (const word of words) {
    if (visibleLength(`${indent}${word}`) > width) {
      if (current.trim()) lines.push(current);
      const chunkWidth = Math.max(1, width - visibleLength(indent));
      const chunks = hasAnsi(word) ? chunkStyledText(word, chunkWidth) : chunkPlainText(word, chunkWidth);
      for (const chunk of chunks.slice(0, -1)) lines.push(`${indent}${chunk}`);
      current = `${indent}${chunks.at(-1) || ""}`;
      continue;
    }
    const next = current.trim() ? `${current} ${word}` : `${indent}${word}`;
    if (visibleLength(next) > width && current) {
      lines.push(current);
      current = `${indent}${word}`;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

function hasAnsi(value: string) {
  return /\x1B\[[0-?]*[ -/]*[@-~]/.test(value);
}

function chunkPlainText(value: string, width: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += width) chunks.push(value.slice(index, index + width));
  return chunks.length ? chunks : [value];
}

function chunkStyledText(value: string, width: number) {
  const match = value.match(/^((?:\x1B\[[0-?]*[ -/]*[@-~])+)(.*)(\x1B\[0m)$/);
  if (!match) return chunkPlainText(stripAnsi(value), width);
  const [, prefix, text, suffix] = match;
  return chunkPlainText(text, width).map((chunk) => `${prefix}${chunk}${suffix}`);
}

function padVisible(value: string, width: number) {
  return value + " ".repeat(Math.max(0, width - visibleLength(value)));
}

function visibleLength(value: string) {
  return stripAnsi(value).length;
}

function stripAnsi(value: string) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function initCopy() {
  return {
    productName: "Oh My Experience",
    setupTitle: "Oh My Experience Setup",
    setupSubtitle: "local-first experience recall for AI coding agents",
    heroClaim: "Stop teaching your agent the same lesson twice.",
    heroCta: "Recall is ready for your next agent task.",
    heroBody: "Choose a library path; OME installs the recall hooks and skills you select.",
    pillarLocal: "Local-first",
    pillarReview: "Draft approval-first",
    pillarRecall: "Prompt-time recall",
    controls: "Enter accepts path defaults · confirmation requires y/n · Ctrl+C cancels",
    modeNew: "first-time setup",
    modeExisting: "reconfigure existing library",
    existingTitle: "Existing config:",
    existingHint: "Only confirmed settings are updated; init does not rewrite experiences or activate new ones.",
    dataDirPrompt: "Where should the experience library live?",
    dataDirDescription: "Stores experiences, retrospectives, indexes, and events in a local OME directory. You can move it later with config preview/set.",
    pathPlaceholder: "Default path:",
    agentStepPrompt: "Which agents should OME connect?",
    agentStepDescription: "OME recalls experience through prompt-time hooks. Codex is the best-tested path today; Claude uses the same hook runtime. Choose codex, claude, all, or none.",
    agentChoiceHelp: "Choices: codex, claude, all, none. Press Enter for codex.",
    invalidAgentChoice: "Enter codex, claude, all, or none.",
    confirmPrompt: "Continue?",
    confirmDescription: "OME will save this library path, install the selected recall hooks and skills, and add built-in starter lessons.",
    cancelled: "Cancelled. Nothing was written.",
    planTitle: "Setup summary",
    doneTitle: "Setup complete",
    doneDataDir: "Library ready:",
    doneConfig: "Config file:",
    doneHook: "Recall enabled:",
    spoolPlanLabel: "Spool source:",
    doneCodexTrust: "Codex App may ask you to trust the new UserPromptSubmit hook.",
    donePrivacy: "Raw prompt text is not written to events by default.",
    nextSteps: "Next task:",
    recommendations: "Suggestions:",
    starterPromptIntro: "Starter lessons are active. Send this to your selected agent so the hook can recall relevant experience automatically.",
    noHookNextStep: "Starter lessons are active, but no agent is connected yet. Run `ome init --provider codex`, `ome init --provider claude`, or `ome init --provider all` when you want prompt-time recall.",
    copyPromptHint: "Copy this task into your selected agent:",
    copyPromptStart: "```text",
    copyPromptEnd: "```",
    starterPrompt: [
      "Create a goal and start now: in /tmp/ome-todo-demo, build a small single-page Todo app with plain HTML, CSS, and JavaScript.",
      "It should let me add tasks, mark tasks complete, delete tasks, clear completed tasks, show the remaining count, persist tasks in localStorage, and look usable on a narrow mobile viewport.",
      "Verify it through the real browser entry before reporting completion.",
      "After finishing, guide me through the OME lifecycle: scan this full run, summarize reusable lessons, review the generated drafts with me, and only add approved drafts to the experience library.",
    ].join("\n"),
    afterRecallTitle: "Turn real corrections into cards",
    afterRecallIntro: "If the first recall feels right, ask your agent to run a first-card flow or a fuller retrospective. New lessons stay in draft approval until you confirm them.",
    firstCardGuide: "https://github.com/rennzhang/oh-my-experience/blob/main/docs/guides/first-card.md",
    sourceScanRecommendation: "Connect more agent histories with Spool",
    sourceScanDescription: "Use Spool when you want OME to search more local agent history. OME recall works without it.",
    sourceScanGuide: "https://github.com/rennzhang/oh-my-experience/blob/main/docs/guides/source-scan.md",
    spoolMissingSummary: "Spool is not installed. OME is ready without it; install later only if you want wider local history search.",
    spoolGithubLabel: "GitHub:",
    spoolInstallLabel: "CLI install:",
    spoolBoundary: "OME will not install Spool during first setup. Scanned material still requires draft approval before it can become active.",
    spoolEnablePrompt: "Spool CLI detected. Enable Spool sources?",
    spoolEnableDescription: "Detected Spool {version}. This only updates OME source config. It does not scan history or activate any experience cards.",
    spoolEnabledSummary: "enabled via Spool {version}",
    spoolDetectedSkipped: "available ({version}), not enabled",
    spoolEnabled: "Spool sources enabled.",
    spoolSkipped: "available, not enabled",
    unknownVersion: "unknown",
    exitHint: "Press any key to exit",
    enabled: "Enabled",
    disabled: "Disabled",
    invalidYesNo: "Enter y or n.",
    interactiveNeedsTerminal: "ome init --interactive requires a real terminal or complete answers through stdin. Use ome init -y for scripted setup.",
  };
}

function color(code: string, value: string) {
  if (process.env.NO_COLOR) return value;
  return `\x1B[${code}m${value}\x1B[0m`;
}

function bold(value: string) {
  return color("1", value);
}

function dim(value: string) {
  return color("2", value);
}

function cyan(value: string) {
  return color("36", value);
}

function magenta(value: string) {
  return color("35", value);
}

function green(value: string) {
  return color("32", value);
}

function strongInline(value: string) {
  return bold(value);
}

function planInitHooks(dataDir: string, args: ParsedArgs, dryRun: boolean) {
  if (args.flags["no-hook"]) return { ok: true, skipped: true, reason: "--no-hook" };
  return selectedProviders(args).map((provider) => {
    const adapter = provider === "claude" ? claudeHookPlan : codexHookPlan;
    return adapter({ ...hookInstallOptions(dataDir, args), dryRun } as any);
  });
}

function installInitHooks(dataDir: string, args: ParsedArgs) {
  if (args.flags["no-hook"]) return { ok: true, skipped: true, reason: "--no-hook" };
  return selectedProviders(args).map((provider) => {
    const adapter = provider === "claude" ? installClaudeHook : installCodexHook;
    const result: any = adapter(hookInstallOptions(dataDir, args) as any);
    if (result.installed) recordHookConfig(dataDir, provider, true);
    return result;
  });
}

function selectedProviders(args: ParsedArgs): string[] {
  const raw = String(args.flags.provider || args.flags.providers || "codex");
  const values = raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!values.length || values.some((item) => ["none", "skip", "no", "off"].includes(item))) return [];
  if (values.some((item) => ["all", "both"].includes(item))) return ["codex", "claude"];
  return Array.from(new Set(values.map((item) => ["claude", "cloud"].includes(item) ? "claude" : "codex")));
}

function hookInstallOptions(dataDir: string, args: ParsedArgs) {
  return {
    dryRun: Boolean(args.flags["dry-run"]),
    codexHome: codexHome(args),
    claudeHome: args.flags["claude-home"] ? path.resolve(args.flags["claude-home"]) : undefined,
    bin: args.flags.bin || "ome",
    dataDir,
  };
}

const OME_SKILL_NAME = "oh-my-experience";
const OME_SKILL_MARKER = ".ome-skill.json";

type SkillOptions = {
  provider?: string;
  codexHome?: string;
  claudeHome?: string;
  dryRun?: boolean;
  force?: boolean;
};

function planInitSkills(args: ParsedArgs, dryRun: boolean) {
  if (args.flags["no-hook"]) return [];
  return selectedProviders(args).map((provider) => planSkill({
    provider,
    codexHome: codexHome(args),
    claudeHome: claudeHome(args),
    dryRun,
  }));
}

function planSkill(options: SkillOptions = {}) {
  const provider = options.provider === "claude" ? "claude" : "codex";
  const root = provider === "claude"
    ? (options.claudeHome || path.join(os.homedir(), ".claude"))
    : (options.codexHome || codexHome({ flags: {}, positionals: [] }));
  const target = path.join(root, "skills", OME_SKILL_NAME);
  const source = path.join(packageRoot(), "skills", OME_SKILL_NAME);
  const existing = inspectSkillTarget(target);
  return {
    ok: true,
    provider,
    name: OME_SKILL_NAME,
    root,
    source,
    target,
    installed: existing.installed,
    owned: existing.owned,
    legacyOwned: existing.legacyOwned,
    conflict: existing.installed && !existing.owned,
    dryRun: Boolean(options.dryRun),
  };
}

function installInitSkills(args: ParsedArgs) {
  if (args.flags["no-hook"]) return [];
  return selectedProviders(args).map((provider) => installSkill({
    provider,
    codexHome: codexHome(args),
    claudeHome: claudeHome(args),
    dryRun: false,
    force: Boolean(args.flags.force),
  }));
}

function installSkill(options: SkillOptions = {}) {
  const plan = planSkill(options);
  if (!fs.existsSync(plan.source)) throw new Error(`bundled OME skill not found: ${plan.source}`);
  if (plan.conflict && !options.force) {
    throw new Error(`${providerName(plan.provider)} skill target already exists and is not owned by OME: ${plan.target}. Use --force only if you want to replace it.`);
  }
  if (options.dryRun) return plan;
  fs.rmSync(plan.target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(plan.target), { recursive: true });
  fs.cpSync(plan.source, plan.target, { recursive: true });
  writeSkillMarker(plan.target, plan.provider);
  return { ...plan, installed: true, owned: true, conflict: false };
}

function uninstallSkill(options: SkillOptions = {}) {
  const plan = planSkill(options);
  if (!plan.installed) return { ...plan, uninstalled: false, reason: "not installed" };
  if (plan.conflict && !options.force) {
    throw new Error(`${providerName(plan.provider)} skill target exists but is not owned by OME: ${plan.target}. Use --force only if you want to remove it.`);
  }
  if (options.dryRun) return { ...plan, dryRun: true };
  fs.rmSync(plan.target, { recursive: true, force: true });
  return { ...plan, installed: false, uninstalled: true };
}

function inspectSkillTarget(target: string) {
  if (!fs.existsSync(target)) return { installed: false, owned: false, legacyOwned: false };
  const marker = path.join(target, OME_SKILL_MARKER);
  if (fs.existsSync(marker)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (parsed?.name === OME_SKILL_NAME) return { installed: true, owned: true, legacyOwned: false };
    } catch {
      return { installed: true, owned: false, legacyOwned: false };
    }
  }
  const skillFile = path.join(target, "SKILL.md");
  const legacyOwned = fs.existsSync(skillFile) && /^name:\s*oh-my-experience\s*$/m.test(fs.readFileSync(skillFile, "utf8"));
  return { installed: true, owned: legacyOwned, legacyOwned };
}

function writeSkillMarker(target: string, provider: string) {
  const info = packageInfo();
  fs.writeFileSync(path.join(target, OME_SKILL_MARKER), JSON.stringify({
    name: OME_SKILL_NAME,
    provider,
    package: info.name,
    version: info.version,
    installedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

function codexHome(args: ParsedArgs) {
  return args.flags["codex-home"] ? path.resolve(args.flags["codex-home"]) : process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function claudeHome(args: ParsedArgs) {
  return args.flags["claude-home"] ? path.resolve(args.flags["claude-home"]) : path.join(os.homedir(), ".claude");
}

function configPointerPath() {
  return path.join(defaultConfigHome(), "config.json");
}

function reflectCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (!subcommand || subcommand === "start" || subcommand === "create") return createReflectRun(dataDir, args);
  if (subcommand === "resume") {
    const runId = args.positionals[2];
    if (!runId) throw new Error("usage: ome reflect resume <runId>");
    return print(withReviewPaths(dataDir, getRetrospectiveRun(dataDir, runId)), args);
  }
  if (subcommand === "list") return print({ ok: true, retrospectives: listRetrospectiveRuns(dataDir) }, args);
  if (subcommand === "show") {
    const runId = args.positionals[2];
    if (!runId) throw new Error("usage: ome reflect show <runId>");
    return print(withReviewPaths(dataDir, getRetrospectiveRun(dataDir, runId)), args);
  }
  if (subcommand === "candidates") {
    const runId = args.positionals[2];
    const file = args.flags.fromFile || args.flags["from-file"];
    if (!runId || !file) throw new Error("usage: ome reflect candidates <runId> --from-file <json>");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const lessons: Array<Record<string, any>> = raw.candidates || raw;
    const candidates = lessons.map((lesson: Record<string, any>) => candidateFromLesson(runId, lesson));
    const audit = readReflectAuditInput(args, raw);
    return print(withReviewPaths(dataDir, {
      ok: true,
      runId,
      audit: audit || null,
      candidates: writeCandidates(dataDir, runId, candidates, reflectAuditOptions(args, audit)),
    }), args);
  }
  if (subcommand === "add") {
    const runId = args.positionals[2];
    if (!runId || !args.flags.title || !args.flags.summary || !args.flags.rule) throw new Error("usage: ome reflect add <runId> --title <title> --summary <summary> --rule <markdown> --triggers <text>");
    const existing = getRetrospectiveRun(dataDir, runId).candidates;
    const audit = readReflectAuditInput(args);
    const candidate = candidateFromLesson(runId, {
      title: args.flags.title,
      category: args.flags.category,
      summary: args.flags.summary,
      rule: args.flags.rule,
      criteria: {
        use_when: splitList(args.flags.triggers || args.flags.trigger || ""),
        ignore_when: splitList(args.flags["negative-triggers"] || args.flags.negativeTriggers || ""),
      },
      engine_hints: {
        positive: splitList(args.flags["engine-hints"] || args.flags.engineHints || ""),
        negative: splitList(args.flags["negative-engine-hints"] || args.flags.negativeEngineHints || ""),
      },
      recall: {
        policy: args.flags["recall-policy"] || args.flags.recallPolicy || "should",
        risk: args.flags.risk || "medium",
        confidence: args.flags.confidence || "medium",
        triggers: splitList(args.flags.triggers || args.flags.trigger || ""),
        topics: splitList(args.flags.topics || args.flags.topic || ""),
      },
      scope: parseApplicability(args),
      evidence: splitList(args.flags.evidence || ""),
    });
    return print(withReviewPaths(dataDir, {
      ok: true,
      runId,
      audit: audit || null,
      candidate,
      candidates: writeCandidates(dataDir, runId, [...existing, candidate], reflectAuditOptions(args, audit)),
    }), args);
  }
  if (subcommand === "decide") {
    const [runId, candidateId] = args.positionals.slice(2);
    const action = args.flags.action;
    if (!runId || !candidateId || !action) throw new Error("usage: ome reflect decide <runId> <candidateId> --action approve|reject|merge|rewrite");
    const rewriteFile = args.flags["rewrite-file"];
    const rewrite = rewriteFile ? JSON.parse(fs.readFileSync(rewriteFile, "utf8")) : {};
    if (args.flags.category) rewrite.category = args.flags.category;
    return print(addDecision(dataDir, runId, {
      candidateId,
      action,
      reason: args.flags.reason || "",
      targetCardId: args.flags.target,
      rewrite: Object.keys(rewrite).length ? rewrite : undefined,
    }), args);
  }
  if (subcommand === "apply") {
    const runId = args.positionals[2];
    if (!runId) throw new Error("usage: ome reflect apply <runId>");
    if (args.flags["dry-run"]) return print(withReviewPaths(dataDir, previewApplyRetrospective(dataDir, runId)), args);
    return print(withReviewPaths(dataDir, applyRetrospective(dataDir, runId)), args);
  }
  throw new Error("usage: ome reflect [start|list|show|candidates|add|decide|apply|resume]");
}

function readReflectAuditInput(args: ParsedArgs, raw: Record<string, any> = {}): Record<string, any> | null {
  const auditFile = args.flags.auditFile || args.flags["audit-file"];
  if (auditFile) return JSON.parse(fs.readFileSync(auditFile, "utf8"));
  return raw.audit || null;
}

function reflectAuditOptions(args: ParsedArgs, audit: Record<string, any> | null) {
  return {
    audit,
    allowIncompleteAudit: Boolean(args.flags.allowIncompleteAudit || args.flags["allow-incomplete-audit"]),
    incompleteAuditReason: String(args.flags.incompleteAuditReason || args.flags["incomplete-audit-reason"] || ""),
  };
}

function createReflectRun(dataDir: string, args: ParsedArgs) {
  if (args.flags["from-session"]) throw new Error("ome reflect start does not accept --from-session; create a run container and let the agent inspect provider session records during source audit");
  const focus = args.flags.focus || args.flags["review-focus"] || args.flags["scan-focus"] || "";
  const guideText = readSkillReference("reflect-retrospective.md");
  const run = createRetrospectiveRun(dataDir, {
    title: "manual",
    focus,
    guideRef: RETROSPECTIVE_GUIDE_REF,
    guideHash: hashText(guideText),
  });
  return print(withReviewPaths(dataDir, {
    ...run,
    nextStep: "Use the OME retrospective skill reference to complete the source audit and synthesis, then write experience drafts for approval.",
  }), args);
}

function readSkillReference(fileName: string): string {
  const relative = path.join("skills", "oh-my-experience", "references", fileName);
  const roots: string[] = [];
  let cursor = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    roots.push(cursor);
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  roots.push(process.cwd());
  for (const root of Array.from(new Set(roots))) {
    const candidate = path.join(root, relative);
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8");
  }
  throw new Error(`missing installed OME skill reference: ${relative}`);
}

function withReviewPaths<T extends Record<string, any>>(dataDir: string, record: T): T {
  const runId = String(record.runId || record.id || record.candidates?.[0]?.runId || "");
  if (!runId) return record;
  const runDir = path.join(layout(dataDir).retrospectives, runId);
  return {
    ...record,
    runId,
    runDir: record.runDir || runDir,
    reviewFile: path.join(runDir, EXPERIENCE_REVIEW_FILE),
  };
}

function sourceCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (!subcommand || subcommand === "status") return print(inspectSourceState(dataDir), args);
  if (subcommand === "scan") return print(scanSource(dataDir, args), args);
  if (subcommand === "clean") return print(cleanSources(dataDir, args), args);
  if (subcommand === "connect") {
    const source = args.positionals[2];
    if (source !== "spool") throw new Error("usage: ome source connect spool --mode off|ask|enabled");
    const mode = String(args.flags.mode || "enabled");
    if (!["off", "ask", "enabled"].includes(mode)) throw new Error("source mode must be off, ask, or enabled");
    const config = loadConfig(dataDir);
    return print(saveConfig(dataDir, { ...config, sources: { ...config.sources, spool: { mode } } }), args);
  }
  throw new Error("usage: ome source status|scan codex|scan spool|clean|connect spool");
}

function scanSource(dataDir: string, args: ParsedArgs) {
  const source = args.positionals[2];
  if (source === "codex") {
    const sessions = args.flags.sessions || args.flags["sessions-dir"];
    if (!sessions) throw new Error("usage: ome source scan codex --sessions <dir>");
    return {
      ...scanCodexSessions(dataDir, path.resolve(sessions)),
      command: "source.scan",
      source,
      storage: "pointer",
    };
  }
  if (source === "spool") {
    return {
      ...scanSpoolSessions(dataDir, spoolOptions(args)),
      command: "source.scan",
      source,
      storage: "pointer",
    };
  }
  throw new Error("usage: ome source scan codex|spool");
}

function cleanSources(dataDir: string, args: ParsedArgs) {
  const dryRun = !args.flags.yes || Boolean(args.flags["dry-run"]);
  const compact = compactSessionIndex(dataDir, { dryRun, dropSummaries: true });
  const prune = pruneMaterializedSessions(dataDir, { dryRun, yes: !dryRun });
  return {
    ok: true,
    dryRun,
    compact,
    prune,
    next: dryRun ? "Run `ome source clean --yes` to apply." : "Source index cleaned.",
  };
}

function inspectSourceState(dataDir: string) {
  const index = readSessionIndex(dataDir);
  const sessions = index.sessions || [];
  const providerCounts = countBy(sessions.map((session) => session.provider));
  const summaryBytes = sessions.reduce((sum, session) => sum + Buffer.byteLength(session.summary || "", "utf8"), 0);
  const summaryRecords = sessions.filter((session) => Boolean(session.summary)).length;
  const rawIndex = sourceIndexRawStats(dataDir);
  return {
    ok: true,
    dataDir,
    spool: checkSpool(),
    sources: loadConfig(dataDir).sources,
    sourceIndex: {
      path: layout(dataDir).sourceIndex,
      sessions: sessions.length,
      providerCounts,
      sourceExists: sessions.filter((session) => session.sourceExists).length,
      missingSources: sessions.filter((session) => !session.sourceExists).length,
      materialized: sessions.filter((session) => session.materialized || session.sessionFile).length,
      messageArrays: rawIndex.messageArrays,
      embeddedMessageRecords: rawIndex.embeddedMessageRecords,
      summaryRecords,
      summaryBytes,
      maxSummaryBytes: sessions.reduce((max, session) => Math.max(max, Buffer.byteLength(session.summary || "", "utf8")), 0),
    },
    storage: auditStorage(dataDir),
  };
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function sourceIndexRawStats(dataDir: string) {
  try {
    const raw = JSON.parse(fs.readFileSync(layout(dataDir).sourceIndex, "utf8"));
    const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {
      messageArrays: sessions.filter((session: any) => Array.isArray(session.messages)).length,
      embeddedMessageRecords: sessions.filter((session: any) => Array.isArray(session.messages) && session.messages.some(hasMessageText)).length,
    };
  } catch {
    return { messageArrays: 0, embeddedMessageRecords: 0 };
  }
}

function hasMessageText(message: any) {
  if (!message || typeof message !== "object") return false;
  return Boolean(String(message.text || message.content || message.contentText || "").trim());
}

function experienceCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  const targetDataDir = scopedExperienceDataDir(dataDir, args);
  if (!subcommand || subcommand === "list") {
    const inspection = inspectCards(targetDataDir, args.flags.status || null);
    const experiences = inspection.cards;
    const compact = Boolean(args.flags.compact || args.flags.index);
    if (!compact) return print({ ok: inspection.issues.length === 0, experiences, invalidCards: inspection.issues }, args);
    return print({
      ok: inspection.issues.length === 0,
      total: experiences.length,
      compact: true,
      experiences: experiences.map(compactExperienceCard),
      invalidCards: inspection.issues,
    }, args);
  }
  if (subcommand === "show") {
    const id = args.positionals[2];
    if (!id) throw new Error("usage: ome experience show <id> [--section summary|rule|triggers]");
    const card = getCard(targetDataDir, id);
    if (args.flags.json) return print({ ok: true, card, section: args.flags.section || null, content: cardSection(card, args.flags.section) }, args);
    console.log(cardSection(card, args.flags.section) || card.body);
    return;
  }
  if (subcommand === "enable") {
    const id = args.positionals[2];
    if (!id) throw new Error("usage: ome experience enable <id>");
    return print(promoteDraft(targetDataDir, id), args);
  }
  if (subcommand === "archive") {
    const id = args.positionals[2];
    if (!id) throw new Error("usage: ome experience archive <id> [--reason <reason>]");
    return print(archiveCard(targetDataDir, id, args.flags.reason || "archived"), args);
  }
  if (subcommand === "migrate-legacy") {
    return print(migrateLegacyCards(targetDataDir, {
      backup: Boolean(args.flags.backup),
      dryRun: Boolean(args.flags["dry-run"]),
      status: args.flags.status || null,
    }), args);
  }
  throw new Error("usage: ome experience list|show|enable|archive|migrate-legacy");
}

function scopedExperienceDataDir(dataDir: string, args: ParsedArgs): string {
  const scope = String(args.flags.scope || "").trim().toLowerCase();
  if (!scope || scope === "global") return dataDir;
  if (scope !== "project") throw new Error("unknown scope: use global or project");
  const cwd = args.flags.cwd ? path.resolve(args.flags.cwd) : process.cwd();
  const projectContext = detectProjectContext(cwd);
  if (!projectContext.root) throw new Error("project scope requires running inside a project");
  return projectLibraryPath(projectContext.root);
}

function compactExperienceCard(card: ReturnType<typeof listCards>[number]) {
  return {
    id: card.id,
    title: card.title,
    status: card.status,
    category: card.category,
  };
}

function cardSection(card: ReturnType<typeof getCard>, section: unknown): string {
  const name = String(section || "").trim().toLowerCase();
  if (!name) return card.body;
  if (["summary", "经验总结"].includes(name)) return card.summary;
  if (["rule", "可复用规则"].includes(name)) return card.rule;
  if (["triggers", "trigger", "触发时机"].includes(name)) return card.triggers.map((trigger) => `- ${trigger}`).join("\n");
  if (["negative-triggers", "negative", "不触发"].includes(name)) return card.negativeTriggers.map((trigger) => `- ${trigger}`).join("\n");
  throw new Error("unknown card section: use summary|rule|triggers|negative-triggers");
}

function matchCommand(dataDir: string, args: ParsedArgs) {
  const query = args.flags.query || args.positionals.slice(1).join(" ");
  if (!query) throw new Error("usage: ome match <query>");
  const config = loadConfig(dataDir);
  const cwd = args.flags.cwd ? path.resolve(args.flags.cwd) : process.cwd();
  const stack = resolveLibraryStack(dataDir, cwd);
  const cards = readLibraryStackCards(stack);
  const options = {
    limit: Number(args.flags.limit || config.retrieval.maxCards),
    threshold: args.flags.threshold === undefined ? config.retrieval.minScore : Number(args.flags.threshold),
    projectContext: stack.projectContext,
  };
  if (args.flags.explain) {
    return print({ query, ...explainMatchFromCards(cards, query, options, { libraries: stack.libraries, warnings: stack.warnings }) }, args);
  }
  const matches = matchCardEntries(cards, query, {
    limit: options.limit,
    threshold: options.threshold,
    projectContext: stack.projectContext,
  });
  return print({ ok: true, query, warnings: stack.warnings, libraries: stack.libraries, matches, additionalContext: renderAdditionalContext(matches) }, args);
}

function projectCommand(_dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  const cwd = args.flags.cwd ? path.resolve(args.flags.cwd) : process.cwd();
  const projectContext = detectProjectContext(cwd);
  if (!projectContext.root) throw new Error("project command requires running inside a project");
  if (!subcommand || subcommand === "status") {
    const library = inspectProjectLibrary(projectContext.root);
    const health = inspectCurrentProjectLibraryHealth({ ...args, flags: { ...args.flags, cwd } });
    return print({
      ok: health?.ok ?? true,
      projectContext,
      projectLibrary: library.dataDir,
      exists: library.exists,
      readable: library.readable,
      warnings: health?.warnings ?? library.warnings,
      experiences: health?.experiences ?? 0,
      invalidCards: health?.invalidCards ?? [],
    }, args);
  }
  if (subcommand === "init") {
    return print(initializeProjectLibrary(projectContext.root), args);
  }
  throw new Error("usage: ome project init|status");
}

async function evalCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (!subcommand || subcommand === "recall") {
    if (args.flags.compare) {
      const before = String(args.flags.compare);
      const after = args.positionals[2] || args.flags.next;
      if (!after) throw new Error("usage: ome eval recall --compare <before-report.json> <after-report.json>");
      return print(compareRecallReports(path.resolve(before), path.resolve(after)), args);
    }
    const suite = args.flags.suite || args.flags.file || args.positionals[2];
    if (!suite) throw new Error("usage: ome eval recall --suite <file>");
    const report = evaluateRecallSuite(dataDir, path.resolve(suite), {
      limit: Number(args.flags.limit || 8),
      threshold: Number(args.flags.threshold || 40),
      persist: Boolean(args.flags.persist),
      experiencesFile: args.flags.experiences || args.flags["experiences-file"],
      useCurrentLibrary: Boolean(args.flags["use-current-library"]),
    });
    const checked = applyRecallThresholds(report, args);
    if (!checked.ok && checked.thresholds?.failed.length) process.exitCode = 1;
    return print(checked, args);
  }
  throw new Error("usage: ome eval recall --suite <file>");
}

async function hookCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === "run") return print(await runHook({ dataDir }), args);
  const provider = args.flags.provider || "codex";
  const options = {
    dryRun: Boolean(args.flags["dry-run"]),
    codexHome: args.flags["codex-home"] ? path.resolve(args.flags["codex-home"]) : process.env.CODEX_HOME,
    claudeHome: args.flags["claude-home"] ? path.resolve(args.flags["claude-home"]) : undefined,
    dataDir,
  };
  const adapter = provider === "claude"
    ? { status: claudeHookStatus }
    : { status: codexHookStatus };
  if (subcommand === "status") return print(adapter.status(options as any), args);
  throw new Error("usage: ome hook run|status");
}

function uninstallCommand(dataDir: string, args: ParsedArgs) {
  if (args.flags["delete-library"] && !(args.flags.yes || args.flags.y || args.flags.force)) {
    throw new Error("ome uninstall --delete-library requires --yes or --force");
  }
  const providers = selectedProviders(args);
  const hooks = args.flags["keep-hooks"]
    ? []
    : providers.map((provider) => {
      const adapter = provider === "claude" ? uninstallClaudeHook : uninstallCodexHook;
      const result: any = adapter(hookInstallOptions(dataDir, args) as any);
      if (result.uninstalled) recordHookConfig(dataDir, provider, false);
      return result;
    });
  const skills = args.flags["keep-skill"]
    ? providers.map((provider) => ({ provider, skipped: true, reason: "--keep-skill" }))
    : providers.map((provider) => uninstallSkill({
      provider,
      codexHome: codexHome(args),
      claudeHome: claudeHome(args),
      dryRun: Boolean(args.flags["dry-run"]),
      force: Boolean(args.flags.force),
    }));
  const library = uninstallLibrary(dataDir, args);
  return print({ ok: true, hooks, skills, library, dryRun: Boolean(args.flags["dry-run"]) }, args);
}

function uninstallLibrary(dataDir: string, args: ParsedArgs) {
  if (!args.flags["delete-library"]) return { deleted: false, kept: true, path: dataDir };
  if (args.flags["dry-run"]) return { deleted: false, dryRun: true, path: dataDir };
  fs.rmSync(dataDir, { recursive: true, force: true });
  return { deleted: true, path: dataDir };
}

function spoolOptions(args: ParsedArgs) {
  return {
    limit: args.flags.limit ? Number(args.flags.limit) : undefined,
    source: args.flags.source,
    project: args.flags.project,
    query: args.flags.query,
    since: args.flags.since,
    maxSessionBytes: args.flags["max-session-bytes"] ? Number(args.flags["max-session-bytes"]) : undefined,
  };
}

function splitList(value: unknown): string[] {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseApplicability(args: ParsedArgs) {
  const level = args.flags["scope-level"] || "global";
  return {
    level,
    projectKey: args.flags["project-key"] || null,
    modulePath: args.flags["module-path"] || null,
    confidence: args.flags["scope-confidence"] || "medium",
    rationale: args.flags["scope-rationale"] || "",
  };
}

function recordHookConfig(dataDir: string, provider: string, enabled: boolean): void {
  const config = loadConfig(dataDir);
  const next = structuredClone(config);
  const providerKey = provider === "claude" ? "claude" : "codex";
  next.hooks.providers[providerKey] = { enabled };
  saveConfig(dataDir, next);
}

function applyRecallThresholds(report: Record<string, any>, args: ParsedArgs) {
  const checks = [
    { flag: "min-pass-rate", metric: "passRate", direction: "min" },
    { flag: "min-precision", metric: "precisionAtK", direction: "min" },
    { flag: "min-recall", metric: "recallAtK", direction: "min" },
    { flag: "min-mrr", metric: "mrr", direction: "min" },
    { flag: "max-over-recall", metric: "overRecallRate", direction: "max" },
    { flag: "max-false-positive", metric: "falsePositiveRate", direction: "max" },
    { flag: "max-no-hit", metric: "noHitRate", direction: "max" },
  ].flatMap((check) => {
    const raw = args.flags[check.flag];
    if (raw === undefined) return [];
    const expected = Number(raw);
    const actual = Number(report.metrics?.[check.metric] ?? 0);
    const passed = check.direction === "min" ? actual >= expected : actual <= expected;
    return [{ ...check, expected, actual, passed }];
  });
  if (!checks.length) return report;
  const failed = checks.filter((check) => !check.passed);
  return {
    ...report,
    ok: Boolean(report.ok) && failed.length === 0,
    thresholds: { ok: failed.length === 0, checks, failed },
  };
}

function print(value: unknown, args: ParsedArgs) {
  if (args.flags.json || args.flags.format === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") console.log(value);
  else console.log(renderHumanOutput(value, args));
}

function renderHumanOutput(value: unknown, args: ParsedArgs): string {
  const command = args.positionals[0] || "";
  const subcommand = args.positionals[1] || "";
  const record = asRecord(value);
  if (command === "init") return renderInitResult(record);
  if (command === "doctor") return renderDoctorResult(record);
  if (command === "hook") return renderHookResult(record);
  if (command === "config") return renderConfigResult(record, subcommand);
  if (command === "source") return renderSourceResult(record, subcommand);
  if (command === "reflect") return renderReflectResult(record);
  if (command === "experience") return renderExperienceResult(record, subcommand);
  if (command === "match") return renderMatchResult(record, Boolean(args.flags.explain));
  if (command === "project") return renderProjectResult(record, subcommand);
  if (command === "eval") return renderEvalResult(record);
  if (command === "stats") return renderStatsResult(record);
  if (command === "uninstall") return renderUninstallResult(record);
  return renderGenericResult(record);
}

function renderInitResult(record: Record<string, any>): string {
  const dryRun = Boolean(record.dryRun);
  const plan = asRecord(record.plan);
  const dataDir = String(plan.dataDir || record.dataDir || "");
  const hooks = Array.isArray(record.hooks) ? record.hooks : [];
  const lines = [
    dryRun ? "Setup preview" : "Setup complete",
    `Library: ${dataDir}`,
    `Config file: ${configPointerPath()}`,
  ];
  if (record.sources) lines.push(`Spool: ${asRecord(asRecord(record.sources).spool).mode || "off"}`);
  if (hooks.length) lines.push(`Agent recall: ${hooks.map((hook) => formatHookStatus(asRecord(hook))).join(", ")}`);
  else if (asRecord(record.hooks).skipped) lines.push("Agent recall: disabled");
  const skills = Array.isArray(record.skills) ? record.skills : [];
  if (skills.length) lines.push(`Agent skills: ${skills.map((skill) => formatSkillStatus(asRecord(skill))).join(", ")}`);
  const starterCards = Array.isArray(record.starterCards) ? record.starterCards : [];
  if (starterCards.length) lines.push(`Starter lessons: ${starterCards.length}`);
  if (!dryRun) {
    lines.push("");
    lines.push("Next step:");
    if (hasInstalledRecallHook(hooks)) {
      lines.push("  Send a real task to your agent; the installed hook will recall relevant active experiences automatically.");
      lines.push("  After the first recall, move to the first-card or full retrospective flow; extracted experiences go to draft approval and are not enabled automatically.");
    } else {
      lines.push("  Library is ready, but prompt-time recall is not connected to an agent yet.");
      lines.push("  Run `ome init --provider codex`, `ome init --provider claude`, or `ome init --provider all` when you want automatic recall.");
    }
    if (hooks.some((hook) => asRecord(hook).provider === "codex" && asRecord(hook).installed)) {
      lines.push("  Codex App may ask you to trust the new UserPromptSubmit hook.");
    }
    lines.push("");
    lines.push("Recommendations:");
    lines.push("  Connect more agent histories with Spool");
    lines.push("  Scan Claude CLI, Gemini CLI, opencode, and other supported history indexes. OME recall works without it.");
    lines.push("  https://github.com/rennzhang/oh-my-experience/blob/main/docs/guides/source-scan.md");
  }
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderDoctorResult(record: Record<string, any>): string {
  const doctor = asRecord(record.doctor || record);
  const lines = [
    `Health check: ${doctor.ok ? "OK" : "Needs attention"}`,
  ];
  if (doctor.checked) lines.push(`Checked: ${Object.keys(asRecord(doctor.checked)).join(", ")}`);
  appendList(lines, "Errors", doctor.errors);
  appendList(lines, "Warnings", doctor.warnings);
  appendList(lines, "Actions", doctor.actions);
  if (record.repairedIndex) lines.push(`Index rebuilt: ${asRecord(record.repairedIndex).experiences?.length || 0} cards`);
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderHookResult(record: Record<string, any>): string {
  const lines = [`Hook status: ${formatHookStatus(record)}`];
  if (record.target) lines.push(`Config file: ${record.target}`);
  if (record.hook?.command) lines.push(`Command: ${record.hook.command}`);
  if (record.reason) lines.push(`Reason: ${record.reason}`);
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderUninstallResult(record: Record<string, any>): string {
  const hooks = Array.isArray(record.hooks) ? record.hooks : [];
  const skills = Array.isArray(record.skills) ? record.skills : [];
  const library = asRecord(record.library);
  const lines = [
    record.dryRun ? "Uninstall preview" : "Uninstall complete",
  ];
  if (hooks.length) lines.push(`Hooks: ${hooks.map((hook) => formatHookStatus(asRecord(hook))).join(", ")}`);
  if (skills.length) lines.push(`Agent skills: ${skills.map((skill) => formatSkillStatus(asRecord(skill))).join(", ")}`);
  if (library.deleted) lines.push(`Library deleted: ${library.path}`);
  else lines.push(`Library kept: ${library.path || ""}`);
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderConfigResult(record: Record<string, any>, subcommand: string): string {
  if (subcommand === "get" || record.version) {
    const retrieval = asRecord(record.retrieval);
    return [
      "Current config",
      `Library: ${record.dataDir || ""}`,
      `Recall: maxCards=${retrieval.maxCards || "-"}, minScore=${retrieval.minScore || "-"}`,
      jsonHint(),
    ].join("\n");
  }
  const lines = [
    record.ok === false ? "Config not updated" : "Config updated",
    `Key: ${record.key || ""}`,
  ];
  if (record.previous !== undefined) lines.push(`Previous: ${formatScalar(record.previous)}`);
  if (record.next !== undefined) lines.push(`Next: ${formatScalar(record.next)}`);
  appendList(lines, "Warnings", record.warnings);
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderSourceResult(record: Record<string, any>, subcommand: string): string {
  if (!subcommand || subcommand === "status") {
    const spool = asRecord(record.spool);
    const sourceIndex = asRecord(record.sourceIndex);
    return [
      "Source status",
      `Spool: ${spool.available ? "available" : "not detected"}`,
      spool.version ? `Version: ${spool.version}` : "",
      `Mode: ${asRecord(asRecord(record.sources).spool).mode || "off"}`,
      `Sessions: ${sourceIndex.sessions || 0}`,
      `Providers: ${formatCounts(asRecord(sourceIndex.providerCounts))}`,
      `Missing sources: ${sourceIndex.missingSources || 0}`,
      `Message arrays: ${sourceIndex.messageArrays || 0}`,
      `Embedded message text: ${sourceIndex.embeddedMessageRecords || 0}`,
      `Summary records: ${sourceIndex.summaryRecords || 0}`,
      jsonHint(),
    ].filter(Boolean).join("\n");
  }
  if (subcommand === "scan") {
    const indexed = Array.isArray(record.indexed) ? record.indexed.length : 0;
    const skipped = Array.isArray(record.skipped) ? record.skipped.length : 0;
    const failed = Array.isArray(record.failed) ? record.failed.length : 0;
    return [
      "Source scan complete",
      `Source: ${record.source || ""}`,
      `Storage: ${record.storage || "pointer"}`,
      `Indexed: ${indexed}`,
      `Skipped: ${skipped}`,
      `Failed: ${failed}`,
      jsonHint(),
    ].join("\n");
  }
  if (subcommand === "clean") {
    const compact = asRecord(record.compact);
    const prune = asRecord(record.prune);
    return [
      "Source cleanup",
      `Dry run: ${Boolean(record.dryRun)}`,
      `Sessions: ${compact.sessions || 0}`,
      `Saved bytes: ${compact.savedBytes || 0}`,
      `Materialized pruned: ${prune.pruned || 0}`,
      record.next ? `Next: ${record.next}` : "",
      jsonHint(),
    ].filter(Boolean).join("\n");
  }
  if (subcommand === "connect") {
    const sources = asRecord(record.sources);
    const spool = asRecord(sources.spool);
    return [
      "Source config updated",
      `Spool mode: ${spool.mode || "off"}`,
      jsonHint(),
    ].join("\n");
  }
  return renderGenericResult(record);
}

function formatCounts(counts: Record<string, any>) {
  const entries = Object.entries(counts);
  if (!entries.length) return "";
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

function renderReflectResult(record: Record<string, any>): string {
  if (Array.isArray(record.retrospectives) || Array.isArray(record.candidates) || Array.isArray(record.drafts)) {
    return renderRetrospectiveResult(record);
  }
  return [
    "Experience review",
    `Reflect id: ${record.runId || record.id || ""}`,
    reviewFileLine(record),
    record.nextStep ? `Next: ${record.nextStep}` : "",
    jsonHint(),
  ].filter(Boolean).join("\n");
}

function renderRetrospectiveResult(record: Record<string, any>): string {
  const candidates = Array.isArray(record.candidates) ? record.candidates.length : 0;
  const drafts = Array.isArray(record.drafts) ? record.drafts.length : 0;
  const retrospectives = Array.isArray(record.retrospectives) ? record.retrospectives.length : 0;
  const lines = ["Experience review result"];
  if (record.runId) lines.push(`Reflect id: ${record.runId}`);
  if (retrospectives) lines.push(`Experience reviews: ${retrospectives}`);
  if (candidates) lines.push(`Experience drafts: ${candidates}`);
  if (drafts) lines.push(`Drafts ready to add: ${drafts}`);
  if (record.candidate?.id) lines.push(`Experience id: ${record.candidate.id}`);
  const reviewLine = reviewFileLine(record);
  if (reviewLine) lines.push(reviewLine);
  if (record.dryRun) lines.push("Dry run only; no drafts were prepared for the library.");
  else if (drafts) lines.push("These drafts are not recalled yet. Enable them only after confirmation.");
  else if (candidates) lines.push(retrospectiveNextStep(record));
  lines.push(jsonHint());
  return lines.join("\n");
}

function reviewFileLine(record: Record<string, any>): string {
  if (!record.reviewFile) return "";
  const relative = reviewRelativePath(record);
  return `Draft approval: [Review](<${markdownLinkTarget(relative)}>)`;
}

function reviewRelativePath(record: Record<string, any>): string {
  if (record.reviewFile) return normalizeMarkdownPath(path.relative(process.cwd(), String(record.reviewFile)));
  if (record.runId) return normalizeMarkdownPath(path.join("retrospectives", String(record.runId), EXPERIENCE_REVIEW_FILE));
  if (record.runFile && record.runDir) return normalizeMarkdownPath(path.relative(process.cwd(), String(record.runFile)));
  return EXPERIENCE_REVIEW_FILE;
}

function normalizeMarkdownPath(value: string): string {
  return value.split(path.sep).join("/");
}

function markdownLinkTarget(value: string): string {
  return value.replaceAll(">", "%3E");
}

function retrospectiveNextStep(record: Record<string, any>): string {
  const state = String(record.state || "");
  if (state === "applied_to_drafts") {
    return "The approved drafts are ready to add. They are not recalled yet; enable them only after confirmation.";
  }
  if (state === "decisions_recorded") {
    return "Approval notes are recorded; after confirmation, have the agent prepare accepted drafts for the library.";
  }
  return "Review the experience drafts; reply approve, reject, revise, merge, or add boundaries. Add to the library only after confirmation.";
}

function renderExperienceResult(record: Record<string, any>, subcommand: string): string {
  const cards = Array.isArray(record.experiences) ? record.experiences : [];
  const invalidCards = Array.isArray(record.invalidCards) ? record.invalidCards : [];
  const lines = [subcommand === "list" || cards.length ? `Experiences: ${cards.length}` : "Experience updated"];
  for (const card of cards.slice(0, 10)) lines.push(`  - ${asRecord(card).id}: ${asRecord(card).title || ""}`);
  if (cards.length > 10) lines.push(`  ... ${cards.length - 10} more`);
  if (invalidCards.length) {
    lines.push(`Invalid cards: ${invalidCards.length}`);
    for (const issue of invalidCards.slice(0, 5)) {
      const item = asRecord(issue);
      lines.push(`  - ${item.status || ""}: ${item.path || ""} (${item.message || ""})`);
    }
    if (invalidCards.length > 5) lines.push(`  ... ${invalidCards.length - 5} more invalid`);
  }
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderMatchResult(record: Record<string, any>, explain: boolean): string {
  const matches = Array.isArray(record.matches) ? record.matches : [];
  const libraries = Array.isArray(record.libraries) ? record.libraries : [];
  const lines = [
    `Recall result: ${matches.length} cards`,
    `Query: ${record.query || ""}`,
  ];
  if (explain && libraries.length) {
    lines.push(`Libraries: ${libraries.map((library) => {
      const item = asRecord(library);
      return `${item.scope}${item.exists === false ? "(missing)" : item.readable === false ? "(unreadable)" : ""}`;
    }).join(", ")}`);
  }
  for (const match of matches.slice(0, 8)) {
    const item = asRecord(match);
    const card = asRecord(item.card);
    const title = item.title || card.title || item.id || card.id;
    const id = item.id || card.id || "";
    const scope = card.libraryScope ? ` ${card.libraryScope}` : "";
    lines.push(`  ${item.rank || "-"}. ${title} (score ${Math.round(Number(item.score || 0))}${scope}) ${id ? `[${id}]` : ""}`);
    if (explain && Array.isArray(item.reasons) && item.reasons.length) lines.push(`     ${item.reasons.slice(0, 2).map(formatMatchReason).join("; ")}`);
  }
  const envelope = asRecord(record.envelope);
  if (explain && Array.isArray(envelope.intentModes) && envelope.intentModes.length) lines.push(`intent: ${envelope.intentModes.join(", ")}`);
  if (explain && Array.isArray(envelope.ruleSignals) && envelope.ruleSignals.length) lines.push(`signals: ${envelope.ruleSignals.map((signal) => asRecord(signal).id || signal).join(", ")}`);
  if (record.additionalContext) lines.push(`Additional context: ${String(record.additionalContext).length} chars`);
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderProjectResult(record: Record<string, any>, subcommand: string): string {
  if (subcommand === "init") {
    return [
      "Project library initialized",
      `Project: ${record.projectRoot || ""}`,
      `Project library: ${record.projectLibrary || ""}`,
      jsonHint(),
    ].join("\n");
  }
  return [
    "Project library status",
    `Project library: ${record.projectLibrary || ""}`,
    `Exists: ${record.exists ? "yes" : "no"}`,
    `Readable: ${record.readable ? "yes" : "no"}`,
    ...(Array.isArray(record.warnings) && record.warnings.length ? [`Warnings: ${record.warnings.join("; ")}`] : []),
    jsonHint(),
  ].join("\n");
}

function formatMatchReason(value: unknown): string {
  const item = asRecord(value);
  if (!Object.keys(item).length) return String(value);
  return `${item.field || "reason"}:${item.term || ""}${item.weight !== undefined ? ` ${item.weight}` : ""}`.trim();
}

function renderEvalResult(record: Record<string, any>): string {
  const metrics = asRecord(record.metrics);
  const lines = [
    `Evaluation: ${record.ok === false ? "failed" : "passed"}`,
  ];
  if (Object.keys(metrics).length) {
    lines.push(`passRate=${formatMetric(metrics.passRate)}, recall@k=${formatMetric(metrics.recallAtK)}, precision@k=${formatMetric(metrics.precisionAtK)}, overRecall=${formatMetric(metrics.overRecallRate)}`);
  }
  if (record.thresholds && asRecord(record.thresholds).failed?.length) appendList(lines, "Failed thresholds", asRecord(record.thresholds).failed);
  lines.push(jsonHint());
  return lines.join("\n");
}

function renderStatsResult(record: Record<string, any>): string {
  return [
    "Stats",
    `Cards: ${Object.keys(asRecord(record.cardRecallCount)).length}`,
    `Recent events: ${Array.isArray(record.recentEvents) ? record.recentEvents.length : 0}`,
    jsonHint(),
  ].join("\n");
}

function renderGenericResult(record: Record<string, any>): string {
  const lines = [record.ok === false ? "Failed" : "Done"];
  for (const [key, value] of Object.entries(record).slice(0, 8)) {
    if (key === "ok") continue;
    if (Array.isArray(value)) lines.push(`${key}: ${value.length}`);
    else if (isPrimitive(value)) lines.push(`${key}: ${formatScalar(value)}`);
  }
  lines.push(jsonHint());
  return lines.join("\n");
}

function formatHookStatus(record: Record<string, any>): string {
  const provider = providerName(record.provider || "hook");
  if (record.skipped) return `${provider} disabled`;
  if (record.installed) return `${provider} enabled`;
  if (record.uninstalled) return `${provider} removed`;
  if (record.dryRun) return `${provider} preview`;
  if (typeof record.installed === "boolean") return `${provider} ${record.installed ? "enabled" : "disabled"}`;
  return `${provider} updated`;
}

function formatSkillStatus(record: Record<string, any>): string {
  const provider = providerName(record.provider || "skill");
  if (record.skipped) return `${provider} kept`;
  if (record.conflict) return `${provider} conflict`;
  if (record.uninstalled) return `${provider} removed`;
  if (record.dryRun) return `${provider} preview`;
  if (record.installed) return `${provider} installed`;
  if (typeof record.installed === "boolean") return `${provider} ${record.installed ? "installed" : "not installed"}`;
  return `${provider} updated`;
}

function providerName(value: unknown): string {
  const provider = String(value || "hook").toLowerCase();
  if (provider === "codex") return "Codex";
  if (provider === "claude") return "Claude";
  return String(value || "hook");
}

function appendList(lines: string[], label: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) return;
  lines.push(`${label}:`);
  for (const item of value.slice(0, 8)) lines.push(`  - ${formatListItem(item)}`);
  if (value.length > 8) lines.push(`  ... ${value.length - 8} more`);
}

function formatListItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (isRecord(item)) return Object.entries(item).map(([key, value]) => `${key}=${formatScalar(value)}`).join(", ");
  return String(item);
}

function formatMetric(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "-";
}

function jsonHint(): string {
  return "Use --json for full machine-readable output.";
}

function asRecord(value: unknown): Record<string, any> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) return "{...}";
  return String(value);
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: CliFlags = {};
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const eq = key.indexOf("=");
      if (eq !== -1) {
        flags[key.slice(0, eq)] = key.slice(eq + 1);
        continue;
      }
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
      }
    } else if (/^-[A-Za-z]+$/.test(token)) {
      for (const key of token.slice(1)) flags[key] = true;
    } else {
      positionals.push(token);
    }
  }
  return { flags, positionals };
}

function printHelp() {
  console.log(`Oh My Experience

Local-first experience layer for AI coding agents: approve experience drafts,
then recall them at prompt time.

Common path:
  ome init                         start the setup wizard
  ome doctor                       check library, hooks, and package status
  ome uninstall                    remove selected recall hooks and skills, keep library by default

Core commands:
  ome init [--interactive] [--yes|-y] [--data-dir <path>] [--provider codex|claude|all] [--no-hook] [--reset-config]
  ome uninstall [--provider codex|claude|all] [--delete-library --yes]
  ome version | ome -v
  ome config get|preview|set
  ome source status|scan codex|scan spool|clean|connect spool
  ome reflect start [--focus <text>]
  ome reflect list|show|add|candidates|decide|apply|resume
  ome experience list|show|enable|archive|migrate-legacy
  ome project init|status
  ome eval recall --suite <file>
  ome hook run|status
  ome stats

Output:
  Human-readable by default. Use --json for scripts, hooks, and tests.
  --reset-config only overwrites runtime config. It does not delete experiences, source indexes, or draft approval runs.
  If init does not show a wizard, run ome version first, then ome init --interactive.

Docs:
  docs/guides/quickstart.md
  docs/reference/cli.md
`);
}

function unknownCommandMessage(command: string): string {
  const suggestion = closestCommand(command);
  return [
    `unknown command: ${command}`,
    suggestion ? `Did you mean: ome ${suggestion}?` : "",
    `Run "ome help" to see common commands.`,
  ].filter(Boolean).join("\n");
}

function closestCommand(command: string) {
  const ranked = SUGGESTED_COMMANDS
    .map((candidate) => ({ candidate, distance: levenshtein(command, candidate) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  return best && best.distance <= 3 ? best.candidate : null;
}

function levenshtein(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}
