# can-prompt

Can this process block on human input? Zero dependencies.

**Your CLI just hung an AI agent for five minutes.** A coding agent ran your command, your prompt
library checked for a terminal, found one, and asked a question. Nobody was there to answer it.

```js
// inside a coding agent, with a pseudo-terminal attached — measured, not imagined
process.stdin.isTTY   // true
isInteractive()       // true   ← "safe to prompt"
canPrompt()           // false  ← nobody is there
```

```js
import {canPrompt, promptOr} from 'can-prompt';

// Ask only when someone can answer.
const branch = await promptOr(
  () => prompts({type: 'text', name: 'branch', message: 'Branch name?'}),
  {branch: 'main'},
);
```

## Why a terminal check is the wrong test

Agents run commands through a pseudo-terminal so that interactive tools work. That makes
`process.stdin.isTTY` true. Every prompt library treats that as permission to ask a question, and
the question goes into a transcript that nobody is reading. The agent waits until it times out.

Verified by running a prompt inside a real agent session with a real pseudo-terminal: `prompts`
(46M downloads a week) renders the question and blocks, with and without a terminal attached. It
never checks.

The three things a CLI needs to know are genuinely different questions, and this answers all three:

| question | the honest answer depends on |
| --- | --- |
| can I ask a question? | a terminal, **and** no agent, **and** no CI |
| can I draw a spinner? | a terminal on stdout, and no agent recording every repaint |
| can I open a browser? | a desktop, so also not a sandbox and not an SSH session |

## Checks are ordered by authority

1. **An explicit instruction wins.** `NO_PROMPT` and `FORCE_PROMPT` outrank everything below, in
   both directions. When they conflict, prompting is refused, because that is the safe way to be
   wrong.
2. **An agent or a CI system means nobody is waiting**, whatever the terminal says.
3. **Only then does the terminal get a vote.**

Every answer carries the reason it was reached, so a `--doctor` command or a log line can explain
itself:

```js
whyNotPrompt();
// {
//   reason: 'agent',
//   detail: 'running under claude-code (CLAUDECODE is set); a terminal check would say yes here
//            and the prompt would wait until the agent times out'
// }
```

## Sandboxes can prompt. That is deliberate.

A person in a cloud development environment is sitting at a real terminal and can answer a question.
Treating a sandbox as non-interactive breaks them for no reason. A sandbox *does* block opening a
browser, because there is no desktop to open one on, and that is a different question with a
different answer.

```js
const codespace = {env: {CODESPACES: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}};
canPrompt(codespace);        // true  — a human is right there
canOpenBrowser(codespace);   // false — but there is no desktop
```

## API

### `canPrompt(options?)` → `boolean`

Whether this process can block on human input.

### `whyNotPrompt(options?)` → `{reason, detail} | null`

Why a prompt would be unsafe, or `null` when it is safe. `reason` is one of `agent`, `ci`,
`no-tty`, `dumb-terminal`, `explicitly-disabled`.

### `promptOr(ask, fallback, options?)` → `Promise`

Runs `ask()` when prompting is safe, otherwise returns `fallback`. The fallback is **required**, not
defaulted: an unattended run needs a deliberate answer, and silence is not one. Pass a function to
receive the reason.

### `canAnimate(options?)`, `canUseColor(options?)`, `canOpenBrowser(options?)`

The other three decisions. Colour follows the [`NO_COLOR`](https://no-color.org) convention and
`FORCE_COLOR`.

### `detectAgent()`, `detectCI()`, `detectSandbox()`

The raw detections, each returning `{variable, id}` or `null`, if you want to branch on them
yourself.

### `describeEnvironment(options?)`

Everything the decisions were made from, for a `--doctor` command.

### Testing your own code

Every function takes `{env, stdin, stdout}`, so a scenario can be written out in full rather than
simulated:

```js
canPrompt({env: {CLAUDECODE: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}});   // false
```

That is how this package's own tests work, because a test that reads the ambient environment proves
nothing about a package whose job is reading the ambient environment.

## Environment variables

| variable | effect |
| --- | --- |
| `NO_PROMPT`, `NONINTERACTIVE`, `NON_INTERACTIVE` | never prompt |
| `FORCE_PROMPT`, `FORCE_INTERACTIVE` | prompt anyway |
| `NO_COLOR` / `FORCE_COLOR` | colour off / on |
| `NO_ANIMATION` | no spinners |
| `NO_BROWSER` | never open a browser |

`AGENT_VARIABLES`, `CI_VARIABLES` and `SANDBOX_VARIABLES` are exported, so you can see exactly what
is detected and work around a gap without waiting for a release.

## Honest limits

- **Detection is a list of environment variables, and lists go stale.** A new agent that sets
  nothing recognisable is indistinguishable from a person. That is why the registries are exported
  and why `NO_PROMPT` exists.
- **It cannot tell you a human is paying attention**, only that nothing indicates otherwise. Someone
  can start a command and walk away.
- **It does not prompt.** Use `prompts`, `@inquirer/prompts`, `@clack/prompts` or whatever you
  already have. This decides whether to call them.
- The agent and sandbox registries overlap with
  [`agent-cli-detector`](https://github.com/expo/agent-cli-detector),
  [`@vercel/detect-agent`](https://github.com/vercel/vercel) and
  [`sandbox-cli-detector`](https://github.com/davidmokos/sandbox-cli-detector), which got here first
  and are worth using if detection is all you need. This package exists for the decision on top of
  it, and for the distinction those three do not draw between prompting and opening a browser.

## Install

```sh
npm install can-prompt
```

ESM and CommonJS, TypeScript types included, Node 18 or newer, no dependencies.

## License

MIT
