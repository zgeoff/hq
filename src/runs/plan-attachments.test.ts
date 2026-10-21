import { expect, test } from 'bun:test';
import { planAttachments } from './plan-attachments.ts';

test('it attaches an in-scope PR to the open run its body names', () => {
  const plan = planAttachments([{ repo: 'hq', number: 7, body: 'Fit the lid.\n\nFixes GEO-9811' }], new Set(), new Set(['GEO-9811']));

  expect(plan).toStrictEqual({ attach: [{ ref: 'hq#7', issue: 'GEO-9811', url: 'https://github.com/zgeoff/hq/pull/7' }], errors: [] });
});

test('it skips a PR out of scope, one a run already holds, and one that names no open run', () => {
  const plan = planAttachments(
    [
      { repo: 'teapot', number: 1, body: 'Fixes GEO-9811' },
      { repo: 'hq', number: 2, body: 'Fixes GEO-9811' },
      { repo: 'hq', number: 3, body: 'Fixes GEO-9899' },
    ],
    new Set(['hq#2']),
    new Set(['GEO-9811']),
  );

  expect(plan).toStrictEqual({ attach: [], errors: [] });
});

test('it attaches to neither of two open runs one body names, and says so', () => {
  const plan = planAttachments([{ repo: 'hq', number: 7, body: 'Fixes GEO-9811\nContributes to GEO-9812' }], new Set(), new Set(['GEO-9811', 'GEO-9812']));

  expect(plan).toStrictEqual({ attach: [], errors: ['hq#7: its body names GEO-9811 and GEO-9812, so hq attaches it to neither'] });
});

test('it reads only the open runs among those a body names', () => {
  const plan = planAttachments([{ repo: 'hq', number: 7, body: 'Fixes GEO-9811\nContributes to GEO-9812' }], new Set(), new Set(['GEO-9812']));

  expect(plan.attach).toStrictEqual([{ ref: 'hq#7', issue: 'GEO-9812', url: 'https://github.com/zgeoff/hq/pull/7' }]);
});

test('it reads the verbs case by case: a lowercase "fixes" or "contributes to" names no run', () => {
  const plan = planAttachments([{ repo: 'hq', number: 7, body: 'fixes GEO-9811\ncontributes to GEO-9811' }], new Set(), new Set(['GEO-9811']));

  expect(plan).toStrictEqual({ attach: [], errors: [] });
});
