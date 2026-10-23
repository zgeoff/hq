import { expect, test } from 'bun:test';
import { buildStubReleaseGH } from '../../test/build-stub-release-gh.ts';
import { readReleaseList } from './read-release-list.ts';

test('it reads the published releases, drafts and prereleases left out', async () => {
  const run = buildStubReleaseGH(
    {
      'kettle-co/kettle': [
        { tag_name: 'v1.3.0', draft: true, prerelease: false, published_at: null },
        { tag_name: 'v1.3.0-rc.1', draft: false, prerelease: true, published_at: '2026-10-14T03:00:00Z' },
        { tag_name: 'v1.2.0', draft: false, prerelease: false, published_at: '2026-10-12T00:00:00Z' },
      ],
    },
    [],
  );

  const releases = await readReleaseList(run, 'kettle-co/kettle');

  expect(releases).toStrictEqual([{ tag: 'v1.2.0', publishedAt: '2026-10-12T00:00:00Z' }]);
});

test('it refuses an answer that is not JSON as bad_releases', () => {
  expect(readReleaseList(() => Promise.resolve({ code: 0, stdout: 'invented: not json', stderr: '' }), 'kettle-co/kettle')).rejects.toMatchObject({ code: 'bad_releases', message: 'releases of kettle-co/kettle are not JSON' });
});

test('it refuses JSON in the wrong shape as bad_releases', () => {
  expect(readReleaseList(() => Promise.resolve({ code: 0, stdout: '[{"tag_name":7}]', stderr: '' }), 'kettle-co/kettle')).rejects.toMatchObject({ code: 'bad_releases', message: 'releases of kettle-co/kettle have an unexpected shape' });
});
