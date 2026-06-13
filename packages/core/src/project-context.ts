import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectContextSchema, type ProjectContext } from "./schema.js";
import { hashText } from "./storage.js";

const PROJECT_MARKERS = [".git", ".oh-my-experience", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "AGENTS.md", "CLAUDE.md"];

export function detectProjectContext(cwd: string | null | undefined = process.cwd()): ProjectContext {
  if (!cwd) return ProjectContextSchema.parse({ source: "none" });
  const resolvedCwd = path.resolve(cwd);
  const root = findProjectRoot(resolvedCwd);
  if (!root) {
    return ProjectContextSchema.parse({ cwd: resolvedCwd, root: null, source: "none" });
  }
  const packageName = readPackageName(root);
  const remote = readGitRemote(root);
  const projectKey = normalizeProjectKey(remote) || packageName || path.basename(root);
  const modulePath = path.relative(root, resolvedCwd) || ".";
  return ProjectContextSchema.parse({
    cwd: resolvedCwd,
    root,
    projectKey,
    modulePath,
    packageName,
    source: remote ? "git" : packageName ? "package" : "path",
  });
}

export function sanitizeProjectContext(context: ProjectContext): Record<string, unknown> {
  return {
    hasProject: Boolean(context.projectKey),
    projectKeyHash: context.projectKey ? hashText(context.projectKey) : null,
    modulePathHash: context.modulePath ? hashText(context.modulePath) : null,
    source: context.source,
  };
}

export function projectFamilyKey(projectKey: string | null | undefined): string | null {
  if (!projectKey) return null;
  const parts = String(projectKey).split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0].includes(".")) return parts.slice(0, 2).join("/");
  if (parts.length >= 2) return parts.slice(0, -1).join("/");
  return projectKey;
}

function findProjectRoot(start: string): string | null {
  let current = fs.existsSync(start) && fs.statSync(start).isDirectory() ? start : path.dirname(start);
  while (true) {
    if (PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(current, marker)))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readPackageName(root: string): string | null {
  const packageJson = path.join(root, "package.json");
  if (!fs.existsSync(packageJson)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    return typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null;
  } catch {
    return null;
  }
}

function readGitRemote(root: string): string | null {
  if (!fs.existsSync(path.join(root, ".git"))) return null;
  try {
    const value = execFileSync("git", ["-C", root, "config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function normalizeProjectKey(remote: string | null): string | null {
  if (!remote) return null;
  const trimmed = remote.trim().replace(/\.git$/, "");
  const ssh = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  try {
    const url = new URL(trimmed);
    return `${url.host}${url.pathname}`.replace(/\/+$/, "").replace(/^(.+?)\/+/, "$1/");
  } catch {
    return trimmed || null;
  }
}
