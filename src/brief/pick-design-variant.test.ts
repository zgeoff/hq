import { expect, test } from 'bun:test';
import { buildKettleIssueText } from '../../test/build-kettle-issue-text.ts';
import { pickDesignVariant } from './pick-design-variant.ts';

test('#pickDesignVariant picks with-geoff for an issue with the with-geoff label', () => {
  expect(pickDesignVariant({ identifier: 'GEO-9001', description: buildKettleIssueText({ actions: 'Design session, then the decision record as a Linear document' }), labels: [{ name: 'With-Geoff' }] })).toStrictEqual({ kind: 'with-geoff' });
});

test('#pickDesignVariant picks the agent pass for an issue without the label, with or without the Actions line', () => {
  const plain = { identifier: 'GEO-9001', description: buildKettleIssueText({ actions: 'Design session' }), labels: [{ name: 'cloud' }] };
  const named = { identifier: 'GEO-9002', description: buildKettleIssueText({ actions: 'Agent design pass (`hq run add --design agent`), not with-geoff.' }), labels: [] };

  expect([pickDesignVariant(plain), pickDesignVariant(named)]).toStrictEqual([{ kind: 'agent' }, { kind: 'agent' }]);
});

test('#pickDesignVariant refuses an issue with the label whose Actions line asks for an agent pass', () => {
  expect(pickDesignVariant({ identifier: 'GEO-9001', description: buildKettleIssueText({ actions: 'Agent design pass' }), labels: [{ name: 'with-geoff' }] })).toStrictEqual({
    kind: 'refused',
    message: 'GEO-9001 has the with-geoff label but its Actions line asks for an agent design pass; drop one',
  });
});

test('#pickDesignVariant refuses an issue without the label whose Actions line asks for a session with the owner', () => {
  const geoff = { identifier: 'GEO-9001', description: buildKettleIssueText({ actions: 'Design session with Geoff, then the decision record' }), labels: [] };
  const owner = { identifier: 'GEO-9002', description: buildKettleIssueText({ actions: 'A design session with the owner' }), labels: [] };

  expect([pickDesignVariant(geoff), pickDesignVariant(owner)]).toStrictEqual([
    { kind: 'refused', message: 'GEO-9001 has no with-geoff label but its Actions line asks for a session with the owner; add the label or change the line' },
    { kind: 'refused', message: 'GEO-9002 has no with-geoff label but its Actions line asks for a session with the owner; add the label or change the line' },
  ]);
});

test('#pickDesignVariant reads a note after the action name as nothing', () => {
  expect(pickDesignVariant({ identifier: 'GEO-9001', description: buildKettleIssueText({ actions: 'Agent design pass, not with Geoff.' }), labels: [] })).toStrictEqual({ kind: 'agent' });
});
