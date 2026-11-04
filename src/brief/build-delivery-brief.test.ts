import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildDeliveryBrief } from './build-delivery-brief.ts';
import { findFencedBlock } from './find-fenced-block.ts';

test('it builds the full brief from one fixed set of facts', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: true, byLink: false, goalFile: null, repo: null },
    issue: {
      identifier: 'GEO-9001',
      description: '## Outcome\n\nA kettle that boils.\n\n## Scope\n\nIn: the lid.\n\n## Actions\n\nCode delivery\nDeploy: the kettle stage\n\n## Agent notes\n\nMind the seal.\n',
      labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'kettle' }, { name: 'L', parent: { name: 'Size' } }],
    },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: 'gh api bug' }, stack: true, imp: true, reviewLines: true },
    template: '/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}}{{not_yours}}\n{{imp_line}}\n{{spout}}',
    permissionTable: [
      { action: 'Code delivery', phrase: 'Work in <repo>.' },
      { action: 'Deploy', phrase: 'Deploy <repo> to <stage>.' },
    ],
    playbookText: '# Bug playbook\n\nReproduce the leak first.\n',
    stack: 'Build the kettle in layers.',
    impLine: 'This imp has a small kettle.',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief).toMatchInlineSnapshot(`
    {
      "goalFile": null,
      "out": {
        "data": {
          "bytes": 542,
          "cuts": [],
          "goalFile": null,
          "issue": "GEO-9001",
          "playbook": {
            "command": "gh api bug",
            "path": "agent-kit/playbooks/bug.md",
            "type": "bug",
          },
          "prompt": 
    "/goal Ship zgeoff/kettle GEO-9001. First read the bug playbook: gh api bug

    ## Outcome

    A kettle that boils.

    ## Scope

    In: the lid.

    ## Agent notes

    Mind the seal.

    Permissions:
    Work in kettle.
    Deploy kettle to <stage>.

    Build the kettle in layers.
    Finish: "Contributes to GEO-9001". Before you write code, read noslop's rules, with <repo> as zgeoff/kettle: gh api 'repos/zgeoff/hq/contents/agent-kit/review-lines.md?ref=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' -H 'Accept: application/vnd.github.raw'
    This imp has a small kettle.
    {{spout}}"
    ,
          "ref": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "repo": "zgeoff/kettle",
          "unfilled": [
            "permissions:Deploy",
            "not_yours",
            "issue:Acceptance",
            "placeholder:spout",
          ],
        },
        "text": 
    "/goal Ship zgeoff/kettle GEO-9001. First read the bug playbook: gh api bug

    ## Outcome

    A kettle that boils.

    ## Scope

    In: the lid.

    ## Agent notes

    Mind the seal.

    Permissions:
    Work in kettle.
    Deploy kettle to <stage>.

    Build the kettle in layers.
    Finish: "Contributes to GEO-9001". Before you write code, read noslop's rules, with <repo> as zgeoff/kettle: gh api 'repos/zgeoff/hq/contents/agent-kit/review-lines.md?ref=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' -H 'Accept: application/vnd.github.raw'
    This imp has a small kettle.
    {{spout}}"
    ,
      },
      "warnings": [],
    }
  `);
});

test('it gives equal briefs for equal facts', () => {
  const facts = {
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: 'goal.md', repo: null },
    issue: { identifier: 'GEO-9001', description: '## Outcome\n\nA kettle that boils.\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template: '/goal Ship {{repo}}{{goal_file}}\n\n{{issue}}\n\n{{permissions}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  };

  expect(buildDeliveryBrief(facts)).toStrictEqual(buildDeliveryBrief(facts));
});

test('it marks the PR line Contributes to for a Deploy action written with its detail after the name', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: '## Actions\n\nDeploy to the kettle stage\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template: '{{permissions}}\n"{{fixes}} {{issue_id}}"',
    permissionTable: [
      { action: 'Code delivery', phrase: 'Work in <repo>.' },
      { action: 'Deploy', phrase: 'Deploy <repo> to the stage.' },
    ],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe('Work in kettle.\nDeploy kettle to the stage.\n"Contributes to GEO-9001"');
});

