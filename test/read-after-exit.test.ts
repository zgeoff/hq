import { expect, test } from 'bun:test';
import { readAfterExit } from './read-after-exit.ts';

test('it gives its value once the process exits, after the given time', async () => {
  const started = performance.now(),
    value = await readAfterExit('invented answer', 0.1);
  expect(value).toBe('invented answer');
  expect(performance.now() - started).toBeGreaterThanOrEqual(90);
});

test('it arrives after a deadline that expired while another answer blocked the event loop', async () => {
  const blocker = (async () => {
      await readAfterExit('first', 0.05);
      Bun.sleepSync(600);
    })(),
    late = (async () => {
      await Bun.sleep(300);
      return 'deadline';
    })(),
    order: string[] = [],
    racer = (async () => {
      const won = await Promise.race([readAfterExit('second', 0.1), late]);
      order.push(won);
    })();
  await Promise.all([blocker, racer]);
  expect(order).toStrictEqual(['deadline']);
});
