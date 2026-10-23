import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig } from "../../core/src/index.js";
import { packageInfo, packageRoot } from "./package-info.js";
import { hookPlan as codexHookPlan, hookStatus as codexHookStatus, installHook as installCodexHook, uninstallHook as uninstallCodexHook } from "../../adapters/agents/codex/src/hook-install.js";
import { claudeHookPlan, claudeHookStatus, installClaudeHook, uninstallClaudeHook } from "../../adapters/agents/claude/src/hook-install.js";
import { cursorHookPlan, cursorHookStatus, installCursorHook, uninstallCursorHook } from "../../adapters/agents/cursor/src/hook-install.js";
import { ompHookPlan, ompHookStatus, installOmpHook, uninstallOmpHook, resolveOmpHome } from "../../adapters/agents/omp/src/hook-install.js";
type ParsedArgs = { flags: Record<string, any>; positionals: string[] };
export const HOOK_PROVIDERS = ["codex", "claude", "cursor", "omp"] as const;
export type HookProvider = typeof HOOK_PROVIDERS[number];

export function planInitHooks(dataDir: string, args: ParsedArgs, dryRun: boolean) {
  if (args.flags["no-hook"]) return { ok: true, skipped: true, reason: "--no-hook" };
  return selectedProviders(args).map((provider) => {
    return hookAdapter(provider).plan({ ...hookInstallOptions(dataDir, args), dryRun } as any);
  });
}

export function installInitHooks(dataDir: string, args: ParsedArgs) {
  if (args.flags["no-hook"]) return { ok: true, skipped: true, reason: "--no-hook" };
  return selectedProviders(args).map((provider) => {
    const result: any = hookAdapter(provider).install(hookInstallOptions(dataDir, args) as any);
    if (result.installed) recordHookConfig(dataDir, provider, true);
    return result;
  });
}

export function selectedProviders(args: ParsedArgs): string[] {
  const raw = String(args.flags.provider || args.flags.providers || "codex");
  const values = raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!values.length || values.some((item) => ["none", "skip", "no", "off"].includes(item))) return [];
  if (values.some((item) => ["all", "both"].includes(item))) return [...HOOK_PROVIDERS];
  const mapped = values.map((item) => item === "cloud" ? "claude" : item);
  const unknown = mapped.filter((item) => !(HOOK_PROVIDERS as readonly string[]).includes(item));
  if (unknown.length) {
    throw new Error(`unsupported hook provider: ${unknown.join(", ")}; use ${HOOK_PROVIDERS.join(", ")}, or all`);
  }
  return Array.from(new Set(mapped));
}

export function hookInstallOptions(dataDir: string, args: ParsedArgs) {
  return {
    dryRun: Boolean(args.flags["dry-run"]),
    codexHome: codexHome(args),
    claudeHome: args.flags["claude-home"] ? path.resolve(args.flags["claude-home"]) : undefined,
    cursorHome: args.flags["cursor-home"] ? path.resolve(args.flags["cursor-home"]) : undefined,
    ompHome: ompHome(args),
    bin: args.flags.bin || "ome",
    dataDir,
  };
}

export function hookAdapter(provider: string) {
  if (provider === "omp") return { plan: ompHookPlan, install: installOmpHook, uninstall: uninstallOmpHook, status: ompHookStatus };
  if (provider === "claude") {
    return { plan: claudeHookPlan, install: installClaudeHook, uninstall: uninstallClaudeHook, status: claudeHookStatus };
  }
  if (provider === "cursor") {
    return { plan: cursorHookPlan, install: installCursorHook, uninstall: uninstallCursorHook, status: cursorHookStatus };
  }
  if (provider === "codex") {
    return { plan: codexHookPlan, install: installCodexHook, uninstall: uninstallCodexHook, status: codexHookStatus };
  }
  throw new Error(`unsupported hook provider: ${provider}; use one of ${HOOK_PROVIDERS.join(", ")}`);
}

const OME_SKILL_NAME = "oh-my-experience";
export const OME_SKILL_MARKER = ".ome-skill.json";

type SkillOptions = {
  provider?: string;
  codexHome?: string;
  claudeHome?: string;
  cursorHome?: string;
  ompHome?: string;
  dryRun?: boolean;
  force?: boolean;
};

export function planInitSkills(args: ParsedArgs, dryRun: boolean) {
  if (args.flags["no-hook"]) return [];
  return selectedProviders(args).map((provider) => planSkill({
    provider,
    codexHome: codexHome(args),
    claudeHome: claudeHome(args),
    cursorHome: cursorHome(args),
    ompHome: ompHome(args),
    dryRun,
  }));
}

export function planSkill(options: SkillOptions = {}) {
  const provider = (HOOK_PROVIDERS as readonly string[]).includes(String(options.provider)) ? String(options.provider) : "codex";
  const root = skillRoot(provider, options);
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

export function installInitSkills(args: ParsedArgs) {
  if (args.flags["no-hook"]) return [];
  return selectedProviders(args).map((provider) => installSkill({
    provider,
    codexHome: codexHome(args),
    claudeHome: claudeHome(args),
    cursorHome: cursorHome(args),
    ompHome: ompHome(args),
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

export function uninstallSkill(options: SkillOptions = {}) {
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

export function codexHome(args: ParsedArgs) {
  return args.flags["codex-home"] ? path.resolve(args.flags["codex-home"]) : process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function claudeHome(args: ParsedArgs) {
  return args.flags["claude-home"] ? path.resolve(args.flags["claude-home"]) : path.join(os.homedir(), ".claude");
}

export function cursorHome(args: ParsedArgs) {
  return args.flags["cursor-home"] ? path.resolve(args.flags["cursor-home"]) : process.env.CURSOR_HOME || path.join(os.homedir(), ".cursor");
}

export function ompHome(args: ParsedArgs) {
  return args.flags["omp-home"] === undefined ? undefined : resolveOmpHome(args.flags["omp-home"]);
}

function skillRoot(provider: string, options: SkillOptions = {}) {
  if (provider === "omp") return resolveOmpHome(options.ompHome);
  if (provider === "claude") return options.claudeHome || path.join(os.homedir(), ".claude");
  if (provider === "cursor") return options.cursorHome || cursorHome({ flags: {}, positionals: [] });
  return options.codexHome || codexHome({ flags: {}, positionals: [] });
}


export function recordHookConfig(dataDir: string, provider: string, enabled: boolean): void {
  const config = loadConfig(dataDir);
  const next = structuredClone(config);
  if (!(HOOK_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`unsupported hook provider: ${provider}; use ${HOOK_PROVIDERS.join(", ")}, or all`);
  }
  const providerKey = provider as HookProvider;
  next.hooks.providers[providerKey] = { enabled };
  saveConfig(dataDir, next);
}


export function providerName(value: unknown): string {
  const provider = String(value || "hook").toLowerCase();
  if (provider === "codex") return "Codex";
  if (provider === "claude") return "Claude";
  if (provider === "cursor") return "Cursor";
  if (provider === "omp") return "OMP";
  return String(value || "hook");
}
