import { expect, onTestFinished, test } from 'bun:test';
import { FAKE_FULL_SHA, buildFakeRunner } from '../../test/noslop-fake.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import type { Flags } from '../cli.ts';
import { listNews } from '../news/list-news.ts';
import { readHeadExemption } from './read-head-exemption.ts';
import { runPRCommand } from './run-pr-command.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    exempt: async (repo: string, flags: Flags, actor = 'z-review') => {
      const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\nAGENTS.md\n', stderr: '' } });
      return await runPRCommand({ run: fake.run, db: fresh.db, verb: 'exempt', rest: [repo, '7'], flags, actor: () => Promise.resolve(actor), readOwnerSession: () => Promise.resolve({ verdict: 'other' }) });
    },
  };
}

test('it records an exemption at the head and says in the news line that hq did not prove it', async () => {
  const ctx = setupTest();

  await ctx.exempt('widgets', { rule: 'boundary', note: 'The kettle grant covers it.' });

  expect(readHeadExemption(ctx.db, 'widgets', 7, FAKE_FULL_SHA)).toMatchObject({ rule: 'boundary', note: 'The kettle grant covers it.' });
  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([
    { from_name: 'z-review', topic: 'merge', text: "z-review exempted widgets#7 at 0123456 from the instruction-file hold under the boundary rule (z-review's call, not proved by hq): skills/kettle/SKILL.md, AGENTS.md. Note: The kettle grant covers it." },
  ]);
});

test('it says a repo-sync exemption did not check the files against the sync source, and lists the files', async () => {
  const ctx = setupTest();

  await ctx.exempt('widgets', { rule: 'repo-sync', note: 'Sync from the tools tag.' });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ text: expect.stringContaining('hq did not check the files against the sync source): skills/kettle/SKILL.md, AGENTS.md') }]);
});

test('it keeps one news line to 400 characters', async () => {
  const ctx = setupTest();

  await ctx.exempt('widgets', { rule: 'rename', note: 'Renamed the kettle. '.repeat(40) });

  expect(listNews(ctx.db, { all: true, limit: 10 })[0]?.text).toHaveLength(400);
});

test.each([
  ['an unknown rule', { rule: 'whim', note: 'Because.' }],
  ['no rule', { note: 'Because.' }],
  ['no note', { rule: 'rename' }],
  ['a blank note', { rule: 'rename', note: '  ' }],
])('it refuses %s', async (_label, flags) => {
  const ctx = setupTest();

  await expect(ctx.exempt('widgets', flags)).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('usage: hq pr exempt') });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it refuses any actor but z-review', async () => {
  const ctx = setupTest();

  await expect(ctx.exempt('widgets', { rule: 'rename', note: 'Because.' }, 'z-kettle')).rejects.toMatchObject({ code: 'bad_args' });

  expect(readHeadExemption(ctx.db, 'widgets', 7, FAKE_FULL_SHA)).toBeNull();
});

test.each(['hq', 'hq-private'])('it refuses a PR in %s', async (repo) => {
  const ctx = setupTest();

  await expect(ctx.exempt(repo, { rule: 'rename', note: 'Because.' })).rejects.toMatchObject({ code: 'bad_args' });
});
