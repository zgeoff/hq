import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPermissionTable } from '../src/brief/read-permission-table.ts';
import { buildMockSha } from './build-mock-sha.ts';
import { createStubBriefDeps } from './create-stub-brief-deps.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-stub-deps-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it wires the private checkout, the noslop list and the sha, and a warning goes into the list', () => {
  const ctx = setupTest();

  const stub = createStubBriefDeps(ctx.root, { issues: {}, rows: [['Code delivery', 'Work in <repo>.']], noslop: ['tools'] });
  stub.deps.warn('kettle warning');

  expect(readPermissionTable(stub.deps.files, stub.deps.privateDir)).toStrictEqual([{ action: 'Code delivery', phrase: 'Work in <repo>.' }]);
  expect(stub.deps.noslop).toStrictEqual({ repos: ['tools'], sha: null, caps: {} });
  expect(stub.sha).toBe(buildMockSha(2748));
  expect(stub.warnings).toStrictEqual(['kettle warning']);
});

test('it answers Linear with the issues and gh with the kit at the sha for each ref, and records the calls', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, { issues: { 'GEO-9001': { description: 'x', labels: [] } }, rows: [], refs: ['main', 'kettle-branch'] });

  const issue = await stub.deps.linear('query', { identifier: 'GEO-9001' });
  const commit = await stub.deps.run(['gh', 'api', 'repos/zgeoff/hq/commits/kettle-branch', '--jq', '.sha']);

  expect(issue).toStrictEqual({ issue: { identifier: 'GEO-9001', description: 'x', labels: { nodes: [] } } });
  expect(commit.stdout).toBe(`${buildMockSha(2748)}\n`);
  expect(stub.asked).toStrictEqual(['GEO-9001']);
  expect(stub.calls).toStrictEqual(['gh api repos/zgeoff/hq/commits/kettle-branch --jq .sha']);
});

test('it uses the kit it is given in place of the whole one', async () => {
  const ctx = setupTest();
  const stub = createStubBriefDeps(ctx.root, { issues: {}, rows: [], kit: { 'agent-kit/only.md': 'only\n' } });

  const only = await stub.deps.run(['gh', 'api', `repos/zgeoff/hq/contents/agent-kit/only.md?ref=${stub.sha}`, '-H', 'Accept: application/vnd.github.raw']);
  const brief = await stub.deps.run(['gh', 'api', `repos/zgeoff/hq/contents/agent-kit/brief.md?ref=${stub.sha}`, '-H', 'Accept: application/vnd.github.raw']);

  expect(only.stdout).toBe('only\n');
  expect(brief.code).toBe(1);
});
