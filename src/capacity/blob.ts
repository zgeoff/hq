import { z } from 'zod';

export const BLOB = z.record(z.string(), z.unknown());
