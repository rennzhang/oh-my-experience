import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeJsonAtomic } from "../../../../core/src/storage.js";

type HookInstallOptions = {
  cursorHome?: string;
  bin?: string;
  dataDir?: string | null;
  dryRun?: boolean;
};

type HookSettings = Record<string, any>;

export function cursorHookPlan({
  cursorHome = process.env.CURSOR_HOME || path.join(os.homedir(), ".cursor"),
  bin = "ome",
  dataDir = null,
}: HookInstallOptions = {}) {
  const root = cursorHome;
  const target = path.join(root, "hooks.json");
  return {
    ok: true,
    provider: "cursor",
    installTarget: "global",
    root,
    target,
    hook: {
      command: `${shellArg(bin)} hook run --json${optionsDataDir({ dataDir })}`,
      timeout: 5,
    },
  };
}

export function installCursorHook(options: HookInstallOptions = {}) {
  const plan = cursorHookPlan(options);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, dryRun: true };
  const target = String(plan.target);
  const root = String(plan.root);
  const hook = plan.hook as HookSettings;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeJsonAtomic(target, mergeHook(readHooksJson(target), hook), root);
  return { ...plan, installed: true };
}

export function uninstallCursorHook(options: HookInstallOptions = {}) {
  const plan = cursorHookPlan(options);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, dryRun: true };
  const target = String(plan.target);
  const root = String(plan.root);
  const hook = plan.hook as HookSettings;
  if (!fs.existsSync(target)) return { ...plan, uninstalled: true };
  writeJsonAtomic(target, removeHook(readHooksJson(target), String(hook.command)), root);
  return { ...plan, uninstalled: true };
}

export function cursorHookStatus(options: HookInstallOptions = {}) {
  const plan = cursorHookPlan(options);
  if (!plan.ok) return plan;
  const target = String(plan.target);
  const hook = plan.hook as HookSettings;
  const config = readHooksJson(target);
  const entries: HookSettings[] = Array.isArray(config.hooks?.beforeSubmitPrompt) ? config.hooks.beforeSubmitPrompt : [];
  const installedHook = entries.find((candidate: HookSettings) => isOmeHookCommand(candidate.command, String(hook.command)));
  return {
    ...plan,
    installed: Boolean(installedHook),
    installedCommand: installedHook?.command || null,
    matchesExpectedCommand: installedHook?.command === hook.command,
  };
}

function readHooksJson(target: string): HookSettings {
  if (!fs.existsSync(target)) return { version: 1, hooks: {} };
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function mergeHook(config: HookSettings, hook: HookSettings): HookSettings {
  const hooks = { ...(config.hooks || {}) };
  const entries: HookSettings[] = Array.isArray(hooks.beforeSubmitPrompt) ? hooks.beforeSubmitPrompt : [];
  const cleaned = entries.filter((entry: HookSettings) => !isOmeHookCommand(entry?.command, String(hook.command)));
  cleaned.push(hook);
  return {
    ...config,
    version: config.version ?? 1,
    hooks: {
      ...hooks,
      beforeSubmitPrompt: cleaned,
    },
  };
}

function removeHook(config: HookSettings, command: string): HookSettings {
  if (!config.hooks?.beforeSubmitPrompt) return config;
  const hooks = { ...config.hooks };
  const remaining = (hooks.beforeSubmitPrompt || []).filter((entry: HookSettings) => !isOmeHookCommand(entry?.command, command));
  if (remaining.length) hooks.beforeSubmitPrompt = remaining;
  else delete hooks.beforeSubmitPrompt;
  return { ...config, hooks };
}

function isOmeHookCommand(candidate: unknown, currentCommand: string): boolean {
  if (typeof candidate !== "string") return false;
  if (candidate === currentCommand) return true;
  return isOmeRuntimeHookCommand(candidate);
}

function isOmeRuntimeHookCommand(command: string): boolean {
  const normalized = command.replace(/\\/g, "/");
  return /(?:^|[\s/"'])(?:ome|oh-my-experience)(?:\.js)?['"]?\s+hook\s+run(?:\s|$)/i.test(normalized);
}

function optionsDataDir(options: HookInstallOptions = {}): string {
  return options.dataDir ? ` --data-dir ${shellArg(String(options.dataDir))}` : "";
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
