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
    '. The full issue is in briefs/GEO-9001.md; read it first.',
  );

  expect(fitted).toMatchInlineSnapshot(`
    {
      "bytes": 321,
      "cuts": [],
      "movedIssue": false,
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

  expect(fitBrief('/goal Ship {{repo}}{{goal_file}}\n\n{{issue}}', parts, '. The full issue is in briefs/GEO-9001.md; read it first.')).toStrictEqual(fitBrief('/goal Ship {{repo}}{{goal_file}}\n\n{{issue}}', parts, '. The full issue is in briefs/GEO-9001.md; read it first.'));
});

test('it fills each placeholder in one pass, with the repo under its owner', () => {
  const parts = buildBriefParts({ sections: [{ name: 'Outcome', text: '## Outcome\n\nBoil {{repo}}.' }], stack: 'STACK', impLine: 'IMP' });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, '. The full issue is in briefs/GEO-9001.md; read it first.');

  expect(fitted.prompt).toBe('/goal Ship zgeoff/kettle GEO-9001\n\n## Outcome\n\nBoil {{repo}}.\n\nPermissions:\nWork in kettle.\n\nSTACK\nFinish: "Fixes GEO-9001".  Done.\nIMP\nEnd.');
  expect(fitted.cuts).toStrictEqual([]);
  expect(fitted.bytes).toBe(Buffer.byteLength(fitted.prompt));
});

test('it leaves the issue out when it is not in the prompt', () => {
  const parts = buildBriefParts({ sections: [{ name: 'Outcome', text: '## Outcome\n\nBoil.' }] });

  expect(fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, null).prompt).not.toContain('Boil.');
});

test('it names a placeholder it has no value for and leaves it as written', () => {
  const fitted = fitBrief('{{repo}} {{lid}} {{lid}}', buildBriefParts(), '. The full issue is in briefs/GEO-9001.md; read it first.');

  expect(fitted.prompt).toBe('zgeoff/kettle {{lid}} {{lid}}');
  expect(fitted.unknown).toStrictEqual(['lid']);
});

test('it moves the whole issue out as cut 1 when the issue in the prompt is over the limit, and points the /goal line at its file', () => {
  const parts = buildBriefParts({
    sections: [
      { name: 'Outcome', text: '## Outcome\n\nBoil.' },
      { name: 'Context', text: `## Context\n\n${'The kettle leaks. '.repeat(250)}` },
    ],
  });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, '. The full issue is in briefs/GEO-9001.md; read it first.');

  expect(fitted.cuts).toStrictEqual(['cut 1']);
  expect(fitted.movedIssue).toBe(true);
  expect(fitted.prompt.startsWith('/goal Ship zgeoff/kettle GEO-9001. The full issue is in briefs/GEO-9001.md; read it first.\n\n\n\nPermissions:')).toBe(true);
  expect(fitted.prompt).not.toContain('Boil.');
  expect(fitted.bytes).toBeLessThan(4000);
});

test('it applies cut 2 after cut 1, keeping the file pointer as a line of its own with the blank line under it', () => {
  const parts = buildBriefParts({ permissions: 'Work in kettle.\n'.repeat(260), sections: [{ name: 'Scope', text: `## Scope\n\n${'In: the kettle. '.repeat(300)}` }] });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, '. The full issue is in briefs/GEO-9001.md; read it first.');

  expect(fitted.cuts).toStrictEqual(['cut 1', 'cut 2']);
  expect(fitted.prompt.startsWith('The full issue is in briefs/GEO-9001.md; read it first.\n\n\n\nPermissions:')).toBe(true);
});

test('it applies cut 2 without cut 1 when the issue is already out of the prompt', () => {
  const parts = buildBriefParts({ permissions: 'Work in kettle.\n'.repeat(400) });

  const fitted = fitBrief('/goal Ship {{repo}} {{issue_id}}{{goal_file}}\n\n{{issue}}\n\nPermissions:\n{{permissions}}\n\n{{stack}}\nFinish: "{{fixes}} {{issue_id}}". {{review_lines}} Done.{{not_yours}}\n{{imp_line}}\nEnd.', parts, null);

  expect(fitted.cuts).toStrictEqual(['cut 2']);
});

test('it counts bytes, not characters', () => {
  const fitted = fitBrief('{{permissions}}', buildBriefParts({ permissions: 'é' }), '. The full issue is in briefs/GEO-9001.md; read it first.');

  expect(fitted.bytes).toBe(2);
});

test('it passes at exactly 4000 bytes after cut 2 and keeps the blank line that follows the /goal line', () => {
  const fitted = fitBrief('/goal Ship\n\n{{permissions}}', buildBriefParts({ permissions: 'a'.repeat(3999) }), null);

  expect(fitted.cuts).toStrictEqual(['cut 2']);
  expect(fitted.bytes).toBe(4000);
  expect(fitted.prompt).toBe(`\n${'a'.repeat(3999)}`);
});

test('it is still over the limit at 4001 bytes after cut 2, because the blank line is kept', () => {
  const fitted = fitBrief('/goal Ship\n\n{{permissions}}', buildBriefParts({ permissions: 'a'.repeat(4000) }), null);

  expect(fitted.cuts).toStrictEqual(['cut 2']);
  expect(fitted.bytes).toBe(4001);
});
