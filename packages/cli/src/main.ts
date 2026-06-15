import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  archiveCard,
  compareRecallReports,
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
  normalizeLocale,
  explainMatchFromCards,
  projectLibraryPath,
  previewConfigValue,
  previewApplyRetrospective,
  promoteDraft,
  renderAdditionalContext,
  repairIndex,
  readLibraryStackCards,
  resolveLibraryStack,
  runDoctor,
  saveConfig,
  setConfigValue,
  t,
  writeCandidates,
  addDecision,
  applyRetrospective,
  candidateFromLesson,
} from "../../core/src/index.js";
import { defaultConfigHome } from "../../core/src/storage.js";
import { importCodexSessions } from "../../adapters/sources/codex-sessions/src/importer.js";
import { hookPlan as codexHookPlan, hookStatus as codexHookStatus, installHook as installCodexHook, uninstallHook as uninstallCodexHook } from "../../adapters/agents/codex/src/hook-install.js";
import { claudeHookPlan, claudeHookStatus, installClaudeHook, uninstallClaudeHook } from "../../adapters/agents/claude/src/hook-install.js";
import { checkSpool, importSpoolSessions } from "../../adapters/sources/spool/src/spool.js";
import { runHook } from "../../hook-runtime/src/run.js";

type CliFlags = Record<string, any>;
type ParsedArgs = { flags: CliFlags; positionals: string[] };
const RETROSPECTIVE_GUIDE_REF = "skills/oh-my-experience/references/reflect-retrospective.md";
const SPOOL_CLI_PACKAGE = "@spool-lab/cli";
const SPOOL_GITHUB_URL = "https://github.com/spool-lab/spool";

const KNOWN_COMMANDS = [
  "experience",
  "config",
  "doctor",
  "eval",
  "help",
  "hook",
  "import",
  "init",
  "match",
  "project",
  "reflect",
  "source",
  "stats",
  "uninstall",
  "version",
];
const SUGGESTED_COMMANDS = KNOWN_COMMANDS.filter((command) => command !== "reflect");

