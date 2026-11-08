import { expect, test } from 'bun:test';
import { z } from 'zod';
import { parseLinearData } from './parse-linear-data.ts';

function setupTest() {
  const nodes = z.array(z.object({ identifier: z.string() }));
  return { schema: z.object({ issues: z.object({ nodes }) }) };
}

test('#parseLinearData returns the data a schema accepts', () => {
  const ctx = setupTest();

  expect(parseLinearData({ issues: { nodes: [{ identifier: 'GEO-1' }] } }, ctx.schema)).toStrictEqual({ issues: { nodes: [{ identifier: 'GEO-1' }] } });
});

test('#parseLinearData names where the shape is wrong', () => {
  const ctx = setupTest();

  expect(() => parseLinearData({ issues: { nodes: [{ identifier: 4 }] } }, ctx.schema)).toThrow(/at issues\.nodes\.0\.identifier/u);
});

test('#parseLinearData throws linear_failed for an answer with no issues', () => {
  const ctx = setupTest();
  const outcome = Promise.try(() => parseLinearData({}, ctx.schema));

  expect(outcome).rejects.toMatchObject({ code: 'linear_failed' });
});
