import { expect, test } from 'bun:test';
import type { DocumentLookup } from './to-document-lookup.ts';
import { toDocumentLookup } from './to-document-lookup.ts';

test.each<[string, DocumentLookup]>([
  ['https://linear.app/kettle/document/descaling-plan-abc123def456', { by: 'slugID', slugID: 'abc123def456' }],
  ['https://linear.app/kettle/document/descaling-plan-abc123def456?x=1#top', { by: 'slugID', slugID: 'abc123def456' }],
  ['descaling-plan-abc123def456', { by: 'slugID', slugID: 'abc123def456' }],
  ['abc123def456', { by: 'slugID', slugID: 'abc123def456' }],
  ['5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', { by: 'id', id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10' }],
  ['https://linear.app/kettle/document/5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', { by: 'id', id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10' }],
  ['descaling-plan', { by: 'id', id: 'descaling-plan' }],
])('it looks %s up as %o', (ref, expected) => {
  expect(toDocumentLookup(ref)).toStrictEqual(expected);
});
