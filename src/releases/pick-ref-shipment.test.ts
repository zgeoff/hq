import { expect, test } from 'bun:test';
import { pickRefShipment } from './pick-ref-shipment.ts';
import type { RefFacts, RefStep } from './pick-ref-shipment.ts';

test.each<{ name: string; facts: RefFacts; step: RefStep }>([
  { name: 'a PR the main ref does not hold', facts: { found: null, gatedRef: 'deployed/teapot' }, step: { kind: 'done', result: null } },
  { name: 'a compare cap', facts: { found: 'cap', gatedRef: 'deployed/teapot' }, step: { kind: 'done', result: 'cap' } },
  { name: 'a source with no gate', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: null }, step: { kind: 'done', result: { tag: 'deployed/kettle', at: null } } },
  { name: 'a gate not read yet', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot' }, step: { kind: 'read-gate' } },
  { name: 'a gates file hq could not read', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: null }, step: { kind: 'done', result: null } },
  { name: 'files not read yet', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: { paths: ['nixos/**'], ignore: [] } }, step: { kind: 'read-files' } },
  { name: 'a PR that touches no gated path', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: { paths: ['nixos/**'], ignore: [] }, files: ['docs/kettle.md'] }, step: { kind: 'done', result: { tag: 'deployed/kettle', at: null } } },
  { name: 'a gated PR whose second ref is not read yet', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: { paths: ['nixos/**'], ignore: [] }, files: ['nixos/kettle.nix'] }, step: { kind: 'read-held' } },
  { name: 'a gated PR the second ref holds', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: { paths: ['nixos/**'], ignore: [] }, files: ['nixos/kettle.nix'], held: true }, step: { kind: 'done', result: { tag: 'deployed/teapot', at: null } } },
  { name: 'a gated PR the second ref does not hold', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: { paths: ['nixos/**'], ignore: [] }, files: ['nixos/kettle.nix'], held: false }, step: { kind: 'done', result: null } },
  { name: 'a gated PR whose second-ref compare hit the cap', facts: { found: { tag: 'deployed/kettle', at: null }, gatedRef: 'deployed/teapot', gate: { paths: ['nixos/**'], ignore: [] }, files: ['nixos/kettle.nix'], held: 'cap' }, step: { kind: 'done', result: 'cap' } },
])('it decides $name', (row) => {
  expect(pickRefShipment(row.facts)).toStrictEqual(row.step);
});
