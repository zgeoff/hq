import { expect, test } from 'bun:test';
import { buildWrapUpPlan } from './build-wrap-up-plan.ts';

test('it forgets a local session tree whose work is all pushed, with no imp to destroy', () => {
  expect(buildWrapUpPlan('0000a001', ['0000a002'], { state: 'pushed' }, 'local')).toStrictEqual({ kind: 'forget', destroyImp: false });
});

test('it keeps a local session with unpushed work, and says why', () => {
  expect(buildWrapUpPlan('0000a001', [], { state: 'unpushed', detail: '/workspace/kettle: 3f2a1bc add lid' }, 'local')).toStrictEqual({
    kind: 'keep',
    kept: [{ id: '0000a001', reason: 'its working directory holds unpushed work (/workspace/kettle: 3f2a1bc add lid), so the session stays' }],
  });
});

test('it keeps a local session whose check gave no answer, and says why', () => {
  expect(buildWrapUpPlan('0000a001', [], { state: 'unknown', detail: 'the check exited 128' }, 'local')).toStrictEqual({
    kind: 'keep',
    kept: [{ id: '0000a001', reason: 'the unpushed-work check could not run (the check exited 128), so the session stays' }],
  });
});

test('it forgets an imp session tree whose work is all pushed, and destroys its imp', () => {
  expect(buildWrapUpPlan('0000a001', ['0000a002'], { state: 'pushed' }, 'imp')).toStrictEqual({ kind: 'forget', destroyImp: true });
});

test('it keeps an imp session and each sub-session when its work is unpushed, and says why', () => {
  expect(buildWrapUpPlan('0000a001', ['0000a002', '0000a003'], { state: 'unpushed', detail: 'home-0000a001: ?? lid.ts' }, 'imp')).toStrictEqual({
    kind: 'keep',
    kept: [
      { id: '0000a001', reason: 'its imp holds unpushed work (home-0000a001: ?? lid.ts), so the imp stays' },
      { id: '0000a002', reason: 'its parent session stays' },
      { id: '0000a003', reason: 'its parent session stays' },
    ],
  });
});

test('it keeps an imp session whose check gave no answer, and says why', () => {
  expect(buildWrapUpPlan('0000a001', [], { state: 'unknown', detail: 'imp exec exited 255' }, 'imp')).toStrictEqual({
    kind: 'keep',
    kept: [{ id: '0000a001', reason: 'the unpushed-work check could not run (imp exec exited 255), so the imp stays' }],
  });
});
