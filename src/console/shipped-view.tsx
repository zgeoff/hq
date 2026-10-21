import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { match } from 'ts-pattern';
import type { ShippedPeriod } from '../shipped/types.ts';
import { consoleAPI } from './console-api.ts';
import { ConsoleTabs } from './console-tabs.tsx';
import { KeyHelp } from './key-help.tsx';
import { pickShippedKey } from './pick-shipped-key.ts';
import { ShippedReportBody } from './shipped-report-body.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

interface ShippedViewProps {
  // How often an open page reads its report again; tests shorten it.
  refreshMs?: number;
}

// Shipped: what merged today, yesterday or this week, as the delivery report shows it. t, y and w
// switch the period. hq keeps each report 5 minutes, and an open page reads again every 5, so a
// new Sydney day shows within 5 minutes of midnight.
export function ShippedView(props: ShippedViewProps) {
  const refreshMs = props.refreshMs ?? 5 * 60_000,
    [period, setPeriod] = useState<ShippedPeriod>('today'),
    [help, setHelp] = useState(false),
    report = useQuery(consoleAPI.shipped.report.queryOptions({ input: { period }, staleTime: refreshMs, refetchInterval: refreshMs }));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const action = pickShippedKey({ key: e.key, inText: false, modified: e.metaKey || e.ctrlKey || e.altKey });
      if (action === null) {
        return;
      }
      e.preventDefault();
      match(action)
        .with({ kind: 'period' }, (picked) => setPeriod(picked.period))
        .with({ kind: 'help' }, () => setHelp((open) => !open))
        .with({ kind: 'close' }, () => setHelp(false))
        .exhaustive();
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  });

  return (
    <>
      <header className="hq-header">
        <ConsoleTabs current="shipped" />
        <ThemeToggle />
      </header>
      <main className="hq-main hq-main-shipped">
        <div className="hq-periods" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.period} className="hq-period" type="button" aria-pressed={p.period === period} onClick={() => setPeriod(p.period)}>
              {p.label} <kbd className="hq-kbd">{p.key}</kbd>
            </button>
          ))}
        </div>
        {report.isPending && <p className="hq-shipped-line">Reading GitHub and Linear…</p>}
        {report.isError && <p className="hq-meta-deadline">hq could not read the report: {report.error.message}</p>}
        {report.isSuccess && <ShippedReportBody report={report.data.report} />}
      </main>
      <KeyHelp open={help} onToggle={() => setHelp((open) => !open)} keys={SHIPPED_KEYS} />
    </>
  );
}

const PERIODS: { period: ShippedPeriod; label: string; key: string }[] = [
  { period: 'today', label: 'Today', key: 't' },
  { period: 'yesterday', label: 'Yesterday', key: 'y' },
  { period: 'week', label: 'This week', key: 'w' },
],
  SHIPPED_KEYS = [
    { key: 't / y / w', what: 'Today / yesterday / this week' },
    { key: 'Esc', what: 'Close this list' },
  ];
