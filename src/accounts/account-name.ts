import { ACCOUNT_KEY } from '../goals/account-key.ts';

export const accountName = (labels: Record<string, string>, key: string): string => labels[key] ?? (ACCOUNT_KEY.test(key) ? key.slice(0, 6) : key);
