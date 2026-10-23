import { z } from 'zod';
import { HqError } from '../errors.ts';

const GATES = z.object({ gates: z.record(z.string(), z.object({ paths: z.array(z.string()).min(1), ignore: z.array(z.string()).optional() })) });

export interface Gate {
  paths: string[];
  ignore: string[];
}

export function parseGate(gatesBase64: string, name: string): Gate {
  const text = Buffer.from(gatesBase64.replaceAll(/\s/gu, ''), 'base64').toString('utf8');
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch {
    throw new HqError('bad_gates', '.github/gates.yml is not YAML');
  }
  const parsed = GATES.safeParse(raw);
  if (!parsed.success) {
    throw new HqError('bad_gates', '.github/gates.yml is not the expected shape');
  }
  const gate = parsed.data.gates[name];
  if (!gate) {
    throw new HqError('bad_gates', `.github/gates.yml has no ${name} gate`);
  }
  return { paths: gate.paths, ignore: gate.ignore ?? [] };
}
