import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import type { ConsoleTab } from './console-tab-list.ts';
import { CONSOLE_TAB_LIST } from './console-tab-list.ts';
import { planTabKey } from './plan-tab-key.ts';

interface ConsoleTabsProps {
  current: ConsoleTab;

  // Opens a tab's path; tests watch it. By default the app's router opens it, or, with no router,
  // the browser loads it.
  onGo?: (path: string) => void;
}

// The console's tabs, each with its jump key, and the keys that move between them on every tab.
export function ConsoleTabs(props: ConsoleTabsProps) {
  const appRouter = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined,
    go = props.onGo ?? ((path: string) => openPath(appRouter, path)),
    pendingSince = useRef<number | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const plan = planTabKey({ key: e.key, inText: isTextTarget(e.target), modified: e.metaKey || e.ctrlKey || e.altKey, current: props.current, pendingSince: pendingSince.current, now: Date.now() });
      pendingSince.current = plan.pendingSince;
      if (plan.consumed) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (plan.go !== null) {
        go(plan.go);
      }
    };
    globalThis.addEventListener('keydown', handleKey, { capture: true });
    return () => globalThis.removeEventListener('keydown', handleKey, { capture: true });
  });

  return (
    <nav className="hq-tabs" aria-label="Console">
      {CONSOLE_TAB_LIST.map((entry) => (
        <a key={entry.tab} className="hq-tab" href={entry.path} aria-current={props.current === entry.tab ? 'page' : undefined} aria-keyshortcuts={`g ${entry.key}`}>
          {entry.label} <kbd className="hq-kbd">g {entry.key}</kbd>
        </a>
      ))}
    </nav>
  );
}

function openPath(router: ReturnType<typeof useRouter> | undefined, path: string): void {
  if (router === undefined) {
    globalThis.location.assign(path);
    return;
  }
  void router.navigate({ to: path });
}

function isTextTarget(target: EventTarget | null): boolean {
  const name = (target as HTMLElement | null)?.tagName;
  return name === 'TEXTAREA' || name === 'INPUT';
}
