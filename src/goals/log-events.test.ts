import { expect, test } from 'bun:test';
import { logEvents } from './log-events.ts';

test('log events: a full time, or HH:MMZ on the last dated day; a time far behind rolls to the next day', () => {
  const text = [
    '- 2026-10-13T22:00Z took over',
    '- 22:30Z DEPLOY nixie 0.1.0 live',
    '- 23:10Z HOLD cloud switch until 08:00 Sydney; MORNING DEPLOY of nixie later',
    '- 01:15Z DEPLOY-START cloud; HOLD lifted for atc',
    '- 01:20Z DEPLOY cloud main',
    '## 2026-10-15 a heading',
    '- 03:00Z merged a PR, nothing else',
    'a continuation line: HOLD it too',
    '- 04:00Z HOLD a release',
  ].join('\n');
  expect(logEvents([text])).toEqual([
    { kind: 'DEPLOY', at: '2026-10-13T22:30:00Z' },
    { kind: 'HOLD', at: '2026-10-13T23:10:00Z' },
    { kind: 'DEPLOY', at: '2026-10-14T01:20:00Z' }, // 01:20 after 23:10: the next UTC day
    { kind: 'HOLD', at: '2026-10-15T03:00:00Z' }, // a line with no time takes the last line's
    { kind: 'HOLD', at: '2026-10-15T04:00:00Z' },
  ]);
});
