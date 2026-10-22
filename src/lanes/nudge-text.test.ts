import { expect, test } from 'bun:test';
import { nudgeText } from './nudge-text.ts';

test('it says there is no fresh Ready count from Linear when the count is unknown', () => {
  expect(nudgeText(3, 12, null)).toMatchInlineSnapshot(`"3 agent slots free for 12 min, Ready count unknown (no fresh Ready count from Linear): fill now. (hq lanes; you pick the issues and write the briefs.)"`);
});
