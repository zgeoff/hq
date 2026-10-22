import { expect, test } from 'bun:test';
import { mismatch } from './mismatch.ts';

test("it names hq's version when the refusal text is in another wording", () => {
  expect(mismatch('nope').message).toBe("atc refused hq's protocol (nope); hq speaks protocol v11. hq and atc install together: install the hq release that matches this atc.");
});

test("it names both versions when the refusal is atc's own wording", () => {
  const text = 'hq speaks protocol v11, daemon 7.2.0 speaks v12; restart the daemon so both run the same build';

  expect(mismatch(text).message).toBe('atc 7.2.0 speaks protocol v12; hq speaks protocol v11. hq and atc install together: install the hq release that matches this atc.');
});
