import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { shipRuns } from './ship-runs.ts';
import { getRun } from '../runs/get-run.ts';
import { setState } from '../runs/set-state.ts';
import { buildMockRelease } from '../../test/build-mock-release.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubSourceGH } from '../../test/build-stub-source-gh.ts';
import { createMergedRun } from '../../test/create-merged-run.ts';
import { NOON_SYDNEY, freshDb } from '../../test/helpers.ts';

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_LIVECHECK_TO', undefined));
  const calls: string[] = [];

  return {
    db: base.db,
    now: new Date(NOON_SYDNEY),
    calls,
    setMergedAt: (ref: string, mergedAt: string) => {
      base.db.query('UPDATE run_prs SET merged_at = ? WHERE ref = ?').run(mergedAt, ref);
    },
    readPr: (ref: string) => base.db.query('SELECT merge_sha, shipped_tag, shipped_at FROM run_prs WHERE ref = ?').get(ref),
  };
}

test('it ships a tools PR once the one package it changed has a release holding the merge, with the oldest such release', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-70', ['tools#5']);
  const run = buildStubSourceGH(
    {
      shas: { 'tools#5': buildMockSha(5) },
      contains: { 'alpha@1.0.0': [buildMockSha(5)], 'alpha@1.1.0': [buildMockSha(5)], 'beta@2.0.0': [buildMockSha(5)] },
      releases: { tools: [buildMockRelease('beta@2.0.0', '2026-10-17T00:00:00Z'), buildMockRelease('alpha@1.1.0', '2026-10-16T00:00:00Z'), buildMockRelease('alpha@1.0.0', '2026-10-15T00:00:00Z')] },
      config: { tools: { packages: { 'packages/alpha': { component: 'alpha' }, 'packages/beta': { 'package-name': 'beta' } } } },
      files: { 'tools#5': ['packages/alpha/src/a.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([{ issue: 'GEO-70', to: 'live-check', prs: [{ ref: 'tools#5', tag: 'alpha@1.0.0', shipped_at: '2026-10-15T00:00:00Z' }] }]);
  expect(ctx.readPr('tools#5')).toStrictEqual({ merge_sha: buildMockSha(5), shipped_tag: 'alpha@1.0.0', shipped_at: '2026-10-15T00:00:00Z' });
});

test('it moves no run whose shipment write failed, and reports the failure', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-72', ['tools#7']);
  ctx.db.run("CREATE TEMP TRIGGER refuse_shipment BEFORE UPDATE OF shipped_at ON run_prs WHEN NEW.shipped_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'invented: shipment refused'); END");
  const run = buildStubSourceGH(
    {
      shas: { 'tools#7': buildMockSha(7) },
      contains: { 'alpha@1.0.0': [buildMockSha(7)] },
      releases: { tools: [buildMockRelease('alpha@1.0.0', '2026-10-15T00:00:00Z')] },
      config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } },
      files: { 'tools#7': ['packages/alpha/src/a.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect([result.moved, result.shippedPrs, result.errors]).toStrictEqual([[], 0, ['tools#7: invented: shipment refused']]);
  expect(getRun(ctx.db, 'GEO-72')?.state).toBe('merged');
});

test('it waits on a tools PR while one of two changed packages has no release, then ships it with the latest-published one', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-71', ['tools#6']);
  const facts = {
    shas: { 'tools#6': buildMockSha(6) },
    contains: { 'alpha@1.0.0': [buildMockSha(6)] },
    releases: { tools: [buildMockRelease('alpha@1.0.0', '2026-10-15T00:00:00Z')] },
    config: { tools: { packages: { 'packages/alpha': { component: 'alpha' }, 'packages/beta': { 'package-name': 'beta' } } } },
    files: { 'tools#6': ['packages/alpha/a.ts', 'packages/beta/b.ts'] },
  };

  const first = await shipRuns(ctx.db, buildStubSourceGH(facts, ctx.calls), ctx.now);
  const waiting = getRun(ctx.db, 'GEO-71')?.state;
  const second = await shipRuns(
    ctx.db,
    buildStubSourceGH({ ...facts, contains: { 'alpha@1.0.0': [buildMockSha(6)], 'beta@3.0.0': [buildMockSha(6)] }, releases: { tools: [buildMockRelease('beta@3.0.0', '2026-10-18T00:00:00Z'), buildMockRelease('alpha@1.0.0', '2026-10-15T00:00:00Z')] } }, ctx.calls),
    ctx.now,
  );

  expect(first.moved).toStrictEqual([]);
  expect(waiting).toBe('merged');
  expect(second.moved[0]?.prs).toStrictEqual([{ ref: 'tools#6', tag: 'beta@3.0.0', shipped_at: '2026-10-18T00:00:00Z' }]);
});

test('it counts a noslop package at the repo root as changed by any file', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-72', ['noslop#2']);
  const run = buildStubSourceGH(
    {
      shas: { 'noslop#2': buildMockSha(2) },
      contains: { 'noslop@0.4.0': [buildMockSha(2)] },
      releases: { noslop: [buildMockRelease('noslop@0.4.0', '2026-10-15T00:00:00Z')] },
      config: { noslop: { packages: { '.': { 'package-name': 'noslop' } } } },
      files: { 'noslop#2': ['README.md'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved[0]?.prs).toStrictEqual([{ ref: 'noslop#2', tag: 'noslop@0.4.0', shipped_at: '2026-10-15T00:00:00Z' }]);
});

test('it ships a tools PR that changes no package at its merge time, with no tag and no release read', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-73', ['tools#7']);
  ctx.setMergedAt('tools#7', '2026-10-12T05:06:07Z');
  const run = buildStubSourceGH({ shas: { 'tools#7': buildMockSha(7) }, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } }, files: { 'tools#7': ['docs/readme.md'] } }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([{ issue: 'GEO-73', to: 'live-check', prs: [{ ref: 'tools#7', tag: null, shipped_at: '2026-10-12T05:06:07Z' }] }]);
  expect(ctx.readPr('tools#7')).toStrictEqual({ merge_sha: buildMockSha(7), shipped_tag: null, shipped_at: '2026-10-12T05:06:07Z' });
  expect(ctx.calls.filter((call) => call.includes('/releases'))).toStrictEqual([]);
});

test('it keeps a PR shipped at its merge with no tag on the next pass, with no gh call for it, while another PR of the run waits', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-74', ['tools#8', 'tools#9']);
  ctx.setMergedAt('tools#8', '2026-10-12T05:06:07Z');
  const facts = {
    shas: { 'tools#8': buildMockSha(8), 'tools#9': buildMockSha(9) },
    contains: {},
    releases: { tools: [] },
    config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } },
    files: { 'tools#8': ['docs/readme.md'], 'tools#9': ['packages/alpha/a.ts'] },
  };
  await shipRuns(ctx.db, buildStubSourceGH(facts, []), ctx.now);
  const calls: string[] = [];

  const second = await shipRuns(ctx.db, buildStubSourceGH(facts, calls), ctx.now);

  expect(second.shippedPrs).toBe(0);
  expect(ctx.readPr('tools#8')).toStrictEqual({ merge_sha: buildMockSha(8), shipped_tag: null, shipped_at: '2026-10-12T05:06:07Z' });
  expect(calls.filter((call) => call.includes('pulls/8/') || call.includes(`ref=${buildMockSha(8)}`) || call.includes(' 8 -R '))).toStrictEqual([]);
  expect(getRun(ctx.db, 'GEO-74')?.state).toBe('merged');
});

