import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { freshDb } from '../../test/helpers.ts';
import type { FleetSession } from '../fleet/types.ts';
import { addRun } from './add-run.ts';
import { getRun } from './get-run.ts';
import { runWrapUp } from './run-wrap-up.ts';
import { setGeoffChat } from './set-geoff-chat.ts';
import { setState } from './set-state.ts';
import type { ImpWork } from './types.ts';

// A closed run on a stub atc that lists the run's session, its sub-session and an unrelated
// session, and records every call the wrap-up makes. An imp session's first forget asks to
// confirm the destroy.
function setupTest(place: 'local' | 'imp', options: { geoffChat?: boolean; impWork?: () => Promise<ImpWork> } = {}) {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const ids = { root: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', child: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  addRun(fresh.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place, session: ids.root, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  if (options.geoffChat === true) {
    setGeoffChat(fresh.db, 'GEO-9801', true, 'z-delivery');
  }
  setState(fresh.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const checked: string[] = [];
  const opened: string[] = [];
  const fleet = buildStubFleetClient({
    sessions: [
      { id: ids.root, name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: ids.child, name: 'kettle-helper', alive: true, parent: ids.root, cwd: '/workspace/kettle' },
      { id: '0000a003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    ],
    forgets: place === 'imp' ? { [ids.root]: [{ forgotten: false, confirmToken: 'token-kettle' }] } : {},
  });
  const wrapUp = () =>
    runWrapUp(
      fresh.db,
      {
        openClient: () => {
          opened.push('atc');
          return Promise.resolve(fleet.client);
        },
        readImpWork: (session) => {
          checked.push(`${session.id.slice(0, 8)} ${session.cwd}`);
          return options.impWork === undefined ? Promise.resolve({ state: 'pushed' }) : options.impWork();
        },
      },
      'GEO-9801',
      'z-delivery',
    );
  const notes = () => fresh.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9801'").all();
  return { db: fresh.db, ids, calls: fleet.calls, checked, opened, wrapUp, notes };
}

test('done forgets the run session and its sub-session, the sub-session first, and leaves other sessions alone', async () => {
  const app = setupTest('local');

  const wrapUp = await app.wrapUp();

  expect(wrapUp).toStrictEqual({ forgotten: [app.ids.child, app.ids.root], destroyed: [], kept: [], failed: [] });
  expect(app.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a002', 'unpin 0000a002', 'forget 0000a002', 'kill 0000a001', 'unpin 0000a001', 'forget 0000a001']);
  expect(app.checked).toStrictEqual([]);
  expect(app.notes()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: forgot 0000a002, 0000a001.' }]);
});

test('done keeps every session, and opens no atc connection, when the owner chats on the run', async () => {
  const app = setupTest('local', { geoffChat: true });

  const wrapUp = await app.wrapUp();

  expect(wrapUp).toStrictEqual({ forgotten: [], destroyed: [], kept: [{ id: app.ids.root, reason: 'the owner chats on this run' }], failed: [] });
  expect(app.opened).toStrictEqual([]);
  expect(app.calls).toStrictEqual([]);
  expect(app.notes()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: kept 0000a001 (the owner chats on this run).' }]);
});

test('done keeps an imp that holds unpushed work, with its session and sub-session, and notes why; the run stays done', async () => {
  const app = setupTest('imp', { impWork: () => Promise.resolve({ state: 'unpushed', detail: 'home-0000a001aaaa4aaa8aaa: 3f2a1bc add kettle lid' }) });

  const wrapUp = await app.wrapUp();

  expect(wrapUp).toStrictEqual({
    forgotten: [],
    destroyed: [],
    kept: [
      { id: app.ids.root, reason: 'its imp holds unpushed work (home-0000a001aaaa4aaa8aaa: 3f2a1bc add kettle lid), so the imp stays' },
      { id: app.ids.child, reason: 'its parent session stays' },
    ],
    failed: [],
  });
  expect(app.checked).toStrictEqual(['0000a001 /workspace/kettle']);
  expect(app.calls).toStrictEqual([]);
  expect(app.notes()).toStrictEqual([
    {
      label: 'wrap-up',
      text: 'Wrap-up: kept 0000a001 (its imp holds unpushed work (home-0000a001aaaa4aaa8aaa: 3f2a1bc add kettle lid), so the imp stays); kept 0000a002 (its parent session stays).',
    },
  ]);
  expect(getRun(app.db, 'GEO-9801')?.state).toBe('done');
});

test('done destroys an imp whose work is all pushed, confirming the destroy atc asks for', async () => {
  const app = setupTest('imp');

  const wrapUp = await app.wrapUp();

  expect(wrapUp).toStrictEqual({ forgotten: [app.ids.child, app.ids.root], destroyed: [app.ids.root], kept: [], failed: [] });
  expect(app.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a002', 'unpin 0000a002', 'forget 0000a002', 'kill 0000a001', 'forget 0000a001', 'forget 0000a001 token-kettle']);
  expect(app.notes()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: forgot 0000a002, 0000a001; destroyed the imp of 0000a001.' }]);
});

test('a check that fails, or cannot answer, counts as unpushed work and keeps the imp', async () => {
  const thrown = setupTest('imp', { impWork: () => Promise.reject(new Error('ssh: connect to host timed out')) });
  const unknown = setupTest('imp', { impWork: () => Promise.resolve({ state: 'unknown', detail: 'imp exec exited 255' }) });

  const thrownWrapUp = await thrown.wrapUp();
  const unknownWrapUp = await unknown.wrapUp();

  expect(thrownWrapUp.kept[0]).toStrictEqual({ id: thrown.ids.root, reason: 'the unpushed-work check could not run (ssh: connect to host timed out), so the imp stays' });
  expect(unknownWrapUp.kept[0]).toStrictEqual({ id: unknown.ids.root, reason: 'the unpushed-work check could not run (imp exec exited 255), so the imp stays' });
  expect([...thrown.calls, ...unknown.calls]).toStrictEqual([]);
});

test('done forgets the one atc session that a short session id on the run starts', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const sessions: FleetSession[] = [
    { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true },
    { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
  ];
  const fleet = buildStubFleetClient({ sessions });
  const deps = { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) };
  addRun(fresh.db, { issue: 'GEO-9811', title: 'Invented kettle descaler', place: 'local', session: '0000a001', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9811', 'done', {}, 'z-delivery');

  const wrapUp = await runWrapUp(fresh.db, deps, 'GEO-9811', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] });
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a001', 'unpin 0000a001', 'forget 0000a001']);
});

test('done forgets no session for a short session id that several atc sessions start, and records the failure', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const sessions: FleetSession[] = [
    { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    { id: '0000b001-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'teapot-helper', alive: true },
  ];
  const fleet = buildStubFleetClient({ sessions });
  const deps = { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) };
  addRun(fresh.db, { issue: 'GEO-9812', title: 'Invented teapot cosy', place: 'local', session: '0000b001', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9812', 'done', {}, 'z-delivery');

  const wrapUp = await runWrapUp(fresh.db, deps, 'GEO-9812', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: [], destroyed: [], kept: [], failed: [{ id: '0000b001', reason: '2 sessions start with 0000b001; give more of the id' }] });
  expect(fleet.calls).toStrictEqual([]);
});
