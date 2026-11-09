import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedLinearIssueOfUnknownType } from './seed-linear-issue-of-unknown-type.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readIssues: () => fresh.db.query('SELECT issue, type, title, state FROM linear_issues ORDER BY issue').all() };
}

test('#seedLinearIssueOfUnknownType stores an issue under the type name it is given, and input overrides apply', () => {
  const ctx = setupTest();

  seedLinearIssueOfUnknownType(ctx, { issue: 'GEO-9', type: 'constructor', state: 'open' });

  expect(ctx.readIssues()).toStrictEqual([{ issue: 'GEO-9', type: 'constructor', title: 'Descale the kettle', state: 'open' }]);
});

test('#seedLinearIssueOfUnknownType replaces the type an issue already holds', () => {
  const ctx = setupTest();
  seedLinearIssueOfUnknownType(ctx, { issue: 'GEO-9', type: 'constructor' });

  seedLinearIssueOfUnknownType(ctx, { issue: 'GEO-9', type: 'toString' });

  expect(ctx.readIssues()).toMatchObject([{ issue: 'GEO-9', type: 'toString' }]);
});
