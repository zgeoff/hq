import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildNodeBriefFiles } from '../src/brief/build-node-brief-files.ts';
import type { BriefDeps } from '../src/brief/types.ts';
import { buildMockSha } from './build-mock-sha.ts';
import { buildStubBriefGH } from './build-stub-brief-gh.ts';
import { buildStubBriefKit } from './build-stub-brief-kit.ts';
import type { StubBriefIssue } from './build-stub-brief-linear.ts';
import { buildStubBriefLinear } from './build-stub-brief-linear.ts';
import { createStubBriefPrivateDir } from './create-stub-brief-private-dir.ts';

interface StubBriefScenario {
  // Linear issues by identifier
  issues: Record<string, StubBriefIssue>;

  // the permission phrasing table rows of the private checkout
  rows: [string, string][];

  // the repos noslop reviews; none when absent
  noslop?: string[];

  // the files of zgeoff/hq at the commit; the whole kit when absent
  kit?: Record<string, string>;

  // the refs that point at the commit; main when absent
  refs?: string[];

  // the record line of the private design brief; an invented one when absent, none when null
  recordLine?: string | null;
}

// The marker sits in a section of the private file outside the permission table.
export const PRIVATE_MARKER = 'MARKER-OUTSIDE-THE-TABLE';

// Everything hq brief reaches, as stand-ins: Linear with the issues, gh with the kit at one
// commit, and a private checkout under `root` whose briefs file holds the rows. `warnings` and
// `calls` record the warnings printed and the gh commands run.
export function createStubBriefDeps(root: string, scenario: StubBriefScenario) {
  const calls: string[] = [];
  const warnings: string[] = [];
  const sha = buildMockSha(2748);
  const linear = buildStubBriefLinear(scenario.issues);
  createStubBriefPrivateDir(root, { path: 'skills/delivery-lead/references/briefs.private.md', rows: scenario.rows, marker: PRIVATE_MARKER });
  if (scenario.recordLine !== null) {
    const record = join(root, 'skills/delivery-lead/references/design-brief.private.md');
    mkdirSync(dirname(record), { recursive: true });
    writeFileSync(record, ['# design brief', '', '## Design brief (the record line)', '', scenario.recordLine ?? 'You should file the kettle record on <GEO-n>.', '', '## the closing', '', PRIVATE_MARKER, ''].join('\n'));
  }
  const commits = Object.fromEntries((scenario.refs ?? ['main']).map((ref) => [ref, sha]));
  const run = buildStubBriefGH({ commits, files: scenario.kit ?? buildStubBriefKit() }, calls);
  const deps: BriefDeps = { linear: linear.call, run, noslop: { repos: scenario.noslop ?? [], sha: null, caps: {} }, privateDir: root, files: buildNodeBriefFiles(), warn: (line) => warnings.push(line) };
  return { deps, calls, warnings, asked: linear.asked, sha };
}