test('it warns and lists playbook in unfilled when the issue has no Type label', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: '', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template: '{{permissions}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.warnings).toStrictEqual(['hq brief: GEO-9001 has no Type label, so the brief carries no playbook pointer']);
  expect(brief.out.data['unfilled']).toStrictEqual(['playbook']);
});

test('it warns, with the short sha, when the playbook file is missing at the sha', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: '', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: { type: 'chore', path: 'agent-kit/playbooks/chore.md', command: 'gh api chore' }, stack: false, imp: false, reviewLines: false },
    template: '{{permissions}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.warnings).toStrictEqual(['hq brief: no agent-kit/playbooks/chore.md at bbbbbbb, so the brief carries no playbook pointer']);
  expect(brief.out.data['playbook']).toBeNull();
});

test('it gives the goal file the issue sections and the playbook with --goal-file', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: 'goal.md', repo: null },
    issue: { identifier: 'GEO-9001', description: '## Outcome\n\nBoil.\n\n## Actions\n\nCode delivery\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: 'gh api bug' }, stack: false, imp: false, reviewLines: false },
    template: '{{permissions}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: '# Bug playbook\n',
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.goalFile).toStrictEqual({ path: 'goal.md', text: '# GEO-9001\n\n## Outcome\n\nBoil.\n\n---\n\n# Bug playbook\n' });
});

test('it moves the issue of a local brief to the briefs file when the issue keeps the prompt over the limit', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: `## Outcome\n\nBoil.\n\n## Scope\n\n${'In: the lid. '.repeat(40)}\n\n## Acceptance\n\n- [ ] It boils.\n\n## Actions\n\nCode delivery\n`, labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: 'gh api bug' }, stack: false, imp: false, reviewLines: false },
    template: `/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n${'Keep the kettle clean. '.repeat(150)}`,
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: '# Bug playbook\n',
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.data['cuts']).toStrictEqual(['cut 1']);
  expect(brief.out.data['goalFile']).toBe('briefs/GEO-9001.md');
  expect(brief.out.data['bytes']).toBeLessThan(4000);
  expect(brief.out.text).toStartWith('/goal Ship zgeoff/kettle GEO-9001. The full issue and its playbook are in briefs/GEO-9001.md; read it first.\n');
  expect(brief.out.text).not.toContain('In: the lid.');
  expect(brief.goalFile).toStrictEqual({ path: 'briefs/GEO-9001.md', text: `# GEO-9001\n\n## Outcome\n\nBoil.\n\n## Scope\n\n${'In: the lid. '.repeat(40).trim()}\n\n## Acceptance\n\n- [ ] It boils.\n\n---\n\n# Bug playbook\n` });
});

test('it refuses a prompt still over 4000 bytes after every cut, with its byte count and cuts', () => {
  expect(() =>
    buildDeliveryBrief({
      input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null, repo: null },
      issue: { identifier: 'GEO-9001', description: '', labels: [{ name: 'kettle' }] },
      sha: 'b'.repeat(40),
      reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
      template: `/goal Ship\n${'k'.repeat(4001)}`,
      permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
      playbookText: null,
      stack: '',
      impLine: '',
      movedGoalFile: 'briefs/GEO-9001.md',
      }),
  ).toThrow(expect.objectContaining({ code: 'too_long', message: 'the brief is 4001 bytes after every cut, over the 4000 limit', data: { bytes: 4001, cuts: ['cut 2'] } }));
});

