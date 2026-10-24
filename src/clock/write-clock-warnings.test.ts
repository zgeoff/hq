import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { overrideBuild } from '../../test/override-build.ts';
import { writeClockWarnings } from './write-clock-warnings.ts';

function setupTest() {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => lines.push(line),
  };
}

test('it warns once for each clock setting the installed hq ignores', () => {
  const ctx = setupTest();
  onTestFinished(overrideBuild({ commit: 'abc1234', dirty: false }));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  writeClockWarnings({ HQ_NOW: '2031-03-04T05:06:07Z', HQ_QUIET: '10-12', HQ_LIVE: '1' }, ctx.write);

  expect(ctx.lines).toStrictEqual(['hq: HQ_NOW is ignored in the installed hq', 'hq: HQ_QUIET is ignored in the installed hq']);
});

test('it says nothing in the installed hq when neither setting is set', () => {
  const ctx = setupTest();
  onTestFinished(overrideBuild({ commit: 'abc1234', dirty: false }));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  writeClockWarnings({ HQ_LIVE: '1' }, ctx.write);

  expect(ctx.lines).toStrictEqual([]);
});

test('it says nothing in a run from source, where the settings are honoured', () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  writeClockWarnings({ HQ_NOW: '2031-03-04T05:06:07Z', HQ_QUIET: '10-12' }, ctx.write);

  expect(ctx.lines).toStrictEqual([]);
});
