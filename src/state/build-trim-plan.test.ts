import { expect, test } from 'bun:test';
import { buildTrimPlan } from './build-trim-plan.ts';

function setupTest() {
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const log = ['09:10Z boiled the water\n', '09:11Z poured the tea\n  with a splash of milk\n\n', '09:12Z washed the cup\n'];
  const tail = '\n## Holds\nlid: stuck\n';
  const text = `${head}## Log\n${log.join('')}${tail}`;
  return { head, log, tail, text };
}

test('#buildTrimPlan a file under its limit moves nothing', () => {
  const ctx = setupTest();

  expect(buildTrimPlan(ctx.text, 10_000)).toStrictEqual({ kind: 'plan', kept: ctx.text, moved: '', entriesMoved: 0, beforeBytes: Buffer.byteLength(ctx.text), afterBytes: Buffer.byteLength(ctx.text) });
});

test('#buildTrimPlan the oldest entries move until the file fits, and the other sections stay byte for byte', () => {
  const ctx = setupTest();
  const limit = Buffer.byteLength(ctx.text) - Buffer.byteLength(ctx.log[0] ?? '');

  expect(buildTrimPlan(ctx.text, limit)).toMatchObject({ kept: `${ctx.head}## Log\n${ctx.log[1]}${ctx.log[2]}${ctx.tail}`, moved: ctx.log[0], entriesMoved: 1, afterBytes: limit });
});

test('#buildTrimPlan an indented line and the blank line after it move with their entry', () => {
  const ctx = setupTest();
  const limit = Buffer.byteLength(ctx.text) - Buffer.byteLength(`${ctx.log[0]}${ctx.log[1]}`);

  expect(buildTrimPlan(ctx.text, limit)).toMatchObject({ moved: `${ctx.log[0]}${ctx.log[1]}`, entriesMoved: 2 });
});

test('#buildTrimPlan the newest entry stays even when the file is still over the limit', () => {
  const ctx = setupTest();

  expect(buildTrimPlan(ctx.text, 1)).toMatchObject({ kept: `${ctx.head}## Log\n${ctx.log[2]}${ctx.tail}`, entriesMoved: 2 });
});

test('#buildTrimPlan the heading line stays and lines before the first entry are never moved', () => {
  const text = '## Log\n\n  a note under the heading\n09:10Z boiled the water\n09:11Z poured the tea\n';

  expect(buildTrimPlan(text, 1)).toMatchObject({ kept: '## Log\n\n  a note under the heading\n09:11Z poured the tea\n', moved: '09:10Z boiled the water\n' });
});

test('#buildTrimPlan the log section ends at the next heading, so entries after it are never moved', () => {
  const text = '## Log\n09:10Z boiled the water\n09:11Z poured the tea\n## Holds\nlid: stuck\nlid: loose\n';

  expect(buildTrimPlan(text, 1)).toMatchObject({ kept: '## Log\n09:11Z poured the tea\n## Holds\nlid: stuck\nlid: loose\n', entriesMoved: 1 });
});

test('#buildTrimPlan a heading that only starts with Log is not the log section', () => {
  expect(buildTrimPlan('## Logbook\n09:10Z boiled the water\n', 1)).toStrictEqual({ kind: 'no-log' });
});

test('#buildTrimPlan a file with no log heading has no log', () => {
  expect(buildTrimPlan('# kettle\n\n## Cursors\nspout: 4\n', 1)).toStrictEqual({ kind: 'no-log' });
});

test('#buildTrimPlan a log whose last line has no newline keeps it', () => {
  expect(buildTrimPlan('## Log\n09:10Z boiled the water\n09:11Z poured the tea', 1)).toMatchObject({ kept: '## Log\n09:11Z poured the tea' });
});
