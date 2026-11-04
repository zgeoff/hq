import type { LinearCall } from '../linear/types.ts';
import type { NoslopSettings } from '../noslop/load-noslop-settings.ts';
import type { Runner } from '../runner/types.ts';

export interface BriefInput {
  issue: string;
  ref: string;
  imp: boolean;
  byLink: boolean;
  goalFile: string | null;

  repo: string | null;
}

export interface BriefDeps {
  linear: LinearCall;
  run: Runner;
  noslop: NoslopSettings;
  privateDir: string;

  briefsDir: string;
  files: BriefFiles;
  warn: (line: string) => void;
}

export type EntryKind = 'file' | 'directory' | 'link' | 'other' | 'missing';

export interface BriefFiles {
  readKind: (path: string) => EntryKind;
  readLinkKind: (path: string) => EntryKind;
  readText: (path: string) => string;
  writeText: (path: string, text: string) => void;
  makeDir: (path: string) => void;
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
  goalReview: string;
}

export type SkillBriefKind = 'design' | 'pr-walk';

export type BriefKind = 'delivery' | SkillBriefKind;

export interface SkillBriefInput {
  issue: string;
  ref: string;
  kind: SkillBriefKind;
  repo: string | null;
}

export interface BriefSkill {
  name: string;
  path: string;
  command: string;
}
