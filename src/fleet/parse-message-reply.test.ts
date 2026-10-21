import { expect, test } from 'bun:test';
import { parseMessageReply } from './parse-message-reply.ts';
import type { MessageLookup, MessageReply } from './parse-message-reply.ts';

test.each<[string, MessageLookup, MessageReply]>([
  ['a save request not yet sent', { kind: 'unsent' }, { kind: 'pending' }],
  ['a failed lookup', { kind: 'failed' }, { kind: 'unread' }],
  ['an unanswered message', { kind: 'read', status: 'unanswered', answer: null, answeredAt: null }, { kind: 'unanswered' }],
  ['a delivered message', { kind: 'read', status: 'delivered', answer: null, answeredAt: null }, { kind: 'pending' }],
  ['a queued message', { kind: 'read', status: 'queued', answer: null, answeredAt: null }, { kind: 'pending' }],
  ['a saved answer', { kind: 'read', status: 'answered', answer: 'saved', answeredAt: 1_792_499_114_832 }, { kind: 'saved', answeredAt: 1_792_499_114_832 }],
  ['a quoted saved answer with a full stop', { kind: 'read', status: 'answered', answer: ' `Saved`. ', answeredAt: 1_792_499_114_832 }, { kind: 'saved', answeredAt: 1_792_499_114_832 }],
  ['a saved answer with no time', { kind: 'read', status: 'answered', answer: 'saved', answeredAt: null }, { kind: 'saved', answeredAt: undefined }],
  ['a busy answer', { kind: 'read', status: 'answered', answer: 'busy!', answeredAt: 1_792_499_114_832 }, { kind: 'busy' }],
  ['another answer', { kind: 'read', status: 'answered', answer: 'invented reply', answeredAt: 1_792_499_114_832 }, { kind: 'pending' }],
  ['an answer with no text', { kind: 'read', status: 'answered', answer: null, answeredAt: 1_792_499_114_832 }, { kind: 'pending' }],
])('it reads %s as its reply', (_, lookup, expected) => {
  expect(parseMessageReply(lookup)).toStrictEqual(expected);
});
