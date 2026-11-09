// oxlint-disable zgeoff/test-beside-module -- checks every transition table against the asks, runs and unblock modules that apply it
import { describe, expect, onTestFinished, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { addAsk } from '../src/asks/add-ask.ts';
import { answerAsk } from '../src/asks/answer-ask.ts';
import { applyAsk } from '../src/asks/apply-ask.ts';
import { closeAsk } from '../src/asks/close-ask.ts';
import { laterAsk } from '../src/asks/later-ask.ts';
import { openAsk } from '../src/asks/open-ask.ts';
import { skipAsk } from '../src/asks/skip-ask.ts';
import type { AddInput } from '../src/asks/types.ts';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { closePr } from '../src/runs/close-pr.ts';
import { finalPr } from '../src/runs/final-pr.ts';
import { setState } from '../src/runs/set-state.ts';
import { unfinalPr } from '../src/runs/unfinal-pr.ts';
import { unmergePr } from '../src/runs/unmerge-pr.ts';
import { isOneOf } from '@zgeoff/std';
import { collectKeys } from '../src/test-utils/collect-keys.ts';
import { ASK_STATES } from '../src/transitions/ask-states.ts';
import { ASK_TRANSITIONS } from '../src/transitions/ask-transitions.ts';
import { checkAsk } from '../src/transitions/check-ask.ts';
import { checkPr } from '../src/transitions/check-pr.ts';
import { checkRun } from '../src/transitions/check-run.ts';
import { PR_STATES } from '../src/transitions/pr-states.ts';
import { PR_TRANSITIONS } from '../src/transitions/pr-transitions.ts';
import { RUN_STATES } from '../src/transitions/run-states.ts';
import { RUN_TRANSITIONS } from '../src/transitions/run-transitions.ts';
import { checkUnblock } from '../src/check-unblock.ts';
import { addUnblock } from '../src/unblock/add-unblock.ts';
import { closeUnblock } from '../src/unblock/close-unblock.ts';
import type { UnblockInput } from '../src/unblock/types.ts';
import { UNBLOCK_TRANSITIONS } from '../src/unblock-transitions.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const db: Database = fresh.db;

  return {
    db,
    addRun: () => addRun(db, { issue: 'GEO-9100', title: 'Wind the clock', place: 'none', session: null, next: 'Start.', gate: null, geoffChat: false, actor: 'z-delivery' }),
  };
}

const throwsBadState = (fn: () => void): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    expect(e).toMatchObject({ code: 'bad_state' });
    return true;
  }
};

describe('the tables match the checks, pair by pair', () => {
  for (const action of collectKeys(ASK_TRANSITIONS)) {
    test(`ask ${action}`, () => {
      for (const from of ASK_STATES) {
        const allowed = isOneOf(from, ASK_TRANSITIONS[action].from);
        expect([action, from, throwsBadState(() => checkAsk('x', action, from))]).toEqual([action, from, !allowed]);
      }
    });
  }

  for (const action of collectKeys(RUN_TRANSITIONS)) {
    test(`run ${action}`, () => {
      for (const from of RUN_STATES) {
        for (const to of RUN_STATES) {
          const row = RUN_TRANSITIONS[action];
          const allowed = isOneOf(from, row.from) && isOneOf(to, [row.to].flat());
          expect([action, from, to, throwsBadState(() => checkRun('x', action, from, to))]).toEqual([action, from, to, !allowed]);
        }
      }
    });
  }

  for (const action of collectKeys(PR_TRANSITIONS)) {
    test(`pr ${action}`, () => {
      for (const from of PR_STATES) {
        const allowed = isOneOf(from, PR_TRANSITIONS[action].from);
        expect([action, from, throwsBadState(() => checkPr('x#1', action, from))]).toEqual([action, from, !allowed]);
      }
    });
  }

  for (const action of collectKeys(UNBLOCK_TRANSITIONS)) {
    test(`unblock ${action}`, () => {
      for (const from of ['open', 'done', 'dropped'] as const) {
        const allowed = isOneOf(from, UNBLOCK_TRANSITIONS[action].from);
        expect([action, from, throwsBadState(() => checkUnblock('x', action, from))]).toEqual([action, from, !allowed]);
      }
    });
  }

  test('the tables hold today\'s moves', () => {
    expect(ASK_TRANSITIONS.answered.from).toEqual(['open']);
    expect(ASK_TRANSITIONS.applied.from).toEqual(['answered']);
    expect([...ASK_TRANSITIONS.later.from].sort()).toEqual(['open', 'queued']);
    expect([...ASK_TRANSITIONS.opened.from].sort()).toEqual(['later', 'queued']);
    expect([...RUN_TRANSITIONS.state.from].sort()).toEqual(['blocked', 'deploy-held', 'deploying', 'live-check', 'merged', 'working']);
    expect([...RUN_TRANSITIONS.reopen.from].sort()).toEqual(['done', 'dropped']);
    expect([...RUN_TRANSITIONS['design-to-build'].from].toSorted()).toStrictEqual(['done', 'dropped']);
    expect(RUN_TRANSITIONS['design-to-build'].to).toBe('working');
    expect(PR_TRANSITIONS.unmerge.from).toEqual(['merged']);
    expect(UNBLOCK_TRANSITIONS.reopened.from).toEqual(['done', 'dropped']);
    expect([UNBLOCK_TRANSITIONS.done.from, UNBLOCK_TRANSITIONS.dropped.from, UNBLOCK_TRANSITIONS.updated.from]).toEqual([['open'], ['open'], ['open']]);
  });
});

