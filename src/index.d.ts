export declare class PromptContextError extends Error {
  readonly name: 'PromptContextError';
}

/** Why prompting is unsafe here. */
export type Reason =
  | 'explicitly-disabled'
  | 'explicitly-enabled'
  | 'agent'
  | 'ci'
  | 'no-tty'
  | 'dumb-terminal'
  | 'interactive';

export interface Detection {
  /** The environment variable that gave it away. */
  variable: string;
  /** Short identifier, for example "claude-code". */
  id: string;
}

export interface CIDetection {
  variable: string;
}

export interface Options {
  /** Defaults to process.env. Pass a plain object to test a scenario. */
  env?: Record<string, string | undefined>;
  /** Defaults to process.stdin. */
  stdin?: {isTTY?: boolean};
  /** Defaults to process.stdout. */
  stdout?: {isTTY?: boolean};
}

export interface EnvironmentDescription {
  canPrompt: boolean;
  reason: Reason;
  detail: string;
  canAnimate: boolean;
  canUseColor: boolean;
  canOpenBrowser: boolean;
  agent: Detection | null;
  ci: CIDetection | null;
  sandbox: Detection | null;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}

/** Environment variables that identify a coding agent, keyed by variable name. */
export declare const AGENT_VARIABLES: Readonly<Record<string, string>>;
/** Environment variables that identify a CI system. */
export declare const CI_VARIABLES: readonly string[];
/** Environment variables that identify a sandbox or remote development environment. */
export declare const SANDBOX_VARIABLES: Readonly<Record<string, string>>;

/** Whether to show an interactive prompt: a person is at a terminal and nothing says a program is driving. */
export declare function canPrompt(options?: Options): boolean;

/** Why a prompt would be unsafe, or null when it is safe. */
export declare function whyNotPrompt(options?: Options): {reason: Reason; detail: string} | null;

/** Whether to draw spinners or anything that repaints a line. */
export declare function canAnimate(options?: Options): boolean;

/** Whether to emit ANSI colour. Follows NO_COLOR and FORCE_COLOR. */
export declare function canUseColor(options?: Options): boolean;

/** Whether opening a browser would reach a person. Blocked in sandboxes, unlike prompting. */
export declare function canOpenBrowser(options?: Options): boolean;

/** The agent running this process, or null. */
export declare function detectAgent(options?: Options): Detection | null;

/** The CI system, or null. */
export declare function detectCI(options?: Options): CIDetection | null;

/** The sandbox or remote development environment, or null. */
export declare function detectSandbox(options?: Options): Detection | null;

/** Everything the decisions are based on. */
export declare function describeEnvironment(options?: Options): EnvironmentDescription;

/**
 * Ask only when someone can answer. The fallback is required, not defaulted: an unattended run
 * needs a deliberate answer.
 */
export declare function promptOr<T>(
  ask: () => T | Promise<T>,
  fallback: T | ((why: {reason: Reason; detail: string} | null) => T),
  options?: Options,
): Promise<T>;
