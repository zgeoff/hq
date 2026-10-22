import { expect, test } from 'bun:test';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { readMergeVerdicts } from './read-merge-verdicts.ts';

const MERGE = 'abcd000000000000000000000000000000000001';

function buildComments(...bodies: string[]): string {
  return bodies.map((body) => JSON.stringify({ login: 'noslop-review[bot]', body })).join('\n');
}

test('it takes the newest summary comment, so a later rejection replaces an older check', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: buildComments(`<!-- noslop:summary {"checkedMerges":["${MERGE}"]} -->`, `<!-- noslop:summary {"checkedMerges":[],"rejectedMerges":["${MERGE}"]} -->`), stderr: '' } }),
    verdicts = await readMergeVerdicts(fake.run, 'zgeoff/widgets', 7);

  expect({ checked: [...verdicts.checked], rejected: [...verdicts.rejected] }).toStrictEqual({ checked: [], rejected: [MERGE] });
});

test('it fails on a newest summary marker that is not an object, rather than use an older one', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: buildComments(`<!-- noslop:summary {"checkedMerges":["${MERGE}"]} -->`, '<!-- noslop:summary null -->'), stderr: '' } });

  await expect(readMergeVerdicts(fake.run, 'zgeoff/widgets', 7)).rejects.toThrow("hq cannot read noslop's summary marker on the PR");
});

test('it fails on a newest summary marker that never closes, rather than use an older one', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: buildComments(`<!-- noslop:summary {"checkedMerges":["${MERGE}"]} -->`, `<!-- noslop:summary {"checkedMerges":["${MERGE}"]}`), stderr: '' } });

  await expect(readMergeVerdicts(fake.run, 'zgeoff/widgets', 7)).rejects.toThrow("hq cannot read noslop's summary marker on the PR");
});
