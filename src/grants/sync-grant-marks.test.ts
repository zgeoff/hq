import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { NOON_SYDNEY, at } from '../../test/helpers.ts';
import { createGrantMark } from './create-grant-mark.ts';
import { readGrantMarksCheck } from './read-grant-marks-check.ts';
import { syncGrantMarks } from './sync-grant-marks.ts';

function setupTest() {
  const ctx = createTreeFixture();
  const boil = '- id: boil\n  label: "Boil"\n  outcome: allow\n';
  const tree = ctx.createPrivate({ 'grants/z-kettle.yaml': boil });
  at(NOON_SYDNEY);
  return {
    db: ctx.db,
    tree,
    boil,
    boilAndPour: `${boil}- id: boil-twice\n  label: "Boil twice"\n  outcome: allow\n- id: pour\n  label: "Pour"\n  outcome: allow\n`,
    selectGrantMarks: () => ctx.db.query("SELECT at, text, ref, grant_name, added_by FROM marks WHERE kind = 'grant' ORDER BY grant_name").all(),
  };
}

test('a merged PR that adds a grant gives it a mark named for the session and id, at the merge time, with the PR as the ref', () => {
  const ctx = setupTest();
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': ctx.boilAndPour }, { subject: 'feat(grants): let z-kettle pour (#12)', at: '2026-10-13T22:30:00+11:00' });
  ctx.tree.git('fetch', '-q', 'origin');
  createGrantMark(ctx.db, { text: 'z-kettle may boil', ref: null, at: null, name: 'z-kettle-boil', actor: 'z-kettle' });

  const sync = syncGrantMarks(ctx.db, ctx.tree.dir, 'hq-watcher');

  expect(sync.unmarked).toStrictEqual([]);
  expect(ctx.selectGrantMarks()).toStrictEqual([
    { at: '2026-10-14T01:00:00Z', text: 'z-kettle may boil', ref: null, grant_name: 'z-kettle-boil', added_by: 'z-kettle' },
    { at: '2026-10-13T11:30:00Z', text: "z-kettle's Boil twice grant (grants/z-kettle.yaml)", ref: 'hq-private#12', grant_name: 'z-kettle-boil-twice', added_by: 'hq-watcher' },
    { at: '2026-10-13T11:30:00Z', text: "z-kettle's Pour grant (grants/z-kettle.yaml)", ref: 'hq-private#12', grant_name: 'z-kettle-pour', added_by: 'hq-watcher' },
  ]);
});

test('a grant removed and added again takes the time and PR of the later add', () => {
  const ctx = setupTest();
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': ctx.boilAndPour }, { subject: 'feat(grants): let z-kettle pour (#12)', at: '2026-10-10T09:00:00Z' });
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': ctx.boil }, { subject: 'feat(grants): stop z-kettle pouring (#13)', at: '2026-10-11T09:00:00Z' });
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': ctx.boilAndPour }, { subject: 'feat(grants): let z-kettle pour again (#14)', at: '2026-10-12T09:00:00Z' });
  ctx.tree.git('fetch', '-q', 'origin');

  syncGrantMarks(ctx.db, ctx.tree.dir, 'hq-watcher');

  expect(ctx.db.query("SELECT at, ref FROM marks WHERE grant_name = 'z-kettle-pour'").all()).toStrictEqual([{ at: '2026-10-12T09:00:00Z', ref: 'hq-private#14' }]);
});

test('a grant whose id is quoted takes the PR that added it, not a later change that only reformats the file', () => {
  const ctx = setupTest();
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': `${ctx.boil}- id: "pour"\n  label: "Pour"\n  outcome: allow\n` }, { subject: 'feat(grants): let z-kettle pour (#12)', at: '2026-10-10T09:00:00Z' });
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': `# z-kettle's grants\n${ctx.boil}- id: 'pour'\n  label: Pour\n  outcome: allow\n` }, { subject: 'docs(grants): tidy the quotes (#13)', at: '2026-10-11T09:00:00Z' });
  ctx.tree.git('fetch', '-q', 'origin');

  syncGrantMarks(ctx.db, ctx.tree.dir, 'hq-watcher');

  expect(ctx.db.query("SELECT at, ref FROM marks WHERE grant_name = 'z-kettle-pour'").all()).toStrictEqual([{ at: '2026-10-10T09:00:00Z', ref: 'hq-private#12' }]);
});

test('a grant whose add names no PR gets no mark, and the health check names it', () => {
  const ctx = setupTest();
  createGrantMark(ctx.db, { text: 'z-kettle may boil', ref: null, at: null, name: 'z-kettle-boil', actor: 'z-kettle' });
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': ctx.boilAndPour }, { subject: 'feat(grants): let z-kettle pour', at: '2026-10-13T09:00:00Z' });
  ctx.tree.git('fetch', '-q', 'origin');

  const sync = syncGrantMarks(ctx.db, ctx.tree.dir, 'hq-watcher');

  expect(sync.added).toStrictEqual([]);
  expect(sync.unmarked.map((grant) => grant.name)).toStrictEqual(['z-kettle-boil-twice', 'z-kettle-pour']);
  expect(readGrantMarksCheck(ctx.db, ctx.tree.dir)).toStrictEqual({
    key: 'grant-marks',
    ok: false,
    line: 'grant marks: 2 grant(s) on hq-private main have none, so hq grant act refuses them: z-kettle-boil-twice, z-kettle-pour',
  });
});

test('the health check passes once every grant has a mark, and reads only what main holds', () => {
  const ctx = setupTest();
  createGrantMark(ctx.db, { text: 'z-kettle may boil', ref: null, at: null, name: 'z-kettle-boil', actor: 'z-kettle' });
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': ctx.boilAndPour }, { subject: 'feat(grants): let z-kettle pour (#12)', at: '2026-10-13T09:00:00Z' });

  expect(readGrantMarksCheck(ctx.db, ctx.tree.dir)).toStrictEqual({ key: 'grant-marks', ok: true, line: 'grant marks: all 1 grants on hq-private main have one' });
});

test('the health check reports a grants file it cannot read, and stays quiet with no clone', () => {
  const ctx = setupTest();
  ctx.tree.writeCommit({ 'grants/z-kettle.yaml': 'boil: yes\n' }, { subject: 'chore: break the grants (#15)', at: '2026-10-13T09:00:00Z' });
  ctx.tree.git('fetch', '-q', 'origin');

  expect(readGrantMarksCheck(ctx.db, ctx.tree.dir)).toStrictEqual({
    key: 'grant-marks',
    ok: false,
    line: "grant marks: can't read hq-private's grants: grants/z-kettle.yaml at hq-private main is not a list of grants with an id and a label",
  });
  expect(readGrantMarksCheck(ctx.db, `${ctx.tree.dir}-missing`)).toBeNull();
});