test('it does not count a draft or prerelease of the changed tools package', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-74', ['tools#8']);
  const run = buildStubSourceGH(
    {
      shas: { 'tools#8': buildMockSha(8) },
      contains: { 'alpha@2.0.0': [buildMockSha(8)], 'alpha@2.1.0': [buildMockSha(8)] },
      releases: { tools: [buildMockRelease('alpha@2.0.0', '2026-10-17T00:00:00Z', { prerelease: true }), buildMockRelease('alpha@2.1.0', '2026-10-17T01:00:00Z', { draft: true, published_at: null })] },
      config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } },
      files: { 'tools#8': ['packages/alpha/a.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(getRun(ctx.db, 'GEO-74')?.state).toBe('merged');
});

test('it records an error and moves nothing when GitHub has no release config for tools', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-75', ['tools#9']);
  const run = buildStubSourceGH({ shas: { 'tools#9': buildMockSha(9) }, contains: { 'alpha@1.0.0': [buildMockSha(9)] }, releases: { tools: [buildMockRelease('alpha@1.0.0', '2026-10-15T00:00:00Z')] }, files: { 'tools#9': ['packages/alpha/a.ts'] } }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors[0]).toContain('tools#9');
  expect(getRun(ctx.db, 'GEO-75')?.state).toBe('merged');
  expect(ctx.readPr('tools#9')).toStrictEqual({ merge_sha: buildMockSha(9), shipped_tag: null, shipped_at: null });
});

