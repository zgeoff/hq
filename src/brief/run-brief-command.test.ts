import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKettleIssueText } from '../../test/build-kettle-issue-text.ts';
import { buildStubBriefKit } from '../../test/build-stub-brief-kit.ts';
import { PRIVATE_MARKER, createStubBriefDeps } from '../../test/create-stub-brief-deps.ts';
import { runBriefCommand } from './run-brief-command.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-run-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it fills the template for a Bug with Code delivery only, and gives the prompt as the text', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo> and open a PR.']],
  });
  const command = `gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${stub.sha}' -H 'Accept: application/vnd.github.raw'`;

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).toBe(
    `/goal A ready PR in zgeoff/cloud for GEO-9001. First read the bug playbook: ${command}\n\n## Outcome\n\nA kettle that boils.\n\n## Context\n\nIt leaks at the lid.\n\n## Scope\n\nIn: the lid.\nOut: none stated.\n\n## Acceptance\n\n- [ ] it boils\n\n## Agent notes\n\nMind the seal.\n\nPermissions:\nWork in cloud and open a PR.\n\n\nFinish line: a ready PR in zgeoff/cloud whose description holds "Fixes GEO-9001".\nBoil the water.  Leave the lid to me.\n\nSend a note when done.`,
  );
  expect(out.data).toStrictEqual({
    issue: 'GEO-9001',
    repo: 'zgeoff/cloud',
    ref: stub.sha,
    prompt: out.text,
    bytes: Buffer.byteLength(out.text),
    cuts: [],
    playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command },
    goalFile: null,
    unfilled: [],
  });
  expect(stub.warnings).toStrictEqual([]);
});

test('it adds the stack line, from the files at the resolved sha, for a size L issue', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }, { name: 'L', parent: 'Size' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).toContain('Work in cloud.\n\nSTACK-LINE: build this in layers.\nFinish line:');
});

test('it leaves the stack line out for a size M issue, and never reads briefs.md', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }, { name: 'M', parent: 'Size' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).not.toContain('STACK-LINE');
  expect(stub.calls.some((call) => call.includes('briefs.md'))).toBe(false);
});

test('it adds the review lines, with the repo filled in and <n> left, for a repo noslop reviews', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'tools' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
    noslop: ['Tools'],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).toContain('Boil the water. REVIEW-LINES: list findings with gh api repos/zgeoff/tools/pulls/<n>/comments. Leave the lid to me.');
});

test('it leaves the review lines out for a repo noslop does not review, and never reads review-lines.md', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
    noslop: ['tools'],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).not.toContain('REVIEW-LINES');
  expect(stub.calls.some((call) => call.includes('review-lines.md'))).toBe(false);
});

test('it adds the imp line with --imp', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: true, byLink: false, goalFile: null });

  expect(out.text).toContain('Leave the lid to me.\nIMP-LINE: this imp has a small kettle.\nSend a note');
});

test('it writes Contributes to and lists not_yours when the Actions include Deploy', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Code delivery\nDeploy: kettle stage, after CI passes on main' }), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.'], ['Deploy', 'Deploy to the kettle stage.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).toContain('holds "Contributes to GEO-9001"');
  expect(out.text).toContain('Work in cloud.\nDeploy to the kettle stage.\n');
  expect(out.data['unfilled']).toStrictEqual(['not_yours']);
});

test('it writes Contributes to when the Actions include Infra', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Code delivery\nInfra: the kettle stack' }), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.'], ['Infra', 'Change the kettle stack.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).toContain('holds "Contributes to GEO-9001"');
});

test('it lists a phrase with a leftover slot, and an action with no wording, in unfilled', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ actions: 'Code delivery\nCredentials: kettle vault\nLinear edits: the kettle doc' }), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.'], ['Credentials', 'Read <vault> for <credential>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text).toContain('Permissions:\nWork in cloud.\nRead <vault> for <credential>.\n');
  expect(out.data['unfilled']).toStrictEqual(['permissions:Credentials', 'permissions:Linear edits (no wording)']);
});

test('it pins the playbook pointer to the full sha of the ref and checks the file at that sha', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
    refs: ['refactor/kettle-rebuild'],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'refactor/kettle-rebuild', imp: false, byLink: false, goalFile: null });

  expect(out.text.split('\n')[0]).toBe(
    `/goal A ready PR in zgeoff/cloud for GEO-9001. First read the bug playbook: gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${stub.sha}' -H 'Accept: application/vnd.github.raw'`,
  );
  expect(out.data['ref']).toBe(stub.sha);
  expect(stub.calls).toContain(`gh api repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${stub.sha} -H Accept: application/vnd.github.raw`);
});

test('it carries on with no playbook pointer, lists playbook and warns when the issue has no Type label', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.text.split('\n')[0]).toBe('/goal A ready PR in zgeoff/cloud for GEO-9001');
  expect(out.data['playbook']).toBeNull();
  expect(out.data['unfilled']).toStrictEqual(['playbook']);
  expect(stub.warnings).toStrictEqual(['hq brief: GEO-9001 has no Type label, so the brief carries no playbook pointer']);
});

test('it does the same for a Type whose playbook file is missing at the sha', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Improvement', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.data['playbook']).toBeNull();
  expect(out.data['unfilled']).toStrictEqual(['playbook']);
  expect(stub.warnings).toStrictEqual(['hq brief: no agent-kit/playbooks/improvement.md at 0000000, so the brief carries no playbook pointer']);
});