const ask = (): AddInput => ({ kind: 'call', id: 'tea-or-coffee', title: 'Tea or coffee', question: 'Tea or coffee?', body: 'Pick one.', issues: [], forSession: null, actor: 'z-refine' });

describe('refusals through the real functions', () => {
  test('answering a queued ask', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    addAsk(ctx.db, ask());
    expect(() => answerAsk(ctx.db, { id: 'tea-or-coffee', kind: undefined, answer: 'tea', actor: 'z-stu' })).toThrow('tea-or-coffee is queued: answered needs open');
  });

  test('applying an open ask', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    addAsk(ctx.db, ask());
    openAsk(ctx.db, { force: false, actor: 'z-stu' });
    expect(() => applyAsk(ctx.db, 'tea-or-coffee', undefined, 'none', null, 'z-stu')).toThrow('open: applied needs answered');
  });

  test('later, skip and close refuse the states the table leaves out', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    addAsk(ctx.db, ask());
    closeAsk(ctx.db, 'tea-or-coffee', undefined, 'moot', 'z-stu');
    expect(() => laterAsk(ctx.db, 'tea-or-coffee', undefined, null, 'z-stu')).toThrow('later needs open or queued');
    expect(() => skipAsk(ctx.db, 'tea-or-coffee', undefined, null, 'z-stu')).toThrow('skipped needs');
    expect(() => closeAsk(ctx.db, 'tea-or-coffee', undefined, 'again', 'z-stu')).toThrow('closed needs');
    expect(() => openAsk(ctx.db, { id: 'tea-or-coffee', force: true, actor: 'z-stu' })).toThrow('only queued or due items open');
  });

  test('setting a done run without --reopen', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    ctx.addRun();
    setState(ctx.db, 'GEO-9100', 'done', {}, 'z-delivery');
    expect(() => setState(ctx.db, 'GEO-9100', 'working', {}, 'z-delivery')).toThrow('GEO-9100 is done: pass --reopen to change it');
    expect(setState(ctx.db, 'GEO-9100', 'working', { reopen: true }, 'z-delivery').state).toBe('working');
  });

  test('an open run goes to any state, its own included', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    ctx.addRun();
    for (const state of RUN_STATES) {
      expect(setState(ctx.db, 'GEO-9100', state, { reopen: state === 'done' || state === 'dropped' }, 'z-delivery').state).toBe(state);
    }
  });

  test('unmerging an open PR', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    ctx.addRun();
    addPr(ctx.db, 'GEO-9100', 'hq#901', 'z-delivery');
    expect(() => unmergePr(ctx.db, 'hq#901', 'z-review', null)).toThrow('hq#901 is open, not merged');
  });

  test('final on a merged PR, and unfinal and close', () => {
    const ctx = setupTest();
    at(NOON_SYDNEY);
    ctx.addRun();
    addPr(ctx.db, 'GEO-9100', 'hq#902', 'z-delivery');
    closePr(ctx.db, 'hq#902', { to: 'merged', actor: 'z-review' });
    expect(() => finalPr(ctx.db, 'hq#902', { sha: 'abcdef1', actor: 'z-delivery' })).toThrow('hq#902 is merged');
    expect(() => unfinalPr(ctx.db, 'hq#902', 'z-delivery', null)).toThrow('hq#902 is merged');
    expect(() => closePr(ctx.db, 'hq#902', { to: 'closed', actor: 'z-review' })).toThrow('hq#902 is merged');
  });
});

test('an unblock item is added, updated, closed done, and reopened after done or dropped', () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  expect(addUnblock(ctx.db, buildKettleInput('Descale the kettle')).result).toBe('added');
  expect(addUnblock(ctx.db, buildKettleInput('Descale the kettle twice')).result).toBe('updated');
  expect(closeUnblock(ctx.db, 'kettle', 'done', null, 'kettle-bot').state).toBe('done');
  expect(addUnblock(ctx.db, buildKettleInput('Descale it again')).result).toBe('reopened');
  expect(closeUnblock(ctx.db, 'kettle', 'dropped', 'moot', 'kettle-bot').state).toBe('dropped');
  expect(addUnblock(ctx.db, buildKettleInput('Descale it once more')).item.state).toBe('open');
});

test('closing an unblock item that is not open is refused, as done or dropped', () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  addUnblock(ctx.db, buildKettleInput('Descale the kettle'));
  closeUnblock(ctx.db, 'kettle', 'done', null, 'kettle-bot');
  expect(() => closeUnblock(ctx.db, 'kettle', 'done', null, 'kettle-bot')).toThrow('kettle is done, not open');
  expect(() => closeUnblock(ctx.db, 'kettle', 'dropped', null, 'kettle-bot')).toThrow('kettle is done, not open');
});

function buildKettleInput(task: string): UnblockInput {
  return { id: 'kettle', task, minutes: null, unblocks: [], notify: [], actor: 'kettle-bot' };
}

describe('no state write skips the table', () => {
  test('every source file that writes a state column imports the table', () => {
    const sourceDirectory = join(import.meta.dir, '..', 'src');
    const write = /UPDATE (?:asks|runs|run_prs|unblocks) SET [^`'"]*\bstate\s*=/u;
    const offenders: string[] = [];
    let seen = 0;
    for (const file of readdirSync(sourceDirectory, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      const text = readFileSync(join(sourceDirectory, file), 'utf8');
      if (!write.test(text)) continue;
      seen++;
      if (!file.startsWith('transitions/') && !/from '(?:\.\.?\/)+(?:transitions\/[a-z-]+|check-unblock)\.ts'/u.test(text)) {
        offenders.push(file);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