test('it records an error when the tools release list cannot be read', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-76', ['tools#10']);
  const run = buildStubSourceGH({ shas: { 'tools#10': buildMockSha(10) }, contains: {}, config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } }, files: { 'tools#10': ['packages/alpha/a.ts'] } }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors[0]).toStartWith('tools:');
});

test('it ships an hq PR once the clean installed build holds its merge', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-80', ['hq#30']);
  const commit = buildMockSha(2748);
  const run = buildStubSourceGH({ shas: { 'hq#30': buildMockSha(30) }, contains: { [commit]: [buildMockSha(30)] } }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now, { readBuild: () => ({ commit, dirty: false }) });

  expect(result.moved).toStrictEqual([{ issue: 'GEO-80', to: 'live-check', prs: [{ ref: 'hq#30', tag: `build:${commit.slice(0, 7)}`, shipped_at: NOON_SYDNEY }] }]);
  expect(result.errors).toStrictEqual([]);
});

test('it waits on an hq PR, with no error, when the installed build does not hold the merge', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-81', ['hq#31']);
  const commit = buildMockSha(2748);
  const run = buildStubSourceGH({ shas: { 'hq#31': buildMockSha(31) }, contains: { [commit]: [] } }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now, { readBuild: () => ({ commit, dirty: false }) });

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(ctx.readPr('hq#31')).toStrictEqual({ merge_sha: buildMockSha(31), shipped_tag: null, shipped_at: null });
});

test.each([
  ['a dirty build', { commit: buildMockSha(2748), dirty: true }],
  ['a build with an unknown dirty flag', { commit: buildMockSha(2748), dirty: null }],
  ['a source run', { commit: null, dirty: null }],
])('it waits on an hq PR, with no error and no compare, for %s', async (_name, build) => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-82', ['hq#32']);
  const run = buildStubSourceGH({ shas: { 'hq#32': buildMockSha(32) }, contains: { [buildMockSha(2748)]: [buildMockSha(32)] } }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now, { readBuild: () => build });

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(ctx.calls.filter((call) => call.includes('/compare/'))).toStrictEqual([]);
  expect(getRun(ctx.db, 'GEO-82')?.state).toBe('merged');
});

test('it ships a vers PR at its merge time', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-90', ['vers#4']);
  ctx.setMergedAt('vers#4', '2026-10-12T05:06:07Z');
  const run = buildStubSourceGH({ shas: { 'vers#4': buildMockSha(4) }, contains: {} }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([{ issue: 'GEO-90', to: 'live-check', prs: [{ ref: 'vers#4', tag: null, shipped_at: '2026-10-12T05:06:07Z' }] }]);
  expect(ctx.calls.filter((call) => call.includes('/compare/') || call.includes('/releases'))).toStrictEqual([]);
});