test('it empties the issue and tells the agent to read it by link with --issue-by-link', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null });

  expect(out.text.split('\n')[0]).toBe(
    `/goal A ready PR in zgeoff/cloud for GEO-9001. First read GEO-9001 with your own Linear access, then the bug playbook: gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${stub.sha}' -H 'Accept: application/vnd.github.raw'`,
  );
  expect(out.text).not.toContain('A kettle that boils.');
  expect(out.data['unfilled']).toStrictEqual([]);
});

test('it writes the issue and playbook to the file and points to it with --goal-file', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });
  const goalFile = join(ctx.root, 'goal.md');

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile });

  expect(out.text.split('\n')[0]).toBe(`/goal A ready PR in zgeoff/cloud for GEO-9001. The full issue and its playbook are in ${goalFile}; read it first.`);
  expect(out.text).not.toContain('A kettle that boils.');
  expect(out.data['goalFile']).toBe(goalFile);
  expect(readFileSync(goalFile, 'utf8')).toBe(
    '# GEO-9001\n\n## Outcome\n\nA kettle that boils.\n\n## Context\n\nIt leaks at the lid.\n\n## Scope\n\nIn: the lid.\nOut: none stated.\n\n## Acceptance\n\n- [ ] it boils\n\n## Agent notes\n\nMind the seal.\n\n---\n\n# Bug playbook\n\nReproduce the leak first.\n',
  );
});

test('it refuses a --goal-file in a missing directory before it reads anything', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, { issues: {}, rows: [] });

  const outcome = runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: join(ctx.root, 'gone/goal.md') });

  expect(outcome).rejects.toMatchObject({ code: 'bad_args' });
  expect(stub.asked).toStrictEqual([]);
  expect(stub.calls).toStrictEqual([]);
});

test('it drops Context and Agent notes as cut 2, and reports it, when the issue pushes the prompt over 4000 bytes', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ context: 'It leaks at the lid. '.repeat(200) }), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.data['cuts']).toStrictEqual(['cut 1 unavailable', 'cut 2']);
  expect(out.text).not.toContain('## Context');
  expect(out.text).not.toContain('## Agent notes');
  expect(out.text).toContain('## Acceptance');
  expect(out.data['bytes']).toBeLessThanOrEqual(4000);
});

test('it applies cut 3 after cut 2, keeping the playbook pointer, when the issue is still too long', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText({ scope: 'In: the lid. '.repeat(273) }), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(out.data['cuts']).toStrictEqual(['cut 1 unavailable', 'cut 2', 'cut 3']);
  expect(out.text.startsWith(`First read the bug playbook: gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${stub.sha}'`)).toBe(true);
  expect(out.data['bytes']).toBeLessThanOrEqual(4000);
});

test('it refuses a prompt still over 4000 bytes after cut 3, with its byte count, and writes no goal file', () => {
  const ctx = setupTest();
  const template = buildStubBriefKit()['agent-kit/brief.md'] ?? '';
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
    kit: { ...buildStubBriefKit(), 'agent-kit/brief.md': template.replace('Send a note when done.', 'Send a note when done. '.repeat(300)) },
  });
  const goalFile = join(ctx.root, 'goal.md');

  const outcome = runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile });

  expect(outcome).rejects.toMatchObject({ code: 'too_long', message: expect.stringMatching(/^the brief is 7\d{3} bytes after every cut, over the 4000 limit$/u) });
  expect(existsSync(goalFile)).toBe(false);
});

test('it refuses with the --ref hint when brief.md is missing at the sha', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
    kit: buildStubBriefKit({ without: ['agent-kit/brief.md'] }),
  });

  const outcome = runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(outcome).rejects.toMatchObject({ code: 'not_found', message: `agent-kit/brief.md is missing at ${stub.sha}; pass --ref refactor/fleet-skill-rebuild until the skill rebuild merges` });
});

test('it never prints a section of the private file outside the permission table', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const out = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: true, byLink: false, goalFile: null });

  expect(JSON.stringify(out)).not.toContain(PRIVATE_MARKER);
  expect(JSON.stringify(out)).not.toContain('Opening text.');
  expect(stub.warnings).toStrictEqual([]);
});

test('it lists a missing Outcome, Scope or Acceptance section in unfilled, but not with --issue-by-link', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, {
    issues: { 'GEO-9001': { description: '## Outcome\n\nBoil.\n\n## Actions\n\nCode delivery\n', labels: [{ name: 'Bug', parent: 'Type' }, { name: 'cloud' }] } },
    rows: [['Code delivery', 'Work in <repo>.']],
  });

  const plain = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });
  const byLink = await runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null });

  expect(plain.data['unfilled']).toStrictEqual(['issue:Scope', 'issue:Acceptance']);
  expect(byLink.data['unfilled']).toStrictEqual([]);
});

test('it refuses an issue with no area label, since none names a repo', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, { issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'Bug', parent: 'Type' }] } }, rows: [] });

  const outcome = runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(outcome).rejects.toMatchObject({ code: 'bad_state', message: 'GEO-9001 needs exactly one area label to name its repo; it has none' });
});

test('it refuses an issue with two area labels, since neither names the repo', () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, { issues: { 'GEO-9001': { description: buildKettleIssueText(), labels: [{ name: 'cloud' }, { name: 'imp' }] } }, rows: [] });

  const outcome = runBriefCommand(stub.deps, { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null });

  expect(outcome).rejects.toMatchObject({ code: 'bad_state', message: 'GEO-9001 needs exactly one area label to name its repo; it has cloud, imp' });
});
