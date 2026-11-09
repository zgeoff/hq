import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../../test/helpers.ts';
import { readReadySnapshot } from '../read-ready-snapshot.ts';
import { seedReadyIssues } from './seed-ready-issues.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  return { db: fresh.db, readReadyIdentifiers: () => readReadySnapshot(fresh.db)?.eligible.map((issue) => issue.identifier) };
}

test('#seedReadyIssues stores the Ready issues the board lists, in order', async () => {
  const ctx = setupTest();

  await seedReadyIssues(ctx, [
    { identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
    { identifier: 'GEO-9802', project: 'kettle roadmap', type: 'Bug', labels: ['vers'], priority: 3 },
  ]);

  expect(ctx.readReadyIdentifiers()).toStrictEqual(['GEO-9801', 'GEO-9802']);
});

test('#seedReadyIssues replaces the issues a former read stored', async () => {
  const ctx = setupTest();
  await seedReadyIssues(ctx, [{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);

  await seedReadyIssues(ctx, [{ identifier: 'GEO-9802', project: 'kettle roadmap', type: 'Bug', labels: ['vers'], priority: 3 }]);

  expect(ctx.readReadyIdentifiers()).toStrictEqual(['GEO-9802']);
});
