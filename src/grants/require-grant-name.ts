import { HqError } from '../errors.ts';

// A grant's name: a slug, short enough to type with each action.
export function requireGrantName(name: string): string {
  const NAME_MAX = 40;
  if (name.length > NAME_MAX || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    throw new HqError('bad_args', `a grant name must be a slug of lowercase letters, digits and single hyphens, ${NAME_MAX} characters at most`);
  }
  return name;
}