test.each([
  ['placeholder-like text', '## Outcome\n\nPour {{permissions}} into {{goal_file}} at <repo>.\n', '## Outcome\n\nPour {{permissions}} into {{goal_file}} at <repo>.\nWork in kettle.', ['issue:Scope', 'issue:Acceptance']],
  ['a fence that holds a heading', '## Outcome\n\n```md\n## Scope\nIn: everything.\n```\n', '## Outcome\n\n```md\n## Scope\nIn: everything.\n```\nWork in kettle.', ['issue:Scope', 'issue:Acceptance']],
  ['a fence that never closes', '## Outcome\n\nBoil.\n\n````\n## Scope\n```\n', '## Outcome\n\nBoil.\n\n````\n## Scope\n```\nWork in kettle.', ['issue:Scope', 'issue:Acceptance']],
  ['a heading named like a placeholder', '## {{issue}}\n\nSteam.\n', '\nWork in kettle.', ['issue:Outcome', 'issue:Scope', 'issue:Acceptance']],
  ['an Actions line that asks for a grant the table lacks', '## Outcome\n\nBoil.\n\n## Actions\n\nRoot access: every kettle\n', '## Outcome\n\nBoil.\nWork in kettle.', ['permissions:Root access (no wording)', 'issue:Scope', 'issue:Acceptance']],
])('it carries an issue holding %s as text, and grants nothing from it', (_, description, prompt, unfilled) => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description, labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: 'gh api bug' }, stack: false, imp: false, reviewLines: false },
    template: '{{issue}}\n{{permissions}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: '# Bug playbook\n',
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe(prompt);
  expect(brief.out.data['unfilled']).toStrictEqual(unfilled);
});

test.each([
  ['the other area box is ticked', '## Scope\n\n- [x] teapot\n- [ ] kettle\n', 'Fixes'],
  ['the other area box is open', '## Scope\n\n- [ ] teapot\n- [ ] kettle\n', 'Contributes to'],
  ['the issue has no area checklist', '## Outcome\n\nA kettle that boils.\n', 'Contributes to'],
])('it keeps the agent to its --repo area, and when %s writes %s', (_case, description, fixes) => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: 'kettle' },
    issue: { identifier: 'GEO-9001', description, labels: [{ name: 'kettle' }, { name: 'teapot' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [{ label: 'teapot', repo: 'teapot' }], playbook: null, stack: false, imp: false, reviewLines: false },
    template: 'Leave the merge to me.{{not_yours}}\n"{{fixes}} {{issue_id}}"',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe(`Leave the merge to me. Do only the \`kettle\` part of GEO-9001: each other area (teapot) gets its own launch.\n"${fixes} GEO-9001"`);
});

test('it exempts the launch area label when --repo names the repo under an alias', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: 'teapot' },
    issue: { identifier: 'GEO-9001', description: '## Scope\n\n- [ ] kettle: the lid\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'teapot', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template: 'Leave the merge to me.{{not_yours}}\n"{{fixes}} {{issue_id}}"',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe('Leave the merge to me.\n"Fixes GEO-9001"');
});

test('it asks for noslop\'s review in the /goal line for a repo on noslop\'s list', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: '## Outcome\n\nA kettle that boils.\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: true },
    template: '/goal Ship {{repo}} with {{goal_review}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe("/goal Ship zgeoff/kettle with noslop's review answered");
});

test('it asks for the agent\'s own review in the /goal line for a repo off noslop\'s list', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: '## Outcome\n\nA kettle that boils.\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template: '/goal Ship {{repo}} with {{goal_review}}',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe("/goal Ship zgeoff/kettle with your own review's findings fixed");
});

test('it counts a merged PR as the goal, and asks only for the acceptance a PR can show, when the issue holds a live check', () => {
  const template = findFencedBlock(readFileSync('agent-kit/brief.md', 'utf8'), null) ?? '';
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: {
      identifier: 'GEO-9001',
      description: '## Outcome\n\nA kettle that boils.\n\n## Acceptance\n\n- [ ] The lid test passes.\n- [ ] A live check on the kettle stage shows the lid shut after the deploy.\n',
      labels: [{ name: 'kettle' }],
    },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template,
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text.split('\n')[0]).toBe(
    "/goal A PR in zgeoff/kettle for GEO-9001 that is merged, or out of draft with evidence for each acceptance item a PR can show before merge and your own review's findings fixed. First read GEO-9001 with your own Linear access.",
  );
  expect(brief.out.text).toContain('evidence for each acceptance item a PR can show before merge. Keep the ID');
});

