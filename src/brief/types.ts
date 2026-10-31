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
// hq-private checkout, and where a warning goes (stderr).
export interface BriefDeps {
  linear: LinearCall;
  run: Runner;
  noslop: NoslopSettings;
  privateDir: string;
  warn: (line: string) => void;
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
