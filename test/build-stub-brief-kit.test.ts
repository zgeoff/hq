import { expect, test } from 'bun:test';
import { buildStubBriefKit } from './build-stub-brief-kit.ts';
import { findFencedBlock } from '../src/brief/find-fenced-block.ts';

test('it holds the template, briefs, review lines and two playbooks, each text fence readable', () => {
  const kit = buildStubBriefKit();

  expect(Object.keys(kit).toSorted()).toStrictEqual([
    'agent-kit/brief.md',
    'agent-kit/playbooks/bug.md',
    'agent-kit/playbooks/feature.md',
    'agent-kit/review-lines.md',
    'skills/delivery-lead/references/briefs.md',
  ]);
  expect(findFencedBlock(kit['agent-kit/brief.md'] ?? '', null)?.startsWith('/goal A ready PR in {{repo}}')).toBe(true);
  expect(findFencedBlock(kit['skills/delivery-lead/references/briefs.md'] ?? '', 'The stack line:')).toBe('STACK-LINE: build this in layers.');
  expect(findFencedBlock(kit['skills/delivery-lead/references/briefs.md'] ?? '', 'The imp line:')).toBe('IMP-LINE: this imp has a small kettle.');
});

test('it leaves out the paths it is told to', () => {
  const kit = buildStubBriefKit({ without: ['agent-kit/brief.md', 'agent-kit/playbooks/bug.md'] });

  expect(Object.keys(kit)).not.toContain('agent-kit/brief.md');
  expect(Object.keys(kit)).not.toContain('agent-kit/playbooks/bug.md');
  expect(Object.keys(kit)).toContain('agent-kit/playbooks/feature.md');
});
