import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKettleIssueText } from '../../test/build-kettle-issue-text.ts';
import { buildStubSkillBriefKit } from '../../test/build-stub-skill-brief-kit.ts';
import { PRIVATE_MARKER, createStubBriefDeps } from '../../test/create-stub-brief-deps.ts';
import { runSkillBriefCommand } from './run-skill-brief-command.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-skill-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it prints the design template, filled, then the tickets skill pointer at the full sha', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Design', parent: 'Type' }, { name: 'with-geoff' }, { name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
    refs: ['refactor/kettle-rebuild'],
  });
  const command = `gh api 'repos/zgeoff/hq/contents/skills/tickets/SKILL.md?ref=${stub.sha}' -H 'Accept: application/vnd.github.raw'`;

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'refactor/kettle-rebuild', kind: 'design', repo: null });

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
    variant: 'with-geoff',
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

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk', repo: null });

  expect(out.text).toBe(`# Brief: going through the kettle PRs with the owner\n\nFind out why each lid PR took rework.\n\nFirst read the fix-it-here skill: ${command}`);
  expect(out.data['kind']).toBe('pr-walk');
  expect(out.data['skill']).toStrictEqual({ name: 'fix-it-here', path: 'skills/fix-it-here/SKILL.md', command });
  expect(out.data['unfilled']).toStrictEqual([]);
});

test('it prints a brief whose template names no repo for an issue with no area label', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
  });

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk', repo: null });

  expect(out.data['repo']).toBeNull();
  expect(out.text.startsWith('# Brief: going through the kettle PRs with the owner\n')).toBe(true);
});

test('it refuses a brief whose template names the repo when the issue has no area label', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Design', parent: 'Type' }, { name: 'with-geoff' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'bad_state', message: 'GEO-9001 needs an area label to name its repo; it has none' });
});

test('it fills the repo that --repo picks from a multi-area issue', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Design', parent: 'Type' }, { name: 'with-geoff' }, { name: 'cloud' }, { name: 'imp' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
  });

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: 'imp' });

  expect(out.text).toStartWith('Run a design session with me for GEO-9001 in zgeoff/impz:');
});

test('it refuses when the skill file is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit({ without: ['skills/tickets/SKILL.md'] }),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `skills/tickets/SKILL.md is missing at ${stub.sha}` });
});

test('it refuses when the template is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [],
    kit: buildStubSkillBriefKit({ without: ['agent-kit/pr-walk-brief.md'] }),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `agent-kit/pr-walk-brief.md is missing at ${stub.sha}` });
});

test('it lists a placeholder hq has no value for in unfilled and leaves it in the prompt', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'with-geoff' }, { name: 'cloud' }] } },
    rows: [],
    kit: { ...buildStubSkillBriefKit(), 'agent-kit/design-brief.md': '```text\nPour {{issue_id}} through the {{spout}}.\n```\n' },
  });

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

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

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'pr-walk', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'too_long', message: 'the brief is 4182 bytes, over the 4000 limit', data: { bytes: 4182, cuts: [] } });
});

test('it prints the agent design brief for a design issue without with-geoff, with the playbook, record line and checker pinned', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass, not with-geoff.' }), labels: [{ name: 'Design', parent: 'Type' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
  });
  const raw = `-H 'Accept: application/vnd.github.raw'`;
  const playbook = `gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/design.md?ref=${stub.sha}' ${raw}`;
  const checker = `gh api 'repos/zgeoff/hq/contents/skills/linear-triage/scripts/check-sketches.sh?ref=${stub.sha}' ${raw} > <scratch>/check-sketches.sh`;
  const skill = `gh api 'repos/zgeoff/hq/contents/skills/tickets/SKILL.md?ref=${stub.sha}' ${raw}`;

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(out.text).toBe(
    `/goal A kettle record for GEO-9001. Read the playbook: ${playbook}\n\nPermissions: You should file the kettle record on GEO-9001. Commit nothing.\n\nCheck the spout: ${checker}\n\nFirst read the tickets skill: ${skill}`,
  );
  expect(out.data).toStrictEqual({
    issue: 'GEO-9001',
    repo: null,
    ref: stub.sha,
    prompt: out.text,
    bytes: Buffer.byteLength(out.text),
    cuts: [],
    playbook: { type: 'design', path: 'agent-kit/playbooks/design.md', command: playbook },
    goalFile: null,
    unfilled: [],
    kind: 'design',
    variant: 'agent',
    skill: { name: 'tickets', path: 'skills/tickets/SKILL.md', command: skill },
  });
  expect(out.text).not.toContain(PRIVATE_MARKER);
});

test('it adds a permission line for each action beyond the design pass, from the table', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: '- Agent design pass\n- Paid API: kettle vision for spout photos, limit $2' }), labels: [] } },
    rows: [['Paid API', 'You may spend up to the stated limit on <API>.']],
    kit: buildStubSkillBriefKit(),
  });

  const out = await runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(out.text).toContain('Commit nothing.\nYou may spend up to the stated limit on <API>.\n');
  expect(out.data['unfilled']).toStrictEqual(['permissions:Paid API']);
});

test('it refuses a design issue with the with-geoff label whose Actions line asks for an agent pass', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [{ name: 'with-geoff' }] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'bad_state', message: 'GEO-9001 has the with-geoff label but its Actions line asks for an agent design pass; drop one' });
});

test('it refuses an agent design brief when its template is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [] } },
    rows: [],
    kit: buildStubSkillBriefKit({ without: ['agent-kit/agent-design-brief.md'] }),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `agent-kit/agent-design-brief.md is missing at ${stub.sha}` });
});

test('it refuses an agent design brief when hq-private holds no record line', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
    recordLine: null,
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `no design-brief.private.md under ${ctx.root}; hq defs shows the hq-private clone` });
});

test('it refuses an agent design brief over 4000 bytes with its byte count', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [] } },
    rows: [],
    kit: { ...buildStubSkillBriefKit(), 'agent-kit/agent-design-brief.md': `\`\`\`text\n${'Weigh the spout. '.repeat(250)}\n\`\`\`\n` },
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'too_long' });
});

test('it refuses an agent design brief when the private design brief has an empty record line', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [] } },
    rows: [],
    kit: buildStubSkillBriefKit(),
    recordLine: '',
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'bad_state', message: `${join(ctx.root, 'skills/delivery-lead/references/design-brief.private.md')} has no record line` });
});

test('it refuses an agent design brief when the design playbook is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [] } },
    rows: [],
    kit: buildStubSkillBriefKit({ without: ['agent-kit/playbooks/design.md'] }),
  });

  const outcome = runSkillBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', kind: 'design', repo: null });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `agent-kit/playbooks/design.md is missing at ${stub.sha}` });
});
