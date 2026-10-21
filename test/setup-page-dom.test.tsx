import { expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { setupPageDOM } from './setup-page-dom.ts';

// Shows "ready" once a fetch to a local server answers, as a page's first query does.
function KettleStatus(props: KettleStatusProps) {
  const [status, setStatus] = useState('waiting');
  useEffect(() => {
    void loadStatus(props.url, setStatus);
  }, [props.url]);
  return <p>{status}</p>;
}

interface KettleStatusProps {
  url: string;
}

async function loadStatus(url: string, show: (status: string) => void): Promise<void> {
  const response = await fetch(url),
    status = await response.text();
  show(status);
}

// The same check twice: the second page in this process must still fetch and re-render.
test.each(['first', 'second'])('the %s page in a process fetches and re-renders after an await', async () => {
  const kettle = Bun.serve({ port: 0, fetch: () => new Response('ready') }),
    lib = await setupPageDOM(`http://127.0.0.1:${kettle.port}/`);
  try {
    lib.render(<KettleStatus url={`http://127.0.0.1:${kettle.port}/status`} />);
    const shown = await lib.within(document.body).findByText('ready');
    expect(shown.tagName).toBe('P');
  } finally {
    void kettle.stop(true);
  }
});
