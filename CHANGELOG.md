# Changelog

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
