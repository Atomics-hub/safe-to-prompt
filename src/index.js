// Can this process block on human input?
//
// A terminal check answers a different question than the one a CLI is asking. Measured inside a real
// coding agent with a pseudo-terminal attached, `process.stdin.isTTY` is true and a TTY-based
// interactivity check returns "safe to prompt". Nobody is there. The prompt waits until the agent
// times out.
//
// So the checks here are ordered by authority, and every answer carries the reason it was reached:
//
//   1. An explicit instruction from the operator wins outright, in both directions.
//   2. A detected agent or CI system means no human is waiting, whatever the terminal says.
//   3. Only then does the terminal get a vote.
//
// Sandboxes are deliberately NOT treated as non-interactive. A person in a cloud development
// environment is sitting at a real terminal and can answer a prompt. A sandbox does block opening a
// browser, which is a different question and gets a different answer.
//
// Zero dependencies, and every registry below is exported so it can be corrected without a release.

export class PromptContextError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptContextError';
  }
}

// Environment variables set by coding agents and automated development tools. Names only; each is a
// published detail of the tool that sets it. Prior art worth crediting: expo's agent-cli-detector,
// vercel's detect-agent and davidmokos' sandbox-cli-detector cover overlapping ground.
export const AGENT_VARIABLES = Object.freeze({
  CLAUDECODE: 'claude-code',
  CLAUDE_CODE_SESSION_ID: 'claude-code',
  CURSOR_CONVERSATION_ID: 'cursor',
  CURSOR_AGENT: 'cursor',
  CODEX_THREAD_ID: 'codex',
  CODEX_SANDBOX: 'codex',
  COPILOT_AGENT_SESSION_ID: 'github-copilot',
  GITHUB_COPILOT_CLI: 'github-copilot',
  GEMINI_CLI: 'gemini-cli',
  REPLIT_SESSION: 'replit',
  DEVIN_SESSION_ID: 'devin',
  OPENCODE: 'opencode',
  OPENCODE_PID: 'opencode',
  AIDER_CHAT: 'aider',
  KIRO_SESSION_ID: 'kiro',
  KILO_RUN_ID: 'kilo',
  GROK_SESSION_ID: 'grok',
  ANTIGRAVITY_TRAJECTORY_ID: 'antigravity',
  AUGMENT_CLI: 'augment',
  PI_CODING_AGENT: 'pi',
  AI_AGENT: 'unknown-agent',
});

// Continuous integration. `CI` alone covers most providers; the rest set only their own name.
export const CI_VARIABLES = Object.freeze([
  'CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI',
  'TRAVIS', 'JENKINS_URL', 'TEAMCITY_VERSION', 'BUILDKITE', 'DRONE', 'APPVEYOR',
  'TF_BUILD', 'CODEBUILD_BUILD_ID', 'BITBUCKET_BUILD_NUMBER', 'NETLIFY', 'VERCEL', 'CF_PAGES',
]);

// Remote and containerised development. A human may well be attached, so these never block a prompt.
// They do block opening a browser, because there is no desktop to open it on.
export const SANDBOX_VARIABLES = Object.freeze({
  CODESPACES: 'github-codespaces',
  GITPOD_WORKSPACE_ID: 'gitpod',
  E2B_SANDBOX: 'e2b',
  MODAL_SANDBOX_ID: 'modal',
  DAYTONA_SANDBOX_ID: 'daytona',
  CSB_SANDBOX_ID: 'codesandbox',
  STACKBLITZ: 'stackblitz',
  REPLIT_CONTAINER: 'replit',
  CLOUDFLARE_DURABLE_OBJECT_ID: 'cloudflare',
});

// Explicit instructions, which outrank every inference below them.
const FORCE_OFF = ['NO_PROMPT', 'NONINTERACTIVE', 'NON_INTERACTIVE'];
const FORCE_ON = ['FORCE_PROMPT', 'FORCE_INTERACTIVE'];

// Environment values are strings in practice, but a caller can pass any object as `env`, so this
// never assumes a method exists on the value it was handed.
const truthy = (value) => {
  if (value === undefined || value === null) return false;
  const text = String(value);
  return text !== '' && text !== '0' && text.toLowerCase() !== 'false';
};

const readEnv = (options) => options?.env ?? process.env;

const firstMatch = (env, table) => {
  for (const [name, id] of Object.entries(table)) {
    if (truthy(env[name])) return {variable: name, id};
  }
  return null;
};

/** The agent running this process, or null. */
export function detectAgent(options) {
  const env = readEnv(options);
  return firstMatch(env, AGENT_VARIABLES);
}

/** The sandbox or remote development environment, or null. */
export function detectSandbox(options) {
  const env = readEnv(options);
  return firstMatch(env, SANDBOX_VARIABLES);
}

/** The CI system, or null. `DEBIAN_FRONTEND=noninteractive` is a packaging convention, not CI. */
export function detectCI(options) {
  const env = readEnv(options);
  for (const name of CI_VARIABLES) {
    if (truthy(env[name])) return {variable: name};
  }
  return null;
}

