import { expect, test } from 'bun:test';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { readSummaryHead } from './read-summary-head.ts';

test('it takes the head of the newest summary comment by the noslop App', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: [JSON.stringify({ login: 'noslop-review[bot]', body: '<!-- noslop:summary {"head":"f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed"} -->' }), JSON.stringify({ login: 'noslop-review[bot]', body: 'Review summary\n<!-- noslop:summary {"head":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678","reviews":2} -->' })].join('\n'), stderr: '' } });

  await expect(readSummaryHead(fake.run, 'zgeoff/widgets', 7)).resolves.toStrictEqual({ found: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' });
});

test('it ignores a summary marker in a comment by anyone but the noslop App', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: [JSON.stringify({ login: 'noslop-review[bot]', body: '<!-- noslop:summary {"head":"f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed"} -->' }), JSON.stringify({ login: 'kettle-fan', body: '<!-- noslop:summary {"head":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"} -->' })].join('\n'), stderr: '' } });

  await expect(readSummaryHead(fake.run, 'zgeoff/widgets', 7)).resolves.toStrictEqual({ found: true, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' });
});

test('it finds no summary on a PR with no summary comment', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: `${JSON.stringify({ login: 'noslop-review[bot]', body: 'The kettle looks fine.' })}\n`, stderr: '' } });

  await expect(readSummaryHead(fake.run, 'zgeoff/widgets', 7)).resolves.toStrictEqual({ found: false, reason: 'noslop has posted no review summary on the PR' });
});

test.each([
  ['a null marker', '<!-- noslop:summary null -->'],
  ['a marker that never closes', '<!-- noslop:summary {"head":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"}'],
  ['a marker that is not JSON', '<!-- noslop:summary {head: kettle} -->'],
  ['a marker with no head', '<!-- noslop:summary {"reviews":1} -->'],
])('it reads no head from %s in the newest summary, rather than an older one', async (_label, body) => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: [JSON.stringify({ login: 'noslop-review[bot]', body: '<!-- noslop:summary {"head":"f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed"} -->' }), JSON.stringify({ login: 'noslop-review[bot]', body })].join('\n'), stderr: '' } });

  await expect(readSummaryHead(fake.run, 'zgeoff/widgets', 7)).resolves.toStrictEqual({ found: false, reason: "hq cannot read the head in noslop's summary marker on the PR" });
});

test('it reads no head when gh cannot read the comments, with the cause', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 1, stdout: '', stderr: 'gh: Server Error (HTTP 502)' } });

  await expect(readSummaryHead(fake.run, 'zgeoff/widgets', 7)).resolves.toStrictEqual({ found: false, reason: 'gh cannot read the comments of the PR (gh: Server Error (HTTP 502))' });
});

test('it reads no head when gh prints a line that is not a comment', async () => {
  const fake = buildFakeRunner({ markerComments: { code: 0, stdout: 'kettle\n', stderr: '' } });

  await expect(readSummaryHead(fake.run, 'zgeoff/widgets', 7)).resolves.toStrictEqual({ found: false, reason: 'gh api repos/zgeoff/widgets/issues/7/comments printed a line that is not a comment' });
});
