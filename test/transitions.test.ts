import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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
import type { AskState } from '../src/transitions/ask-states.ts';
import { ASK_STATES } from '../src/transitions/ask-states.ts';
import type { AskAction } from '../src/transitions/ask-transitions.ts';
import { ASK_TRANSITIONS } from '../src/transitions/ask-transitions.ts';
import { checkAsk } from '../src/transitions/check-ask.ts';
import { checkPr } from '../src/transitions/check-pr.ts';
import { checkRun } from '../src/transitions/check-run.ts';
import type { PrState } from '../src/transitions/pr-states.ts';
import { PR_STATES } from '../src/transitions/pr-states.ts';
import type { PrAction } from '../src/transitions/pr-transitions.ts';
import { PR_TRANSITIONS } from '../src/transitions/pr-transitions.ts';
import type { RunState } from '../src/transitions/run-states.ts';
import { RUN_STATES } from '../src/transitions/run-states.ts';
import type { RunAction } from '../src/transitions/run-transitions.ts';
import { RUN_TRANSITIONS } from '../src/transitions/run-transitions.ts';
import { checkUnblock } from '../src/check-unblock.ts';
import { addUnblock } from '../src/unblock/add-unblock.ts';
import { closeUnblock } from '../src/unblock/close-unblock.ts';
import type { UnblockInput } from '../src/unblock/types.ts';
import type { UnblockState } from '../src/unblock-state.ts';
import type { UnblockAction } from '../src/unblock-transitions.ts';
import { UNBLOCK_TRANSITIONS } from '../src/unblock-transitions.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

const throwsBadState = (fn: () => void): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    expect((e as { code?: string }).code).toBe('bad_state');
    return true;
  }
};

