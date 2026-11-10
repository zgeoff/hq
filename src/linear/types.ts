import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import type { IssueType } from './issue-types.ts';
import type { NodeSchema } from './node-schema.ts';

export interface LinearIssue {
  issue: string;
  type: IssueType;
  title: string;
  state: 'completed' | 'canceled' | 'open';
  closed_at: string | null;
}

export type LinearCall = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export interface IssueFiles {
  statSync: (path: string) => { isDirectory: () => boolean };
  readdirSync: (path: string) => string[];
  writeFileSync: (path: string, text: string) => void;
  rmSync: (path: string, options: ForceRemove) => void;
}

// A page the failed write never created is no error to remove.
interface ForceRemove {
  force: true;
}

export interface LinearCommandDeps {
  db: Database;
  call: LinearCall;
  run: Runner;
  files: IssueFiles;
}

export type Node = z.output<typeof NodeSchema>;

// A fleet session name, from fleet.json.
export type ZSession = string;

export type FiledSource = 'owner' | 'design' | 'agent' | 'live check' | 'bot' | ZSession;

export type UmbrellaOutcome = 'news' | 'ticked' | 'no_box' | 'ambiguous' | 'gone';

export interface UmbrellaBox {
  repo: string;
  number: number;
  issue: string;
  merged_at: string;
  outcome: UmbrellaOutcome | null;
  decided_at: string | null;
}
