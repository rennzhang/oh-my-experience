import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

type OmpHookOptions = { ompHome?: string; bin?: string; dataDir?: string | null; dryRun?: boolean };
const OWNERSHIP = "// Managed by oh-my-experience: OMP recall extension";
const CONFIG_PREFIX = "// OME configuration: ";

// Mirrors @oh-my-pi/pi-utils dirs.ts: named profiles ignore the default-agent
// override; OMP_PROFILE (even empty) takes precedence over the PI_PROFILE alias.
export function resolveOmpHome(ompHome?: string): string {
  if (ompHome !== undefined) {
    if (!ompHome.trim() || ompHome.includes("\0")) throw new Error("OMP agent home must be a nonempty directory path");
    return path.resolve(ompHome);
  }
  const named = normalizeProfile(process.env.OMP_PROFILE !== undefined ? process.env.OMP_PROFILE : process.env.PI_PROFILE);
  const config = path.join(os.homedir(), process.env.PI_CONFIG_DIR || ".omp");
  if (named) return path.join(config, "profiles", named, "agent");
  let legacyProfile: string | undefined;
  try { legacyProfile = normalizeProfile(process.env.PI_PROFILE); } catch { /* The canonical explicit default ignores an invalid legacy alias. */ }
  const override = process.env.PI_CODING_AGENT_DIR;
  const inheritedProfileDir = legacyProfile && override === path.join(config, "profiles", legacyProfile, "agent");
  return override && !inheritedProfileDir ? path.resolve(override) : path.join(config, "agent");
}
function normalizeProfile(profile?: string): string | undefined {
  const named = profile?.trim();
  if (!named || named === "default") return undefined;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(named) || named === "." || named === ".." || named.endsWith(".") || /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i.test(named)) {
    throw new Error("Invalid OMP profile; use its valid named profile or an explicit OMP agent home");
  }
  return named;
}

export function ompHookPlan({ ompHome, bin = "ome", dataDir = null }: OmpHookOptions = {}) {
  if (!bin.trim() || bin.includes("\0") || dataDir !== null && (!dataDir.trim() || dataDir.includes("\0"))) throw new Error("OME executable/data directory must be nonempty paths");
  const root = resolveOmpHome(ompHome);
  return { ok: true, provider: "omp", installTarget: "global", root, target: path.join(root, "extensions", "ome-recall.ts"),
    hook: { type: "extension", event: "before_agent_start", command: bin, args: ["hook", "run", "--json", ...(dataDir ? ["--data-dir", dataDir] : [])], timeout: 5 } };
}

