import type { LinearCall } from '../linear/types.ts';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import type { Runner } from '../runner/types.ts';

export interface BriefInput {
  issue: string;
  ref: string;
  imp: boolean;
  byLink: boolean;
  goalFile: string | null;
}

// What hq brief reaches the outside through: Linear, gh, the noslop list read from the db, the
// hq-private checkout, the filesystem, and where a warning goes (stderr).
export interface BriefDeps {
  linear: LinearCall;
  run: Runner;
  noslop: NoslopSettings;
  privateDir: string;
  files: BriefFiles;
  warn: (line: string) => void;
}

// What is at a path: `readKind` follows a link to what it names, `readLinkKind` reports the link.
export type EntryKind = 'file' | 'directory' | 'link' | 'other' | 'missing';

// Every filesystem operation hq brief makes, so a test can put a failure at any of them.
export interface BriefFiles {
  readKind: (path: string) => EntryKind;
  readLinkKind: (path: string) => EntryKind;
  readText: (path: string) => string;
  writeText: (path: string, text: string) => void;
}

export interface IssueLabel {
  name: string;
  parent?: { name: string } | null | undefined;
}

export interface BriefIssue {
  identifier: string;
  description: string;
  labels: IssueLabel[];
}

// One heading of an issue description with the text under it, the heading line kept.
export interface IssueSection {
  name: string;
  text: string;
}

export interface PermissionRow {
  action: string;
  phrase: string;
}

export interface BriefPlaybook {
  type: string;
  path: string;
  command: string;
}

// The pieces {{placeholders}} take, and whether the issue's sections are in the prompt at all.
export interface BriefParts {
  repo: string;
  issueID: string;
  sections: IssueSection[];
  permissions: string;
  stack: string;
  fixes: string;
  reviewLines: string;
  notYours: string;
  impLine: string;
  goalFile: string;
}

export type SkillBriefKind = 'design' | 'pr-walk';

export type BriefKind = 'delivery' | SkillBriefKind;

export interface SkillBriefInput {
  issue: string;
  ref: string;
  kind: SkillBriefKind;
}

export interface BriefSkill {
  name: string;
  path: string;
  command: string;
}
