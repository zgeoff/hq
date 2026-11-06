import { expect, test } from 'bun:test';
import { pickOwnedPrWrites } from './pick-owned-pr-writes.ts';

test.each([
  {
    title: 'a new PR',
    existing: null,
    given: '0000d001',
    expected: { kind: 'write', attached: true, owner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousOwner: null, ownerChanged: true },
  },
  {
    title: 'an attached PR with no owner',
    existing: { session_id: null, session_by_hand: 0 },
    given: '0000d001',
    expected: { kind: 'write', attached: false, owner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousOwner: null, ownerChanged: true },
  },
  {
    title: 'a PR a marker gave the same session',
    existing: { session_id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', session_by_hand: 0 },
    given: '0000d001',
    expected: { kind: 'write', attached: false, owner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousOwner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerChanged: true },
  },
  {
    title: 'a PR the same session owns by hand',
    existing: { session_id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', session_by_hand: 1 },
    given: '0000d001',
    expected: { kind: 'write', attached: false, owner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousOwner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerChanged: false },
  },
  {
    title: 'a PR another session owns by hand',
    existing: { session_id: '0000d002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', session_by_hand: 1 },
    given: '0000d001',
    expected: { kind: 'write', attached: false, owner: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousOwner: '0000d002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerChanged: true },
  },
  {
    title: 'a session the run does not have',
    existing: null,
    given: '0000d009',
    expected: { kind: 'no-session' },
  },
])('it picks the writes for $title', (row) => {
  expect(pickOwnedPrWrites({ existing: row.existing, sessionIDs: ['0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000d002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], given: row.given })).toStrictEqual(row.expected);
});
