import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { setState } from './set-state.ts';

// A working run, GEO-9731, with PRs kettle#61 and kettle#62 open and an owner wait.
function setupTest(waitsOn: string) {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-16T07:00:00Z'));
  addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9731', 'kettle#61', 'z-delivery');
  addPr(fresh.db, 'GEO-9731', 'kettle#62', 'z-delivery');
  setState(fresh.db, 'GEO-9731', 'working', { waitsOn, waitsOnGeoff: true }, 'z-delivery');
  return {
    db: fresh.db,
    merge: (ref: string) => closePr(fresh.db, ref, { to: 'merged', actor: 'z-review' }),
    readWait: () => fresh.db.query("SELECT waits_on, waits_on_geoff FROM runs WHERE issue = 'GEO-9731'").get(),
    readEvents: () => z.array(z.object({ actor: z.string(), data: z.string() })).parse(fresh.db.query("SELECT actor, data FROM events WHERE action = 'owner-wait-cleared'").all()).map((row) => ({ actor: row.actor, data: z.unknown().parse(JSON.parse(row.data)) })),
  };
}

test('it clears the wait on merging the PR it names, and logs the PR and the named rule', () => {
  const app = setupTest('owner to merge kettle#61');

  app.merge('kettle#61');

  expect({ wait: app.readWait(), events: app.readEvents() }).toStrictEqual({
    wait: { waits_on: null, waits_on_geoff: 0 },
    events: [{ actor: 'z-review', data: { ref: 'kettle#61', waitsOn: 'owner to merge kettle#61', rule: 'named' } }],
  });
});

test('it clears a wait that names no PR on merging the last open PR', () => {
  const app = setupTest('owner to check the kettle');

  app.merge('kettle#61');
  const kept = app.readWait();
  app.merge('kettle#62');

  expect({ kept, wait: app.readWait(), events: app.readEvents() }).toStrictEqual({
    kept: { waits_on: 'owner to check the kettle', waits_on_geoff: 1 },
    wait: { waits_on: null, waits_on_geoff: 0 },
    events: [{ actor: 'z-review', data: { ref: 'kettle#62', waitsOn: 'owner to check the kettle', rule: 'last-open' } }],
  });
});

test('it keeps a wait on merging a PR it does not name while another PR is open', () => {
  const app = setupTest('owner to merge kettle#62');

  app.merge('kettle#61');

  expect({ wait: app.readWait(), events: app.readEvents() }).toStrictEqual({ wait: { waits_on: 'owner to merge kettle#62', waits_on_geoff: 1 }, events: [] });
});