test('it fits a review-lines brief with a playbook only because the refs are short', () => {
  const sha = 'c'.repeat(40);
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: sha, imp: true, byLink: true, goalFile: null, repo: 'kettle' },
    issue: { identifier: 'GEO-9001', description: '## Outcome\n\nBoil.\n', labels: [{ name: 'kettle' }] },
    sha,
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: { type: 'bug', path: 'agent-kit/playbooks/bug.md', command: `gh api 'repos/zgeoff/hq/contents/agent-kit/playbooks/bug.md?ref=${sha}'` }, stack: false, imp: true, reviewLines: true },
    template: `/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{review_lines}}\n\n${'Mind the kettle.\n'.repeat(212)}`,
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: '# Bug playbook\n',
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.data['cuts']).toStrictEqual(['short refs']);
  expect(brief.out.text).toContain('/goal Ship zgeoff/kettle GEO-9001. First read GEO-9001 with your own Linear access, then the bug playbook');
  expect(brief.out.text).not.toContain(sha);
  expect(brief.out.data['bytes']).toBeLessThanOrEqual(4000);
});

test.each([
  ['an open box for a repo with no label', '## Scope\n\n- [ ] kettle: the lid\n- [ ] teapot\n- [ ] mug: the handle\n- [ ] add the retry test\n', 'Contributes to', ' (teapot, mug)'],
  ['every other box ticked', '## Scope\n\n- [ ] kettle: the lid\n- [x] teapot\n- [X] mug: the handle\n- [x] add the retry test\n', 'Fixes', ''],
  ['the launch area in another case', '## Scope\n\n- [ ] Kettle: the lid\n', 'Fixes', ''],
  ['an open box inside a fence', '## Scope\n\n```md\n- [ ] teapot\n```\n- [ ] kettle\n', 'Fixes', ''],
  ['an open box that names a task', '## Scope\n\n- [ ] add the retry test\n', 'Contributes to', ''],
  ['an open box that repeats an area label', '## Scope\n\n- [ ] teapot\n- [ ] Teapot: again\n', 'Contributes to', ' (teapot)'],
])('it counts open Scope boxes as other areas with --repo, and with %s writes %s', (_case, description, fixes, listed) => {
  const otherAreas = listed === ' (teapot)' ? [{ label: 'teapot', repo: 'teapot' }] : [];
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: 'kettle' },
    issue: { identifier: 'GEO-9001', description, labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas, playbook: null, stack: false, imp: false, reviewLines: false },
    template: 'Leave the merge to me.{{not_yours}}\n"{{fixes}} {{issue_id}}"',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });
  const line = listed === '' ? '' : ` Do only the \`kettle\` part of GEO-9001: each other area${listed} gets its own launch.`;

  expect(brief.out.text).toBe(`Leave the merge to me.${line}\n"${fixes} GEO-9001"`);
});

test('it ignores open Scope boxes without --repo', () => {
  const brief = buildDeliveryBrief({
    input: { issue: 'GEO-9001', ref: 'main', imp: false, byLink: true, goalFile: null, repo: null },
    issue: { identifier: 'GEO-9001', description: '## Scope\n\n- [ ] teapot\n', labels: [{ name: 'kettle' }] },
    sha: 'b'.repeat(40),
    reads: { label: 'kettle', repo: 'kettle', otherAreas: [], playbook: null, stack: false, imp: false, reviewLines: false },
    template: 'Leave the merge to me.{{not_yours}}\n"{{fixes}} {{issue_id}}"',
    permissionTable: [{ action: 'Code delivery', phrase: 'Work in <repo>.' }],
    playbookText: null,
    stack: '',
    impLine: '',
    movedGoalFile: 'briefs/GEO-9001.md',
  });

  expect(brief.out.text).toBe('Leave the merge to me.\n"Fixes GEO-9001"');
});
