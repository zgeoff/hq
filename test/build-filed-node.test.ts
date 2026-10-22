import { expect, test } from 'bun:test';
import { buildFiledNode } from './build-filed-node.ts';

test('it builds a person-filed issue with no labels or attachments, and takes overrides', () => {
  expect(buildFiledNode('GEO-9801', 'Descale the kettle.', { creator: null })).toStrictEqual({
    identifier: 'GEO-9801',
    title: 'Invented kettle work',
    createdAt: '2026-10-16T01:00:00Z',
    description: 'Descale the kettle.',
    creator: null,
    labels: { nodes: [] },
    attachments: { nodes: [] },
  });
});
