import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { finalPr } from './final-pr.ts';
import { findAlerts } from './find-alerts.ts';
import { listRuns } from './list-runs.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { resolveCliFinal } from './resolve-cli-final.ts';
import { reviewedPr } from './reviewed-pr.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  const finalSha = () => listRuns(fresh.db)[0]?.prs[0]?.final_sha;
  const eventData = () =>
    z
      .array(z.object({ data: z.string() }))
      .parse(fresh.db.query(`SELECT data FROM events WHERE action = 'final'`).all())
      .map((event) => z.record(z.string(), z.unknown()).parse(JSON.parse(event.data)));
  return { db: fresh.db, finalSha, eventData };
}

test('it refuses a sha that is no commit of the PR, naming the sha and the head', async () => {
  const ctx = setupTest();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '4423866e');

  expect(() => finalPr(ctx.db, 'kettle#714', { sha: '4423866e', actor: 'z-q', resolution })).toThrow(
    'the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha',
  );
  expect(ctx.finalSha()).toBeNull();
});

test('it stores a short sha as its full sha', async () => {
  const ctx = setupTest();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '44238662');

  finalPr(ctx.db, 'kettle#714', { sha: '44238662', actor: 'z-q', resolution });

  expect(ctx.finalSha()).toBe(head);
});

test('it keeps the sha as given beside the stored sha in the event', async () => {
  const ctx = setupTest();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '44238662');

  finalPr(ctx.db, 'kettle#714', { sha: '44238662', actor: 'z-q', resolution });

  expect(ctx.eventData()).toStrictEqual([
    {
      ref: 'kettle#714',
      sha: head,
      source: 'cli:z-q',
      note: null,
      given: '44238662',
      resolved: true,
    },
  ]);
});

test('it tells the reviewer the stored sha', async () => {
  const ctx = setupTest();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '44238662');

  finalPr(ctx.db, 'kettle#714', { sha: '44238662', actor: 'z-q', resolution });

  expect(ctx.db.query(`SELECT text FROM outbox WHERE target = 'z-review'`).all()).toStrictEqual([{ text: 'Final: GEO-9731 (kettle#714 at 4423866). Review it, then merge.' }]);
});

test('it records the sha of an earlier commit of the PR in full', async () => {
  const ctx = setupTest();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '1a2b3c4');

  finalPr(ctx.db, 'kettle#714', { sha: '1a2b3c4', actor: 'z-q', resolution });

  expect(ctx.finalSha()).toBe(early);
});

test('it shows the head as moved after a review at the head when the final is an earlier commit', async () => {
  const ctx = setupTest();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '1a2b3c4');
  finalPr(ctx.db, 'kettle#714', { sha: '1a2b3c4', actor: 'z-q', resolution });
  reviewedPr(ctx.db, 'kettle#714', head, { recheck: false, force: false }, 'z-delivery');

  const alerts = findAlerts(ctx.db, [], new Map(), new Date(Date.parse(NOON_SYDNEY) + 600 * 60_000));

  expect(alerts[0]?.line).toContain('head moved since your review');
});

test('it records the full sha of a commit no longer in the PR that the commit lookup finds', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const pushedAway = `ab12cd3${buildMockSha(3).slice(7)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head], lookups: { ab12cd3: pushedAway } }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', 'ab12cd3');

  finalPr(ctx.db, 'kettle#714', { sha: 'ab12cd3', actor: 'z-q', resolution });

  expect(ctx.finalSha()).toBe(pushedAway);
});

test('it refuses a prefix of two commits and lists both full shas', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const twin = `44238662${buildMockSha(4).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head, twin] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '44238662');

  expect(() => finalPr(ctx.db, 'kettle#714', { sha: '44238662', actor: 'z-q', resolution })).toThrow(`which matches 2 commits of zgeoff/kettle#714: ${head}, ${twin} - this sha is ambiguous`);
});

test('it records the sha as given when GitHub fails', async () => {
  const ctx = setupTest();
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: 'fault' }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '4423866e');

  finalPr(ctx.db, 'kettle#714', { sha: '4423866e', actor: 'z-q', resolution });

  expect(ctx.finalSha()).toBe('4423866e');
});

test('it says in the event that the sha was not resolved when GitHub fails', async () => {
  const ctx = setupTest();
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: 'fault' }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '4423866e');

  finalPr(ctx.db, 'kettle#714', { sha: '4423866e', actor: 'z-q', resolution });

  expect(ctx.eventData()).toStrictEqual([
    {
      ref: 'kettle#714',
      sha: '4423866e',
      source: 'cli:z-q',
      note: null,
      given: '4423866e',
      resolved: false,
      reason: 'gh: Bad Gateway (HTTP 502)',
    },
  ]);
});

test('it records the sha as given and unresolved when only the commit lookup fails', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head], lookupFault: true }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', '4423866e');

  finalPr(ctx.db, 'kettle#714', { sha: '4423866e', actor: 'z-q', resolution });

  expect(ctx.eventData()).toStrictEqual([
    {
      ref: 'kettle#714',
      sha: '4423866e',
      source: 'cli:z-q',
      note: null,
      given: '4423866e',
      resolved: false,
      reason: 'gh: Bad Gateway (HTTP 502)',
    },
  ]);
});

test('it refuses a sha that is no hex sha', () => {
  const ctx = setupTest();
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');

  expect(() => finalPr(ctx.db, 'kettle#714', { sha: 'nope', actor: 'z-q' })).toThrow('--sha must be a hex commit sha');
});

test('it reads GitHub not at all for a sha that is no hex sha', async () => {
  const calls: string[] = [];
  const resolveFinal = makeFinalResolver(buildStubFinalGH({}, calls));

  await resolveCliFinal(resolveFinal, 'kettle#714', 'nope');

  expect(calls).toStrictEqual([]);
});
