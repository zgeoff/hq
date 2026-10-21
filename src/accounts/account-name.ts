import { ACCOUNT_KEY } from '../goals/account-key.ts';

// The name when one is set, else the first 6 characters of the key ('active' stays as it is).
export const accountName = (labels: Record<string, string>, key: string): string => labels[key] ?? (ACCOUNT_KEY.test(key) ? key.slice(0, 6) : key);