describe('the tables match the checks, pair by pair', () => {
  for (const action of Object.keys(ASK_TRANSITIONS) as AskAction[]) {
    test(`ask ${action}`, () => {
      for (const from of ASK_STATES) {
        const allowed = (ASK_TRANSITIONS[action].from as readonly AskState[]).includes(from);
        expect([action, from, throwsBadState(() => checkAsk('x', action, from))]).toEqual([action, from, !allowed]);
      }
    });
  }

  for (const action of Object.keys(RUN_TRANSITIONS) as RunAction[]) {
    test(`run ${action}`, () => {
      for (const from of RUN_STATES) {
        for (const to of RUN_STATES) {
          const row = RUN_TRANSITIONS[action];
          const allowed = (row.from as readonly RunState[]).includes(from) && (row.to as readonly RunState[]).includes(to);
          expect([action, from, to, throwsBadState(() => checkRun('x', action, from, to))]).toEqual([action, from, to, !allowed]);
        }
      }
    });
  }

  for (const action of Object.keys(PR_TRANSITIONS) as PrAction[]) {
    test(`pr ${action}`, () => {
      for (const from of PR_STATES) {
        const allowed = (PR_TRANSITIONS[action].from as readonly PrState[]).includes(from);
        expect([action, from, throwsBadState(() => checkPr('x#1', action, from))]).toEqual([action, from, !allowed]);
      }
    });
  }

  for (const action of Object.keys(UNBLOCK_TRANSITIONS) as UnblockAction[]) {
    test(`unblock ${action}`, () => {
      for (const from of ['open', 'done', 'dropped'] as const) {
        const allowed = (UNBLOCK_TRANSITIONS[action].from as readonly UnblockState[]).includes(from);
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
    expect(PR_TRANSITIONS.unmerge.from).toEqual(['merged']);
    expect(UNBLOCK_TRANSITIONS.reopened.from).toEqual(['done', 'dropped']);
    expect([UNBLOCK_TRANSITIONS.done.from, UNBLOCK_TRANSITIONS.dropped.from, UNBLOCK_TRANSITIONS.updated.from]).toEqual([['open'], ['open'], ['open']]);
  });
});

const ask = (): AddInput => ({ kind: 'call', id: 'tea-or-coffee', title: 'Tea or coffee', question: 'Tea or coffee?', body: 'Pick one.', issues: [], forSession: null, actor: 'z-refine' });
const run = () => addRun(db, { issue: 'GEO-9100', title: 'Wind the clock', place: 'none', session: null, next: 'Start.', gate: null, geoffChat: false, actor: 'z-delivery' });

describe('refusals through the real functions', () => {
  test('answering a queued ask', () => {
    addAsk(db, ask());
    expect(() => answerAsk(db, { id: 'tea-or-coffee', kind: undefined, answer: 'tea', actor: 'z-stu' })).toThrow('tea-or-coffee is queued: answered needs open');
  });

  test('applying an open ask', () => {
    addAsk(db, ask());
    openAsk(db, { force: false, actor: 'z-stu' });
    expect(() => applyAsk(db, 'tea-or-coffee', undefined, 'none', null, 'z-stu')).toThrow('open: applied needs answered');
  });

  test('later, skip and close refuse the states the table leaves out', () => {
    addAsk(db, ask());
    closeAsk(db, 'tea-or-coffee', undefined, 'moot', 'z-stu');
    expect(() => laterAsk(db, 'tea-or-coffee', undefined, null, 'z-stu')).toThrow('later needs open or queued');
    expect(() => skipAsk(db, 'tea-or-coffee', undefined, null, 'z-stu')).toThrow('skipped needs');
    expect(() => closeAsk(db, 'tea-or-coffee', undefined, 'again', 'z-stu')).toThrow('closed needs');
    expect(() => openAsk(db, { id: 'tea-or-coffee', force: true, actor: 'z-stu' })).toThrow('only queued or due items open');
  });

  test('setting a done run without --reopen', () => {
    run();
    setState(db, 'GEO-9100', 'done', {}, 'z-delivery');
    expect(() => setState(db, 'GEO-9100', 'working', {}, 'z-delivery')).toThrow('GEO-9100 is done: pass --reopen to change it');
    expect(setState(db, 'GEO-9100', 'working', { reopen: true }, 'z-delivery').state).toBe('working');
  });

  test('an open run goes to any state, its own included', () => {
    run();
    for (const s of RUN_STATES) expect(setState(db, 'GEO-9100', s, { reopen: s === 'done' || s === 'dropped' }, 'z-delivery').state).toBe(s);
  });

  test('unmerging an open PR', () => {
    run();
    addPr(db, 'GEO-9100', 'hq#901', 'z-delivery');
    expect(() => unmergePr(db, 'hq#901', 'z-review', null)).toThrow('hq#901 is open, not merged');
  });

  test('final on a merged PR, and unfinal and close', () => {
    run();
    addPr(db, 'GEO-9100', 'hq#902', 'z-delivery');
    closePr(db, 'hq#902', { to: 'merged', actor: 'z-review' });
    expect(() => finalPr(db, 'hq#902', { sha: 'abcdef1', actor: 'z-delivery' })).toThrow('hq#902 is merged');
    expect(() => unfinalPr(db, 'hq#902', 'z-delivery', null)).toThrow('hq#902 is merged');
    expect(() => closePr(db, 'hq#902', { to: 'closed', actor: 'z-review' })).toThrow('hq#902 is merged');
  });
});

test('an unblock item is added, updated, closed done, and reopened after done or dropped', () => {
  expect(addUnblock(db, buildKettleInput('Descale the kettle')).result).toBe('added');
  expect(addUnblock(db, buildKettleInput('Descale the kettle twice')).result).toBe('updated');
  expect(closeUnblock(db, 'kettle', 'done', null, 'kettle-bot').state).toBe('done');
  expect(addUnblock(db, buildKettleInput('Descale it again')).result).toBe('reopened');
  expect(closeUnblock(db, 'kettle', 'dropped', 'moot', 'kettle-bot').state).toBe('dropped');
  expect(addUnblock(db, buildKettleInput('Descale it once more')).item.state).toBe('open');
});

test('closing an unblock item that is not open is refused, as done or dropped', () => {
  addUnblock(db, buildKettleInput('Descale the kettle'));
  closeUnblock(db, 'kettle', 'done', null, 'kettle-bot');
  expect(() => closeUnblock(db, 'kettle', 'done', null, 'kettle-bot')).toThrow('kettle is done, not open');
  expect(() => closeUnblock(db, 'kettle', 'dropped', null, 'kettle-bot')).toThrow('kettle is done, not open');
});

function buildKettleInput(task: string): UnblockInput {
  return { id: 'kettle', task, minutes: null, unblocks: [], notify: [], actor: 'kettle-bot' };
}

describe('no state write skips the table', () => {
  // Recursive: GEO-1288 moved the writers into area folders, and the table into src/transitions/.
  test('every source file that writes a state column imports the table', () => {
    const src = join(import.meta.dir, '..', 'src'),
      write = /UPDATE (?:asks|runs|run_prs|unblocks) SET [^`'"]*\bstate\s*=/u;
    const offenders: string[] = [];
    let seen = 0;
    for (const f of readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((n) => n.endsWith('.ts'))) {
      const text = readFileSync(join(src, f), 'utf8');
      if (!write.test(text)) continue;
      seen++;
      if (!f.startsWith('transitions/') && !/from '(?:\.\.?\/)+(?:transitions\/[a-z-]+|check-unblock)\.ts'/u.test(text)) {
        offenders.push(f);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
