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
      notYoursShort: ' Leave the rest to me.',
      impLine: 'This imp has a small kettle.',
      goalFile: '. First read the bug playbook: gh api bug',
      goalReview: '',
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
    notYoursShort: '',
    impLine: '',
    goalFile: '. First read the bug playbook: gh api bug',
    goalReview: '',
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

test('it shortens the sha as the first cut, and keeps the /goal line when that is enough', () => {
  const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const template = `/goal ${'Ship the kettle. '.repeat(4)}{{goal_file}}\n\n{{review_lines}}\n\n{{permissions}}`;
  const parts = buildBriefParts({ reviewLines: `read the rules: gh api 'x?ref=${sha}'`, goalFile: `. First read the playbook: gh api 'y?ref=${sha}'` });
  const room = 4000 - fitBrief(template, { ...parts, permissions: '' }, null).bytes;

  const fitted = fitBrief(template, { ...parts, permissions: 'a'.repeat(room + 5) }, null, sha);

  expect(fitted.cuts).toStrictEqual(['short refs']);
  expect(fitted.prompt.startsWith('/goal ')).toBe(true);
  expect(fitted.prompt).not.toContain(sha);
  expect(fitted.prompt).toContain(`ref=${sha.slice(0, 12)}'`);
  expect(fitted.bytes).toBeLessThanOrEqual(4000);
});

test('it carries the short sha into the pointer that cut 2 moves to the first line', () => {
  const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const template = `/goal ${'Ship the kettle. '.repeat(4)}{{goal_file}}\n\n{{review_lines}}\n\n{{permissions}}`;
  const parts = buildBriefParts({ reviewLines: `read the rules: gh api 'x?ref=${sha}'`, goalFile: `. First read the playbook: gh api 'y?ref=${sha}'` });
  const room = 4000 - fitBrief(template, { ...parts, permissions: '' }, null).bytes;

  const fitted = fitBrief(template, { ...parts, permissions: 'a'.repeat(room + 70) }, null, sha);

  expect(fitted.cuts).toStrictEqual(['short refs', 'cut 2']);
  expect(fitted.prompt.startsWith(`First read the playbook: gh api 'y?ref=${sha.slice(0, 12)}'`)).toBe(true);
  expect(fitted.prompt).not.toContain(sha);
  expect(fitted.bytes).toBeLessThanOrEqual(4000);
});

test('it records no short refs when the prompt does not hold the sha', () => {
  const fitted = fitBrief('/goal Ship\n\n{{permissions}}', buildBriefParts({ permissions: 'a'.repeat(4000) }), null, 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');

  expect(fitted.cuts).toStrictEqual(['cut 2']);
});

test('it leaves the sha whole when the prompt fits', () => {
  const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

  const fitted = fitBrief('{{review_lines}}', buildBriefParts({ reviewLines: `gh api 'x?ref=${sha}'` }), null, sha);

  expect(fitted.cuts).toStrictEqual([]);
  expect(fitted.prompt).toContain(sha);
});

test('it drops the area names from the not-yours line as cut 3 when the prompt is still over after cut 2', () => {
  const parts = buildBriefParts({ permissions: 'k'.repeat(3850), notYours: ` Do only the kettle part: each other area (${'teapot, '.repeat(22)}mug) gets its own launch.`, notYoursShort: ' Do only the kettle part: each other area gets its own launch.' });

  const fitted = fitBrief('/goal Ship {{issue_id}}\n{{permissions}}{{not_yours}}', parts, null);

  expect(fitted).toMatchObject({ cuts: ['cut 2', 'cut 3'], prompt: `${'k'.repeat(3850)} Do only the kettle part: each other area gets its own launch.` });
});

test('it makes no cut 3 when the brief has no not-yours line', () => {
  const parts = buildBriefParts({ permissions: 'k'.repeat(4100) });

  const fitted = fitBrief('/goal Ship {{issue_id}}\n{{permissions}}{{not_yours}}', parts, null);

  expect(fitted.cuts).toStrictEqual(['cut 2']);
});