const streams = (options) => ({
  stdin: options?.stdin ?? process.stdin,
  stdout: options?.stdout ?? process.stdout,
});

// The single decision, with the reason it was reached. Everything public is a thin read of this.
function decide(options) {
  const env = readEnv(options);
  const {stdin, stdout} = streams(options);

  for (const name of FORCE_OFF) {
    if (truthy(env[name])) {
      return {can: false, reason: 'explicitly-disabled', detail: `${name} is set, so prompting was turned off deliberately`};
    }
  }
  for (const name of FORCE_ON) {
    if (truthy(env[name])) {
      return {can: true, reason: 'explicitly-enabled', detail: `${name} is set, so prompting was turned on deliberately`};
    }
  }

  const agent = detectAgent(options);
  if (agent) {
    return {
      can: false,
      reason: 'agent',
      detail: `running under ${agent.id} (${agent.variable} is set); a terminal check would say yes here and the prompt would wait until the agent times out`,
      agent,
    };
  }

  const ci = detectCI(options);
  if (ci) {
    return {can: false, reason: 'ci', detail: `${ci.variable} is set, so this is an automated build with nobody at a keyboard`, ci};
  }

  if (!stdin?.isTTY) return {can: false, reason: 'no-tty', detail: 'stdin is not a terminal, so there is nothing to read a keystroke from'};
  if (!stdout?.isTTY) return {can: false, reason: 'no-tty', detail: 'stdout is not a terminal, so the question would not be visible'};
  if (env.TERM === 'dumb') {
    return {can: false, reason: 'dumb-terminal', detail: 'TERM is dumb, so the terminal cannot render an interactive prompt'};
  }

  return {can: true, reason: 'interactive', detail: 'a terminal is attached and nothing indicates automation'};
}

/** Whether this process can block on human input. */
export function canPrompt(options) {
  return decide(options).can;
}

/** Why a prompt would be unsafe, or null when it is safe. */
export function whyNotPrompt(options) {
  const verdict = decide(options);
  return verdict.can ? null : {reason: verdict.reason, detail: verdict.detail};
}

/**
 * Whether to draw spinners, progress bars or anything that repaints a line. An agent records every
 * repaint as another line of transcript, so animation is noise there even when a terminal exists.
 */
export function canAnimate(options) {
  const env = readEnv(options);
  const {stdout} = streams(options);
  if (truthy(env.NO_ANIMATION)) return false;
  if (detectAgent(options)) return false;
  if (detectCI(options)) return false;
  if (!stdout?.isTTY) return false;
  if (env.TERM === 'dumb') return false;
  return true;
}

/** Whether to emit ANSI colour, following the NO_COLOR and FORCE_COLOR conventions. */
export function canUseColor(options) {
  const env = readEnv(options);
  const {stdout} = streams(options);
  if (truthy(env.NO_COLOR)) return false;
  if (env.FORCE_COLOR !== undefined) return truthy(env.FORCE_COLOR);
  if (env.TERM === 'dumb') return false;
  return Boolean(stdout?.isTTY);
}

/**
 * Whether opening a browser would reach a person. Unlike prompting, a sandbox blocks this: a cloud
 * development environment has a human at a terminal but no desktop to open a window on.
 */
export function canOpenBrowser(options) {
  const env = readEnv(options);
  if (truthy(env.NO_BROWSER)) return false;
  if (detectAgent(options)) return false;
  if (detectCI(options)) return false;
  if (detectSandbox(options)) return false;
  if (truthy(env.SSH_CONNECTION) || truthy(env.SSH_TTY)) return false;
  if (process.platform === 'linux' && !truthy(env.DISPLAY) && !truthy(env.WAYLAND_DISPLAY)) return false;
  return true;
}

/** Everything the decisions above are based on, for logging or for a --doctor command. */
export function describeEnvironment(options) {
  const {stdin, stdout} = streams(options);
  const verdict = decide(options);
  return {
    canPrompt: verdict.can,
    reason: verdict.reason,
    detail: verdict.detail,
    canAnimate: canAnimate(options),
    canUseColor: canUseColor(options),
    canOpenBrowser: canOpenBrowser(options),
    agent: detectAgent(options),
    ci: detectCI(options),
    sandbox: detectSandbox(options),
    stdinIsTTY: Boolean(stdin?.isTTY),
    stdoutIsTTY: Boolean(stdout?.isTTY),
  };
}

/**
 * Ask only when someone can answer, and take the fallback when they cannot. The fallback is required
 * rather than defaulted, because an unattended run needs a deliberate answer and silence is not one.
 */
export async function promptOr(ask, fallback, options) {
  if (typeof ask !== 'function') {
    throw new PromptContextError('promptOr takes a function to run when prompting is safe');
  }
  if (arguments.length < 2) {
    throw new PromptContextError('promptOr needs a fallback value for the unattended case; pick one deliberately');
  }
  if (!canPrompt(options)) return typeof fallback === 'function' ? fallback(whyNotPrompt(options)) : fallback;
  return ask();
}
