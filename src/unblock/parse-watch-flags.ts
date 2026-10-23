import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import type { UnblockKind } from './types.ts';

export interface WatchFields {
  kind?: UnblockKind;
  deadline?: string;
}

const kindSchema = z.enum(['owner', 'watch']);

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;

// hq unblock add's --kind and --deadline; each left out is left out, so a refresh keeps the stored one.
export function parseWatchFlags(kind: string | undefined, deadline: string | undefined): WatchFields {
  const fields: WatchFields = {};
  if (kind !== undefined) {
    const parsed = kindSchema.safeParse(kind);
    if (!parsed.success) {
      throw new HqError('bad_args', `--kind must be owner or watch, not "${kind.slice(0, 60)}"`);
    }
    fields.kind = parsed.data;
  }
  if (deadline !== undefined) {
    if (!ISO_TIME.test(deadline) || Number.isNaN(Date.parse(deadline))) {
      throw new HqError('bad_args', `--deadline takes an ISO time, such as 2026-11-02T09:00:00Z, not "${deadline.slice(0, 60)}"`);
    }
    fields.deadline = iso(new Date(deadline));
  }
  return fields;
}
