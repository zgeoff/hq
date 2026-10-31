import { expect, test } from 'bun:test';
import { buildTrimPlan } from './build-trim-plan.ts';

test('#buildTrimPlan a file under its limit moves nothing', () => {
  const text = '# kettle\n\n## Log\n09:10Z boiled the water\n09:11Z poured the tea\n\n## Holds\nlid: stuck\n';

  expect(buildTrimPlan(text, 10_000)).toStrictEqual({
    kind: 'plan',
    kept: text,
    moved: '',
    entriesMoved: 0,
    beforeBytes: Buffer.byteLength(text),
    afterBytes: Buffer.byteLength(text),
  });
});

test('#buildTrimPlan the oldest entries move until the file fits, and the other sections stay byte for byte', () => {
  const text = '# kettle\n\n## Cursors\nspout: 4\n\n## Log\n09:10Z boiled the water\n09:11Z poured the tea\n09:12Z washed the cup\n\n## Holds\nlid: stuck\n';
  const limit = Buffer.byteLength(text) - Buffer.byteLength('09:10Z boiled the water\n');

  expect(buildTrimPlan(text, limit)).toStrictEqual({
    kind: 'plan',
    kept: '# kettle\n\n## Cursors\nspout: 4\n\n## Log\n09:11Z poured the tea\n09:12Z washed the cup\n\n## Holds\nlid: stuck\n',
    moved: '09:10Z boiled the water\n',
    entriesMoved: 1,
    beforeBytes: Buffer.byteLength(text),
    afterBytes: limit,
  });
});

test('#buildTrimPlan an indented line and the blank line after it move with their entry', () => {
  const text = '## Log\n09:10Z boiled the water\n09:11Z poured the tea\n  with a splash of milk\n\n09:12Z washed the cup\n';
  const limit = Buffer.byteLength(text) - Buffer.byteLength('09:10Z boiled the water\n09:11Z poured the tea\n  with a splash of milk\n\n');

  expect(buildTrimPlan(text, limit)).toStrictEqual({
    kind: 'plan',
    kept: '## Log\n09:12Z washed the cup\n',
    moved: '09:10Z boiled the water\n09:11Z poured the tea\n  with a splash of milk\n\n',
    entriesMoved: 2,
    beforeBytes: 100,
    afterBytes: 29,
  });
});

test('#buildTrimPlan the newest entry stays even when the file is still over the limit', () => {
  const text = '# kettle\n\n## Log\n09:10Z boiled the water\n09:11Z poured the tea\n09:12Z washed the cup\n\n## Holds\nlid: stuck\n';

  expect(buildTrimPlan(text, 1)).toStrictEqual({
    kind: 'plan',
    kept: '# kettle\n\n## Log\n09:12Z washed the cup\n\n## Holds\nlid: stuck\n',
    moved: '09:10Z boiled the water\n09:11Z poured the tea\n',
    entriesMoved: 2,
    beforeBytes: 106,
    afterBytes: 60,
  });
});

test('#buildTrimPlan the heading line stays and lines before the first entry are never moved', () => {
  const text = '## Log\n\n  a note under the heading\n09:10Z boiled the water\n09:11Z poured the tea\n';

  expect(buildTrimPlan(text, 1)).toStrictEqual({
    kind: 'plan',
    kept: '## Log\n\n  a note under the heading\n09:11Z poured the tea\n',
    moved: '09:10Z boiled the water\n',
    entriesMoved: 1,
    beforeBytes: 81,
    afterBytes: 57,
  });
});

test('#buildTrimPlan the log section ends at the next heading, so entries after it are never moved', () => {
  const text = '## Log\n09:10Z boiled the water\n09:11Z poured the tea\n## Holds\nlid: stuck\nlid: loose\n';

  expect(buildTrimPlan(text, 1)).toStrictEqual({
    kind: 'plan',
    kept: '## Log\n09:11Z poured the tea\n## Holds\nlid: stuck\nlid: loose\n',
    moved: '09:10Z boiled the water\n',
    entriesMoved: 1,
    beforeBytes: 84,
    afterBytes: 60,
  });
});

