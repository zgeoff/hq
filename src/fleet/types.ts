import type { MessageGet } from '../atc/message-get-schema.ts';
import type { RcState } from '../rc/types.ts';
import type { Role } from '../roles/role-names.ts';
import type { Runner } from '../runner/types.ts';

export interface FleetEntry {
  name: string;
  cwd: string;
  model: string;
  prompt: string; // main:<path> (read from origin/main) or an absolute path outside any repo
  wake: boolean; // keep it on hq's wake list
  skill?: string | null; // the role skill in the definitions repo; null for a session with a prompt file of its own
  roles?: Role[];

  // Claude Code plugin folders passed to atc's spawn; atc gives each as --plugin-dir
  pluginDirs?: string[];
  remoteControl?: boolean; // after a spawn, type `/remote-control <name>` once the start turn ends (GEO-1102)
}

export interface PromptDrift {
  state: 'current' | 'stale' | 'unknown';
  since: string | null; // stale: the latest commit on origin/main that touched the prompt, or the file's mtime
  hint: string | null; // stale: the first differing line
  reason: string | null; // unknown: why
}

// A live session's plugin folders against fleet.json's, when they differ.
export interface PluginDrift {
  declared: string[];
  running: string[];
}

export interface DriftClient {
  prompt(id: string): Promise<string | undefined>; // atc's session.get `prompt`
}

export interface FleetSession {
  id: string;
  name: string;
  alive: boolean;
  state?: string; // atc's running | needs_you | done | exited
  lifecycle?: { desired?: string; harness?: string };

  // atc 4.15+: the folders the session was spawned with
  pluginDirs?: readonly string[] | null | undefined;

  // the session this one is a sub-session of, and its working directory inside its host
  parent?: string | null | undefined;
  cwd?: string | null | undefined;
}

// What hq fleet asks atc's session.spawn for.
export interface SpawnRequest {
  cwd: string;
  name: string;
  prompt: string;
  model: string;
  agent: string;
  idempotencyKey: string;
  pluginDirs?: string[];
}

// atc's session.forget: forgotten, or refused. A confirmToken answer means the forget destroys the
// session's host, and atc wants a second call that carries the token.
interface ForgetResult {
  forgotten: boolean;
  confirmToken?: string | undefined;
}

// What the stale restart reads and does beyond ensure: a session's prompt and last activity, a
// sent message's outcome, and the stop, unpin and forget.
export interface StaleOps {
  details: (id: string) => Promise<{ prompt: string | null; lastActivityAt: number }>;
  message: (id: string) => Promise<MessageGet>;
  kill: (id: string) => Promise<void>;
  unpin: (id: string) => Promise<void>;
  forget: (id: string, confirmToken?: string) => Promise<ForgetResult>;
}

export interface FleetClient extends Partial<StaleOps> {
  sessions(): Promise<FleetSession[]>;
  spawn: (p: SpawnRequest) => Promise<{ id: string }>;
  pin(id: string): Promise<void>;
  submit?(id: string, text: string): Promise<void>; // types a line and submits it; atc refuses one mid-turn
}

export interface EnsureStep {
  name: string;
  action: 'ok' | 'duplicates' | 'waiting' | 'spawned' | 'would spawn' | 'failed' | 'remote control';
  detail: string;
  id?: string | undefined;

  // the whole line z-stu is told, when it isn't `<name> <action>: <detail>`
  message?: string | undefined;

  // told at once, quiet hours or not (Remote Control may have been turned off)
  urgent?: boolean | undefined;
}

// What the Remote Control steps need from outside: the state probe (reads /proc and Claude
// Code's config), a runner for systemd-run, and hq's own command line. Tests inject all three.
export interface RcDeps {
  state(sessionId: string): RcState;
  run: Runner;
  self: string[];
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
}

export interface RcPending {
  id: string;
  since: string;

  // set before the line goes out, in one transaction: a crash or a rival never types twice
  typedAt?: string | undefined;
}

export type RcEval = { kind: 'none' } | { kind: 'wait' } | { kind: 'done'; step: EnsureStep; seq: number };

export interface RcCheck {
  client: FleetClient;
  rc: RcDeps;
  name: string;
  known: Record<string, string>;
  actor: string;
  replaced: 'finish' | 'quiet';
}
