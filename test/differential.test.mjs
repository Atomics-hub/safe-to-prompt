// The claim is that a terminal check answers the wrong question. This proves it two ways: against a
// matrix of environments, and against a real pseudo-terminal in a real child process.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canPrompt, canAnimate, canUseColor, canOpenBrowser, describeEnvironment, whyNotPrompt, AGENT_VARIABLES, CI_VARIABLES, SANDBOX_VARIABLES} from '../src/index.js';

const TTY = {isTTY: true};
const PIPE = {isTTY: false};

// What every prompt library and every TTY-based interactivity check effectively does.
const terminalCheckSaysYes = (scenario) => Boolean(scenario.stdin?.isTTY && scenario.stdout?.isTTY);

test('a terminal check and this package disagree exactly where they should', () => {
  const cases = [
    {label: 'plain terminal', env: {TERM: 'xterm'}, stdin: TTY, stdout: TTY, terminal: true, ours: true},
    {label: 'piped', env: {}, stdin: PIPE, stdout: PIPE, terminal: false, ours: false},
    {label: 'agent WITH a terminal', env: {CLAUDECODE: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY, terminal: true, ours: false},
    {label: 'agent without a terminal', env: {CLAUDECODE: '1'}, stdin: PIPE, stdout: PIPE, terminal: false, ours: false},
    {label: 'CI WITH a terminal', env: {CI: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY, terminal: true, ours: false},
    {label: 'sandbox with a terminal', env: {CODESPACES: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY, terminal: true, ours: true},
  ];
  let disagreements = 0;
  for (const c of cases) {
    assert.equal(terminalCheckSaysYes(c), c.terminal, `${c.label}: terminal check`);
    assert.equal(canPrompt(c), c.ours, `${c.label}: canPrompt`);
    if (terminalCheckSaysYes(c) !== canPrompt(c)) disagreements++;
  }
  // The two disagreements are the agent and the CI run that provide a terminal. Those are the hangs.
  assert.equal(disagreements, 2, 'the disagreements are the cases a terminal check gets wrong');
});

test('this package never says yes where a terminal check says no', () => {
  // It is strictly more conservative, except when told otherwise explicitly. That matters: adopting
  // it can only remove hangs, never introduce one.
  const envs = [{}, {TERM: 'xterm'}, {CI: '1'}, {CLAUDECODE: '1'}, {CODESPACES: '1'}, {TERM: 'dumb'}];
  for (const env of envs) {
    for (const stdin of [TTY, PIPE]) {
      for (const stdout of [TTY, PIPE]) {
        const scenario = {env, stdin, stdout};
        if (!terminalCheckSaysYes(scenario)) {
          assert.equal(canPrompt(scenario), false,
            `${JSON.stringify(env)} stdin=${stdin.isTTY} stdout=${stdout.isTTY} should not be more permissive`);
        }
      }
    }
  }
});

test('every registry entry is reachable and maps to a stable identifier', () => {
  for (const [variable, id] of Object.entries(AGENT_VARIABLES)) {
    assert.match(id, /^[a-z0-9-]+$/, `${variable} -> ${id}`);
    assert.equal(describeEnvironment({env: {[variable]: '1'}, stdin: TTY, stdout: TTY}).agent.id, id);
  }
  for (const [variable, id] of Object.entries(SANDBOX_VARIABLES)) {
    assert.match(id, /^[a-z0-9-]+$/, `${variable} -> ${id}`);
    assert.equal(describeEnvironment({env: {[variable]: '1'}}).sandbox.id, id);
  }
  for (const variable of CI_VARIABLES) {
    assert.match(variable, /^[A-Z][A-Z0-9_]*$/, variable);
  }
  // No variable is claimed by two registries, which would make the answer depend on check order.
  const agentNames = new Set(Object.keys(AGENT_VARIABLES));
  const sandboxNames = new Set(Object.keys(SANDBOX_VARIABLES));
  for (const name of agentNames) assert.ok(!sandboxNames.has(name), `${name} is in two registries`);
  for (const name of CI_VARIABLES) assert.ok(!agentNames.has(name), `${name} is in two registries`);
});

test('the answer never depends on the order of unrelated variables', () => {
  const base = {TERM: 'xterm', PATH: '/usr/bin', HOME: '/home/x', LANG: 'en_US.UTF-8'};
  const forward = {...base, CLAUDECODE: '1'};
  const reverse = Object.fromEntries(Object.entries(forward).reverse());
  assert.equal(canPrompt({env: forward, stdin: TTY, stdout: TTY}), canPrompt({env: reverse, stdin: TTY, stdout: TTY}));
  assert.equal(whyNotPrompt({env: forward, stdin: TTY, stdout: TTY}).reason,
    whyNotPrompt({env: reverse, stdin: TTY, stdout: TTY}).reason);
});

test('nothing throws on hostile input', () => {
  const hostile = [
    {}, {env: {}}, {env: {}, stdin: null, stdout: null},
    {env: {CI: undefined}}, {env: {CLAUDECODE: null}},
    {env: Object.create(null), stdin: {}, stdout: {}},
    {env: {TERM: 123}, stdin: TTY, stdout: TTY},
  ];
  for (const input of hostile) {
    assert.doesNotThrow(() => canPrompt(input), JSON.stringify(input));
    assert.doesNotThrow(() => describeEnvironment(input), JSON.stringify(input));
    assert.doesNotThrow(() => canAnimate(input));
    assert.doesNotThrow(() => canUseColor(input));
    assert.doesNotThrow(() => canOpenBrowser(input));
  }
});

// The proof, in a real process with a real pseudo-terminal. Skipped where a PTY cannot be allocated,
// which is Windows and any host without python3, because the point is the behaviour and not the
// mechanism for obtaining a terminal.
const canAllocatePty = () => {
  if (process.platform === 'win32') return false;
  try { execFileSync('python3', ['-c', 'import pty'], {stdio: 'ignore'}); return true; } catch { return false; }
};

test('with a real pseudo-terminal attached, a terminal check says yes and this says no', {skip: !canAllocatePty()}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'can-prompt-pty-'));
  const probe = join(dir, 'probe.mjs');
  const moduleUrl = new URL('../src/index.js', import.meta.url).href;
  writeFileSync(probe, `
    import {canPrompt, whyNotPrompt} from ${JSON.stringify(moduleUrl)};
    const terminalCheckSaysYes = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    console.log(JSON.stringify({terminalCheckSaysYes, canPrompt: canPrompt(), why: whyNotPrompt()?.reason ?? null}));
  `);
  const run = (env) => {
    const raw = execFileSync('python3', ['-c', `import pty,sys; pty.spawn([${JSON.stringify(process.execPath)}, ${JSON.stringify(probe)}])`],
      {encoding: 'utf8', env: {...process.env, ...env}});
    const line = raw.replace(/\r/g, '').split('\n').find((l) => l.trim().startsWith('{'));
    return JSON.parse(line);
  };

  // Under an agent, with a genuine terminal on both streams.
  const underAgent = run({CLAUDECODE: '1', FORCE_PROMPT: '', NO_PROMPT: '', CI: ''});
  assert.equal(underAgent.terminalCheckSaysYes, true, 'the pseudo-terminal really is attached');
  assert.equal(underAgent.canPrompt, false, 'and prompting is still refused');
  assert.equal(underAgent.why, 'agent');

  // The same terminal without the agent marker allows a prompt, which shows the terminal was real
  // and that the refusal above came from the agent rather than from the harness.
  const clean = {...process.env};
  for (const key of Object.keys(AGENT_VARIABLES)) delete clean[key];
  for (const key of CI_VARIABLES) delete clean[key];
  const withoutAgent = execFileSync('python3',
    ['-c', `import pty,sys; pty.spawn([${JSON.stringify(process.execPath)}, ${JSON.stringify(probe)}])`],
    {encoding: 'utf8', env: {...clean, TERM: 'xterm-256color'}});
  const parsed = JSON.parse(withoutAgent.replace(/\r/g, '').split('\n').find((l) => l.trim().startsWith('{')));
  assert.equal(parsed.terminalCheckSaysYes, true);
  assert.equal(parsed.canPrompt, true, 'the same terminal without an agent does allow a prompt');
});
