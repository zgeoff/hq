# Pacing

Run `scripts/capacity.sh` before every launch. Launch only on the provider it picks. That covers
the launch of a Ready issue, a pitch, a relaunch, a design session and an ad-hoc session. Take Ready issues
in the order `hq focus show` prints. Only the owner sets that order, with `hq focus set`.

These mistakes cost the most:

- Leaving out `--design agent|with-geoff` when you run `hq run add` for a design session. hq then
  counts a Design-type issue against the with-geoff limit.
- Launching work that reads the owner's personal data on a provider other than Claude. Only Claude
  runs under the owner's account.

Contents: [Terms](#terms), [Before a launch](#before-a-launch),
[Design session limits](#design-session-limits), [Reading the output](#reading-the-output),
[Settings](#settings).

## Terms

For a pitch, Nix and the unblock list, see [owner-calls](../../owner-calls/SKILL.md#terms).

- **An imp:** a cloud machine that runs one session.
- **This host:** the machine you run on. `capacity.sh` and pacing.json call it `local`.
- **A provider:** the agent CLI, such as Claude or Codex.
- **A slot:** room for one session in a place, the imps or this host.
  [pacing.json](../pacing.json) sets how many slots each place has, and `hq lanes` counts the free
  ones.
- **A design session's kind:** `agent`, which settles a design without the owner, or `with-geoff`,
  which works through it with the owner. Each kind has its own limit.
- **The route:** the providers that `routes` in pacing.json lists for a size, in the order
  `capacity.sh` tries them.
- **The imp broker:** the service on the imps' host that adds the owner's Claude login to each
  request an imp sends to Claude.

A session launches only while the imps have memory free and its provider's quota has room. A design
session also waits while its kind is at its limit.

## Before a launch

When the work reads the owner's personal data, launch it only when `launch.provider` is `claude` in
step 4. That data is the owner's memories, hq's event log and Nix's conversations. With any other
provider, hold the work, and add nothing to the unblock list for it.

1. For a design session, read the `design:` line in `hq lanes`. It shows each kind's running
   sessions and its limit, such as `agent 1/2, with-geoff 1/1`. Hold when this session's kind is
   at its limit. The one exception is a with-geoff session the owner asked for.
2. Count the delivery sessions running on this host, from `hq lanes`.
3. Run `scripts/capacity.sh --size <S|M|L|XL> --local-open <n>`, where `<n>` is the count from
   step 2. Take the size from `hq run show <issue>`. For an investigation, or an issue with no
   size, pass `M`. For a design session, pass `--design` in place of `--size <size>`.
4. Read `launch` in the output:
   - With a `provider`, pass `launch.agent` as the `agent` of `atc_session_spawn`, and launch on
     `launch.target` (`imp` or `local`).
   - With no `provider`, hold, and read `launch.reason` for what has no room. Then follow the last
     paragraph of [Reading the output](#reading-the-output).

## Design session limits

- Launch an agent design session to settle a `needs-design` or Design-type issue.
- Launch a with-geoff session to work through an issue labelled `with-geoff`.
- When the owner asks for a with-geoff session, launch it even at the with-geoff limit. Still run
  `capacity.sh` first. Then pass `--asked <link to the owner's message>` to `hq run add`. Agent
  design sessions have no such exception.
- Right after the launch, run `hq run add --design agent|with-geoff`.
- When the design session ends, run `hq run done`. The next `hq run add` on the issue turns the
  design run into the delivery run, and `hq run show` keeps the design notes.

## Reading the output

- `imp.room` is false when less than one imp's memory (`imp.impMib`) is free. Then every provider
  whose `target` is `imp` holds. The exception is a provider with `localFallback: <n>`. It launches
  on this host (`launch.target: local`) while fewer than `<n>` delivery sessions run here.
- A provider's `used` is its fullest usage window, in percent. Its `room` is true while `used` is
  below its `threshold`. A provider with an `error` has no room. `cached` means the reading is up to
  2 minutes old.
- For a launch on an imp, Claude's quota is that of the account the imp broker uses
  (`hq capacity broker`). For a launch on this host, it's this host's Claude login.
- When a Claude session you launched on an imp has started work, record a broker proof:
  `hq slots broker <account number> --proof <session id>`. The owner has Claude accounts 1 to 4,
  and `hq slots broker` alone prints the number of the broker's account. The session id is the `id`
  that `atc_session_spawn` returned. The proof shows that the broker's account works.
- When no reading of the broker's quota is under 2.5 hours old, Claude's imp reading is `unknown`.
  hq counts an `unknown` reading as room while the last broker proof is under 24 hours old. After
  that, hq holds every imp launch.
- `capacity.sh` never picks a provider whose `unattended` is false.

When every provider on the route is over its threshold, or a reading fails, check `hq unblock list`
for an open item. With none, add one with `hq unblock add`, as owner-calls says. Give it the
soonest `resetsAt` among the providers' readings, or the `error`. Run `hq unblock done` on it once
`capacity.sh` finds room. Tell no one about any other hold. It's routine.

## Settings

Change `pacing.json` only when the owner asks, and quote the owner in the PR. CI checks the file
against [pacing.schema.json](../pacing.schema.json). Add a new field to the schema in the same PR.

- `designSlots`: the with-geoff design sessions that may run at once. The owner may go over it.
- `agentDesignSlots`: the agent design sessions that may run at once.
- `slots.imp`, `slots.local`: the delivery sessions that may run on the imps, and on this host. Keep
  `slots.imp` at 7 or fewer. The imps' host has 16 GiB for 8 imps of 2 GiB, and one imp's memory
  stays free for imps outside the slots.
- `placeTypes.<place>`: the issue Types that `hq lanes` puts in that place's slots. It puts no other
  Type there. A place with no list takes every Type. An imp agent gets only its repo's skills, so
  `placeTypes.local` lists Investigation.
- `providers.<name>`:
  - `threshold`: the percent of quota at which its launches stop.
  - `unattended`: whether it may launch with no person in the session.
  - `localFallback`: how many sessions it may run on this host when the imps are full.
  - `target`: `imp` or `local`. Codex runs `local`, where its login lives.
- `routes`: for each size, the providers in order, cheapest subscriptions first.
