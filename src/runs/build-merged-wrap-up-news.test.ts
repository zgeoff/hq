import { expect, test } from 'bun:test';
import { buildMergedWrapUpNews } from './build-merged-wrap-up-news.ts';

test('it builds no news when every session was forgotten', () => {
  expect(buildMergedWrapUpNews('GEO-9901', { forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] })).toBeNull();
});

test('it names each kept and failed session by its first eight characters with its reason', () => {
  const text = buildMergedWrapUpNews('GEO-9901', {
    forgotten: ['0000a003-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    destroyed: [],
    kept: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }],
    failed: [{ id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'unpin: atc is down' }],
  });

  expect(text).toBe('GEO-9901 merged; wrap-up left kept 0000a001 (pinned in atc); failed 0000a002 (unpin: atc is down)');
});

test('it truncates a long list under 400 characters and counts the sessions it left out', () => {
  const kept = Array.from({ length: 12 }, (_, index) => ({ id: `0000b0${String(index).padStart(2, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, reason: 'its imp holds unpushed work (home-kettle: 3f2a1bc add kettle lid), so the imp stays' }));

  const text = buildMergedWrapUpNews('GEO-9901', { forgotten: [], destroyed: [], kept, failed: [] });

  expect(text?.length).toBeLessThanOrEqual(400);
  expect(text).toMatch(/; and \d+ more$/);
  expect(text).toStartWith('GEO-9901 merged; wrap-up left kept 0000b000 (');
});

test('it puts a multi-line reason on one line', () => {
  const text = buildMergedWrapUpNews('GEO-9901', { forgotten: [], destroyed: [], kept: [], failed: [{ id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc said\nno' }] });

  expect(text).toBe('GEO-9901 merged; wrap-up left failed 0000a002 (atc said no)');
});
