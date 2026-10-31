# Pacing

A session launches only while the imps have memory free and its provider's quota has room. A design
session also needs a free place in its design lane. An imp is a cloud machine that runs one session;
a provider is the agent CLI, such as Claude or Codex. `scripts/capacity.sh` reads memory and quotas
and picks the provider; hq counts design sessions; [pacing.json](../pacing.json) holds the limits.

Run `capacity.sh` before every launch: a Ready issue, a pitch, a relaunch, a design or ad-hoc
session. Take Ready issues in the order `hq focus show` prints.

## Before a launch

1. **Design session:** read the `design:` line in `hq lanes`. Hold when its lane is full, unless the
   owner asked for a with-geoff session.
2. Count the delivery sessions running on this host, from `hq lanes`.
3. Run `scripts/capacity.sh --size <S|M|L|XL> --local-open <n>`, with the size from
   `hq run show <issue>` (an investigation, or no size: M). For a design session, pass `--design`
   instead of `--size`.
4. Read `launch`. With a `provider`, set `agent` to `launch.agent` and launch on `launch.target`
   (`imp` or `local`). With none, hold; `launch.reason` names the full limit.

Work that reads the owner's personal data (his memories, hq's event log, or Nix's conversations)
runs only when `launch.provider` is `claude`, since only Claude runs under his account. Otherwise
hold it, with no `hq unblock add`.

## Design lanes

- An agent design session settles a `needs-design` or Design-type issue without the owner. A
  with-geoff session works through an issue labelled `with-geoff` with him.
- When he asks for a with-geoff session, launch it even if the lane is full: still run
  `capacity.sh`, and pass `--asked <link to his message>` to `hq run add`. The agent lane has no
  override.
- Right after the launch, run `hq run add --design agent|with-geoff`. Always pass the flag: without
  it, hq puts a Design-type issue in the with-geoff lane.
- When it ends, `hq run done`. The next `hq run add` on the issue turns it into the delivery run,
  and `hq run show` keeps the design notes.

## Reading the output

- `imp.room` is false when less than one imp's memory (`imp.impMib`) is free. That holds only
  providers whose `target` is `imp`. A provider with `localFallback` still launches locally
  (`launch.target: local`) while fewer delivery sessions than that run here.
- A provider's `used` is its fullest usage window, in percent; `room` is true below `threshold`. A
  provider with an `error` has no room. `cached` means up to 2 minutes old.
- On an imp, Claude's quota is the imp broker's account (`hq capacity broker`); here, it's this
  host's login. The owner has Claude accounts 1 to 4, and hq calls the broker's one its slot.
- With no broker reading under 2.5 hours old, Claude's imp reading is `unknown`. It counts as room
  while the last broker proof is under 24 hours old, then holds every imp launch. Once a Claude
  session you launched on an imp has started work, record a proof with
  `hq slots broker <account number> --proof <spawn id>` (`hq slots broker` alone prints the number).
- A provider with `unattended` false never launches from the route.

When every provider on the route is over its threshold, or a reading fails, check `hq unblock list`
for an open item. With none, `hq unblock add` one with the soonest `resetsAt`, or the `error`. Close
it with `hq unblock done` once `capacity.sh` finds room. Any other hold is routine: say nothing.

## Settings

Change `pacing.json` only when the owner asks, quoting him in the PR. CI checks it against
[pacing.schema.json](../pacing.schema.json); add a new field to the schema in the same PR.

- `designSlots`: with-geoff design sessions at once; a soft limit he can exceed.
- `agentDesignSlots`: agent design sessions at once.
- `slots.imp`, `slots.local`: delivery sessions on the imps, and on this host. Keep `slots.imp` at 7
  or fewer: the imps' host has 16 GiB for 8 imps of 2 GiB.
- `placeTypes.<place>`: the issue Types a slot there takes, so `hq lanes` fills it with no other
  Type. A place with no list takes every Type. An imp agent gets only its repo's skills, so local
  takes the Investigation issues.
- `providers.<name>`: `threshold` (percent at which launches stop), `unattended` (may launch with no
  person in it), `localFallback` (local sessions when the imps are full), `target` (`imp` or
  `local`; Codex runs `local`, where its login lives).
- `routes`: per size, the providers in order, cheapest subscriptions first.

What the agents work on is the owner's, through `hq focus set`.
