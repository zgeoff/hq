import { match } from 'ts-pattern';
import type { MessageGet } from '../atc/message-get-schema.ts';
import type { AskedAnswer } from './pick-asked-outcome.ts';

export type MessageLookup = { kind: 'unsent' } | { kind: 'failed' } | { kind: 'read'; status: MessageGet['status']; answer: string | null; answeredAt: number | null };

export type MessageReply = Exclude<AskedAnswer, { kind: 'saved' }> | { kind: 'saved'; answeredAt: number | undefined };

export function parseMessageReply(lookup: MessageLookup): MessageReply {
  return match<MessageLookup, MessageReply>(lookup)
    .with({ kind: 'unsent' }, () => ({ kind: 'pending' }))
    .with({ kind: 'failed' }, () => ({ kind: 'unread' }))
    .with({ kind: 'read', status: 'unanswered' }, () => ({ kind: 'unanswered' }))
    .with({ kind: 'read', status: 'answered' }, (read) => parseAnswerWord(read.answer, read.answeredAt))
    .with({ kind: 'read' }, () => ({ kind: 'pending' }))
    .exhaustive();
}

function parseAnswerWord(answer: string | null, answeredAt: number | null): MessageReply {
  const word = (answer ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/^[`'"]+|[`'".!]+$/gu, '');
  if (word === 'saved') {
    return { kind: 'saved', answeredAt: answeredAt ?? undefined };
  }
  if (word === 'busy') {
    return { kind: 'busy' };
  }
  return { kind: 'pending' };
}
