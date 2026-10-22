import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ConsoleItem } from '../load-console-items.ts';
import { consoleAPI } from './console-api.ts';
import { ConsoleTabs } from './console-tabs.tsx';
import { formatAskStu } from './format-ask-stu.ts';
import { ItemCard } from './item-card.tsx';
import { KeyHelp } from './key-help.tsx';
import { pickKeyAction } from './pick-key-action.ts';
import type { DotState } from './progress-dots.tsx';
import { ProgressDots } from './progress-dots.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

interface Toast {
  text: string;
  tone: 'plain' | 'warn';
}

interface Choice {
  item: ConsoleItem;
  label: string;
  note: string;
}

interface Answered {
  id: string;
  at: number;
}

interface NeedsYouViewProps {
  // How often an open page reads hq's list again; tests shorten it.
  refreshMs?: number;
}

// Needs you: one item at a time. A click or a key answers at once, with no confirm; the answer goes
// to hq, a toast confirms it, and the next item slides in. An answered item stays hidden only until
// hq's list is fetched again, so one put off until later comes back when it is due. An open page
// reads the list again every minute, so a new or newly due item shows without a reload.
export function NeedsYouView(props: NeedsYouViewProps) {
  const refreshMs = props.refreshMs ?? 60_000;
  const [answered, setAnswered] = useState<Answered[]>([]),
    [offset, setOffset] = useState(0),
    [notes, setNotes] = useState<ReadonlyMap<string, string>>(new Map()),
    [copied, setCopied] = useState(false),
    [help, setHelp] = useState(false),
    [toast, setToast] = useState<Toast | null>(null),
    emitToast = (next: Toast) => {
      setToast(next);
      globalThis.setTimeout(() => setToast((t) => (t === next ? null : t)), 2400);
    },
    list = useQuery(consoleAPI.items.list.queryOptions({ refetchInterval: refreshMs })),
    noteRef = useRef<HTMLTextAreaElement | null>(null),
    pending = buildRotation(
      (list.data ?? []).filter((i) => !answered.some((a) => a.id === i.id && a.at > list.dataUpdatedAt)),
      offset,
    ),
    queryClient = useQueryClient(),
    send = useMutation({
      mutationFn: async (choice: Choice) => await sendChoice(choice),
      onSuccess: (told, choice) => {
        setAnswered((a) => [...a, { id: choice.item.id, at: Date.now() }]);
        setNotes((n) => new Map(n).set(choice.item.id, ''));
        setCopied(false);
        setOffset(0);
        const next: Toast = told ? { text: `Sent to Stu: ${formatShown(choice)}`, tone: 'plain' } : { text: `Recorded: ${formatShown(choice)}. The message to Stu failed; hq retries it.`, tone: 'warn' };
        emitToast(next);
        void queryClient.invalidateQueries({ queryKey: consoleAPI.items.list.key() });
      },
      onError: (error) => emitToast({ text: `Not recorded: ${error.message}`, tone: 'warn' }),
    }),
    top = pending[0] ?? null,
    topNote = top === null ? '' : (notes.get(top.id) ?? ''),
    tryPick = (label: string) => {
      if (top === null || send.isPending) {
        return;
      }
      if (top.kind === 'review' && label === 'Changes' && topNote.trim() === '') {
        emitToast({ text: 'Changes needs a note: say what to change.', tone: 'plain' });
        noteRef.current?.focus();
        return;
      }
      send.mutate({ item: top, label, note: topNote });
    },
    trySendNote = () => {
      if (top === null || topNote.trim() === '') {
        return;
      }
      if (top.kind === 'todo') {
        emitToast({ text: 'A to-do takes Done, Later or Skip; the note goes with it.', tone: 'plain' });
        return;
      }
      if (top.kind === 'review') {
        emitToast({ text: 'A review takes lgtm, Changes, Later or Reject; the note goes with it.', tone: 'plain' });
        return;
      }
      tryPick('');
    },
    writeStuPrompt = async () => {
      if (top === null) {
        return;
      }
      const prompt = formatAskStu(top);
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        emitToast({ text: `Could not copy. Paste this to Stu: ${prompt}`, tone: 'warn' });
        return;
      }
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 2400);
    },
    writeTopNote = (text: string) => {
      if (top !== null) {
        setNotes((n) => new Map(n).set(top.id, text));
      }
    };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const action = pickKeyAction({ key: e.key, inText: isTextTarget(e.target), modified: e.metaKey || e.ctrlKey || e.altKey });
      if (action === null) {
        return;
      }
      e.preventDefault();
      if (action.kind === 'close') {
        noteRef.current?.blur();
        setHelp(false);
      } else if (action.kind === 'help') {
        setHelp((h) => !h);
      } else if (action.kind === 'note') {
        noteRef.current?.focus();
      } else if (action.kind === 'ask-stu') {
        void writeStuPrompt();
      } else if (action.kind === 'next') {
        setOffset((o) => o + 1);
      } else if (action.kind === 'previous') {
        setOffset((o) => o - 1);
      } else {
        const option = top?.options[action.index];
        if (option !== undefined && option.noKey !== true) {
          tryPick(option.label);
        }
      }
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  });

  return (
    <>
      <header className="hq-header">
        <ConsoleTabs current="needs-you" />
        <ProgressDots dots={buildDots(answered.length, pending.length)} label={formatProgress(answered.length, pending.length)} />
        <ThemeToggle />
      </header>
      <main className="hq-main">
        {list.isError && <p className="hq-meta-deadline">hq did not answer: {list.error.message}</p>}
        {list.isSuccess && top === null && <h1 className="hq-empty">Nothing needs you.</h1>}
        {top !== null && (
          <ItemCard item={top} note={topNote} busy={send.isPending} copied={copied} noteRef={noteRef} onNote={writeTopNote} onPick={tryPick} onSendNote={trySendNote} onAskStu={() => void writeStuPrompt()} />
        )}
      </main>
      {toast !== null && (
        <div className="hq-toast" role="status" data-tone={toast.tone}>
          {toast.text}
        </div>
      )}
      <KeyHelp open={help} onToggle={() => setHelp((h) => !h)} keys={NEEDS_YOU_KEYS} />
    </>
  );
}