test('it moves no run when the message about the move cannot be queued, so the next pass moves it and tells of it', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-92', ['vers#6']);
  ctx.db.exec("CREATE TEMP TRIGGER refuse_shipped BEFORE INSERT ON outbox WHEN NEW.topic LIKE 'run-shipped:%' BEGIN SELECT RAISE(ABORT, 'invented refusal'); END");
  const failure = await shipRuns(ctx.db, buildStubSourceGH({ shas: { 'vers#6': buildMockSha(6) }, contains: {} }, ctx.calls), ctx.now).then(
    () => null,
    (error: unknown) => error,
  );
  const stateAfterFailure = getRun(ctx.db, 'GEO-92')?.state;
  ctx.db.exec('DROP TRIGGER refuse_shipped');

  await shipRuns(ctx.db, buildStubSourceGH({ shas: { 'vers#6': buildMockSha(6) }, contains: {} }, ctx.calls), ctx.now);

  expect(failure).toMatchObject({ message: 'invented refusal' });
  expect(stateAfterFailure).toBe('merged');
  expect(ctx.db.query("SELECT text FROM outbox WHERE target = 'z-qa'").all()).toStrictEqual([{ text: 'Shipped, now live-check: GEO-92 (vers#6 at merge). Run the live check, then hq run done GEO-92.' }]);
});

test('it tells a PR shipped at its merge as shipped at merge', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-91', ['vers#5']);
  const run = buildStubSourceGH({ shas: { 'vers#5': buildMockSha(5) }, contains: {} }, ctx.calls);

  await shipRuns(ctx.db, run, ctx.now);

  const texts = ctx.db.query("SELECT text FROM outbox WHERE target = 'z-qa'").all();
  expect(texts).toStrictEqual([{ text: 'Shipped, now live-check: GEO-91 (vers#5 at merge). Run the live check, then hq run done GEO-91.' }]);
});

