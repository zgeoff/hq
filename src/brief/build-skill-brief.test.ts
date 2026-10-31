import { expect, test } from 'bun:test';
import { buildSkillBrief } from './build-skill-brief.ts';

test('it builds the full brief from one fixed set of facts', () => {
  const brief = buildSkillBrief({
    issue: { identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }] },
    sha: 'c'.repeat(40),
    kind: 'design',
    template: 'Design the lid of {{repo}} for {{issue_id}}. {{spout}}',
    skill: { name: 'tickets', path: 'skills/tickets/SKILL.md', command: 'gh api tickets' },
    repo: 'zgeoff/cloud',
  });

  expect(brief).toMatchInlineSnapshot(`
    {
      "data": {
        "bytes": 100,
        "cuts": [],
        "goalFile": null,
        "issue": "GEO-9001",
        "kind": "design",
        "playbook": null,
        "prompt": 
    "Design the lid of zgeoff/cloud for GEO-9001. {{spout}}

    First read the tickets skill: gh api tickets"
    ,
        "ref": "cccccccccccccccccccccccccccccccccccccccc",
        "repo": "zgeoff/cloud",
        "skill": {
          "command": "gh api tickets",
          "name": "tickets",
          "path": "skills/tickets/SKILL.md",
        },
        "unfilled": [
          "placeholder:spout",
        ],
      },
      "text": 
    "Design the lid of zgeoff/cloud for GEO-9001. {{spout}}

    First read the tickets skill: gh api tickets"
    ,
    }
  `);
});

test('it gives equal briefs for equal facts', () => {
  const facts = {
    issue: { identifier: 'GEO-9001', description: '', labels: [] },
    sha: 'c'.repeat(40),
    kind: 'pr-walk' as const,
    template: 'Walk the PR for {{issue_id}}.',
    skill: { name: 'fix-it-here', path: 'skills/fix-it-here/SKILL.md', command: 'gh api fix' },
    repo: null,
  };

  expect(buildSkillBrief(facts)).toStrictEqual(buildSkillBrief(facts));
});

test('it needs no area label when the template names no repo', () => {
  const brief = buildSkillBrief({
    issue: { identifier: 'GEO-9001', description: '', labels: [] },
    sha: 'c'.repeat(40),
    kind: 'pr-walk',
    template: 'Walk the PR for {{issue_id}}.',
    skill: { name: 'fix-it-here', path: 'skills/fix-it-here/SKILL.md', command: 'gh api fix' },
    repo: null,
  });

  expect(brief.data['repo']).toBeNull();
});


test('it refuses a brief over 4000 bytes with its byte count', () => {
  expect(() =>
    buildSkillBrief({
      issue: { identifier: 'GEO-9001', description: '', labels: [] },
      sha: 'c'.repeat(40),
      kind: 'design',
      template: 'k'.repeat(4000),
      skill: { name: 'tickets', path: 'skills/tickets/SKILL.md', command: 'gh api tickets' },
    repo: null,
    }),
  ).toThrow(expect.objectContaining({ code: 'too_long', message: 'the brief is 4046 bytes, over the 4000 limit', data: { bytes: 4046, cuts: [] } }));
});
