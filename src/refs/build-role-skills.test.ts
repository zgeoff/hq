import { expect, test } from 'bun:test';
import { buildRoleSkills } from './build-role-skills.ts';

test('it counts a shared skill under every role that lists it, and a forwarded name inherits its holder', () => {
  const base = { cwd: 'defs', model: 'opus', wake: true } as const;
  const roles = buildRoleSkills({
    sessions: [
      { ...base, name: 'z-aa', skills: ['kettle', 'shared-pot'], roles: ['owner'] },
      { ...base, name: 'z-bb', skills: ['teapot', 'shared-pot'], roles: ['reviewer'] },
      { ...base, name: 'z-cc', skills: [], prompt: 'kettle.md', roles: ['developer'] },
    ],
    forwards: { 'z-old': 'z-bb' },
  });

  expect(roles.find((entry) => entry.role === 'owner')?.skills).toStrictEqual(['kettle', 'shared-pot']);
  expect(roles.find((entry) => entry.role === 'reviewer')?.skills).toStrictEqual(['teapot', 'shared-pot']);
  expect(roles.find((entry) => entry.role === 'reviewer')?.names).toStrictEqual(['z-bb', 'z-old']);
  expect(roles.find((entry) => entry.role === 'developer')?.skills).toStrictEqual([]);
});
