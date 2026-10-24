import { z } from 'zod';
import { HqError } from '../errors.ts';

export interface CapArgs {
  repo: string;

  // null turns the cap off.
  cap: number | null;
}

const REPO_MESSAGE = 'hq noslop cap <repo> <n|off> needs a bare repo name like tools';
const CAP_MESSAGE = 'hq noslop cap <repo> <n|off> needs a whole number of 1 or more, or off';
const BARE_REPO = /^[A-Za-z0-9._-]+$/u;
const WHOLE_NUMBER = /^\d+$/u;

const RepoSchema = z
  .string({ error: REPO_MESSAGE })
  .regex(BARE_REPO, REPO_MESSAGE)
  .refine((repo) => repo !== '.' && repo !== '..', REPO_MESSAGE)
  .transform((repo) => repo.toLowerCase());

const CountSchema = z
  .string()
  .regex(WHOLE_NUMBER)
  .transform(Number)
  .pipe(z.number({ error: CAP_MESSAGE }).int(CAP_MESSAGE).min(1, CAP_MESSAGE).max(Number.MAX_SAFE_INTEGER, CAP_MESSAGE));

const CapSchema = z.union([z.literal('off').transform(() => null), CountSchema], { error: CAP_MESSAGE });

const CapArgsSchema = z.tuple([RepoSchema, CapSchema], z.never({ error: 'hq noslop cap <repo> <n|off> takes a repo and a cap, and nothing more' }));

export function parseCapArgs(rest: readonly string[]): CapArgs {
  const parsed = CapArgsSchema.safeParse(rest);
  if (!parsed.success) {
    throw new HqError('bad_args', parsed.error.issues[0]?.message ?? CAP_MESSAGE);
  }
  const [repo, cap] = parsed.data;
  return { repo, cap };
}
