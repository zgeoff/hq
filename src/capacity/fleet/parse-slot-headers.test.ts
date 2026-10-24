import { expect, test } from 'bun:test';
import { parseSlotHeaders } from './parse-slot-headers.ts';

test('it turns the utilization fractions into percent and the epoch resets into ISO times', () => {
  const headers = new Headers({
    'anthropic-ratelimit-unified-5h-utilization': '0.07',
    'anthropic-ratelimit-unified-5h-reset': '1792000000',
    'anthropic-ratelimit-unified-7d-utilization': '0.4125',
    'anthropic-ratelimit-unified-7d-reset': '1792400000',
  });

  expect(parseSlotHeaders(headers)).toStrictEqual({ five: 7, fiveResetsAt: '2026-10-14T17:46:40Z', seven: 41.25, sevenResetsAt: '2026-10-19T08:53:20Z' });
});

test('it leaves a header that is missing or not a number as null', () => {
  const headers = new Headers({ 'anthropic-ratelimit-unified-5h-utilization': 'soon', 'anthropic-ratelimit-unified-7d-reset': '' });

  expect(parseSlotHeaders(headers)).toStrictEqual({ five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null });
});
