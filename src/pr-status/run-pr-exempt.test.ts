import { expect, onTestFinished, test } from 'bun:test';
import { FAKE_FULL_SHA, buildFakeRunner } from '../../test/noslop-fake.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { listNews } from '../news/list-news.ts';
import { readHeadExemption } from './read-head-exemption.ts';
import { runPRCommand } from './run-pr-command.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it records an exemption at the head and says in the news line that hq did not prove it', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\nAGENTS.md\n', stderr: '' } });

  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'boundary', note: 'The kettle grant covers it.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(readHeadExemption(ctx.db, 'widgets', 7, FAKE_FULL_SHA)).toMatchObject({ rule: 'boundary', note: 'The kettle grant covers it.', files: ['skills/kettle/SKILL.md', 'AGENTS.md'] });
  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([
    { from_name: 'z-review', topic: 'merge', text: "z-review exempted widgets#7 at 0123456 from the instruction-file hold under the boundary rule (z-review's call, not proved by hq): skills/kettle/SKILL.md, AGENTS.md. Note: The kettle grant covers it." },
  ]);
});

test('it says a repo-sync exemption did not check the files against the sync source, and lists the files', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\nAGENTS.md\n', stderr: '' } });

  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'repo-sync', note: 'Sync from the tools tag.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ text: expect.stringContaining('hq did not check the files against the sync source): skills/kettle/SKILL.md, AGENTS.md') }]);
});

test('it lists every held file in a repo-sync news line, however many the PR changes', async () => {
  const ctx = setupTest();
  const files = ['AGENTS.md', 'skills/kettle/SKILL.md', 'skills/teapot/SKILL.md', 'skills/steam/SKILL.md', 'skills/whistle/SKILL.md'];
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: `${files.join('\n')}\n`, stderr: '' } });

  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'repo-sync', note: 'Sync from the tools tag.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ text: expect.stringContaining(`sync source): ${files.join(', ')}.`) }]);
});

test('it points a repo-sync news line to hq pr status when the file list is too long, and hq pr status lists every file', async () => {
  const ctx = setupTest();
  const files = Array.from({ length: 12 }, (_value, index) => `skills/kettle-${index}/SKILL.md`);
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: `${files.join('\n')}\n`, stderr: '' } });
  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'repo-sync', note: 'Sync from the tools tag.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });
  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-review'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  const status = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ text: expect.stringContaining('12 held files, all listed by hq pr status widgets 7') }]);
  expect(status.text).toContain(`(held files: ${files.join(', ')})`);
});

test('it shows the exemption in hq pr status for a fresh PR with no other record', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });
  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'formatting', note: 'Only blank lines moved.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  const status = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(status).toStrictEqual({
    data: { pr: null, reviewRecords: { mechanical: null, exemption: { rule: 'formatting', note: 'Only blank lines moved.', files: ['skills/kettle/SKILL.md'] } } },
    text: 'No record for widgets#7.\nz-review: exempt under the formatting rule, not proved by hq: Only blank lines moved. (held files: skills/kettle/SKILL.md)',
  });
});

test('it keeps one news line to 400 characters', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\nAGENTS.md\n', stderr: '' } });

  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'rename', note: 'Renamed the kettle. '.repeat(40) }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(listNews(ctx.db, { all: true, limit: 10 })[0]?.text).toHaveLength(400);
});

test.each([
  ['an unknown rule', { rule: 'whim', note: 'Because.' }],
  ['no rule', { note: 'Because.' }],
  ['no note', { rule: 'rename' }],
  ['a blank note', { rule: 'rename', note: '  ' }],
])('it refuses %s', async (_label, flags) => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({
    code: 'bad_args',
    message: expect.stringContaining('usage: hq pr exempt'),
  });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it refuses any actor but z-review', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'rename', note: 'Because.' }, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args' });

  expect(readHeadExemption(ctx.db, 'widgets', 7, FAKE_FULL_SHA)).toBeNull();
});

test.each([
  { name: 'another session', probe: { verdict: 'other' as const }, reason: "only z-review's own atc session records this; this session is not it" },
  { name: 'a session atc cannot check', probe: { verdict: 'unknown' as const, cause: 'connect ENOENT /run/teapot.sock' }, reason: "hq could not check through atc that this is z-review's session (connect ENOENT /run/teapot.sock), so no record is stored" },
])('it refuses $name even when the actor says z-review', async (row) => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: ['widgets', '7'], flags: { rule: 'rename', note: 'Because.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve(row.probe) })).rejects.toMatchObject({ code: 'bad_args', message: row.reason });

  expect(readHeadExemption(ctx.db, 'widgets', 7, FAKE_FULL_SHA)).toBeNull();
});

test.each(['hq', 'hq-private'])('it refuses a PR in %s', async (repo) => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'exempt', rest: [repo, '7'], flags: { rule: 'rename', note: 'Because.' }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args' });
});
