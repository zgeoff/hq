import { HqError } from '../errors.ts';
import { PR_REF } from './pr-ref.ts';

// "zgeoff/cloud#242", a github URL, or "cloud#242" -> "cloud#242".
export function normalizePrRef(raw: string): { ref: string; url: string | null } {
  const url = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(raw);
  if (url) return { ref: `${url[2]}#${url[3]}`, url: `https://github.com/${url[1]}/${url[2]}/pull/${url[3]}` };
  const short = /^(?:[\w.-]+\/)?([\w.-]+#\d+)$/.exec(raw.trim());
  if (short && PR_REF.test(short[1]!)) return { ref: short[1]!, url: null };
  throw new HqError('bad_args', `cannot read a PR from "${raw}": use repo#n or a github URL`);
}
