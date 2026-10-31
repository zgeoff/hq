import { expect, test } from 'bun:test';
import { pickBriefReads } from './pick-brief-reads.ts';

test('it picks the repo and the Type playbook, and nothing optional for an M issue in a repo noslop does not review', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'cloud' }, { name: 'M', parent: { name: 'Size' } }] };

  expect(pickBriefReads(issue, { imp: false, repo: null }, { repos: ['tools'], sha: null, caps: {} }, 'a'.repeat(40))).toStrictEqual({
    repo: 'cloud',
    otherAreas: [],
    playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: `gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${'a'.repeat(40)}' -H 'Accept: application/vnd.github.raw'` },
    stack: false,
    imp: false,
    reviewLines: false,
  });
});

test('it picks no playbook for an issue with no Type label', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }] };

  expect(pickBriefReads(issue, { imp: false, repo: null }, { repos: [], sha: null, caps: {} }, 'a'.repeat(40)).playbook).toBeNull();
});

test.each([
  ['S', false],
  ['M', false],
  ['L', true],
  ['XL', true],
])('it reads the stack line for a size %s issue: %p', (size, expected) => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: size, parent: { name: 'Size' } }] };

  expect(pickBriefReads(issue, { imp: false, repo: null }, { repos: [], sha: null, caps: {} }, 'a'.repeat(40)).stack).toBe(expected);
});

test('it reads the imp line with --imp', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }] };

  expect(pickBriefReads(issue, { imp: true, repo: null }, { repos: [], sha: null, caps: {} }, 'a'.repeat(40)).imp).toBe(true);
});

test('it reads the review lines for a repo noslop reviews, whatever its case', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'tools' }] };

  expect(pickBriefReads(issue, { imp: false, repo: null }, { repos: ['Tools'], sha: null, caps: {} }, 'a'.repeat(40)).reviewLines).toBe(true);
});

test('it refuses an issue with no area label, since none names the repo', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'Bug', parent: { name: 'Type' } }] };

  expect(() => pickBriefReads(issue, { imp: false, repo: null }, { repos: [], sha: null, caps: {} }, 'a'.repeat(40))).toThrow('GEO-9001 needs an area label to name its repo; it has none');
});

test('it names the other areas when --repo picks one area of several', () => {
  const issue = { identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'imp' }, { name: 'tools' }] };
  const reads = pickBriefReads(issue, { imp: false, repo: 'imp' }, { repos: [], sha: null, caps: {} }, 'a'.repeat(40));

  expect([reads.repo, reads.otherAreas]).toStrictEqual(['imp', ['cloud', 'tools']]);
});
