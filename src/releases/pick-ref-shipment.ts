import { isGateTouched } from './is-gate-touched.ts';
import type { Gate } from './parse-gate.ts';
import type { Shipment } from './types.ts';

// What a ref source's ship check knows so far. A missing field is a read not made yet; null is a
// read that came back empty.
export interface RefFacts {
  found: Shipment | null | 'cap';
  gatedRef: string | null;
  gate?: Gate | null;
  files?: readonly string[];
  held?: boolean | 'cap';
}

export type RefStep = { kind: 'done'; result: Shipment | null | 'cap' } | { kind: 'read-gate' } | { kind: 'read-files' } | { kind: 'read-held' };

// The next step of a ref source's ship check. A PR in the main ref ships there, unless a gated
// path also needs the second ref to hold it; a gates file hq cannot read keeps the PR unshipped.
export function pickRefShipment(facts: RefFacts): RefStep {
  if (facts.found === null || facts.found === 'cap' || facts.gatedRef === null) {
    return { kind: 'done', result: facts.found };
  }
  if (facts.gate === undefined) {
    return { kind: 'read-gate' };
  }
  if (facts.gate === null) {
    return { kind: 'done', result: null };
  }
  if (facts.files === undefined) {
    return { kind: 'read-files' };
  }
  if (!isGateTouched(facts.gate, facts.files)) {
    return { kind: 'done', result: facts.found };
  }
  if (facts.held === undefined) {
    return { kind: 'read-held' };
  }
  if (facts.held === 'cap') {
    return { kind: 'done', result: 'cap' };
  }
  return { kind: 'done', result: facts.held ? { tag: facts.gatedRef, at: null } : null };
}