type Plan = ReturnType<typeof ompHookPlan>;
function entry(file: string) { try { return fs.lstatSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
function readExtension(plan: Plan) {
  const directories = [path.dirname(plan.target)];
  // HOME and the OS-provided temp root are trusted anchors; macOS exposes
  // /var via a system symlink. Still inspect every user-controlled descendant.
  const anchors = new Set([path.resolve(os.homedir()), path.resolve(os.tmpdir())]);
  for (let directory = plan.root; ; directory = path.dirname(directory)) {
    directories.push(directory);
    if (anchors.has(directory) || directory === path.dirname(directory)) break;
  }
  for (const directory of directories) {
    const stat = entry(directory);
    if (stat?.isSymbolicLink()) throw new Error("OMP hook refuses a symbolic-link agent/extensions directory");
    if (stat && !stat.isDirectory()) throw new Error("OMP agent/extensions path must be a directory");
  }
  const stat = entry(plan.target);
  if (!stat) return null;
  if (stat.isSymbolicLink()) throw new Error("OMP hook refuses a symbolic-link extension");
  if (!stat.isFile()) throw new Error("OMP hook target is not a regular file");
  const fd = fs.openSync(plan.target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const actual = fs.fstatSync(fd);
    if (actual.ino !== stat.ino || actual.dev !== stat.dev) throw new Error("OMP hook changed while reading; retry status before installation");
    return fs.readFileSync(fd, "utf8");
  } finally { fs.closeSync(fd); }
}
function owned(source: string) { return source.startsWith(`${OWNERSHIP}\n`); }
function protect(source: string | null) {
  if (source !== null && !owned(source)) throw new Error("OMP extension already exists without OME ownership; it will not be replaced or removed");
}
function withInstallLock<T>(plan: Plan, run: () => T): T {
  fs.mkdirSync(path.dirname(plan.target), { recursive: true, mode: 0o700 });
  // Only installers share this lock. The OMP extension itself never writes here.
  readExtension(plan);
  const lock = path.join(path.dirname(plan.target), ".ome-recall.install.lock");
  let fd: number;
  try { fd = fs.openSync(lock, "wx", 0o600); }
  catch { throw new Error("OMP hook install/uninstall is locked; preserve the existing file and inspect the active operation"); }
  const identity = fs.fstatSync(fd);
  try { return run(); }
  finally {
    fs.closeSync(fd);
    const current = entry(lock);
    if (current?.ino === identity.ino && current.dev === identity.dev) fs.unlinkSync(lock);
  }
}
function writeExtension(plan: Plan, source: string) {
  const current = readExtension(plan); protect(current);
  if (current === source) return;
  // Exclusive creation prevents clobbering a newly appeared foreign extension.
  if (current === null) { fs.writeFileSync(plan.target, source, { flag: "wx", mode: 0o600 }); return; }
  const temporary = path.join(path.dirname(plan.target), `.ome-recall.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, source, { flag: "wx", mode: 0o600 });
    if (readExtension(plan) !== current) throw new Error("OMP extension changed during installation; refusing overwrite");
    fs.renameSync(temporary, plan.target);
  } finally { if (entry(temporary)) fs.unlinkSync(temporary); }
}

export function installOmpHook(options: OmpHookOptions = {}) {
  const plan = ompHookPlan(options);
  if (options.dryRun) return { ...plan, dryRun: true };
  protect(readExtension(plan));
  withInstallLock(plan, () => writeExtension(plan, extensionSource(plan)));
  return { ...plan, installed: true };
}
export function uninstallOmpHook(options: OmpHookOptions = {}) {
  const plan = ompHookPlan(options);
  if (options.dryRun) return { ...plan, dryRun: true };
  const source = readExtension(plan); protect(source);
  if (source !== null) withInstallLock(plan, () => { const current = readExtension(plan); protect(current); if (current !== null) fs.unlinkSync(plan.target); });
  return { ...plan, uninstalled: true };
}
export function ompHookStatus(options: OmpHookOptions = {}) {
  const plan = ompHookPlan(options);
  let source: string | null;
  try { source = readExtension(plan); }
  catch (error) { return { ...plan, ok: false, installed: false, owned: false, conflict: true, reason: (error as Error).message, installedCommand: null, installedBin: null, matchesExpectedCommand: false }; }
  if (source !== null && !owned(source)) return { ...plan, ok: false, installed: false, owned: false, conflict: true, reason: "Existing extension has no OME ownership marker", installedCommand: null, installedBin: null, matchesExpectedCommand: false };
  let installedCommand: string | null = null;
  if (source) {
    const config = source.split("\n")[1];
    if (config?.startsWith(CONFIG_PREFIX)) { try { const parsed = JSON.parse(config.slice(CONFIG_PREFIX.length)); if (typeof parsed.bin === "string") installedCommand = parsed.bin; } catch { /* Owned older/edited source is reported as outdated below. */ } }
  }
  return { ...plan, installed: source !== null, owned: source !== null, conflict: false, installedCommand, installedBin: installedCommand, matchesExpectedCommand: source === extensionSource(plan) };
}

// Deliberately JS-compatible TypeScript: OMP loads .ts extensions directly, while
// independent tests execute these exact source bytes without an OMP dependency.
function extensionSource(plan: Plan): string {
  return `${OWNERSHIP}
${CONFIG_PREFIX}${JSON.stringify({ bin: plan.hook.command, args: plan.hook.args })}
import { spawn } from "node:child_process";
const executable = ${JSON.stringify(plan.hook.command)};
const args = ${JSON.stringify(plan.hook.args)};
const timeoutMs = 5000;
const maxOutputBytes = 1024 * 1024;

function recall(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: payload.cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let settled = false, bytes = 0;
    const output = [];
    const timer = setTimeout(() => fail("timed out"), timeoutMs);
    function fail(reason) {
      if (settled) return;
      settled = true; clearTimeout(timer); child.kill("SIGKILL");
      reject(new Error("OME recall " + reason));
    }
    child.on("error", () => fail("could not start its executable"));
    child.stdin.on("error", () => fail("could not send its request"));
    child.stdout.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) { fail("exceeded its output limit"); return; }
      output.push(chunk);
    });
    child.stderr.on("data", chunk => { bytes += chunk.length; if (bytes > maxOutputBytes) fail("exceeded its output limit"); });
    child.on("close", code => {
      if (settled) return;
      if (code !== 0) { fail("exited unsuccessfully"); return; }
      let result;
      try {
        result = JSON.parse(Buffer.concat(output).toString("utf8"));
        if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("shape");
        const hook = result.hookSpecificOutput;
        if (hook !== undefined && (!hook || typeof hook !== "object" || Array.isArray(hook) || typeof hook.additionalContext !== "string")) throw new Error("context");
        const context = hook?.additionalContext;
        settled = true; clearTimeout(timer); resolve(context?.trim() ? context : undefined);
      } catch { fail("returned invalid JSON context"); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export default function omeRecall(pi) {
  pi.on("before_agent_start", async (event, ctx) => {
    const context = await recall({ provider: "omp", prompt: event.prompt, cwd: ctx.cwd, session_id: ctx.sessionManager.getSessionId() });
    if (context === undefined) return;
    return { message: { customType: "ome-recall", content: context, display: false } };
  });
}
`;
}
