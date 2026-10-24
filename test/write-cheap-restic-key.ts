import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

interface ScryptParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
}

// restic's own tests open repos with these scrypt parameters. The ones `restic init` calibrates cost
// about 0.75 s on every restic call, and `--insecure-no-password` keeps that cost.
const CHEAP_PARAMETERS: ScryptParameters = { cost: 128, blockSize: 1, parallelization: 1 };

// a key file names the scrypt parameters N, r and p
const KeyFileSchema = z.looseObject({ 'N': z.number(), 'r': z.number(), 'p': z.number(), salt: z.string(), data: z.string() });

// Rewrites the one key of the restic repo at `repo` to hold the same master key under the cheap
// parameters, in restic's key format: scrypt derives 64 bytes, an AES-256 key and a Poly1305-AES key,
// and the data is the IV, the AES-CTR ciphertext of the master key, and the Poly1305-AES tag.
export function writeCheapResticKey(repo: string, password: string): void {
  const keys = join(repo, 'keys');
  const [name] = readdirSync(keys);
  if (name === undefined) {
    throw new Error(`${repo} has no key`);
  }
  const file = join(keys, name);
  const key = KeyFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

  const sealed = Buffer.from(key.data, 'base64');
  const iv = sealed.subarray(0, 16);
  const ciphertext = sealed.subarray(16, -16);
  const calibrated = deriveKeys(password, Buffer.from(key.salt, 'base64'), { cost: key['N'], blockSize: key['r'], parallelization: key['p'] });
  if (!buildTag(calibrated, iv, ciphertext).equals(sealed.subarray(-16))) {
    throw new Error(`the password does not open the key of ${repo}`);
  }
  const decipher = createDecipheriv('aes-256-ctr', calibrated.encryption, iv);
  const masterKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const salt = randomBytes(64);
  const cheap = deriveKeys(password, salt, CHEAP_PARAMETERS);
  const freshIv = randomBytes(16);
  const cipher = createCipheriv('aes-256-ctr', cheap.encryption, freshIv);
  const freshCiphertext = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  const text = JSON.stringify({
    ...key,
    'N': CHEAP_PARAMETERS.cost,
    'r': CHEAP_PARAMETERS.blockSize,
    'p': CHEAP_PARAMETERS.parallelization,
    salt: salt.toString('base64'),
    data: Buffer.concat([freshIv, freshCiphertext, buildTag(cheap, freshIv, freshCiphertext)]).toString('base64'),
  });

  // restic names a key file by the SHA-256 of its content
  writeFileSync(join(keys, createHash('sha256').update(text).digest('hex')), text, { mode: 0o400 });
  unlinkSync(file);
}

interface DerivedKeys {
  encryption: Buffer;
  tagKey: Buffer;
  tagClamp: Buffer;
}

function deriveKeys(password: string, salt: Buffer, parameters: ScryptParameters): DerivedKeys {
  const derived = scryptSync(password, salt, 64, { ...parameters, maxmem: 512 * parameters.cost * parameters.blockSize });
  return { encryption: derived.subarray(0, 32), tagKey: derived.subarray(32, 48), tagClamp: derived.subarray(48, 64) };
}

// Poly1305-AES: the AES-128 encryption of the IV under the tag key is the one-time pad of the tag
function buildTag(keys: DerivedKeys, iv: Buffer, message: Buffer): Buffer {
  const aes = createCipheriv('aes-128-ecb', keys.tagKey, null).setAutoPadding(false);
  const pad = Buffer.concat([aes.update(iv), aes.final()]);
  return buildPoly1305Tag(message, keys.tagClamp, pad);
}

const PRIME = (1n << 130n) - 5n;
const CLAMP = 0x0f_ff_ff_fc_0f_ff_ff_fc_0f_ff_ff_fc_0f_ff_ff_ffn;

// RFC 8439, section 2.5.1, in BigInt: speed is no concern for a key of a few hundred bytes
function buildPoly1305Tag(message: Buffer, clamp: Buffer, pad: Buffer): Buffer {
  const multiplier = toLittleEndianNumber(clamp) & CLAMP;
  let accumulator = 0n;
  for (let offset = 0; offset < message.length; offset += 16) {
    const block = Buffer.concat([message.subarray(offset, offset + 16), Buffer.from([1])]);
    accumulator = ((accumulator + toLittleEndianNumber(block)) * multiplier) % PRIME;
  }
  const tag = (accumulator + toLittleEndianNumber(pad)) & ((1n << 128n) - 1n);
  return Buffer.from(Array.from({ length: 16 }, (_, index) => Number((tag >> BigInt(8 * index)) & 0xffn)));
}

function toLittleEndianNumber(bytes: Buffer): bigint {
  return bytes.reduceRight((value, byte) => (value << 8n) + BigInt(byte), 0n);
}
