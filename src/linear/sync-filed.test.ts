import { expect, onTestFinished, test } from 'bun:test';
import { buildRecordingRunner } from '../../test/build-recording-runner.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { freshDb } from '../../test/helpers.ts';
import { listEvents } from '../list-events.ts';
import { syncFiled } from './sync-filed.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  const recording = buildRecordingRunner(buildStubGitHubFactsRunner({}));

  return { db: fresh.db, run: recording.run, commands: recording.commands };
}

test('it stores the PR attachment that opened before the issue, and skips one that opened after or has no open time', async () => {
  const ctx = setupTest();
  const read = await syncFiled(ctx.db, () => Promise.resolve({
    issues: {
      nodes: [
        {
          identifier: 'GEO-9871',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/41', metadata: { createdAt: '2026-10-21T09:00:00.000Z', status: 'merged' } }] },
        },
        {
          identifier: 'GEO-9872',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/42', metadata: { createdAt: '2026-10-21T13:00:00.000Z', status: 'open' } }] },
        },
        {
          identifier: 'GEO-9873',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/43', metadata: null }] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }), new Date('2026-10-21T00:00:00Z'), { to: new Date('2026-10-22T00:00:00Z'), run: ctx.run });

  expect(read).toBe(3);
  expect(ctx.db.query('SELECT issue, pr_ref FROM linear_filed ORDER BY issue').all()).toStrictEqual([
    { issue: 'GEO-9871', pr_ref: 'kettle#41' },
    { issue: 'GEO-9872', pr_ref: null },
    { issue: 'GEO-9873', pr_ref: null },
  ]);
});

test('it logs a failed read of an attachment PR description with the gh error, and still counts that PR as the source', async () => {
  const ctx = setupTest();
  await syncFiled(ctx.db, () => Promise.resolve({
    issues: {
      nodes: [
        {
          identifier: 'GEO-9874',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The kettle descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/44', metadata: { createdAt: '2026-10-21T09:00:00.000Z' } }] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }), new Date('2026-10-21T00:00:00Z'), { to: new Date('2026-10-22T00:00:00Z'), run: ctx.run });

  expect({ events: listEvents(ctx.db, 'pr-body-unread'), pointed: ctx.db.query('SELECT pr_ref FROM linear_filed').all() }).toStrictEqual({
    events: [{ subject: 'hq', subject_id: 'zgeoff/kettle#44', action: 'pr-body-unread', from_state: null, to_state: null, actor: 'hq', data: JSON.stringify({ issue: 'GEO-9874', reason: 'invented: no such PR' }) }],
    pointed: [{ pr_ref: 'kettle#44' }],
  });
});

test('it reads no PR description for an issue with a From or Found by line, or with only an attachment that opened after it', async () => {
  const ctx = setupTest();
  const earlier = { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/45', metadata: { createdAt: '2026-10-21T09:00:00.000Z' } }] };
  await syncFiled(ctx.db, () => Promise.resolve({
    issues: {
      nodes: [
        { identifier: 'GEO-9875', title: 'Invented kettle descaler', createdAt: '2026-10-21T12:00:00.000Z', description: 'From kettle#40\n\nThe descaler leaves a film.', creator: { app: false }, labels: { nodes: [] }, attachments: earlier },
        { identifier: 'GEO-9876', title: 'Invented kettle descaler', createdAt: '2026-10-21T12:00:00.000Z', description: 'The descaler leaves a film.\n\nFound by the GEO-9800 agent on kettle#40', creator: { app: false }, labels: { nodes: [] }, attachments: earlier },
        {
          identifier: 'GEO-9877',
          title: 'Invented kettle descaler',
          createdAt: '2026-10-21T12:00:00.000Z',
          description: 'The descaler leaves a film.',
          creator: { app: false },
          labels: { nodes: [] },
          attachments: { nodes: [{ url: 'https://github.com/zgeoff/kettle/pull/46', metadata: { createdAt: '2026-10-21T13:00:00.000Z' } }] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }), new Date('2026-10-21T00:00:00Z'), { to: new Date('2026-10-22T00:00:00Z'), run: ctx.run });

  expect(ctx.commands.filter((command) => command[1] === 'pr' && command[2] === 'view')).toStrictEqual([]);
});
