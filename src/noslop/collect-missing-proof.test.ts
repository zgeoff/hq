import { expect, test } from 'bun:test';
import { collectMissingProof } from './collect-missing-proof.ts';

test('it finds nothing missing when each section has a heading and text under it', () => {
  const body = ['Teach the kettle skill to descale.', '', '## Skill checks', '', '```', 'chex skill: 0 problems', '```', '', '## Cold read', '', '- The step order was unclear: fixed.', '', '## Deslop', '', 'none'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});

test('it accepts any heading level and any case', () => {
  const body = ['### SKILL CHECKS', 'chex: 0 problems', '#### cold read', 'No findings.', '# deslop #', 'none'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual([]);
});

test('it names each section with no heading, in order', () => {
  expect(collectMissingProof('## Cold read\n\nNo findings.')).toStrictEqual(['Skill checks', 'Deslop']);
});

test('it counts a section with no text before the next heading as missing', () => {
  const body = ['## Skill checks', '', '## Cold read', 'No findings.', '## Deslop', '   '].join('\n');

  expect(collectMissingProof(body)).toStrictEqual(['Skill checks', 'Deslop']);
});

test('it ignores a heading inside a code fence', () => {
  const body = ['## Skill checks', 'chex: 0 problems', '~~~md', '## Cold read', 'No findings.', '~~~', '## Deslop', 'none'].join('\n');

  expect(collectMissingProof(body)).toStrictEqual(['Cold read']);
});

test('it names every section for an empty body', () => {
  expect(collectMissingProof('')).toStrictEqual(['Skill checks', 'Cold read', 'Deslop']);
});
