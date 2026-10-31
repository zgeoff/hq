import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKettleIssueText } from '../../test/build-kettle-issue-text.ts';
import { buildStubSkillBriefKit } from '../../test/build-stub-skill-brief-kit.ts';
import { createStubBriefDeps } from '../../test/create-stub-brief-deps.ts';
import { runSkillBriefCommand } from './run-skill-brief-command.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-skill-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it prints the design template, filled, then the tickets skill pointer at the full sha', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Design', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
    refs: ['refactor/kettle-rebuild'],
  });
  const command = `gh api 'repos/zgeoff/hq/contents/skills/tickets/SKILL.md?ref=${stub.sha}' -H 'Accept: application/vnd.github.raw'`;

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'refactor/kettle-rebuild', kind: 'design' });

  expect(out.text).toBe(`Run a design session with me for GEO-9001 in zgeoff/cloud: a kettle that pours.\n\nSettle the spout first.\n\nFirst read the tickets skill: ${command}`);
  expect(out.data).toStrictEqual({
    issue: 'GEO-9001',
    repo: 'zgeoff/cloud',
    ref: stub.sha,
    prompt: out.text,
    bytes: Buffer.byteLength(out.text),
    cuts: [],
    playbook: null,
    goalFile: null,
    unfilled: [],
    kind: 'design',
    skill: { name: 'tickets', path: 'skills/tickets/SKILL.md', command },
  });
  expect(stub.calls).toStrictEqual([
    'gh api repos/zgeoff/hq/commits/refactor/kettle-rebuild --jq .sha',
    `gh api repos/zgeoff/hq/contents/agent-kit/design-brief.md?ref=${stub.sha} -H Accept: application/vnd.github.raw`,
    `gh api repos/zgeoff/hq/contents/skills/tickets/SKILL.md?ref=${stub.sha} -H Accept: application/vnd.github.raw`,
  ]);
  expect(stub.warnings).toStrictEqual([]);
});

test('it prints the PR-walk template, then the fix-it-here skill pointer at the full sha', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
  });
  const command = `gh api 'repos/zgeoff/hq/contents/skills/fix-it-here/SKILL.md?ref=${stub.sha}' -H 'Accept: application/vnd.github.raw'`;

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk' });

  expect(out.text).toBe(`# Brief: going through the kettle PRs with the owner\n\nFind out why each lid PR took rework.\n\nFirst read the fix-it-here skill: ${command}`);
  expect(out.data['kind']).toBe('pr-walk');
  expect(out.data['skill']).toStrictEqual({ name: 'fix-it-here', path: 'skills/fix-it-here/SKILL.md', command });
  expect(out.data['unfilled']).toStrictEqual([]);
});

test('it refuses when the skill file is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit({ without: ['skills/tickets/SKILL.md'] }),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design' });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `skills/tickets/SKILL.md is missing at ${stub.sha}; pass --ref refactor/fleet-skill-rebuild until the skill rebuild merges` });
});

test('it refuses with the --ref hint when the template is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit({ without: ['agent-kit/pr-walk-brief.md'] }),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk' });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `agent-kit/pr-walk-brief.md is missing at ${stub.sha}; pass --ref refactor/fleet-skill-rebuild until the skill rebuild merges` });
});

test('it lists a placeholder hq has no value for in unfilled and leaves it in the prompt', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: { ...buildStubSkillBriefKit(), 'agent-kit/design-brief.md': '```text\nPour {{issue_id}} through the {{spout}}.\n```\n' },
  });

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design' });

  expect(out.text.split('\n')[0]).toBe('Pour GEO-9001 through the {{spout}}.');
  expect(out.data['unfilled']).toStrictEqual(['placeholder:spout']);
});

test('it refuses a brief over 4000 bytes with its byte count, and cuts nothing', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: { ...buildStubSkillBriefKit(), 'agent-kit/pr-walk-brief.md': `\`\`\`text\n${'Descale the kettle. '.repeat(200)}\n\`\`\`\n` },
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk' });

  expect(outcome).rejects.toMatchObject({ code: 'too_long', message: 'the brief is 4182 bytes, over the 4000 limit', data: { bytes: 4182, cuts: [] } });
});
