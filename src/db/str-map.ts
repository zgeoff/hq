import { z } from 'zod';

// A string-to-string map: most meta blobs are one.
export const strMap = z.record(z.string(), z.string());
