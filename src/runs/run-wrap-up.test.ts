import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import type { FleetSession } from '../fleet/types.ts';
import { addRun } from './add-run.ts';
import { getRun } from './get-run.ts';
import { runWrapUp } from './run-wrap-up.ts';
import { setGeoffChat } from './set-geoff-chat.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';
import type { ImpWork } from './types.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('done forgets the run session and its sub-session, the sub-session first, and leaves other sessions alone', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, parent: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cwd: '/workspace/kettle' },
      { id: '0000a003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    ],
  });
  const readImpWork = mock<(session: FleetSession) => Promise<ImpWork>>(() => Promise.resolve({ state: 'pushed' }));

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: ['0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] });
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a002', 'unpin 0000a002', 'forget 0000a002', 'kill 0000a001', 'unpin 0000a001', 'forget 0000a001']);
  expect(readImpWork).not.toHaveBeenCalled();
  expect(ctx.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9801'").all()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: forgot 0000a002, 0000a001.' }]);
});

test('done keeps every session, and opens no atc connection, when the owner chats on the run', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setGeoffChat(ctx.db, 'GEO-9801', true, 'z-delivery');
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' }] });
  const openClient = mock(() => Promise.resolve(fleet.client));

  const wrapUp = await runWrapUp(ctx.db, { openClient, readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: [], destroyed: [], kept: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'the owner chats on this run' }], failed: [] });
  expect(openClient).not.toHaveBeenCalled();
  expect(fleet.calls).toStrictEqual([]);
  expect(ctx.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9801'").all()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: kept 0000a001 (the owner chats on this run).' }]);
});

test('done keeps an imp that holds unpushed work, with its session and sub-session, and notes why; the run stays done', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, parent: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cwd: '/workspace/kettle' },
    ],
  });
  const readImpWork = mock<(session: FleetSession) => Promise<ImpWork>>(() => Promise.resolve({ state: 'unpushed', detail: 'home-0000a001aaaa4aaa8aaa: 3f2a1bc add kettle lid' }));

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({
    forgotten: [],
    destroyed: [],
    kept: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'its imp holds unpushed work (home-0000a001aaaa4aaa8aaa: 3f2a1bc add kettle lid), so the imp stays' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'its parent session stays' },
    ],
    failed: [],
  });
  expect(readImpWork.mock.calls).toStrictEqual([[{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' }]]);
  expect(fleet.calls).toStrictEqual([]);
  expect(ctx.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9801'").all()).toStrictEqual([
    {
      label: 'wrap-up',
      text: 'Wrap-up: kept 0000a001 (its imp holds unpushed work (home-0000a001aaaa4aaa8aaa: 3f2a1bc add kettle lid), so the imp stays); kept 0000a002 (its parent session stays).',
    },
  ]);
  expect(getRun(ctx.db, 'GEO-9801')?.state).toBe('done');
});

test('done destroys an imp whose work is all pushed, confirming the destroy atc asks for', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, parent: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cwd: '/workspace/kettle' },
    ],
    forgets: { '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa': [{ forgotten: false, confirmToken: 'token-kettle' }] },
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: ['0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [] });
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a002', 'unpin 0000a002', 'forget 0000a002', 'forget-live 0000a001', 'forget-live 0000a001 token-kettle']);
  expect(ctx.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9801'").all()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: forgot 0000a002, 0000a001; destroyed the imp of 0000a001.' }]);
});

test('a check that fails counts as unpushed work and keeps the imp', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' }] });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('ssh: connect to host timed out')) }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({
    forgotten: [],
    destroyed: [],
    kept: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'the unpushed-work check could not run (ssh: connect to host timed out), so the imp stays' }],
    failed: [],
  });
  expect(fleet.calls).toStrictEqual([]);
});

test('a check that cannot answer counts as unpushed work and keeps the imp', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' }] });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'unknown', detail: 'imp exec exited 255' }) }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({
    forgotten: [],
    destroyed: [],
    kept: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'the unpushed-work check could not run (imp exec exited 255), so the imp stays' }],
    failed: [],
  });
  expect(fleet.calls).toStrictEqual([]);
});

test('done forgets the one atc session that a short session id on the run starts', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Invented kettle descaler', place: 'local', session: '0000a001', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9811', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    ],
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'GEO-9811', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] });
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a001', 'unpin 0000a001', 'forget 0000a001']);
});

test('done forgets no session for a short session id that several atc sessions start, and records the failure', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Invented teapot cosy', place: 'local', session: '0000b001', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9812', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
      { id: '0000b001-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'teapot-helper', alive: true },
    ],
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'GEO-9812', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: [], destroyed: [], kept: [], failed: [{ id: '0000b001', reason: '2 sessions start with 0000b001; give more of the id' }] });
  expect(fleet.calls).toStrictEqual([]);
});

test('a confirmed destroy that atc refuses leaves the session unpinned and records the failure; the run stays done', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' }],
    forgets: { '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa': [{ forgotten: false, confirmToken: 'token-kettle' }, { forgotten: false }] },
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({
    forgotten: [],
    destroyed: [],
    kept: [],
    failed: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc did not forget the session after the confirmed destroy' }],
  });
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'forget-live 0000a001', 'forget-live 0000a001 token-kettle']);
  expect(ctx.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9801'").all()).toStrictEqual([
    { label: 'wrap-up', text: 'Wrap-up: failed 0000a001 (atc did not forget the session after the confirmed destroy).' },
  ]);
  expect(getRun(ctx.db, 'GEO-9801')?.state).toBe('done');
});

test('an imp destroy forgets the live session with no separate stop, which a cloud imp outlasts', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' }],
    killFailures: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    forgets: { '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa': [{ forgotten: false, confirmToken: 'token-kettle' }] },
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'GEO-9801', 'z-delivery');

  expect(wrapUp).toStrictEqual({ forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [] });
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'forget-live 0000a001', 'forget-live 0000a001 token-kettle']);
});

test('done leaves a session removed from the run alone, even when the remove and the close share a second', async () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9801', '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9801', '0000a002', 'z-delivery', 'remove');
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-owner-chat', alive: true, cwd: '/workspace/kettle' },
    ],
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'GEO-9801', 'z-delivery');

  expect([wrapUp.forgotten, fleet.calls.some((call) => call.includes('0000a002'))]).toStrictEqual([['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], false]);
});


test('done never unpins, forgets or destroys a pinned session on the run, even when it ended in the second the run closed', async () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9801', '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-owner-chat', alive: true, pinned: true, cwd: '/workspace/kettle' },
    ],
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'GEO-9801', 'z-delivery');

  expect([wrapUp.kept, fleet.calls.some((call) => call.includes('0000a002'))]).toStrictEqual([[{ id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], false]);
});

test('done keeps a whole session tree when one of its sub-sessions is pinned', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9801', 'done', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, pinned: true, parent: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
  });

  const wrapUp = await runWrapUp(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'GEO-9801', 'z-delivery');

  expect([wrapUp.kept.map((kept) => kept.id), fleet.calls]).toStrictEqual([['0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], []]);
});
