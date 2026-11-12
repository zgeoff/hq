import { expect, test } from 'bun:test';
import fleet from '../../fleet.json';
import { findChatRefusal } from './find-chat-refusal.ts';

test('it names the owner session that fleet.json marks with the owner role', () => {
  const declaredOwner = fleet.sessions.find((session) => session.roles?.includes('owner'));

  expect(findChatRefusal({ verdict: 'other' })).toContain(`(${declaredOwner?.name})`);
  expect(findChatRefusal({ verdict: 'unknown', cause: 'socket closed' })).toContain(`(${declaredOwner?.name})`);
  expect(findChatRefusal({ verdict: 'owner' })).toBeNull();
});
