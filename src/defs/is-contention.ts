import { REF_LOCK } from './ref-lock.ts';

const NOT_CONTENTION = /Permission denied|Read-only file system|No space left|Disk quota|Input\/output error/i;
export const isContention = (err: string) => REF_LOCK.test(err) && !NOT_CONTENTION.test(err);
