// Behavioural checks shared by the unit tests and by the test that installs the packed artifact into
// a fresh consumer, so the published build is held to exactly the behaviour of the source.
//
// Every scenario is expressed as an explicit environment and pair of streams, so none of it depends
// on where the tests happen to run. That matters more here than usual: this package is about
// detecting the ambient environment, and a test that reads the real one proves nothing.
import assert from 'node:assert/strict';

const TTY = {isTTY: true};
const PIPE = {isTTY: false};

/** A terminal is attached and nothing suggests automation. */
export const interactive = () => ({env: {TERM: 'xterm-256color'}, stdin: TTY, stdout: TTY});

export async function runChecks(api) {
  const {
    canPrompt, whyNotPrompt, canAnimate, canUseColor, canOpenBrowser,
    detectAgent, detectCI, detectSandbox, describeEnvironment, promptOr,
    AGENT_VARIABLES, CI_VARIABLES, SANDBOX_VARIABLES, PromptContextError,
  } = api;
  let count = 0;
  const check = (fn) => { fn(); count += 1; };
  const checkAsync = async (fn) => { await fn(); count += 1; };

  // The case the package exists for: a terminal is attached AND an agent is running the process.
  // A TTY check says yes. There is no human, and the prompt would wait until the agent gives up.
  check(() => {
    const scenario = {env: {TERM: 'xterm-256color', CLAUDECODE: '1'}, stdin: TTY, stdout: TTY};
    assert.equal(scenario.stdin.isTTY, true, 'the terminal really is attached');
    assert.equal(canPrompt(scenario), false, 'and prompting is still unsafe');
    const why = whyNotPrompt(scenario);
    assert.equal(why.reason, 'agent');
    assert.match(why.detail, /claude-code/);
  });

  // Every agent variable produces the same refusal, with a terminal attached throughout.
  check(() => {
    for (const [variable, id] of Object.entries(AGENT_VARIABLES)) {
      const scenario = {env: {TERM: 'xterm', [variable]: '1'}, stdin: TTY, stdout: TTY};
      assert.equal(canPrompt(scenario), false, `${variable} should block prompting`);
      assert.equal(detectAgent(scenario).id, id, variable);
      assert.equal(whyNotPrompt(scenario).reason, 'agent', variable);
    }
  });

  // A plain terminal with nothing else set is the one case that allows a prompt.
  check(() => {
    assert.equal(canPrompt(interactive()), true);
    assert.equal(whyNotPrompt(interactive()), null);
    assert.equal(describeEnvironment(interactive()).reason, 'interactive');
  });

  // No terminal means no keystroke to read, whatever else is true.
  check(() => {
    assert.equal(canPrompt({env: {}, stdin: PIPE, stdout: TTY}), false);
    assert.equal(whyNotPrompt({env: {}, stdin: PIPE, stdout: TTY}).reason, 'no-tty');
    // A question nobody can see is no better than one nobody can answer.
    assert.equal(canPrompt({env: {}, stdin: TTY, stdout: PIPE}), false);
    assert.equal(whyNotPrompt({env: {}, stdin: TTY, stdout: PIPE}).reason, 'no-tty');
  });

  // CI blocks prompting even with a terminal, which some runners do provide.
  check(() => {
    for (const variable of CI_VARIABLES) {
      const scenario = {env: {TERM: 'xterm', [variable]: '1'}, stdin: TTY, stdout: TTY};
      assert.equal(canPrompt(scenario), false, `${variable} should block prompting`);
      assert.equal(detectCI(scenario).variable, variable);
    }
  });

  // A sandbox is NOT a reason to refuse a prompt: a person in a cloud development environment is
  // sitting at a real terminal. This is the distinction the package draws deliberately.
  check(() => {
    for (const [variable, id] of Object.entries(SANDBOX_VARIABLES)) {
      const scenario = {env: {TERM: 'xterm', [variable]: '1'}, stdin: TTY, stdout: TTY};
      assert.equal(canPrompt(scenario), true, `${variable} should still allow a prompt`);
      assert.equal(detectSandbox(scenario).id, id, variable);
      assert.equal(canOpenBrowser(scenario), false, `${variable} should block opening a browser`);
    }
  });

  // An explicit instruction outranks every inference, in both directions.
  check(() => {
    for (const off of ['NO_PROMPT', 'NONINTERACTIVE', 'NON_INTERACTIVE']) {
      const scenario = {env: {TERM: 'xterm', [off]: '1'}, stdin: TTY, stdout: TTY};
      assert.equal(canPrompt(scenario), false, off);
      assert.equal(whyNotPrompt(scenario).reason, 'explicitly-disabled', off);
    }
    for (const on of ['FORCE_PROMPT', 'FORCE_INTERACTIVE']) {
      // Even under an agent with no terminal at all, an explicit instruction is obeyed.
      const scenario = {env: {CLAUDECODE: '1', [on]: '1'}, stdin: PIPE, stdout: PIPE};
      assert.equal(canPrompt(scenario), true, on);
    }
    // Off beats on, because refusing to prompt is the safe direction to be wrong in.
    const both = {env: {NO_PROMPT: '1', FORCE_PROMPT: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY};
    assert.equal(canPrompt(both), false, 'the safe direction wins a conflict');
  });

  // Values that look set but mean "off".
  check(() => {
    for (const value of ['', '0', 'false', 'FALSE']) {
      const scenario = {env: {TERM: 'xterm', CI: value}, stdin: TTY, stdout: TTY};
      assert.equal(canPrompt(scenario), true, `CI=${JSON.stringify(value)} should not block`);
      assert.equal(detectCI(scenario), null, `CI=${JSON.stringify(value)}`);
    }
  });

  // Animation is refused wherever the output is a transcript rather than a screen.
  check(() => {
    assert.equal(canAnimate(interactive()), true);
    assert.equal(canAnimate({env: {CLAUDECODE: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY}), false);
    assert.equal(canAnimate({env: {CI: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY}), false);
    assert.equal(canAnimate({env: {TERM: 'dumb'}, stdin: TTY, stdout: TTY}), false);
    assert.equal(canAnimate({env: {}, stdin: TTY, stdout: PIPE}), false);
    assert.equal(canAnimate({env: {NO_ANIMATION: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY}), false);
  });

  // Colour follows the published conventions rather than this package's own opinion.
  check(() => {
    assert.equal(canUseColor(interactive()), true);
    assert.equal(canUseColor({env: {NO_COLOR: '1', TERM: 'xterm'}, stdout: TTY}), false);
    assert.equal(canUseColor({env: {FORCE_COLOR: '1'}, stdout: PIPE}), true, 'FORCE_COLOR wins over a pipe');
    assert.equal(canUseColor({env: {FORCE_COLOR: '0'}, stdout: TTY}), false, 'FORCE_COLOR=0 turns it off');
    assert.equal(canUseColor({env: {TERM: 'dumb'}, stdout: TTY}), false);
    assert.equal(canUseColor({env: {}, stdout: PIPE}), false);
  });

  // Opening a browser needs a desktop, which an agent, CI, a sandbox and a remote shell all lack.
  check(() => {
    assert.equal(canOpenBrowser({env: {DISPLAY: ':0'}, stdout: TTY}), true);
    assert.equal(canOpenBrowser({env: {DISPLAY: ':0', CLAUDECODE: '1'}, stdout: TTY}), false);
    assert.equal(canOpenBrowser({env: {DISPLAY: ':0', CI: '1'}, stdout: TTY}), false);
    assert.equal(canOpenBrowser({env: {DISPLAY: ':0', SSH_CONNECTION: 'x'}, stdout: TTY}), false);
    assert.equal(canOpenBrowser({env: {DISPLAY: ':0', NO_BROWSER: '1'}, stdout: TTY}), false);
  });

  // promptOr runs the question only when someone can answer it.
  await checkAsync(async () => {
    const asking = () => 'asked';
    assert.equal(await promptOr(asking, 'fallback', interactive()), 'asked');
    const agent = {env: {CLAUDECODE: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY};
    assert.equal(await promptOr(asking, 'fallback', agent), 'fallback');
    // A function fallback is handed the reason, so a caller can log it or vary the default.
    const viaFunction = await promptOr(asking, (why) => `fell back: ${why.reason}`, agent);
    assert.equal(viaFunction, 'fell back: agent');
  });

  // A missing fallback is refused rather than guessed at.
  await checkAsync(async () => {
    await assert.rejects(() => promptOr(() => 'x'), PromptContextError);
    await assert.rejects(() => promptOr('not a function', 'f'), PromptContextError);
  });

  // The description reports every input the decisions were made from.
  check(() => {
    const described = describeEnvironment({env: {CLAUDECODE: '1', TERM: 'xterm'}, stdin: TTY, stdout: TTY});
    assert.equal(described.canPrompt, false);
    assert.equal(described.agent.id, 'claude-code');
    assert.equal(described.stdinIsTTY, true, 'the terminal is reported even though it was overruled');
    assert.equal(described.ci, null);
    assert.equal(described.sandbox, null);
    for (const field of ['canAnimate', 'canUseColor', 'canOpenBrowser']) {
      assert.equal(typeof described[field], 'boolean', field);
    }
  });

  return count;
}
