import type { MessageGet } from '../atc/message-get-schema.ts';
import type { RcState } from '../rc/types.ts';
import type { StaleCommit } from './parse-stale-commit.ts';
import type { Runner } from '../runner/types.ts';

export interface FleetEntry {
  name: string;
  cwd: string;
  model: string;
  prompt: string;
  wake: boolean;
  skills?: readonly string[];

  // The role skill, a compatibility alias for readers of the older shape.
  skill?: string | null;

  // Roles are read by name, so a role that fleet.json adds before hq knows the role still counts.
  roles?: readonly string[];

  pluginDirs?: string[];
  remoteControl?: boolean;
}

export interface PromptDrift {
  state: 'current' | 'stale' | 'unknown';
  since: string | null;
  hint: string | null;
  reason: string | null;
}

export interface PluginDrift {
  declared: string[];
  running: string[];
}

export interface DriftClient {
  prompt(id: string): Promise<string | undefined>;
}

export interface TranscriptReader {
  lines: (session: FleetSession, fallbackCwd: string) => AsyncIterable<string>;
}

export interface FleetSession {
  id: string;
  name: string;
  alive: boolean;
  state?: string;
  lifecycle?: { desired?: string; harness?: string; vm?: string | null | undefined } | null | undefined;

  locator?: { targetID?: string | null | undefined } | null | undefined;

  pluginDirs?: readonly string[] | null | undefined;

  pinned?: boolean | null | undefined;

  parent?: string | null | undefined;
  cwd?: string | null | undefined;

  createdAt?: number | null | undefined;
  agentSessionID?: string | null | undefined;
}

export type RestartCause = { kind: 'stale'; commit: string; latest: StaleCommit } | { kind: 'scheduled'; why: string };

export interface SpawnRequest {
  cwd: string;
  name: string;
  prompt: string;
  model: string;
  agent: string;
  idempotencyKey: string;
  pluginDirs?: string[];
}

// A confirmToken answer means the forget destroys the session's host, and atc wants a second call
// that carries the token.
interface ForgetResult {
  forgotten: boolean;
  confirmToken?: string | undefined;
}

export interface StaleOps {
  details: (id: string) => Promise<{ prompt: string | null; lastActivityAt: number }>;
  message: (id: string) => Promise<MessageGet>;
  kill: (id: string) => Promise<void>;
  unpin: (id: string) => Promise<void>;
  forget: (id: string, confirmToken?: string) => Promise<ForgetResult>;

  // A forget that stops a live session itself, for a destroy where a separate stop would suspend the
  // imp first and outlast the call.
  forgetLive: (id: string, confirmToken?: string) => Promise<ForgetResult>;
}

export interface FleetClient extends Partial<StaleOps> {
  sessions(): Promise<FleetSession[]>;
  spawn: (p: SpawnRequest) => Promise<{ id: string }>;
  pin(id: string): Promise<void>;
  submit?(id: string, text: string): Promise<void>; // atc refuses a line mid-turn
}

export interface EnsureStep {
  name: string;
  action: 'ok' | 'duplicates' | 'waiting' | 'spawned' | 'would spawn' | 'failed' | 'remote control';
  detail: string;
  id?: string | undefined;

  message?: string | undefined;

  // told at once, quiet hours or not (Remote Control may have been turned off)
  urgent?: boolean | undefined;
}

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
