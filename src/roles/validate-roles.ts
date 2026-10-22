import { HqError } from '../errors.ts';
import type { Role } from './role-names.ts';
import { ROLE_NAMES } from './role-names.ts';
import { SINGLE } from './single.ts';
import type { DeclaredSession, RolesTable } from './types.ts';

const NAME = /^z-[a-z]+$/;
const SLUG = /^[a-z][a-z0-9-]*$/;

const bad = (field: string, why: string): never => {
  throw new HqError('bad_fleet', `fleet.json: ${field} ${why}`);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateRoles(raw: unknown): RolesTable {
  if (!isObj(raw)) return bad('(top level)', 'must be an object');
  if (!Array.isArray(raw['sessions']) || raw['sessions'].length === 0) {
    return bad('sessions', 'must be a non-empty list');
  }
  const sessions: DeclaredSession[] = [];
  const names = new Set<string>();
  raw['sessions'].forEach((s: unknown, i: number) => {
    const at = `sessions[${i}]`;
    if (!isObj(s)) return bad(at, 'must be an object');
    if (typeof s['name'] !== 'string' || !NAME.test(s['name'])) {
      return bad(`${at}.name`, 'must match ^z-[a-z]+$');
    }
    if (names.has(s['name'])) {
      return bad(`${at}.name`, `${s['name']} is declared twice`);
    }
    names.add(s['name']);
    if (s['skill'] !== null && (typeof s['skill'] !== 'string' || !SLUG.test(s['skill']))) {
      return bad(`${at}.skill`, 'must be a skill slug or null');
    }
    if (s['cwd'] !== 'defs' && s['cwd'] !== 'hq') {
      return bad(`${at}.cwd`, 'must be defs or hq');
    }
    if (typeof s['model'] !== 'string' || !s['model']) {
      return bad(`${at}.model`, 'must be a model name');
    }
    if (typeof s['wake'] !== 'boolean') {
      return bad(`${at}.wake`, 'must be true or false');
    }
    if (s['remoteControl'] !== undefined && typeof s['remoteControl'] !== 'boolean') {
      return bad(`${at}.remoteControl`, 'must be true or false');
    }
    if (s['pluginDirs'] !== undefined && !isPluginDirs(s['pluginDirs'])) {
      return bad(`${at}.pluginDirs`, 'must be a non-empty list of folders, each absolute or starting with ~/, without a .. segment');
    }
    if (s['prompt'] !== undefined && (typeof s['prompt'] !== 'string' || !s['prompt'] || s['prompt'].includes('/'))) {
      return bad(`${at}.prompt`, 'must be a file name');
    }
    if (s['note'] !== undefined && typeof s['note'] !== 'string') {
      return bad(`${at}.note`, 'must be text');
    }
    if (s['skill'] === null && s['prompt'] === undefined) {
      return bad(`${at}.prompt`, 'is required when skill is null');
    }
    if (s['skill'] !== null && s['prompt'] !== undefined) {
      return bad(`${at}.prompt`, 'is only for a session with no skill');
    }
    if (!Array.isArray(s['roles'])) {
      return bad(`${at}.roles`, 'must be a list');
    }
    sessions.push({ name: s['name'], skill: s['skill'], cwd: s['cwd'], model: s['model'], wake: s['wake'], ...(s['remoteControl'] === undefined ? {} : { remoteControl: s['remoteControl'] }), ...(s['pluginDirs'] === undefined ? {} : { pluginDirs: s['pluginDirs'] as string[] }), ...(s['prompt'] === undefined ? {} : { prompt: s['prompt'] }), ...(s['note'] === undefined ? {} : { note: s['note'] }), roles: parseRoles(at, s['roles']) });
  });
  for (const role of SINGLE) {
    const holders = sessions.filter((s) => s.roles.includes(role)).map((s) => s.name);
    if (holders.length !== 1) bad(`roles.${role}`, `must be held by exactly one session (held by ${holders.length ? holders.join(', ') : 'none'})`);
  }
  const forwards: Record<string, string> = {};
  if (raw['forwards'] !== undefined) {
    if (!isObj(raw['forwards'])) {
      return bad('forwards', 'must be an object');
    }
    for (const [from, to] of Object.entries(raw['forwards'])) {
      if (!NAME.test(from)) bad(`forwards.${from}`, 'must be a name matching ^z-[a-z]+$');
      if (typeof to !== 'string' || !names.has(to)) bad(`forwards.${from}`, `must point to a declared session (got ${JSON.stringify(to)})`);
      if (names.has(from)) bad(`forwards.${from}`, 'is a declared session, so it cannot be a retired name');
      forwards[from] = to as string;
    }
  }
  return { sessions, forwards };
}

// atc's spawn refuses any other form, so a bad list fails here, not at the spawn.
function isPluginDirs(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.every((d) => typeof d === 'string' && (d.startsWith('/') || d.startsWith('~/')) && !d.split('/').includes('..'));
}

function parseRoles(at: string, list: unknown[]): Role[] {
  const roles = list.map((r: unknown) => ((ROLE_NAMES as readonly unknown[]).includes(r) ? (r as Role) : bad(`${at}.roles`, `has unknown role ${JSON.stringify(r)}`)));
  if (new Set(roles).size !== roles.length) {
    return bad(`${at}.roles`, 'repeats a role');
  }
  return roles;
}
