import { expect, test } from 'bun:test';
import { buildBriefParts } from '../../test/build-brief-parts.ts';
import { fitBrief } from './fit-brief.ts';

test('it fits one fixed brief', () => {
  const fitted = fitBrief(
    '/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}}{{not_yours}}\n{{imp_line}}\n{{spout}}',
    {
      repo: 'kettle',
      issueID: 'GEO-9001',
      sections: [
        { name: 'Outcome', text: '## Outcome\n\nA kettle that boils.' },
        { name: 'Context', text: '## Context\n\nIt leaks at the lid.' },
      ],
      permissions: 'Work in kettle.',
      stack: 'Build the kettle in layers.',
      fixes: 'Fixes',
      reviewLines: 'List findings on zgeoff/kettle.',
      notYours: ' Leave the stove to me.',
      impLine: 'This imp has a small kettle.',
      goalFile: '. First read the bug playbook: gh api bug',
    },
    true,
  );

  expect(fitted).toMatchInlineSnapshot(`
    {
      "bytes": 321,
      "cuts": [],
      "prompt": 
    "/goal Ship zgeoff/kettle GEO-9001. First read the bug playbook: gh api bug

    ## Outcome

    A kettle that boils.

    ## Context

    It leaks at the lid.

    Permissions:
    Work in kettle.

    Build the kettle in layers.
    Finish: "Fixes GEO-9001". List findings on zgeoff/kettle. Leave the stove to me.
    This imp has a small kettle.
    {{spout}}"
    ,
      "unknown": [
        "spout",
      ],
    }
  `);
});

test('it gives equal results for equal input', () => {
  const parts = {
    repo: 'kettle',
    issueID: 'GEO-9001',
    sections: [{ name: 'Scope', text: `## Scope\n\n${'In: the kettle. '.repeat(300)}` }],
    permissions: 'Work in kettle.',
    stack: '',
    fixes: 'Fixes',
    reviewLines: '',
    notYours: '',
    impLine: '',
    goalFile: '. First read the bug playbook: gh api bug',
  };

  expect(fitBrief('/goal Ship {{repo}}{{goal_file}}\n\n{{issue}}', parts, true)).toStrictEqual(fitBrief('/goal Ship {{repo}}{{goal_file}}\n\n{{issue}}', parts, true));
});

test('it fills each placeholder in one pass, with the repo under its owner', () => {
  const parts = buildBriefParts({ sections: [{ name: 'Outcome', text: '## Outcome\n\nBoil {{repo}}.' }], stack: 'STACK', impLine: 'IMP' });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, true);

  expect(fitted.prompt).toBe('/goal Ship zgeoff/kettle GEO-9001\n\n## Outcome\n\nBoil {{repo}}.\n\nPermissions:\nWork in kettle.\n\nSTACK\nFinish: "Fixes GEO-9001".  Done.\nIMP\nEnd.');
  expect(fitted.cuts).toStrictEqual([]);
  expect(fitted.bytes).toBe(Buffer.byteLength(fitted.prompt));
});

test('it leaves the issue out when it is not in the prompt', () => {
  const parts = buildBriefParts({ sections: [{ name: 'Outcome', text: '## Outcome\n\nBoil.' }] });

  expect(fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, false).prompt).not.toContain('Boil.');
});

test('it names a placeholder it has no value for and leaves it as written', () => {
  const fitted = fitBrief('{{repo}} {{lid}} {{lid}}', buildBriefParts(), true);

  expect(fitted.prompt).toBe('zgeoff/kettle {{lid}} {{lid}}');
  expect(fitted.unknown).toStrictEqual(['lid']);
});

test('it drops Context and Agent notes as cut 2 when the issue is over the limit and in the prompt, after noting cut 1 unavailable', () => {
  const parts = buildBriefParts({
    sections: [
      { name: 'Outcome', text: '## Outcome\n\nBoil.' },
      { name: 'Context', text: `## Context\n\n${'The kettle leaks. '.repeat(250)}` },
      { name: 'Agent notes', text: '## Agent notes\n\nMind the lid.' },
    ],
  });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, true);

  expect(fitted.cuts).toStrictEqual(['cut 1 unavailable', 'cut 2']);
  expect(fitted.prompt).toContain('## Outcome\n\nBoil.');
  expect(fitted.prompt).not.toContain('## Context');
  expect(fitted.prompt).not.toContain('Mind the lid.');
});

test('it applies cut 3, dropping only the /goal line and keeping the blank line under it, when cut 2 is not enough', () => {
  const parts = buildBriefParts({ sections: [{ name: 'Scope', text: `## Scope\n\n${'In: the kettle. '.repeat(300)}` }] });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, true);

  expect(fitted.cuts).toStrictEqual(['cut 1 unavailable', 'cut 3']);
  expect(fitted.prompt.startsWith('\n## Scope')).toBe(true);
  expect(fitted.bytes).toBeGreaterThan(4000);
});

test('it keeps the pointer as a line of its own, with the blank line under it, when cut 3 drops the /goal line', () => {
  const parts = buildBriefParts({ goalFile: '. First read the bug playbook: gh api x', sections: [{ name: 'Scope', text: `## Scope\n\n${'In: the kettle. '.repeat(300)}` }] });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, true);

  expect(fitted.prompt.startsWith('First read the bug playbook: gh api x\n\n## Scope')).toBe(true);
});

test('it applies cut 3 without noting cut 1 when the issue is already out of the prompt', () => {
  const parts = buildBriefParts({ permissions: 'Work in kettle.\n'.repeat(400) });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, false);

  expect(fitted.cuts).toStrictEqual(['cut 3']);
});

test('it counts bytes, not characters', () => {
  const fitted = fitBrief('{{permissions}}', buildBriefParts({ permissions: 'é' }), true);

  expect(fitted.bytes).toBe(2);
});

test('it passes at exactly 4000 bytes after cut 3 and keeps the blank line that follows the /goal line', () => {
  const fitted = fitBrief('/goal Ship\n\n{{permissions}}', buildBriefParts({ permissions: 'a'.repeat(3999) }), false);

  expect(fitted.cuts).toStrictEqual(['cut 3']);
  expect(fitted.bytes).toBe(4000);
  expect(fitted.prompt).toBe(`\n${'a'.repeat(3999)}`);
});

test('it is still over the limit at 4001 bytes after cut 3, because the blank line is kept', () => {
  const fitted = fitBrief('/goal Ship\n\n{{permissions}}', buildBriefParts({ permissions: 'a'.repeat(4000) }), false);

  expect(fitted.cuts).toStrictEqual(['cut 3']);
  expect(fitted.bytes).toBe(4001);
});
