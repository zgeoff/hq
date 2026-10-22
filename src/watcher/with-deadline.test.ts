import { expect, test } from 'bun:test';
import { withDeadline } from './with-deadline.ts';

test('it aborts the step it gives up on at the deadline', async () => {
  const abandon = new AbortController();
  const never = new Promise<never>(() => {});

  const late = await withDeadline(never, 10, 'invented step', abandon).then(
    () => null,
    (error: unknown) => error,
  );

  expect(late).toMatchObject({ code: 'timed_out' });
  expect(abandon.signal.aborted).toBe(true);
});

test('it leaves a step that settles in time running free of any abort', async () => {
  const abandon = new AbortController();

  await withDeadline(Promise.resolve('kettle'), 1000, 'invented step', abandon);

  expect(abandon.signal.aborted).toBe(false);
});