test('#buildTrimPlan a heading that only starts with Log is not the log section', () => {
  expect(buildTrimPlan('## Logbook\n09:10Z boiled the water\n', 1)).toStrictEqual({ kind: 'no-log' });
});

test('#buildTrimPlan a Log-notes section before the real log is left untouched', () => {
  const text = '## Log-notes\n09:00Z descaled the kettle\n09:01Z dried the kettle\n## Log\n09:10Z boiled the water\n09:11Z poured the tea\n';

  expect(buildTrimPlan(text, 1)).toStrictEqual({
    kind: 'plan',
    kept: '## Log-notes\n09:00Z descaled the kettle\n09:01Z dried the kettle\n## Log\n09:11Z poured the tea\n',
    moved: '09:10Z boiled the water\n',
    entriesMoved: 1,
    beforeBytes: 117,
    afterBytes: 93,
  });
});

test('#buildTrimPlan a log heading with words after it is the log section', () => {
  expect(buildTrimPlan('## Log (last 24 h)\n09:10Z boiled the water\n09:11Z poured the tea\n', 1)).toStrictEqual({
    kind: 'plan',
    kept: '## Log (last 24 h)\n09:11Z poured the tea\n',
    moved: '09:10Z boiled the water\n',
    entriesMoved: 1,
    beforeBytes: 65,
    afterBytes: 41,
  });
});

test('#buildTrimPlan each side of the cut keeps the day its time-only entries take from the lines above', () => {
  const text = '## Today 2026-10-13\n\n## Log\n- 22:00Z DEPLOY kettle\n### 2026-10-14\n- 01:00Z HOLD kettle\n- 02:00Z DEPLOY kettle\n';

  expect(buildTrimPlan(text, 1)).toStrictEqual({
    kind: 'plan',
    kept: '## Today 2026-10-13\n\n## Log\n<!-- day context: 2026-10-14T01:00Z -->\n- 02:00Z DEPLOY kettle\n',
    moved: '### 2026-10-13 (day context)\n- 22:00Z DEPLOY kettle\n### 2026-10-14\n- 01:00Z HOLD kettle\n',
    entriesMoved: 3,
    beforeBytes: 110,
    afterBytes: 91,
  });
});

test('#buildTrimPlan entries keep moving until the file fits with the day line it adds back', () => {
  const text = '## Log\n### 2026-10-13\n- 09:00Z DEPLOY kettle\n- 09:05Z HOLD kettle\n- 09:10Z DEPLOY kettle\n';

  expect(buildTrimPlan(text, 79)).toStrictEqual({
    kind: 'plan',
    kept: '## Log\n<!-- day context: 2026-10-13T09:05Z -->\n- 09:10Z DEPLOY kettle\n',
    moved: '<!-- day context: none -->\n### 2026-10-13\n- 09:00Z DEPLOY kettle\n- 09:05Z HOLD kettle\n',
    entriesMoved: 3,
    beforeBytes: 89,
    afterBytes: 70,
  });
});

test('#buildTrimPlan a file with no log heading has no log', () => {
  expect(buildTrimPlan('# kettle\n\n## Cursors\nspout: 4\n', 1)).toStrictEqual({
    kind: 'no-log',
  });
});

test('#buildTrimPlan a log whose last line has no newline keeps it', () => {
  expect(buildTrimPlan('## Log\n09:10Z boiled the water\n09:11Z poured the tea', 1)).toStrictEqual({
    kind: 'plan',
    kept: '## Log\n09:11Z poured the tea',
    moved: '09:10Z boiled the water\n',
    entriesMoved: 1,
    beforeBytes: 52,
    afterBytes: 28,
  });
});
