import { expect, test } from 'bun:test';
import { formatLineRoom } from './format-line-room.ts';

test('it names the RAM impd keeps for priority imps when that RAM holds the imp slots', () => {
  const room = {
    slots: 1,
    heldBy: 'impd priority reservation',
    line: { awakeMib: 14_336, maxMib: 20_480, awakeVcpus: 0, maxVcpus: 16 },
    budget: { budgetMib: 20_480, nixAwakeMib: 1024, keptMib: 3072 },
  };

  expect(formatLineRoom(room)).toBe(
    'impd non-Nix line: 14336/20480 MiB, 0/16 vCPUs awake; impd budget 15360/20480 MiB awake, 3072 MiB kept for priority imps; 1 imp slot(s) to fill, set by impd priority reservation',
  );
});

test('it leaves out the impd budget when the sample has no budget reading', () => {
  const room = { slots: 2, heldBy: 'impd at line', line: { awakeMib: 16_384, maxMib: 20_480, awakeVcpus: 4, maxVcpus: 16 }, budget: null };

  expect(formatLineRoom(room)).toBe('impd non-Nix line: 16384/20480 MiB, 4/16 vCPUs awake; 2 imp slot(s) to fill, set by impd at line');
});