const NEEDS_YOU_KEYS = [
    { key: '1–9', what: 'Pick an option' },
    { key: 'y', what: 'Ask Stu: copy the prompt' },
    { key: 'i / Esc', what: 'Into the note / back out' },
    { key: 'Enter', what: 'In the note: send it' },
    { key: 'j / k', what: 'Next / previous item' },
  ],
  REVIEW_ANSWERS: Record<string, 'lgtm' | 'changes' | 'later' | 'reject'> = { lgtm: 'lgtm', Changes: 'changes', Later: 'later', Reject: 'reject' },
  TODO_MARKS: Record<string, 'done' | 'later' | 'skip'> = { Done: 'done', Later: 'later', Skip: 'skip' };

// Whether the owner session got the message; the answer is recorded either way.
async function sendChoice(choice: Choice): Promise<boolean> {
  const mark = TODO_MARKS[choice.label],
    review = REVIEW_ANSWERS[choice.label];
  if (choice.item.kind === 'review' && review !== undefined) {
    const reviewed = await consoleAPI.unblock.review.call({ id: choice.item.id, review, note: choice.note });
    return reviewed.told;
  }
  if (choice.item.kind === 'todo' && mark !== undefined) {
    const marked = await consoleAPI.unblock.mark.call({ id: choice.item.id, mark, note: choice.note });
    return marked.told;
  }
  return await sendAnswer(choice);
}

async function sendAnswer(choice: Choice): Promise<boolean> {
  const result = await consoleAPI.items.answer.call({ id: choice.item.id, option: choice.label, note: choice.note });
  return result.told;
}

function isTextTarget(target: EventTarget | null): boolean {
  const name = (target as HTMLElement | null)?.tagName;
  return name === 'TEXTAREA' || name === 'INPUT';
}

function buildRotation(items: ConsoleItem[], offset: number): ConsoleItem[] {
  if (items.length === 0) {
    return items;
  }
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function buildDots(done: number, waiting: number): DotState[] {
  return [...Array.from({ length: done }, (): DotState => 'done'), ...Array.from({ length: waiting }, (_, i): DotState => (i === 0 ? 'current' : 'waiting'))];
}

function formatProgress(done: number, waiting: number): string {
  if (waiting === 0) {
    return done === 0 ? '' : `${done} answered`;
  }
  return `${done + 1} of ${done + waiting}`;
}

function formatShown(choice: Choice): string {
  if (choice.note.trim() === '') {
    return choice.label;
  }
  if (choice.label === '') {
    return `“${choice.note}”`;
  }
  return `${choice.label}, “${choice.note}”`;
}