test('it records an error and moves nothing when the tools release pages are not arrays', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-77', ['tools#11']);
  const run = buildStubSourceGH(
    {
      shas: { 'tools#11': buildMockSha(11) },
      contains: {},
      releases: { tools: { tag_name: 'alpha@1.0.0' } },
      config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } },
      files: { 'tools#11': ['packages/alpha/a.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual(['tools: releases of tools are not pages of releases']);
});

test('it reads no release config or file list for a tools PR once the release list of tools failed in the pass', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-78', ['tools#12', 'tools#13']);
  const run = buildStubSourceGH(
    {
      shas: { 'tools#12': buildMockSha(12), 'tools#13': buildMockSha(13) },
      contains: {},
      config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } },
      files: { 'tools#12': ['packages/alpha/a.ts'], 'tools#13': ['packages/alpha/b.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.errors).toStrictEqual(['tools: releases of tools failed (1): invented 404']);
  expect(ctx.calls.filter((call) => call.includes('release-please-config.json') || call.includes('/files'))).toStrictEqual([
    `gh api repos/zgeoff/tools/contents/release-please-config.json?ref=${buildMockSha(12)} --jq .content`,
    'gh api --paginate repos/zgeoff/tools/pulls/12/files?per_page=100 --jq .[] | [.filename, .previous_filename // empty] | @tsv',
  ]);
});

test('it defers a tools PR with no release config or file list read once the compare cap is spent', async () => {
  const ctx = setupTest();
  const numbers = Array.from({ length: 62 }, (_, index) => index + 1);
  for (const number of numbers) {
    createMergedRun(ctx.db, `GEO-${1000 + number}`, [`tools#${number}`]);
  }
  const run = buildStubSourceGH(
    {
      shas: Object.fromEntries(numbers.map((number) => [`tools#${number}`, buildMockSha(number)])),
      contains: { 'alpha@1.0.0': numbers.map((number) => buildMockSha(number)) },
      releases: { tools: [buildMockRelease('alpha@1.0.0', '2026-10-15T00:00:00Z')] },
      config: { tools: { packages: { 'packages/alpha': { component: 'alpha' } } } },
      files: Object.fromEntries(numbers.map((number) => [`tools#${number}`, ['packages/alpha/a.ts']])),
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.compares).toBe(60);
  expect(result.deferred).toBe(2);
  expect(ctx.calls.filter((call) => call.includes('release-please-config.json'))).toHaveLength(60);
  expect(ctx.calls.filter((call) => call.includes('/files?'))).toHaveLength(60);
});

test('it waits on an hq PR, with no error, when GitHub does not know the clean installed build', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-84', ['hq#33']);
  const commit = buildMockSha(2749);
  const run = buildStubSourceGH({ shas: { 'hq#33': buildMockSha(33) }, contains: {}, unknownHeads: [commit] }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now, { readBuild: () => ({ commit, dirty: false }) });

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(getRun(ctx.db, 'GEO-84')?.state).toBe('merged');
});

test('it leaves a run alone that was put in deploy-held after the release that holds its PR', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-91', ['vers#6']);
  ctx.setMergedAt('vers#6', '2026-10-12T05:06:07Z');
  setState(ctx.db, 'GEO-91', 'deploy-held', { next: 'Waits on the kettle host to switch.' }, 'z-release');
  const run = buildStubSourceGH({ shas: { 'vers#6': buildMockSha(6) }, contains: {} }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.held).toStrictEqual(['GEO-91']);
  expect(getRun(ctx.db, 'GEO-91')?.state).toBe('deploy-held');
});

test('it ships a run that was put in deploy-held before the release that holds its PR', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-92', ['vers#7']);
  ctx.setMergedAt('vers#7', '2026-10-15T05:06:07Z');
  setState(ctx.db, 'GEO-92', 'deploy-held', { next: 'Waits on the kettle release.' }, 'z-release');
  const run = buildStubSourceGH({ shas: { 'vers#7': buildMockSha(7) }, contains: {} }, ctx.calls);

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([{ issue: 'GEO-92', to: 'live-check', prs: [{ ref: 'vers#7', tag: null, shipped_at: '2026-10-15T05:06:07Z' }] }]);
  expect(result.held).toStrictEqual([]);
});

