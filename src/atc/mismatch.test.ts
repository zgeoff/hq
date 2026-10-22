import { expect, test } from 'bun:test';
import { mismatch } from './mismatch.ts';

test("it names hq's version when the refusal text is in another wording", () => {
  expect(mismatch('nope').message).toBe("atc refused hq's protocol (nope); hq speaks protocol v8. hq and atc install together: install the hq release that matches this atc.");
});

test("it names both versions when the refusal is atc's own wording", () => {
  const text = 'hq speaks protocol v8, daemon 7.1.0 speaks v9; restart the daemon so both run the same build';

  expect(mismatch(text).message).toBe('atc 7.1.0 speaks protocol v9; hq speaks protocol v8. hq and atc install together: install the hq release that matches this atc.');
});
