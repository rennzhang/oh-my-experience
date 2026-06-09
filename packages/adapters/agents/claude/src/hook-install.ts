import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeJsonAtomic } from "../../../../core/src/storage.js";

type HookInstallOptions = {
  claudeHome?: string;
  bin?: string;
  dataDir?: string | null;
  dryRun?: boolean;
};

type HookSettings = Record<string, any>;
type HookEntry = { matcher?: unknown; hooks?: HookSettings[] };

export function claudeHookPlan({ claudeHome = path.join(os.homedir(), ".claude"), bin = "ome", dataDir = null }: HookInstallOptions = {}) {
  const root = claudeHome;
  const target = path.join(root, "settings.json");
  return {
    ok: true,
    provider: "claude",
    installTarget: "global",
    root,
    target,
    hook: {
      type: "command",
      command: `${shellArg(bin)} hook run --json${optionsDataDir({ dataDir })}`,
      timeout: 5,
    },
  };
}

export function installClaudeHook(options: HookInstallOptions = {}) {
  const plan = claudeHookPlan(options);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, dryRun: true };
  const target = String(plan.target);
  const root = String(plan.root);
  const hook = plan.hook as HookSettings;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeJsonAtomic(target, mergeHook(readSettings(target), hook), root);
  return { ...plan, installed: true };
}

export function uninstallClaudeHook(options: HookInstallOptions = {}) {
  const plan = claudeHookPlan(options);
  if (!plan.ok) return plan;
  if (options.dryRun) return { ...plan, dryRun: true };
  const target = String(plan.target);
  const root = String(plan.root);
  const hook = plan.hook as HookSettings;
  writeJsonAtomic(target, removeHook(readSettings(target), String(hook.command)), root);
  return { ...plan, uninstalled: true };
}

export function claudeHookStatus(options: HookInstallOptions = {}) {
  const plan = claudeHookPlan(options);
  if (!plan.ok) return plan;
  const target = String(plan.target);
  const hook = plan.hook as HookSettings;
  const settings = readSettings(target);
  const entries: HookEntry[] = Array.isArray(settings.hooks?.UserPromptSubmit) ? settings.hooks.UserPromptSubmit : [];
  const installed = Boolean(entries.some((entry: HookEntry) =>
    (entry.hooks || []).some((candidate: HookSettings) => candidate.command === hook.command),
  ));
  return { ...plan, installed };
}

function readSettings(target: string): HookSettings {
  if (!fs.existsSync(target)) return { hooks: {} };
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function mergeHook(settings: HookSettings, hook: HookSettings): HookSettings {
  const next = { ...settings, hooks: { ...(settings.hooks || {}) } };
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

function removeHook(settings: HookSettings, command: string): HookSettings {
  if (!settings.hooks?.UserPromptSubmit) return settings;
  settings.hooks.UserPromptSubmit = removeOmeHooks(settings.hooks.UserPromptSubmit, command);
  return settings;
}

function removeOmeHooks(entries: HookEntry[], command: string): HookEntry[] {
  return entries
    .map((entry: HookEntry) => ({
      ...entry,
      hooks: (entry.hooks || []).filter((hook: HookSettings) => !isOmeHookCommand(hook.command, command)),
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