export async function runCli(argv: string[]) {
  const args = parseArgs(argv);
  const dataDir = path.resolve(args.flags.dataDir || args.flags["data-dir"] || process.env.OH_MY_EXPERIENCE_DATA_DIR || process.env.OME_HOME || defaultDataDir());
  const [command = "help", subcommand] = args.positionals;

  if (isVersionRequest(command, args)) return printVersion(args);
  if (isHelpRequest(command, subcommand, args)) return printHelp();
  if (command === "init") return initCommand(dataDir, args);
  if (command === "doctor") return doctorCommand(dataDir, args);
  if (command === "config") return configCommand(dataDir, subcommand, args);
  if (command === "import") return importCommand(dataDir, subcommand, args);
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
  if (!args.flags["repair-index"]) return print(runDoctor(dataDir, options), args);
  const repairedIndex = repairIndex(dataDir);
  return print({ repairedIndex, doctor: runDoctor(dataDir, options) }, args);
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
  const skillPlan = planInitSkill(args, Boolean(args.flags["dry-run"]));
  if (!args.flags["dry-run"]) {
    return {
      ...result,
      hooks: installInitHooks(dataDir, args),
      skill: installInitSkill(args),
      starterCards: listStarterCards(dataDir).map((card) => ({ id: card.id, title: card.title, category: card.category })),
      nextStep: "Run `ome match \"fix UI and validate in browser\" --explain` to inspect the first recall before starting a retrospective.",
    };
  }
  return { ...result, hooks: hookPlan, skill: skillPlan };
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
    const hookChoice = initHookChoice(args);
    const nextArgs = cloneArgs(args);
    nextArgs.flags["data-dir"] = dataDir;
    if (hookChoice === "none") nextArgs.flags["no-hook"] = true;
    else {
      delete nextArgs.flags["no-hook"];
      nextArgs.flags.provider = hookChoice;
    }

    printInitRecallStep(copy, { dataDir, hookChoice }, nextArgs);
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
    printInitDone(copy, dataDir, hookChoice, result);
    await maybeSetupSpoolSource(copy, dataDir, prompt);
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
  const raw = String(args.flags.provider || args.flags.providers || "codex");
  if (raw.includes("all")) return "all";
  if (raw.includes("claude")) return "claude";
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

async function askYesNo(prompt: PromptSession, question: { title: string; description?: string; defaultValue: boolean; invalidMessage: string; requireExplicit?: boolean }) {
  const suffix = question.requireExplicit ? "y/n" : (question.defaultValue ? "Y/n" : "y/N");
  console.log(`\n${bold(question.title)}`);
  if (question.description) console.log(dim(question.description));
  while (true) {
    const answer = (await prompt.question(`${dim(`[${suffix}]`)} ${cyan("> ")}`)).trim().toLowerCase();
    if (!answer) {
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

function printInitRecallStep(copy: InitCopy, plan: { dataDir: string; hookChoice: string }, args: ParsedArgs) {
  const hookPlan = planInitHooks(plan.dataDir, args, true);
  const hookTargets = Array.isArray(hookPlan)
    ? hookPlan.map((hook) => formatHookPlanTarget(asRecord(hook))).filter(Boolean)
    : [];
  const hookTarget = splitHookTarget(hookTargets[0] || "");
  const skillTarget = planInitSkill(args, true).target;
  printStep("2/2", copy.recallStepPrompt, copy.recallStepDescription);
  printParagraph(copy.recallHookParagraph
    .replace("{hook}", strongInline(hookTarget?.event.replace(/^Codex\s+/, "") || "UserPromptSubmit"))
    .replace("{hookFile}", strongInline(hookTarget?.file || codexHooksFile(args)))
    .replace("{library}", strongInline(plan.dataDir)));
  console.log("");
  printParagraph(copy.recallSkillParagraph
    .replace("{skill}", strongInline("oh-my-experience"))
    .replace("{skillDir}", strongInline(skillTarget)));
}

function printInitDone(copy: InitCopy, dataDir: string, hookChoice: string, result: unknown) {
  const hooks = Array.isArray((result as any).hooks) ? (result as any).hooks : [];
  const codexHookInstalled = hooks.some((hook: any) => hook.provider === "codex" && hook.installed);
  printPanel(green(copy.doneTitle), [
    keyValue(copy.doneDataDir, dataDir),
    keyValue(copy.doneConfig, configPointerPath()),
    keyValue(copy.doneHook, formatHookChoice(hookChoice, copy)),
    ...(codexHookInstalled ? [copy.doneCodexTrust] : []),
  ]);
  console.log(`\n${bold(copy.heroCta)}`);
  console.log(`${bold(copy.nextSteps)} ${dim(copy.starterPromptIntro)}`);
  console.log("");
  console.log(bold(copy.copyPromptHint));
  printPromptBlock(copy.starterPrompt, copy);
  console.log(`\n${bold(copy.afterRecallTitle)} ${dim(copy.afterRecallIntro)}`);
  console.log(`\n${bold(copy.recommendations)}`);
  printRecommendation(1, copy.importSourcesRecommendation, copy.importSourcesDescription, copy.importSourcesGuide);
}

async function maybeSetupSpoolSource(copy: InitCopy, dataDir: string, prompt: PromptSession) {
  printStep("Optional", copy.spoolStepPrompt, copy.spoolStepDescription);
  printPanel(copy.spoolWhyTitle, [
    copy.spoolIntro,
    copy.spoolWithout,
    copy.spoolWith,
    copy.spoolRecommendation,
    keyValue(copy.spoolGithubLabel, SPOOL_GITHUB_URL),
    keyValue(copy.spoolInstallLabel, `npm install -g ${SPOOL_CLI_PACKAGE}`),
    copy.spoolBoundary,
  ]);

  const before = checkSpool();
  if (before.available) {
    const enable = await askYesNo(prompt, {
      title: copy.spoolEnablePrompt,
      description: copy.spoolDetectedDescription.replace("{version}", before.version || copy.unknownVersion),
      defaultValue: true,
      invalidMessage: copy.invalidYesNo,
    });
    if (enable) {
      enableSpoolSource(dataDir);
      console.log(`\n${green(copy.spoolEnabled)}`);
    } else {
      console.log(`\n${dim(copy.spoolSkipped)}`);
    }
    return;
  }

  const install = await askYesNo(prompt, {
    title: copy.spoolInstallPrompt,
    description: copy.spoolInstallDescription,
    defaultValue: false,
    invalidMessage: copy.invalidYesNo,
  });
  if (!install) {
    console.log(`\n${dim(copy.spoolSkipped)}`);
    return;
  }

  console.log(`\n${dim(copy.spoolInstalling.replace("{package}", SPOOL_CLI_PACKAGE))}`);
  const installed = installSpoolCli();
  if (!installed.ok) {
    printPanel(copy.spoolInstallFailed, [
      copy.spoolInstallFailedBody,
      keyValue(copy.spoolGithubLabel, SPOOL_GITHUB_URL),
      keyValue(copy.spoolInstallLabel, `npm install -g ${SPOOL_CLI_PACKAGE}`),
      ...(installed.error ? [installed.error] : []),
    ]);
    return;
  }

  const after = checkSpool();
  if (!after.available) {
    printPanel(copy.spoolInstallFailed, [
      copy.spoolInstallMissingAfterInstall,
      keyValue(copy.spoolInstallLabel, `npm install -g ${SPOOL_CLI_PACKAGE}`),
    ]);
    return;
  }

  enableSpoolSource(dataDir);
  console.log(`\n${green(copy.spoolInstallSuccess.replace("{version}", after.version || copy.unknownVersion))}`);
}

function enableSpoolSource(dataDir: string) {
  const config = loadConfig(dataDir);
  saveConfig(dataDir, { ...config, sources: { ...config.sources, spool: { mode: "enabled" } } });
}

function installSpoolCli() {
  const result = spawnSync("npm", ["install", "-g", SPOOL_CLI_PACKAGE], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const error = [result.stderr, result.stdout].filter(Boolean).join("\n").trim().split(/\r?\n/).slice(-4).join("\n");
  return {
    ok: result.status === 0,
    error,
  };
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
  return `${providerName(record.provider)} UserPromptSubmit -> ${target}`;
}

type InitCopy = ReturnType<typeof initCopy>;

function splitHookTarget(value: string) {
  const marker = " -> ";
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return {
    event: value.slice(0, index),
    file: value.slice(index + marker.length),
  };
}

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
  const zh = cliLanguage() === "zh-CN";
  return zh ? {
    productName: "Oh My Experience",
    setupTitle: "Oh My Experience 设置向导",
    setupSubtitle: "面向 AI 编码 Agent 的本地经验召回层",
    heroClaim: "别再把同一条教训讲第二遍。",
    heroCta: "先用内置示例经验体验召回。",
    heroBody: "选择经验库位置；OME 默认安装 Codex 召回 hook。",
    pillarLocal: "Local-first",
    pillarReview: "Review-first",
    pillarRecall: "Prompt-time recall",
    controls: "路径可回车使用推荐值 · 确认需输入 y/n · Ctrl+C 退出",
    modeNew: "首次设置",
    modeExisting: "重新配置已有经验库",
    existingTitle: "已检测到现有配置",
    existingHint: "继续后只更新你确认的设置；不会自动改写经验或激活新经验。",
    dataDirPrompt: "经验库保存在哪里？",
    dataDirDescription: "保存经验、复盘、索引和事件流。也可以放进 Obsidian，例如 ~/.vault/oh-my-experience。",
    pathPlaceholder: "默认路径:",
    confirmPrompt: "继续？",
    confirmDescription: "OME 将保存这个经验库路径，安装上面显示的 Codex hook 和 skill，并写入内置示例经验。",
    cancelled: "已取消，没有写入任何内容。",
    recallStepPrompt: "安装 Codex 经验召回",
    recallStepDescription: "OME 会配置两个本地入口，让 Codex 能在任务开始时加载相关经验。",
    recallHookParagraph: "OME 会把 {hook} hook 写入 {hookFile}，用于在你向 Codex 发送任务时按需召回 {library} 中的经验。",
    recallSkillParagraph: "OME 还会把 {skill} skill 安装到 {skillDir}，让 Codex 知道如何扫描会话、生成候选经验并维护经验库。",
    doneTitle: "设置完成",
    doneDataDir: "经验库就绪:",
    doneConfig: "配置文件:",
    doneHook: "召回已启用:",
    doneCodexTrust: "Codex App 可能会要求你信任新的 UserPromptSubmit hook。",
    donePrivacy: "提示词原文默认不会写入事件流。",
    nextSteps: "下一步:",
    recommendations: "设置后的可选增强:",
    starterPromptIntro: "内置示例经验已启用。先把一个真实任务发给 Agent，体验 prompt-time recall。",
    copyPromptHint: "复制下面整个 Markdown 代码块给 Codex、Claude 或其他 Agent:",
    copyPromptStart: "```text",
    copyPromptEnd: "```",
    starterPrompt: [
      "Create a single HTML file for a Kanban board page.",
      "Only build the board page, not a landing page or a full app.",
      "Use a Linear-inspired, work-focused style with clear columns, readable task cards,",
      "obvious status, and low visual noise.",
      "After the task summary, tell me whether OME surfaced any relevant lesson,",
      "and whether it changed your implementation or validation choices.",
    ].join("\n"),
    afterRecallTitle: "第一次召回体验后:",
    afterRecallIntro: "如果这次召回符合预期，再进入第一张经验卡或更完整的复盘流程。",
    importSourcesRecommendation: "用 Spool 导入更多 Agent 历史",
    importSourcesDescription: "导入 Claude CLI、Gemini CLI、opencode 等会话；不安装也不影响 Codex 默认召回。",
    importSourcesGuide: "https://github.com/rennzhang/oh-my-experience/blob/main/docs/zh/guides/import-sources.md",
    spoolStepPrompt: "可选：连接 Spool CLI",
    spoolStepDescription: "OME 的核心设置已经完成。Spool 只是扩大可扫描的历史会话范围，不是 Codex 召回的前置条件。",
    spoolWhyTitle: "为什么建议安装",
    spoolIntro: "Spool 是本机 AI 会话索引层，把 Claude、Codex、Gemini 等多 Agent 历史统一成可搜索素材池。",
    spoolWithout: "不安装：OME 仍可从当前对话和显式导入的 Codex 会话取材，核心链路完整。",
    spoolWith: "安装后：先索引命中、再按需取证据；比直接吞原始 session 更省 token、上下文更干净。",
    spoolRecommendation: "推荐安装：多 Agent 用户覆盖更全，同时避免大量思考过程、工具日志挤占上下文。",
    spoolGithubLabel: "GitHub:",
    spoolInstallLabel: "CLI 安装:",
    spoolBoundary: "这里只装 CLI，不装桌面 App。导入内容仍需审核，不会自动成为 active 经验。",
    spoolEnablePrompt: "检测到 Spool CLI，要启用 Spool 导入吗？",
    spoolDetectedDescription: "本机 Spool 版本: {version}。启用后，OME 可以在你要求时导入 Spool 索引到本地经验素材池。",
    spoolInstallPrompt: "要现在安装 Spool CLI 吗？",
    spoolInstallDescription: "会执行 npm 全局安装；你也可以拒绝，之后按上面的 GitHub 和安装命令手动安装。",
    spoolInstalling: "正在安装 {package} ...",
    spoolInstallSuccess: "Spool CLI 已安装并启用，检测到版本 {version}。",
    spoolInstallFailed: "Spool CLI 安装失败",
    spoolInstallFailedBody: "OME 主设置已完成；只是 Spool 可选增强没有启用。可以之后按官方地址手动安装。",
    spoolInstallMissingAfterInstall: "npm 安装命令完成，但当前 PATH 仍检测不到 spool 命令。请打开新终端后运行 ome source status 检查。",
    spoolEnabled: "Spool 导入已启用。",
    spoolSkipped: "已跳过 Spool；OME 核心召回照常可用。",
    unknownVersion: "未知",
    exitHint: "按任意键退出",
    enabled: "已启用",
    disabled: "未启用",
    invalidYesNo: "请输入 y 或 n。",
    interactiveNeedsTerminal: "ome init --interactive 需要真实终端，或通过 stdin 提供完整回答。脚本化设置请使用 ome init -y。",
  } : {
    productName: "Oh My Experience",
    setupTitle: "Oh My Experience Setup",
    setupSubtitle: "local-first experience recall for AI coding agents",
    heroClaim: "Stop teaching your agent the same lesson twice.",
    heroCta: "Start with built-in starter lessons today.",
    heroBody: "Choose a library path; OME installs Codex recall by default.",
    pillarLocal: "Local-first",
    pillarReview: "Review-first",
    pillarRecall: "Prompt-time recall",
    controls: "Enter accepts path defaults · confirmation requires y/n · Ctrl+C cancels",
    modeNew: "first-time setup",
    modeExisting: "reconfigure existing library",
    existingTitle: "Existing config:",
    existingHint: "Only confirmed settings are updated; init does not rewrite experiences or activate new ones.",
    dataDirPrompt: "Where should the experience library live?",
    dataDirDescription: "Stores experiences, retrospectives, indexes, and events. Obsidian works too, for example ~/.vault/oh-my-experience.",
    pathPlaceholder: "Default path:",
    confirmPrompt: "Continue?",
    confirmDescription: "OME will save this library path, install the Codex hook and skill shown above, and add built-in starter lessons.",
    cancelled: "Cancelled. Nothing was written.",
    recallStepPrompt: "Install Codex experience recall",
    recallStepDescription: "OME will configure two local entry points so Codex can load relevant experience at task time.",
    recallHookParagraph: "OME will add the {hook} hook to {hookFile}. It recalls experiences from {library} when you send a task to Codex.",
    recallSkillParagraph: "OME will also install the {skill} skill to {skillDir}. The skill tells Codex how to scan sessions, create retrospective candidates, and maintain the experience library.",
    doneTitle: "Setup complete",
    doneDataDir: "Library ready:",
    doneConfig: "Config file:",
    doneHook: "Recall enabled:",
    doneCodexTrust: "Codex App may ask you to trust the new UserPromptSubmit hook.",
    donePrivacy: "Raw prompt text is not written to events by default.",
    nextSteps: "Next step:",
    recommendations: "After setup (optional):",
    starterPromptIntro: "Starter lessons are active. First, send a real task to your agent to feel prompt-time recall.",
    copyPromptHint: "Copy the entire Markdown code block below into Codex, Claude, or another agent:",
    copyPromptStart: "```text",
    copyPromptEnd: "```",
    starterPrompt: [
      "Create a single HTML file for a Kanban board page.",
      "Only build the board page, not a landing page or a full app.",
      "Use a Linear-inspired, work-focused style with clear columns, readable task cards,",
      "obvious status, and low visual noise.",
      "After the task summary, tell me whether OME surfaced any relevant lesson,",
      "and whether it changed your implementation or validation choices.",
    ].join("\n"),
    afterRecallTitle: "After the first recall:",
    afterRecallIntro: "If the recall feels right, move on to the first-card guide or a fuller retrospective.",
    importSourcesRecommendation: "Import more agent histories with Spool",
    importSourcesDescription: "Import Claude CLI, Gemini CLI, opencode, and other supported histories. Codex recall works without it.",
    importSourcesGuide: "https://github.com/rennzhang/oh-my-experience/blob/main/docs/guides/import-sources.md",
    spoolStepPrompt: "Optional: connect Spool CLI",
    spoolStepDescription: "OME core setup is complete. Spool only expands the session history available for scans; Codex recall does not depend on it.",
    spoolWhyTitle: "Why install it",
    spoolIntro: "Spool is a local AI session index that unifies Claude, Codex, Gemini, and other agent histories into one searchable pool.",
    spoolWithout: "Without it: OME still draws from the current conversation and explicitly imported Codex sessions; the core path is intact.",
    spoolWith: "With it: index-first lookup, then evidence on demand; avoids dumping raw sessions into context and saves tokens.",
    spoolRecommendation: "Recommended for multi-agent users: broader coverage without flooding your context with think traces and tool logs.",
    spoolGithubLabel: "GitHub:",
    spoolInstallLabel: "CLI install:",
    spoolBoundary: "CLI only; no desktop app. Imports still require review; lessons never auto-activate.",
    spoolEnablePrompt: "Spool CLI detected. Enable Spool imports?",
    spoolDetectedDescription: "Detected Spool version: {version}. If enabled, OME can import the Spool index into the local source pool when you ask.",
    spoolInstallPrompt: "Install Spool CLI now?",
    spoolInstallDescription: "This runs a global npm install. You can decline and install it later from the GitHub URL and command above.",
    spoolInstalling: "Installing {package} ...",
    spoolInstallSuccess: "Spool CLI installed and enabled. Detected version {version}.",
    spoolInstallFailed: "Spool CLI install failed",
    spoolInstallFailedBody: "OME core setup is complete; only the optional Spool enhancement was not enabled. You can install it manually later.",
    spoolInstallMissingAfterInstall: "npm completed, but the spool command is still not visible on PATH. Open a new terminal and run ome source status.",
    spoolEnabled: "Spool imports enabled.",
    spoolSkipped: "Skipped Spool; OME core recall still works.",
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
  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (!values.length || values.includes("none")) return [];
  if (values.includes("all")) return ["codex", "claude"];
  return Array.from(new Set(values.map((item) => item === "claude" ? "claude" : "codex")));
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

function planInitSkill(args: ParsedArgs, dryRun: boolean) {
  return planSkill({ codexHome: codexHome(args), dryRun });
}

const OME_SKILL_NAME = "oh-my-experience";
const OME_SKILL_MARKER = ".ome-skill.json";

type SkillOptions = {
  codexHome?: string;
  dryRun?: boolean;
  force?: boolean;
};

function planSkill(options: SkillOptions = {}) {
  const root = options.codexHome || codexHome({ flags: {}, positionals: [] });
  const target = path.join(root, "skills", OME_SKILL_NAME);
  const source = path.join(packageRoot(), "skills", OME_SKILL_NAME);
  const existing = inspectSkillTarget(target);
  return {
    ok: true,
    provider: "codex",
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

function installInitSkill(args: ParsedArgs) {
  return installSkill({ codexHome: codexHome(args), dryRun: false, force: Boolean(args.flags.force) });
}

function installSkill(options: SkillOptions = {}) {
  const plan = planSkill(options);
  if (!fs.existsSync(plan.source)) throw new Error(`bundled OME skill not found: ${plan.source}`);
  if (plan.conflict && !options.force) {
    throw new Error(`Codex skill target already exists and is not owned by OME: ${plan.target}. Use --force only if you want to replace it.`);
  }
  if (options.dryRun) return plan;
  fs.rmSync(plan.target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(plan.target), { recursive: true });
  fs.cpSync(plan.source, plan.target, { recursive: true });
  writeSkillMarker(plan.target);
  return { ...plan, installed: true, owned: true, conflict: false };
}

function uninstallSkill(options: SkillOptions = {}) {
  const plan = planSkill(options);
  if (!plan.installed) return { ...plan, uninstalled: false, reason: "not installed" };
  if (plan.conflict && !options.force) {
    throw new Error(`Codex skill target exists but is not owned by OME: ${plan.target}. Use --force only if you want to remove it.`);
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

function writeSkillMarker(target: string) {
  const info = packageInfo();
  fs.writeFileSync(path.join(target, OME_SKILL_MARKER), JSON.stringify({
    name: OME_SKILL_NAME,
    package: info.name,
    version: info.version,
    installedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

function codexHome(args: ParsedArgs) {
  return args.flags["codex-home"] ? path.resolve(args.flags["codex-home"]) : process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function codexHooksFile(args: ParsedArgs) {
  return path.join(codexHome(args), "hooks.json");
}

function configPointerPath() {
  return path.join(defaultConfigHome(), "config.json");
}

function importCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (subcommand === "codex") {
    const sessions = args.flags.sessions || args.flags["sessions-dir"];
    if (!sessions) throw new Error("usage: ome import codex --sessions <dir>");
    return print(importCodexSessions(dataDir, path.resolve(sessions)), args);
  }
  if (subcommand === "spool") return print(importSpoolSessions(dataDir, spoolOptions(args)), args);
  throw new Error("usage: ome import codex|spool");
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
    nextStep: "Use the OME retrospective skill reference to complete the source audit and synthesis, then write candidates for review.",
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
    reviewFile: path.join(runDir, "retrospective.md"),
  };
}

function sourceCommand(dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  if (!subcommand || subcommand === "status") return print({ ok: true, spool: checkSpool(), sources: loadConfig(dataDir).sources }, args);
  if (subcommand === "connect") {
    const source = args.positionals[2];
    if (source !== "spool") throw new Error("usage: ome source connect spool --mode off|ask|enabled");
    const mode = String(args.flags.mode || "enabled");
    if (!["off", "ask", "enabled"].includes(mode)) throw new Error("source mode must be off, ask, or enabled");
    const config = loadConfig(dataDir);
    return print(saveConfig(dataDir, { ...config, sources: { ...config.sources, spool: { mode } } }), args);
  }
  if (subcommand === "import") {
    const source = args.positionals[2];
    if (source !== "spool") throw new Error("usage: ome source import spool");
    return print(importSpoolSessions(dataDir, spoolOptions(args)), args);
  }
  throw new Error("usage: ome source status|connect spool|import spool");
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
  throw new Error("usage: ome experience list|show|enable|archive");
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
  return print({ ok: true, query, libraries: stack.libraries, matches, additionalContext: renderAdditionalContext(matches) }, args);
}

function projectCommand(_dataDir: string, subcommand: string | undefined, args: ParsedArgs) {
  const cwd = args.flags.cwd ? path.resolve(args.flags.cwd) : process.cwd();
  const projectContext = detectProjectContext(cwd);
  if (!projectContext.root) throw new Error("project command requires running inside a project");
  if (!subcommand || subcommand === "status") {
    const library = inspectProjectLibrary(projectContext.root);
    return print({
      ok: true,
      projectContext,
      projectLibrary: library.dataDir,
      exists: library.exists,
      readable: library.readable,
      warnings: library.warnings,
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
  const skill = args.flags["keep-skill"] || !providers.includes("codex")
    ? { skipped: true, reason: args.flags["keep-skill"] ? "--keep-skill" : "codex provider not selected" }
    : uninstallSkill({
      codexHome: args.flags["codex-home"] ? path.resolve(args.flags["codex-home"]) : process.env.CODEX_HOME,
      dryRun: Boolean(args.flags["dry-run"]),
      force: Boolean(args.flags.force),
    });
  const library = uninstallLibrary(dataDir, args);
  return print({ ok: true, hooks, skill, library, dryRun: Boolean(args.flags["dry-run"]) }, args);
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
  const zh = cliLanguage() === "zh-CN";
  if (command === "init") return renderInitResult(record, zh);
  if (command === "doctor") return renderDoctorResult(record, zh);
  if (command === "hook") return renderHookResult(record, zh);
  if (command === "config") return renderConfigResult(record, subcommand, zh);
  if (command === "import" || command === "source") return renderImportResult(record, subcommand, zh);
  if (command === "reflect") return renderReflectResult(record, zh);
  if (command === "experience") return renderExperienceResult(record, subcommand, zh);
  if (command === "match") return renderMatchResult(record, Boolean(args.flags.explain), zh);
  if (command === "project") return renderProjectResult(record, subcommand, zh);
  if (command === "eval") return renderEvalResult(record, subcommand, zh);
  if (command === "stats") return renderStatsResult(record, zh);
  if (command === "uninstall") return renderUninstallResult(record, zh);
  return renderGenericResult(record, zh);
}

function renderInitResult(record: Record<string, any>, zh: boolean): string {
  const dryRun = Boolean(record.dryRun);
  const plan = asRecord(record.plan);
  const dataDir = String(plan.dataDir || record.dataDir || "");
  const hooks = Array.isArray(record.hooks) ? record.hooks : [];
  const lines = [
    dryRun ? (zh ? "设置预览" : "Setup preview") : (zh ? "设置完成" : "Setup complete"),
    `${zh ? "经验库" : "Library"}: ${dataDir}`,
    `${zh ? "配置文件" : "Config file"}: ${configPointerPath()}`,
  ];
  if (record.sources) lines.push(`Spool: ${asRecord(asRecord(record.sources).spool).mode || "off"}`);
  if (hooks.length) lines.push(`${zh ? "Agent 召回" : "Agent recall"}: ${hooks.map((hook) => formatHookStatus(asRecord(hook), zh)).join(", ")}`);
  else if (asRecord(record.hooks).skipped) lines.push(`${zh ? "Agent 召回" : "Agent recall"}: ${zh ? "未启用" : "disabled"}`);
  const skill = asRecord(record.skill);
  if (skill.target) lines.push(`${zh ? "Codex Skill" : "Codex skill"}: ${skill.target}`);
  const starterCards = Array.isArray(record.starterCards) ? record.starterCards : [];
  if (starterCards.length) lines.push(`${zh ? "内置示例经验" : "Starter lessons"}: ${starterCards.length}`);
  if (!dryRun) {
    lines.push("");
    lines.push(zh ? "下一步:" : "Next step:");
    lines.push(`  ${zh ? "先把一个真实任务发给 Agent，体验内置示例经验的提示词阶段召回。" : "Send a real task to your agent first and feel prompt-time recall with the starter lessons."}`);
    lines.push(`  ${zh ? "第一次召回体验后，再进入第一张经验卡或完整复盘流程；候选会进入 Markdown 审批文件，不会自动启用。" : "After the first recall, move to the first-card or full retrospective flow; candidates go to a Markdown review file and are not enabled automatically."}`);
    if (hooks.some((hook) => asRecord(hook).provider === "codex" && asRecord(hook).installed)) {
      lines.push(`  ${zh ? "Codex App 可能会要求你信任新的 UserPromptSubmit hook。" : "Codex App may ask you to trust the new UserPromptSubmit hook."}`);
    }
    lines.push("");
    lines.push(zh ? "建议:" : "Recommendations:");
    lines.push(`  ${zh ? "用 Spool 导入更多 Agent 历史" : "Import more agent histories with Spool"}`);
    lines.push(`  ${zh ? "可把 Claude CLI、Gemini CLI、opencode 等会话导入 OME；不安装也不影响 Codex 默认召回。" : "Bring Claude CLI, Gemini CLI, opencode, and other supported histories into OME. Codex recall works without it."}`);
    lines.push(`  ${zh ? "https://github.com/rennzhang/oh-my-experience/blob/main/docs/zh/guides/import-sources.md" : "https://github.com/rennzhang/oh-my-experience/blob/main/docs/guides/import-sources.md"}`);
  }
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderDoctorResult(record: Record<string, any>, zh: boolean): string {
  const doctor = asRecord(record.doctor || record);
  const lines = [
    `${zh ? "健康检查" : "Health check"}: ${doctor.ok ? (zh ? "正常" : "OK") : (zh ? "需要处理" : "Needs attention")}`,
  ];
  if (doctor.checked) lines.push(`${zh ? "已检查" : "Checked"}: ${Object.keys(asRecord(doctor.checked)).join(", ")}`);
  appendList(lines, zh ? "阻塞项" : "Errors", doctor.errors);
  appendList(lines, zh ? "注意项" : "Warnings", doctor.warnings);
  appendList(lines, zh ? "建议动作" : "Actions", doctor.actions);
  if (record.repairedIndex) lines.push(`${zh ? "索引已重建" : "Index rebuilt"}: ${asRecord(record.repairedIndex).experiences?.length || 0} ${zh ? "张卡片" : "cards"}`);
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderHookResult(record: Record<string, any>, zh: boolean): string {
  const lines = [`${zh ? "Hook 状态" : "Hook status"}: ${formatHookStatus(record, zh)}`];
  if (record.target) lines.push(`${zh ? "配置文件" : "Config file"}: ${record.target}`);
  if (record.hook?.command) lines.push(`${zh ? "命令" : "Command"}: ${record.hook.command}`);
  if (record.reason) lines.push(`${zh ? "原因" : "Reason"}: ${record.reason}`);
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderUninstallResult(record: Record<string, any>, zh: boolean): string {
  const hooks = Array.isArray(record.hooks) ? record.hooks : [];
  const skill = asRecord(record.skill);
  const library = asRecord(record.library);
  const lines = [
    record.dryRun ? (zh ? "卸载预览" : "Uninstall preview") : (zh ? "卸载完成" : "Uninstall complete"),
  ];
  if (hooks.length) lines.push(`${zh ? "Hook" : "Hooks"}: ${hooks.map((hook) => formatHookStatus(asRecord(hook), zh)).join(", ")}`);
  if (!skill.skipped) lines.push(`${zh ? "Codex Skill" : "Codex skill"}: ${formatSkillStatus(skill, zh)}`);
  else lines.push(`${zh ? "Codex Skill" : "Codex skill"}: ${zh ? "保留" : "kept"}`);
  if (library.deleted) lines.push(`${zh ? "经验库已删除" : "Library deleted"}: ${library.path}`);
  else lines.push(`${zh ? "经验库已保留" : "Library kept"}: ${library.path || ""}`);
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderConfigResult(record: Record<string, any>, subcommand: string, zh: boolean): string {
  if (subcommand === "get" || record.version) {
    const retrieval = asRecord(record.retrieval);
    return [
      zh ? "当前配置" : "Current config",
      `${zh ? "经验库" : "Library"}: ${record.dataDir || ""}`,
      `${zh ? "召回" : "Recall"}: maxCards=${retrieval.maxCards || "-"}, minScore=${retrieval.minScore || "-"}`,
      jsonHint(zh),
    ].join("\n");
  }
  const lines = [
    record.ok === false ? (zh ? "配置未更新" : "Config not updated") : (zh ? "配置已处理" : "Config updated"),
    `${zh ? "字段" : "Key"}: ${record.key || ""}`,
  ];
  if (record.previous !== undefined) lines.push(`${zh ? "之前" : "Previous"}: ${formatScalar(record.previous)}`);
  if (record.next !== undefined) lines.push(`${zh ? "现在" : "Next"}: ${formatScalar(record.next)}`);
  appendList(lines, zh ? "注意项" : "Warnings", record.warnings);
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderImportResult(record: Record<string, any>, subcommand: string, zh: boolean): string {
  if (typeof record.available === "boolean") {
    return [
      `Spool: ${record.available ? (zh ? "可用" : "available") : (zh ? "未检测到" : "not detected")}`,
      record.version ? `Version: ${record.version}` : "",
      record.message ? `${zh ? "说明" : "Message"}: ${record.message}` : "",
      jsonHint(zh),
    ].filter(Boolean).join("\n");
  }
  const imported = Array.isArray(record.imported) ? record.imported.length : 0;
  const failed = Array.isArray(record.failed) ? record.failed.length : 0;
  return [
    subcommand === "spool" ? "Spool import" : (zh ? "导入完成" : "Import complete"),
    `${zh ? "已导入" : "Imported"}: ${imported}`,
    `${zh ? "失败" : "Failed"}: ${failed}`,
    jsonHint(zh),
  ].join("\n");
}

function renderReflectResult(record: Record<string, any>, zh: boolean): string {
  if (Array.isArray(record.retrospectives) || Array.isArray(record.candidates) || Array.isArray(record.drafts)) {
    return renderRetrospectiveResult(record, zh);
  }
  return [
    zh ? "经验审批批次" : "Experience approval run",
    `runId: ${record.runId || record.id || ""}`,
    reviewFileLine(record, zh),
    record.nextStep ? `${zh ? "下一步" : "Next"}: ${record.nextStep}` : "",
    jsonHint(zh),
  ].filter(Boolean).join("\n");
}

function renderRetrospectiveResult(record: Record<string, any>, zh: boolean): string {
  const candidates = Array.isArray(record.candidates) ? record.candidates.length : 0;
  const drafts = Array.isArray(record.drafts) ? record.drafts.length : 0;
  const retrospectives = Array.isArray(record.retrospectives) ? record.retrospectives.length : 0;
  const lines = [zh ? "经验审批结果" : "Experience approval result"];
  if (record.runId) lines.push(`runId: ${record.runId}`);
  if (retrospectives) lines.push(`${zh ? "经验审批批次" : "Experience approval runs"}: ${retrospectives}`);
  if (candidates) lines.push(`${zh ? "候选经验" : "Candidate experiences"}: ${candidates}`);
  if (drafts) lines.push(`${zh ? "经验草稿" : "Experience drafts"}: ${drafts}`);
  if (record.candidate?.id) lines.push(`candidate: ${record.candidate.id}`);
  const reviewLine = reviewFileLine(record, zh);
  if (reviewLine) lines.push(reviewLine);
  if (record.dryRun) lines.push(zh ? "这是 dry-run，没有写入经验草稿。" : "Dry run only; no experience drafts were written.");
  else if (drafts) lines.push(zh ? "经验草稿尚未参与召回；确认无误后运行 ome experience enable <draft-experience-id> 启用。" : "Experience drafts are not recalled yet; run ome experience enable <draft-experience-id> to enable them.");
  else if (candidates) lines.push(retrospectiveNextStep(record, zh));
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function reviewFileLine(record: Record<string, any>, zh: boolean): string {
  if (!record.reviewFile) return "";
  const relative = reviewRelativePath(record);
  const label = zh ? "审批文件" : "Approval file";
  return `${label}: [retrospective.md](${relative})`;
}

function reviewRelativePath(record: Record<string, any>): string {
  if (record.reviewFile) return normalizeMarkdownPath(path.relative(process.cwd(), String(record.reviewFile)));
  if (record.runId) return normalizeMarkdownPath(path.join("retrospectives", String(record.runId), "retrospective.md"));
  if (record.runFile && record.runDir) return normalizeMarkdownPath(path.relative(process.cwd(), String(record.runFile)));
  return "retrospective.md";
}

function normalizeMarkdownPath(value: string): string {
  return value.split(path.sep).join("/");
}

function retrospectiveNextStep(record: Record<string, any>, zh: boolean): string {
  const state = String(record.state || "");
  if (state === "applied_to_drafts") {
    return zh
      ? "已生成经验草稿；草稿不会参与召回，确认无误后运行 ome experience enable <draft-experience-id> 启用。"
      : "Approved candidates have been converted into experience drafts; drafts are not recalled until you run ome experience enable <draft-experience-id>.";
  }
  if (state === "decisions_recorded") {
    return zh
      ? "已有审批区记录；运行 ome reflect apply <runId> 生成经验草稿。"
      : "Approval decisions are recorded; run ome reflect apply <runId> to create experience drafts.";
  }
  return zh
    ? "先在审批文件中回复通过 / 不通过 / 合并 / 改写，再运行 ome reflect apply <runId>。"
    : "Approve candidate experiences in the review file, then run ome reflect apply <runId>.";
}

function renderExperienceResult(record: Record<string, any>, subcommand: string, zh: boolean): string {
  const cards = Array.isArray(record.experiences) ? record.experiences : [];
  const invalidCards = Array.isArray(record.invalidCards) ? record.invalidCards : [];
  const lines = [subcommand === "list" || cards.length ? `${zh ? "经验" : "Experiences"}: ${cards.length}` : (zh ? "经验已更新" : "Experience updated")];
  for (const card of cards.slice(0, 10)) lines.push(`  - ${asRecord(card).id}: ${asRecord(card).title || ""}`);
  if (cards.length > 10) lines.push(`  ... ${cards.length - 10} more`);
  if (invalidCards.length) {
    lines.push(`${zh ? "无效卡片" : "Invalid cards"}: ${invalidCards.length}`);
    for (const issue of invalidCards.slice(0, 5)) {
      const item = asRecord(issue);
      lines.push(`  - ${item.status || ""}: ${item.path || ""} (${item.message || ""})`);
    }
    if (invalidCards.length > 5) lines.push(`  ... ${invalidCards.length - 5} more invalid`);
  }
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderMatchResult(record: Record<string, any>, explain: boolean, zh: boolean): string {
  const matches = Array.isArray(record.matches) ? record.matches : [];
  const libraries = Array.isArray(record.libraries) ? record.libraries : [];
  const lines = [
    `${zh ? "召回结果" : "Recall result"}: ${matches.length} ${zh ? "张卡片" : "cards"}`,
    `${zh ? "查询" : "Query"}: ${record.query || ""}`,
  ];
  if (explain && libraries.length) {
    lines.push(`${zh ? "经验库" : "Libraries"}: ${libraries.map((library) => {
      const item = asRecord(library);
      return `${item.scope}${item.exists === false ? (zh ? "(不存在)" : "(missing)") : item.readable === false ? (zh ? "(不可读)" : "(unreadable)") : ""}`;
    }).join(", ")}`);
  }
  for (const match of matches.slice(0, 8)) {
    const item = asRecord(match);
    const card = asRecord(item.card);
    const title = item.title || card.title || item.id || card.id;
    const id = item.id || card.id || "";
    const scope = card.libraryScope ? ` ${card.libraryScope}` : "";
    lines.push(`  ${item.rank || "-"}。${title} (${zh ? "分数" : "score"} ${Math.round(Number(item.score || 0))}${scope}) ${id ? `[${id}]` : ""}`);
    if (explain && Array.isArray(item.reasons) && item.reasons.length) lines.push(`     ${item.reasons.slice(0, 2).map(formatMatchReason).join("; ")}`);
  }
  const envelope = asRecord(record.envelope);
  if (explain && Array.isArray(envelope.intentModes) && envelope.intentModes.length) lines.push(`intent: ${envelope.intentModes.join(", ")}`);
  if (explain && Array.isArray(envelope.ruleSignals) && envelope.ruleSignals.length) lines.push(`signals: ${envelope.ruleSignals.map((signal) => asRecord(signal).id || signal).join(", ")}`);
  if (record.additionalContext) lines.push(`${zh ? "注入上下文" : "Additional context"}: ${String(record.additionalContext).length} chars`);
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderProjectResult(record: Record<string, any>, subcommand: string, zh: boolean): string {
  if (subcommand === "init") {
    return [
      zh ? "项目经验库已初始化" : "Project library initialized",
      `${zh ? "项目" : "Project"}: ${record.projectRoot || ""}`,
      `${zh ? "项目经验库" : "Project library"}: ${record.projectLibrary || ""}`,
      jsonHint(zh),
    ].join("\n");
  }
  return [
    zh ? "项目经验库状态" : "Project library status",
    `${zh ? "项目经验库" : "Project library"}: ${record.projectLibrary || ""}`,
    `${zh ? "存在" : "Exists"}: ${record.exists ? (zh ? "是" : "yes") : (zh ? "否" : "no")}`,
    `${zh ? "可读" : "Readable"}: ${record.readable ? (zh ? "是" : "yes") : (zh ? "否" : "no")}`,
    ...(Array.isArray(record.warnings) && record.warnings.length ? [`${zh ? "警告" : "Warnings"}: ${record.warnings.join("; ")}`] : []),
    jsonHint(zh),
  ].join("\n");
}

function formatMatchReason(value: unknown): string {
  const item = asRecord(value);
  if (!Object.keys(item).length) return String(value);
  return `${item.field || "reason"}:${item.term || ""}${item.weight !== undefined ? ` ${item.weight}` : ""}`.trim();
}

function renderEvalResult(record: Record<string, any>, subcommand: string, zh: boolean): string {
  const metrics = asRecord(record.metrics);
  const lines = [
    `${zh ? "评估结果" : "Evaluation"}: ${record.ok === false ? (zh ? "未通过" : "failed") : (zh ? "通过" : "passed")}`,
  ];
  if (Object.keys(metrics).length) {
    lines.push(`passRate=${formatMetric(metrics.passRate)}, recall@k=${formatMetric(metrics.recallAtK)}, precision@k=${formatMetric(metrics.precisionAtK)}, overRecall=${formatMetric(metrics.overRecallRate)}`);
  }
  if (record.thresholds && asRecord(record.thresholds).failed?.length) appendList(lines, zh ? "未达标" : "Failed thresholds", asRecord(record.thresholds).failed);
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function renderStatsResult(record: Record<string, any>, zh: boolean): string {
  return [
    zh ? "运行统计" : "Stats",
    `${zh ? "卡片数" : "Cards"}: ${Object.keys(asRecord(record.cardRecallCount)).length}`,
    `${zh ? "最近事件" : "Recent events"}: ${Array.isArray(record.recentEvents) ? record.recentEvents.length : 0}`,
    jsonHint(zh),
  ].join("\n");
}

function renderGenericResult(record: Record<string, any>, zh: boolean): string {
  const lines = [record.ok === false ? (zh ? "未完成" : "Failed") : (zh ? "完成" : "Done")];
  for (const [key, value] of Object.entries(record).slice(0, 8)) {
    if (key === "ok") continue;
    if (Array.isArray(value)) lines.push(`${key}: ${value.length}`);
    else if (isPrimitive(value)) lines.push(`${key}: ${formatScalar(value)}`);
  }
  lines.push(jsonHint(zh));
  return lines.join("\n");
}

function formatHookStatus(record: Record<string, any>, zh: boolean): string {
  const provider = providerName(record.provider || "hook");
  if (record.skipped) return `${provider} ${zh ? "未启用" : "disabled"}`;
  if (record.installed) return `${provider} ${zh ? "已启用" : "enabled"}`;
  if (record.uninstalled) return `${provider} ${zh ? "已移除" : "removed"}`;
  if (record.dryRun) return `${provider} ${zh ? "预览" : "preview"}`;
  if (typeof record.installed === "boolean") return `${provider} ${record.installed ? (zh ? "已启用" : "enabled") : (zh ? "未启用" : "disabled")}`;
  return `${provider} ${zh ? "已处理" : "updated"}`;
}

function formatSkillStatus(record: Record<string, any>, zh: boolean): string {
  if (record.skipped) return zh ? "已跳过" : "skipped";
  if (record.conflict) return zh ? "冲突" : "conflict";
  if (record.uninstalled) return zh ? "已移除" : "removed";
  if (record.dryRun) return zh ? "预览" : "preview";
  if (record.installed) return zh ? "已安装" : "installed";
  if (typeof record.installed === "boolean") return record.installed ? (zh ? "已安装" : "installed") : (zh ? "未安装" : "not installed");
  return zh ? "已处理" : "updated";
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

function jsonHint(zh: boolean): string {
  return zh ? "完整机器可读输出请加 --json。" : "Use --json for full machine-readable output.";
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

function cliLanguage() {
  return normalizeLocale(String(process.env.OME_LANGUAGE || "en"));
}

function printHelp() {
  const locale = cliLanguage();
  const zh = locale === "zh-CN";
  console.log(zh ? `${t("cli.title", locale)}

面向 AI 编码 Agent 的本地经验层：先审核经验卡，再在提示词阶段召回。

常用路径:
  ome init                         打开设置向导
  ome doctor                       检查经验库、hook 和包状态
  ome uninstall                    移除 Codex hook 和 OME skill，默认保留经验库
  ome match "修复 UI 并浏览器验收" --explain

核心命令:
  ome init [--interactive] [--yes|-y] [--data-dir <path>] [--provider codex|claude|all] [--no-hook] [--reset-config]
  ome uninstall [--provider codex|claude|all] [--delete-library --yes]
  ome version | ome -v
  ome config get|preview|set
  ome import codex --sessions <dir>
  ome source status|connect spool|import spool
  ome reflect start [--focus <text>]
  ome reflect list|show|add|candidates|decide|apply|resume
  ome experience list|show|enable|archive
  ome project init|status
  ome eval recall --suite <file>
  ome hook run|status
  ome stats

输出:
  默认输出给人看；脚本、hook、测试请加 --json。
  --reset-config 只覆盖运行配置，不删除经验、来源索引或审批记录。
  如果 init 没有出现向导，先运行 ome version 确认当前二进制，再用 ome init --interactive。

文档:
  docs/zh/guides/quickstart.md
  docs/zh/reference/cli.md
` : `${t("cli.title", locale)}

Local-first experience layer for AI coding agents: review cards first, recall
them at prompt time.

Common path:
  ome init                         start the setup wizard
  ome doctor                       check library, hooks, and package status
  ome uninstall                    remove Codex hook and OME skill, keep library by default
  ome match "fix UI and validate in browser" --explain

Core commands:
  ome init [--interactive] [--yes|-y] [--data-dir <path>] [--provider codex|claude|all] [--no-hook] [--reset-config]
  ome uninstall [--provider codex|claude|all] [--delete-library --yes]
  ome version | ome -v
  ome config get|preview|set
  ome import codex --sessions <dir>
  ome source status|connect spool|import spool
  ome reflect start [--focus <text>]
  ome reflect list|show|add|candidates|decide|apply|resume
  ome experience list|show|enable|archive
  ome project init|status
  ome eval recall --suite <file>
  ome hook run|status
  ome stats

Output:
  Human-readable by default. Use --json for scripts, hooks, and tests.
  --reset-config only overwrites runtime config. It does not delete experiences, source indexes, or approval runs.
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
