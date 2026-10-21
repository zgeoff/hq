import { expect, test } from 'bun:test';
import { messageGetSchema } from './message-get-schema.ts';

test('it accepts an answered message with epoch-millisecond times', () => {
  const payload = {
    message: 'm-invented-1',
    session: 'id-kettle',
    from: 'hq',
    sender: { kind: 'local', name: 'hq' },
    text: 'invented save request',
    status: 'answered' as const,
    sentAt: 1_792_499_100_360,
    deliveredAt: 1_792_499_100_377,
    answeredAt: 1_792_499_114_832,
    answer: 'saved',
    turn: null,
    answeredWith: [],
  };

  expect(messageGetSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects an answeredAt sent as a string', () => {
  const result = messageGetSchema.safeParse({
    message: 'm-invented-1',
    session: 'id-kettle',
    from: 'hq',
    sender: { kind: 'local', name: 'hq' },
    text: 'invented save request',
    status: 'answered',
    sentAt: 1_792_499_100_360,
    deliveredAt: 1_792_499_100_377,
    answeredAt: '2026-10-20T12:25:14Z',
    answer: 'saved',
    turn: null,
    answeredWith: [],
  });

  expect(result.error?.issues).toContainEqual(expect.objectContaining({ path: ['answeredAt'] }));
});
