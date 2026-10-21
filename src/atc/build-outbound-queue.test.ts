import { expect, mock, test } from 'bun:test';
import { buildOutboundQueue } from './build-outbound-queue.ts';

test('it sends the unwritten rest of a short write before a later frame', () => {
  const write = mock<(data: Uint8Array) => number>(() => 3),
    writeQueue = buildOutboundQueue({ write });

  writeQueue.send('abcdef');
  writeQueue.send('gh');
  writeQueue.drain();

  expect(write.mock.calls.map(([data]) => new TextDecoder().decode(data))).toStrictEqual(['abcdef', 'def', 'gh']);
});
