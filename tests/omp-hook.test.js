import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveOmpHome, ompHookPlan, installOmpHook, uninstallOmpHook, ompHookStatus } from "../dist/packages/adapters/agents/omp/src/hook-install.js";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ome-omp-hook-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ompHome = path.join(root, "agent"), bin = path.join(root, "fake ome");
  const options = { ompHome, bin, dataDir: path.join(root, "library with spaces") };
  return { root, ompHome, bin, options };
}
function executable(file, source) { fs.writeFileSync(file, `#!/usr/bin/env node\n${source}\n`, { mode: 0o700 }); }
async function handler(f) {
  installOmpHook(f.options);
  // The installed extension deliberately uses JS syntax so this tests its exact
  // bytes on supported Node versions without requiring an OMP model/runtime.
  const source = fs.readFileSync(ompHookPlan(f.options).target, "utf8");
  const extension = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`);
  let callback;
  extension.default({ on: (event, fn) => { assert.equal(event, "before_agent_start"); callback = fn; } });
  return callback;
}
const ctx = (cwd, id) => ({ cwd, sessionManager: { getSessionId: () => id } });

test("OMP home resolves explicit, named/default profile and canonical/fallback environment without cross-profile writes", () => {
  const keys = ["PI_CONFIG_DIR", "PI_CODING_AGENT_DIR", "OMP_PROFILE", "PI_PROFILE"], before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    assert.equal(resolveOmpHome(), path.join(os.homedir(), ".omp", "agent"));
    process.env.PI_CONFIG_DIR = ".omp-custom"; process.env.PI_CODING_AGENT_DIR = "/tmp/custom-agent"; process.env.OMP_PROFILE = "work";
    assert.equal(resolveOmpHome(), path.join(os.homedir(), ".omp-custom", "profiles", "work", "agent"));
    assert.equal(resolveOmpHome("/tmp/explicit-agent"), "/tmp/explicit-agent");
    process.env.OMP_PROFILE = "default"; assert.equal(resolveOmpHome(), "/tmp/custom-agent");
    process.env.PI_PROFILE = "legacy"; process.env.OMP_PROFILE = ""; assert.equal(resolveOmpHome(), "/tmp/custom-agent");
    delete process.env.OMP_PROFILE; assert.equal(resolveOmpHome(), path.join(os.homedir(), ".omp-custom", "profiles", "legacy", "agent"));
    process.env.OMP_PROFILE = "default"; process.env.PI_CODING_AGENT_DIR = path.join(os.homedir(), ".omp-custom", "profiles", "legacy", "agent");
    assert.equal(resolveOmpHome(), path.join(os.homedir(), ".omp-custom", "agent"));
    for (const name of ["../other", "..", "bad/dir", "CON", "work."]) { process.env.OMP_PROFILE = name; assert.throws(() => resolveOmpHome(), /profile/i); }
  } finally { for (const k of keys) if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
});
test("installation previews, upgrades and uninstalls only its owned extension; other extensions/settings survive", t => {
  const f = fixture(t), plan = ompHookPlan(f.options); assert.equal(plan.provider, "omp"); assert.equal(plan.target, path.join(f.ompHome, "extensions", "ome-recall.ts"));
  installOmpHook({ ...f.options, dryRun: true }); assert.equal(fs.existsSync(f.ompHome), false);
  assert.equal(ompHookStatus(f.options).installed, false);
  installOmpHook(f.options); const original = fs.readFileSync(plan.target, "utf8");
  const other = path.join(f.ompHome, "extensions", "other.ts"), settings = path.join(f.ompHome, "settings.json");
  fs.writeFileSync(other, "other extension"); fs.writeFileSync(settings, "original settings");
  assert.equal(ompHookStatus(f.options).matchesExpectedCommand, true); assert.equal(ompHookStatus(f.options).installedBin, f.bin);
  installOmpHook(f.options); assert.equal(fs.readFileSync(plan.target, "utf8"), original);
  fs.writeFileSync(plan.target, original + "\n// previous-version drift\n"); assert.equal(ompHookStatus(f.options).matchesExpectedCommand, false);
  installOmpHook(f.options); assert.equal(fs.readFileSync(plan.target, "utf8"), original);
  assert.equal(ompHookStatus({ ...f.options, bin: "another-ome" }).matchesExpectedCommand, false);
  uninstallOmpHook(f.options); uninstallOmpHook(f.options); assert.equal(fs.existsSync(plan.target), false);
  assert.equal(fs.readFileSync(other, "utf8"), "other extension"); assert.equal(fs.readFileSync(settings, "utf8"), "original settings");
});
test("foreign same-name files, dangling links and linked extension directories are refused without modifying targets", t => {
  const f = fixture(t), target = ompHookPlan(f.options).target;
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "third-party extension");
  assert.equal(ompHookStatus(f.options).conflict, true);
  assert.throws(() => installOmpHook(f.options), /owned|ownership|managed/i); assert.throws(() => uninstallOmpHook(f.options), /owned|ownership|managed/i); assert.equal(fs.readFileSync(target, "utf8"), "third-party extension");
  fs.unlinkSync(target); fs.symlinkSync(path.join(f.root, "missing.ts"), target);
  assert.throws(() => installOmpHook(f.options), /symbolic|symlink/i); assert.throws(() => uninstallOmpHook(f.options), /symbolic|symlink/i);
  fs.unlinkSync(target); fs.rmdirSync(path.dirname(target)); const outside = path.join(f.root, "elsewhere"); fs.mkdirSync(outside); fs.symlinkSync(outside, path.dirname(target));
  assert.equal(ompHookStatus(f.options).conflict, true); assert.throws(() => installOmpHook(f.options), /symbolic|symlink/i); assert.deepEqual(fs.readdirSync(outside), []);
});
test("generated extension sends exact JSON stdin/argv and returns hidden recall message without replacing prompt/system", async t => {
  const f = fixture(t), capture = path.join(f.root, "capture.json");
  executable(f.bin, `let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{require('node:fs').writeFileSync(${JSON.stringify(capture)},JSON.stringify({argv:process.argv.slice(2),input:JSON.parse(raw),cwd:process.cwd()}));console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'Relevant 中文 experience'}}));});`);
  const run = await handler(f), event = { prompt: "my task 中文", systemPrompt: ["original"] }, context = ctx(f.root, "session-1");
  const result = await run(event, context), observed = JSON.parse(fs.readFileSync(capture, "utf8"));
  assert.deepEqual(observed.input, { provider: "omp", prompt: event.prompt, cwd: f.root, session_id: "session-1" });
  assert.deepEqual(observed.argv, ["hook", "run", "--json", "--data-dir", f.options.dataDir]); assert.equal(observed.cwd, fs.realpathSync(f.root));
  assert.equal(result.message.customType, "ome-recall"); assert.equal(result.message.display, false); assert.equal(result.message.content, "Relevant 中文 experience");
  assert.equal(result.systemPrompt, undefined); assert.equal(result.prompt, undefined); assert.deepEqual(event, { prompt: "my task 中文", systemPrompt: ["original"] });
});
test("empty matches inject nothing and concurrent invocations cannot leak contexts between sessions", async t => {
  const f = fixture(t);
  executable(f.bin, `let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{const p=JSON.parse(raw);setTimeout(()=>console.log(JSON.stringify(p.prompt==='empty'?{}:{hookSpecificOutput:{additionalContext:p.session_id+':'+p.prompt+':'+p.cwd}})),p.prompt==='slow'?60:10);});`);
  const run = await handler(f); assert.equal(await run({ prompt: "empty" }, ctx(f.root, "none")), undefined);
  const [a,b] = await Promise.all([run({ prompt: "slow" }, ctx(f.root, "a")), run({ prompt: "fast" }, ctx(os.tmpdir(), "b"))]);
  assert.equal(a.message.content, `a:slow:${f.root}`); assert.equal(b.message.content, `b:fast:${os.tmpdir()}`);
});
test("runtime errors surface to the OMP handler, including nonzero exit, malformed JSON and executable errors", async t => {
  const f = fixture(t);
  for (const body of ["process.exit(3)", "console.log('not JSON')", "console.log(JSON.stringify({hookSpecificOutput:{additionalContext:42}}))", "console.log(JSON.stringify({hookSpecificOutput:null}))", "process.stdout.write('x'.repeat(1100000))"]) {
    executable(f.bin, body); const run = await handler(f); await assert.rejects(run({ prompt: "task" }, ctx(f.root, "s")), /OME/);
  }
  fs.unlinkSync(f.bin); const run = await handler(f); await assert.rejects(run({ prompt: "task" }, ctx(f.root, "s")), /OME/);
});
test("runtime timeout is bounded, kills child and remains asynchronous", async t => {
  const f = fixture(t), pidFile = path.join(f.root, "pid");
  executable(f.bin, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`);
  const run = await handler(f), start = Date.now(); let timerRan = false; const timer = setTimeout(() => { timerRan = true; }, 10);
  try { await assert.rejects(run({ prompt: "timeout" }, ctx(f.root, "slow")), /OME.*timed out/i); } finally { clearTimeout(timer); }
  assert.equal(timerRan, true); assert.ok(Date.now()-start < 7000);
  await new Promise(resolve => setTimeout(resolve, 50)); const pid = Number(fs.readFileSync(pidFile, "utf8")); assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("a symlink above the agent directory cannot redirect installation into another profile", t => {
  const f = fixture(t), elsewhere = path.join(f.root, "other-profile"); fs.mkdirSync(path.join(elsewhere, "agent"), { recursive: true });
  const link = path.join(f.root, "profile-link"); fs.symlinkSync(elsewhere, link);
  const o = { ...f.options, ompHome: path.join(link, "agent") };
  assert.throws(() => installOmpHook(o), /symbolic|symlink/i); assert.equal(fs.existsSync(path.join(elsewhere, "agent", "extensions")), false);
});
