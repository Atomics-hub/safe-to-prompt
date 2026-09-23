# safe-to-prompt

Should your CLI show an interactive prompt, or ask for a flag? Zero dependencies.

**When a coding agent runs your CLI, an interactive prompt goes wrong in one of two ways**, depending
on how that agent wires stdin:

| stdin, as the agent sets it | agents that do this by default | what a prompt does |
| --- | --- | --- |
| closed | Codex, OpenCode, Roo Code, Kilo Code | exits **0** having done nothing |
| open, never written to | Claude Code, Continue | waits until the agent gives up |
| a real terminal | Gemini CLI, Cline in VS Code | waits for an answer, which the person can type |

The middle column comes from reading each agent's source, except Claude Code, which was measured
directly. What a prompt does was measured against `prompts` (46M downloads a week), and who can type
into an attached terminal comes from Gemini CLI's and Cline's source.

The first row is the one to worry about. When stdin closes, the prompt's promise never settles, the
event loop drains, and Node exits with code 0 partway through the command. The agent is told it
succeeded.

```js
import {canPrompt, whyNotPrompt} from 'safe-to-prompt';

if (!canPrompt()) {
  console.error(`Can't ask for a project name: ${whyNotPrompt().detail}. Pass --name.`);
  process.exit(1);
}
const {name} = await prompts({type: 'text', name: 'name', message: 'Project name?'});
```

## This is happening in tools you use

Measured on 2026-09-22 in empty directories, with each tool's latest release and no flags:

| command | weekly | stdin closed | stdin open |
| --- | --- | --- | --- |
| `shadcn init` | 6.7M | exit 0, created nothing | waits |
| `shadcn add button` | 6.7M | exit 0, created nothing | waits |
| `create-next-app` | 295k | exit 0, created nothing | waits |
| `create-astro` | 16k | exit 0, created nothing | waits |
| `sv create` | 15k | exit 0, created nothing | waits |
| `create-vite` | 661k | scaffolds with defaults | scaffolds with defaults |
| `nuxi init` | 154k | exit 2, names the missing flags | exit 2, names the missing flags |

`create-vite` and `nuxi` show the two right answers: use defaults, or fail loudly and say which flags
to pass. Either works for an agent, which reads the error and runs the command again. Exiting 0 does
not work, because nothing tells anyone it went wrong.

## A terminal check catches both failures

`process.stdin.isTTY` is false in the first two rows of the first table, so a CLI that checks it
before prompting avoids both failures. For many CLIs, that check is all they need.

The third row is not a failure. Gemini CLI and Cline run commands in a real terminal so that
interactive programs work: in Gemini CLI the person presses Tab to type into the running command, and
Cline uses a VS Code terminal the person can type in. Codex attaches a terminal when the model asks
for one, and the model can then type into it itself.

This package still says no there, as a deliberate policy: a program is driving the command, and a flag
is an answer every agent can give. It recognises those agents by the variable each sets on the
commands it runs (`GEMINI_CLI`, `CLINE_ACTIVE`, `CODEX_CI`), and treats CI runs that attach a
terminal the same way. If you would rather prompt whenever a terminal is attached, check
`process.stdin.isTTY` instead.

## Checks are ordered by authority

1. **An explicit instruction wins.** `NO_PROMPT` and `FORCE_PROMPT` outrank everything below, in both
   directions. When they conflict, prompting is refused, because that is the safe way to be wrong.
2. **An agent or a CI system means a program is driving**, whatever the terminal says.
3. **Only then does the terminal get a vote.**

Every answer carries its reason, worded to be true of the process it describes:

```js
whyNotPrompt();
// {reason: 'agent', detail: 'running under gemini-cli (GEMINI_CLI is set), so a coding agent is
//                            driving this command, although a terminal is attached'}
```

## Sandboxes can prompt, on purpose

A person in a cloud development environment is at a real terminal and can answer a question.
Treating a sandbox as unattended would break them. A sandbox does block opening a browser, because
there is no desktop to open one on, so that is a separate question with a separate answer.

```js
const codespace = {env: {CODESPACES: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}};
canPrompt(codespace);        // true:  a person is right there
canOpenBrowser(codespace);   // false: but there is no desktop
```

## Aider is not treated as an agent, on purpose

Aider runs a command only after the person approves it, and wires their keyboard to it. A prompt
under Aider reaches a human, so this package lets it through.

## API

### `canPrompt(options?)` → `boolean`

Whether to show an interactive prompt: a person is at a terminal and nothing says a program is
driving.

### `whyNotPrompt(options?)` → `{reason, detail} | null`

Why not to prompt, or `null` when prompting is fine. `reason` is one of `agent`, `ci`, `no-tty`,
`dumb-terminal` or `explicitly-disabled`.

### `promptOr(ask, fallback, options?)` → `Promise`

Runs `ask()` when `canPrompt` says yes, and otherwise returns `fallback`. The fallback is **required**:
an unattended run needs a deliberate answer. Pass a function to receive the reason.

### `canAnimate(options?)`, `canUseColor(options?)`, `canOpenBrowser(options?)`

The other three decisions. Colour follows the [`NO_COLOR`](https://no-color.org) convention and
`FORCE_COLOR`.

### `detectAgent()`, `detectCI()`, `detectSandbox()`, `describeEnvironment()`

The raw detections, each `{variable, id}` or `null`, and everything the decisions were made from, for
a `--doctor` command.

### Testing your own code

Every function takes `{env, stdin, stdout}`, so a scenario can be written out in full:

```js
canPrompt({env: {GEMINI_CLI: '1'}, stdin: {isTTY: true}, stdout: {isTTY: true}});   // false
```

If your tests mock a prompt library, set `FORCE_PROMPT=1` in the test environment so the mock is
reached.

## Environment variables

| variable | effect |
| --- | --- |
| `NO_PROMPT`, `NONINTERACTIVE`, `NON_INTERACTIVE` | never prompt |
| `FORCE_PROMPT`, `FORCE_INTERACTIVE` | prompt anyway |
| `NO_COLOR` / `FORCE_COLOR` | colour off / on |
| `NO_ANIMATION` | no spinners |
| `NO_BROWSER` | never open a browser |

## Where the agent list comes from

`AGENT_VARIABLES` is exported, and each entry is commented with its source. The ones for Gemini CLI,
Cline, Codex, OpenCode, Kilo Code and Roo Code were read in those projects' source code on
2026-09-22; Claude Code's were observed in a running session. The rest come from the prior-art lists
in [`agent-cli-detector`](https://github.com/expo/agent-cli-detector),
[`@vercel/detect-agent`](https://github.com/vercel/vercel) and
[`sandbox-cli-detector`](https://github.com/davidmokos/sandbox-cli-detector), which got here first and
are worth using if detection is all you need.

## Honest limits

- **A list of environment variables goes stale.** An agent that sets nothing recognisable and attaches
  a terminal looks like a person. That is why the lists are exported and `NO_PROMPT` exists.
- **It cannot tell that a person is paying attention**, only that nothing suggests otherwise.
- **It does not prompt.** Keep your prompt library. This decides whether to call it.
- For the two failures above, a plain `process.stdin.isTTY` check is enough. What this adds is a
  policy for agents and CI runs that attach a terminal, explicit overrides, and a reason you can
  print.

## Install

```sh
npm install safe-to-prompt
```

ESM and CommonJS, TypeScript types included, Node 18 or newer, no dependencies.

## License

MIT
