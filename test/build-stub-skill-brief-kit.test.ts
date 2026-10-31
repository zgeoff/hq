import { expect, test } from 'bun:test';
import { findFencedBlock } from '../src/brief/find-fenced-block.ts';
import { buildStubSkillBriefKit } from './build-stub-skill-brief-kit.ts';

test('it holds the three templates, the design playbook and the two skills, each template fence readable', () => {
  const kit = buildStubSkillBriefKit();

  expect(Object.keys(kit).toSorted()).toStrictEqual(['agent-kit/agent-design-brief.md', 'agent-kit/design-brief.md', 'agent-kit/playbooks/design.md', 'agent-kit/pr-walk-brief.md', 'skills/fix-it-here/SKILL.md', 'skills/tickets/SKILL.md']);
  expect(findFencedBlock(kit['agent-kit/agent-design-brief.md'] ?? '', null)).toBe('/goal A kettle record for {{issue_id}}. Read the playbook: {{playbook}}\n\nPermissions: {{record_line}} Commit nothing.{{permissions}}\n\nCheck the spout: {{check_sketches}}');
  expect(findFencedBlock(kit['agent-kit/design-brief.md'] ?? '', null)).toBe('Run a design session with me for {{issue_id}} in {{repo}}: a kettle that pours.\n\nSettle the spout first.');
  expect(findFencedBlock(kit['agent-kit/pr-walk-brief.md'] ?? '', null)).toBe('# Brief: going through the kettle PRs with the owner\n\nFind out why each lid PR took rework.');
});

test('it leaves out the paths it is told to', () => {
  const kit = buildStubSkillBriefKit({ without: ['skills/tickets/SKILL.md'] });

  expect(Object.keys(kit).toSorted()).toStrictEqual(['agent-kit/agent-design-brief.md', 'agent-kit/design-brief.md', 'agent-kit/playbooks/design.md', 'agent-kit/pr-walk-brief.md', 'skills/fix-it-here/SKILL.md']);
});