test('it ships a cloud PR that changes no host-build path once deployed/prod holds its merge, stamped with now', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9801', ['cloud#42']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#42': buildMockSha(42) },
      contains: { 'deployed/prod': [buildMockSha(42)] },
      tags: { 'deployed/prod': buildMockSha(4200) },
      gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n' },
      files: { 'cloud#42': ['infra/kettle.ts', 'docs/kettle.md'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([{ issue: 'GEO-9801', to: 'live-check', prs: [{ ref: 'cloud#42', tag: 'deployed/prod', shipped_at: NOON_SYDNEY }] }]);
  expect(ctx.calls.filter((call) => call.includes('deployed/host'))).toStrictEqual([]);
});

test('it leaves a cloud PR unshipped, with no file or gates read, while deployed/prod does not hold its merge', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9802', ['cloud#43']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#43': buildMockSha(43) },
      contains: { 'deployed/prod': [] },
      tags: { 'deployed/prod': buildMockSha(4200) },
      gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n' },
      files: { 'cloud#43': ['infra/kettle.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(ctx.calls.filter((call) => call.includes('/files?') || call.includes('gates.yml'))).toStrictEqual([]);
});

test('it asks deployed/prod again on every pass', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9803', ['cloud#44']);
  const facts = {
    shas: { 'cloud#44': buildMockSha(44) },
    contains: { 'deployed/prod': [] as string[] },
    tags: { 'deployed/prod': buildMockSha(4200) },
    gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n' },
    files: { 'cloud#44': ['infra/kettle.ts'] },
  };
  await shipRuns(ctx.db, buildStubSourceGH(facts, ctx.calls), ctx.now);
  facts.contains['deployed/prod'] = [buildMockSha(44)];

  const second = await shipRuns(ctx.db, buildStubSourceGH(facts, ctx.calls), ctx.now);

  expect(second.moved.map((move) => move.issue)).toStrictEqual(['GEO-9803']);
});

test('it waits on a cloud PR that changes a host-build path while only deployed/prod holds its merge', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9804', ['cloud#45']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#45': buildMockSha(45) },
      contains: { 'deployed/prod': [buildMockSha(45)], 'deployed/host': [] },
      tags: { 'deployed/prod': buildMockSha(4200) },
      gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n      - bun.lock\n' },
      files: { 'cloud#45': ['docs/kettle.md', 'nixos/hosts/kettle/configuration.nix'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(ctx.readPr('cloud#45')).toStrictEqual({ merge_sha: buildMockSha(45), shipped_tag: null, shipped_at: null });
});

test('it ships a cloud PR that changes a host-build path in deployed/host once both refs hold its merge', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9805', ['cloud#46']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#46': buildMockSha(46) },
      contains: { 'deployed/prod': [buildMockSha(46)], 'deployed/host': [buildMockSha(46)] },
      tags: { 'deployed/prod': buildMockSha(4200) },
      gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n      - bun.lock\n' },
      files: { 'cloud#46': ['bun.lock'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([{ issue: 'GEO-9805', to: 'live-check', prs: [{ ref: 'cloud#46', tag: 'deployed/host', shipped_at: NOON_SYDNEY }] }]);
});

test('it keeps a cloud PR that changes a host-build path unshipped, with no error, while deployed/host does not exist', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9806', ['cloud#47']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#47': buildMockSha(47) },
      contains: { 'deployed/prod': [buildMockSha(47)] },
      unknownHeads: ['deployed/host'],
      tags: { 'deployed/prod': buildMockSha(4200) },
      gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n' },
      files: { 'cloud#47': ['nixos/flake.lock'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual([]);
  expect(getRun(ctx.db, 'GEO-9806')?.state).toBe('merged');
});

test('it keeps a cloud PR unshipped and records the error when the gates file cannot be read', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9807', ['cloud#48']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#48': buildMockSha(48) },
      contains: { 'deployed/prod': [buildMockSha(48)], 'deployed/host': [buildMockSha(48)] },
      tags: { 'deployed/prod': buildMockSha(4200) },
      files: { 'cloud#48': ['infra/kettle.ts'] },
    },
    ctx.calls,
  );

  const result = await shipRuns(ctx.db, run, ctx.now);

  expect(result.moved).toStrictEqual([]);
  expect(result.errors).toStrictEqual(['cloud: gates of cloud failed (1): gh: Not Found (HTTP 404)']);
  expect(ctx.readPr('cloud#48')).toStrictEqual({ merge_sha: buildMockSha(48), shipped_tag: null, shipped_at: null });
});

test('it reads the gates file once in a pass for two cloud PRs', async () => {
  const ctx = setupTest();
  createMergedRun(ctx.db, 'GEO-9808', ['cloud#49']);
  createMergedRun(ctx.db, 'GEO-9809', ['cloud#50']);
  const run = buildStubSourceGH(
    {
      shas: { 'cloud#49': buildMockSha(49), 'cloud#50': buildMockSha(50) },
      contains: { 'deployed/prod': [buildMockSha(49), buildMockSha(50)] },
      tags: { 'deployed/prod': buildMockSha(4200) },
      gates: { cloud: 'gates:\n  nixos:\n    paths:\n      - nixos/**\n' },
      files: { 'cloud#49': ['infra/kettle.ts'], 'cloud#50': ['infra/teapot.ts'] },
    },
    ctx.calls,
  );

  await shipRuns(ctx.db, run, ctx.now);

  expect(ctx.calls.filter((call) => call.includes('gates.yml'))).toHaveLength(1);
});
