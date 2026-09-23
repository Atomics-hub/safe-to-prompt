# Changelog

## 0.1.2

A correction. 0.1.1 said that agents which attach a terminal leave nobody at it. That was wrong.

- Gemini CLI and Cline attach a real terminal so that interactive programs work, and a person can
  type into it: in Gemini CLI by pressing Tab, in Cline in the VS Code terminal. Codex attaches one
  when the model asks for it, and the model can then type into it. A prompt there can be answered.
- The behaviour is unchanged: `canPrompt()` still says no under an agent. The README, the package
  description and the `agent` explanation now call that what it is, a policy of asking for a flag,
  and no longer claim that nobody is present.
- The `no-tty` explanation no longer says there is nothing to read a keystroke from. Answers piped
  into stdin can be read; what is missing is a person who can type.
- The README says plainly that `process.stdin.isTTY` already catches both measured failures.

## 0.1.1

Corrections, so that every claim is one that was measured or traced to source.

- The agent explanation no longer says a terminal is attached when none is. Most agents attach no
  terminal at all; the message now names one only when stdin really is a terminal.
- The agent list was rebuilt against each agent's own source code. Added `CLINE_ACTIVE`, `CODEX_CI`,
  `CODEX_SESSION_ID`, `KILO`, `KILO_PID` and `ROO_ACTIVE`. Each entry is commented with its source.
- Removed `AIDER_CHAT`, which Aider does not set. Aider runs a command only after a person approves it,
  so a prompt under Aider reaches a human and must not be refused.
- Left out the bare `AGENT` variable that opencode and kilo set: both close stdin, which the terminal
  check already catches, and so generic a name invites false positives.
- The README now leads with what was measured: under a closed stdin, `prompts` exits 0 having done
  nothing, and `shadcn init`, `shadcn add`, `create-next-app`, `create-astro` and `sv create` do exactly
  that. It states plainly that a TTY check covers the common case, and that this package's added value
  is agents and CI runs that attach a real terminal, which Gemini CLI and Cline do by default.

## 0.1.0

First release.

- `canPrompt(options)` — whether this process can block on human input. A terminal check says yes
  inside a coding agent with a pseudo-terminal attached; this says no, because nobody is there.
- `whyNotPrompt(options)` — the reason, as one of `agent`, `ci`, `no-tty`, `dumb-terminal` or
  `explicitly-disabled`, with a sentence a user can act on.
- `promptOr(ask, fallback, options)` — runs the question only when someone can answer it. The
  fallback is required rather than defaulted.
- `canAnimate`, `canUseColor`, `canOpenBrowser` — the other three decisions, which have different
  answers. Colour follows the NO_COLOR convention and FORCE_COLOR.
- Sandboxes allow prompting and block opening a browser, because a person in a cloud development
  environment has a terminal but no desktop.
- Explicit instructions outrank every inference; when they conflict, prompting is refused.
- `AGENT_VARIABLES`, `CI_VARIABLES` and `SANDBOX_VARIABLES` are exported so a gap can be worked
  around without waiting for a release.
- Every function accepts `{env, stdin, stdout}`, so a scenario can be written out in full.
- Zero dependencies. Node 18 or newer.
