import type { IssueType } from './issue-types.ts';

export interface LinearIssue {
  issue: string;
  type: IssueType;
  title: string;
  state: 'completed' | 'canceled' | 'open';
  closed_at: string | null;
}

// A Linear GraphQL call; tests pass a fake.
export type LinearCall = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

// The filesystem calls hq linear issues makes on its --out directory; the CLI passes node:fs.
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

// What hq linear issues reaches Linear and the filesystem through.
export interface LinearCommandDeps {
  call: LinearCall;
  files: IssueFiles;
}

export interface Node {
  identifier: string;
  title: string;
  completedAt: string | null;
  canceledAt: string | null;
  labels: { nodes: { name: string; parent: { name: string } | null }[] };
}

// Where a filed issue came from, as hq reads it from Linear.
export type FiledSource = 'owner' | 'design' | 'agent' | 'live check' | 'bot';

export type UmbrellaOutcome = 'news' | 'ticked' | 'no_box' | 'ambiguous' | 'gone';

export interface UmbrellaBox {
  repo: string;
  number: number;
  issue: string;
  merged_at: string;
  outcome: UmbrellaOutcome | null;
  decided_at: string | null;
}
