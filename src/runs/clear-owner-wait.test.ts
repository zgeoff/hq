import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-16T07:00:00Z'));
  return {
    db: fresh.db,
    readWait: (issue: string) => fresh.db.query('SELECT waits_on, waits_on_geoff FROM runs WHERE issue = ?').get(issue),
    readEvents: () => z.array(z.object({ actor: z.string(), data: z.string() })).parse(fresh.db.query("SELECT actor, data FROM events WHERE action = 'owner-wait-cleared'").all()).map((row) => ({ actor: row.actor, data: z.unknown().parse(JSON.parse(row.data)) })),
  };
}

test('it clears the wait on merging the PR it names, and logs the PR and the named rule', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9731', 'kettle#61', 'z-delivery');
  addPr(ctx.db, 'GEO-9731', 'kettle#62', 'z-delivery');
  setState(ctx.db, 'GEO-9731', 'working', { waitsOn: 'owner to merge kettle#61', waitsOnGeoff: true }, 'z-delivery');

  closePr(ctx.db, 'kettle#61', { to: 'merged', actor: 'z-review' });

  expect({ wait: ctx.readWait('GEO-9731'), events: ctx.readEvents() }).toStrictEqual({
    wait: { waits_on: null, waits_on_geoff: 0 },
    events: [{ actor: 'z-review', data: { ref: 'kettle#61', waitsOn: 'owner to merge kettle#61', rule: 'named' } }],
  });
});

test('it clears a wait that names no PR on merging the last open PR', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9732', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9732', 'kettle#63', 'z-delivery');
  addPr(ctx.db, 'GEO-9732', 'kettle#64', 'z-delivery');
  setState(ctx.db, 'GEO-9732', 'working', { waitsOn: 'owner to check the kettle', waitsOnGeoff: true }, 'z-delivery');

  closePr(ctx.db, 'kettle#63', { to: 'merged', actor: 'z-review' });
  const kept = ctx.readWait('GEO-9732');
  closePr(ctx.db, 'kettle#64', { to: 'merged', actor: 'z-review' });

  expect({ kept, wait: ctx.readWait('GEO-9732'), events: ctx.readEvents() }).toStrictEqual({
    kept: { waits_on: 'owner to check the kettle', waits_on_geoff: 1 },
    wait: { waits_on: null, waits_on_geoff: 0 },
    events: [{ actor: 'z-review', data: { ref: 'kettle#64', waitsOn: 'owner to check the kettle', rule: 'last-open' } }],
  });
});

test('it keeps a wait on merging a PR it does not name while another PR is open', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9733', 'kettle#65', 'z-delivery');
  addPr(ctx.db, 'GEO-9733', 'kettle#66', 'z-delivery');
  setState(ctx.db, 'GEO-9733', 'working', { waitsOn: 'owner to merge kettle#66', waitsOnGeoff: true }, 'z-delivery');

  closePr(ctx.db, 'kettle#65', { to: 'merged', actor: 'z-review' });

  expect({ wait: ctx.readWait('GEO-9733'), events: ctx.readEvents() }).toStrictEqual({ wait: { waits_on: 'owner to merge kettle#66', waits_on_geoff: 1 }, events: [] });
});
