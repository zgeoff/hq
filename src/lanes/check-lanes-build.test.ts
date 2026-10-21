import { expect, mock, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { checkLanesBuild } from './check-lanes-build.ts';

test('it is quiet when the checkout carries an identical lanes.json', () => {
  expect(checkLanesBuild(() => JSON.stringify(rulesTable), '/invented/hq/lanes.json')).toBeNull();
});

test('it is quiet when the checkout has no readable lanes.json', () => {
  expect(
    checkLanesBuild(() => {
      throw new Error('ENOENT: invented missing file');
    }, '/invented/hq/lanes.json'),
  ).toBeNull();
});

test('it warns when the checkout carries a changed lanes.json', () => {
  expect(checkLanesBuild(() => JSON.stringify({ ...rulesTable, readyState: 'Todo' }), '/invented/hq/lanes.json')).toBe(
    'the installed hq carries an older lanes.json than /invented/hq/lanes.json: the Ready read uses the old rules until `bun run install-bin` runs there',
  );
});

test('it reads the path it is given', () => {
  const readText = mock<(path: string) => string>(() => JSON.stringify(rulesTable));

  checkLanesBuild(readText, '/invented/hq/lanes.json');

  expect(readText.mock.calls).toStrictEqual([['/invented/hq/lanes.json']]);
});
