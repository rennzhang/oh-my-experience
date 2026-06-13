import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeJsonAtomic } from "../../../../core/src/storage.js";

type HookInstallOptions = {
  codexHome?: string;
  bin?: string;
  dataDir?: string | null;
  dryRun?: boolean;
};

type HookConfig = Record<string, any>;
type HookEntry = { matcher?: unknown; hooks?: HookConfig[] };

export function hookPlan({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), bin = "ome", dataDir = null }: HookInstallOptions = {}) {
  const root = codexHome;
  const target = path.join(root, "hooks.json");
  const command = `${shellArg(bin)} hook run --json${optionsDataDir({ dataDir })}`;
  return {
    ok: true,
    provider: "codex",
    installTarget: "global",
    root,
    target,
    hook: {
      type: "command",
      command,
      statusMessage: "Recalling experience cards",
      timeout: 5,
    },
  };
}

export function installHook(options: HookInstallOptions = {}) {
  const plan = hookPlan(options);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, dryRun: true };
  const target = String(plan.target);
  const root = String(plan.root);
  const hook = plan.hook as HookConfig;
  const next = mergeHook(readHooksJson(target), hook);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeJsonAtomic(target, next, root);
  return { ...plan, installed: true };
}

export function uninstallHook(options: HookInstallOptions = {}) {
  const plan = hookPlan(options);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, dryRun: true };
  const target = String(plan.target);
  const root = String(plan.root);
  const hook = plan.hook as HookConfig;
  const next = removeHook(readHooksJson(target), String(hook.command));
  if (next) writeJsonAtomic(target, next, root);
  return { ...plan, uninstalled: true };
}

export function hookStatus(options: HookInstallOptions = {}) {
  const plan = hookPlan(options);
  if (!plan.ok) return plan;
  const target = String(plan.target);
  const hook = plan.hook as HookConfig;
  const config = readHooksJson(target);
  const entries: HookEntry[] = Array.isArray(config.hooks?.UserPromptSubmit) ? config.hooks.UserPromptSubmit : [];
  const installedHook = entries
    .flatMap((entry: HookEntry) => entry.hooks || [])
    .find((candidate: HookConfig) => isOmeHookCommand(candidate.command, String(hook.command)));
  return {
    ...plan,
    installed: Boolean(installedHook),
    installedCommand: installedHook?.command || null,
    matchesExpectedCommand: installedHook?.command === hook.command,
  };
}

function readHooksJson(target: string): HookConfig {
  if (!fs.existsSync(target)) return { hooks: {} };
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function mergeHook(config: HookConfig, hook: HookConfig): HookConfig {
  const next = { ...config, hooks: { ...(config.hooks || {}) } };
  const entries: HookEntry[] = Array.isArray(next.hooks.UserPromptSubmit) ? next.hooks.UserPromptSubmit : [];
  const cleaned = removeOmeHooks(entries, String(hook.command));
  const existing = cleaned.find((entry: HookEntry) => !entry.matcher);
  if (existing) {
    existing.hooks = existing.hooks || [];
    existing.hooks.push(hook);
  } else {
    cleaned.push({ hooks: [hook] });
  }
  next.hooks.UserPromptSubmit = cleaned;
  return next;
}

function removeHook(config: HookConfig, command: string): HookConfig {
  if (!config.hooks?.UserPromptSubmit) return config;
  config.hooks.UserPromptSubmit = removeOmeHooks(config.hooks.UserPromptSubmit, command);
  return config;
}

function removeOmeHooks(entries: HookEntry[], command: string): HookEntry[] {
  return entries
    .map((entry: HookEntry) => ({
      ...entry,
      hooks: (entry.hooks || []).filter((hook: HookConfig) => !isOmeHookCommand(hook.command, command)),
    }))
    .filter((entry: HookEntry) => (entry.hooks || []).length > 0);
}

function isOmeHookCommand(candidate: unknown, currentCommand: string): boolean {
  if (typeof candidate !== "string") return false;
  if (candidate === currentCommand) return true;
  return (
    candidate.includes("ome hook run") ||
    candidate.includes("oh-my-experience hook run") ||
    candidate.includes("/ome hook run") ||
    candidate.includes("/oh-my-experience hook run")
  );
}

function optionsDataDir(options: HookInstallOptions = {}): string {
  return options.dataDir ? ` --data-dir ${shellArg(String(options.dataDir))}` : "";
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
