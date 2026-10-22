import { expect, test } from 'bun:test';
import { buildWrapUpPlan } from './build-wrap-up-plan.ts';

test('a local session tree is forgotten with no imp to destroy', () => {
  expect(buildWrapUpPlan('0000a001', ['0000a002'], null)).toStrictEqual({ kind: 'forget', destroyImp: false });
});

test('an imp session tree whose work is all pushed is forgotten and its imp destroyed', () => {
  expect(buildWrapUpPlan('0000a001', ['0000a002'], { state: 'pushed' })).toStrictEqual({ kind: 'forget', destroyImp: true });
});

test('an imp session tree with unpushed work keeps the session and each sub-session, and says why', () => {
  expect(buildWrapUpPlan('0000a001', ['0000a002', '0000a003'], { state: 'unpushed', detail: 'home-0000a001: ?? lid.ts' })).toStrictEqual({
    kind: 'keep',
    kept: [
      { id: '0000a001', reason: 'its imp holds unpushed work (home-0000a001: ?? lid.ts), so the imp stays' },
      { id: '0000a002', reason: 'its parent session stays' },
      { id: '0000a003', reason: 'its parent session stays' },
    ],
  });
});

test('an imp session tree whose check gave no answer keeps the session, and says why', () => {
  expect(buildWrapUpPlan('0000a001', [], { state: 'unknown', detail: 'imp exec exited 255' })).toStrictEqual({
    kind: 'keep',
    kept: [{ id: '0000a001', reason: 'the unpushed-work check could not run (imp exec exited 255), so the imp stays' }],
  });
});
