export interface OutboundQueue {
  send: (text: string) => void;
  drain: () => void;
}

interface SocketWriter {
  write: (data: Uint8Array) => number;
}

// socket.write drops what it does not accept, so a short write parks the rest here until the
// socket drains.
export function buildOutboundQueue(socket: SocketWriter): OutboundQueue {
  const chunks: Uint8Array[] = [],
    drain = (): void => {
      for (let head = chunks.at(0); head !== undefined; head = chunks.at(0)) {
        const wrote = Math.max(socket.write(head), 0);
        if (wrote < head.length) {
          chunks[0] = head.subarray(wrote);
          return;
        }
        chunks.shift();
      }
    },
    encoder = new TextEncoder(),
    send = (text: string): void => {
      chunks.push(encoder.encode(text));
      if (chunks.length === 1) {
        drain();
      }
    };

  return { send, drain };
}
