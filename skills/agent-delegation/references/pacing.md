# pacing

A session launches only while imp capacity and provider quota both have room, and a design pass
also needs a free design lane. `scripts/capacity.sh` reads the imp room and the quotas and picks the
provider, so one call stands in for several. hq counts the design lanes itself, from the open
design runs. [pacing.json](../pacing.json) holds the slot counts, the thresholds, the routes and
the design lane counts.

Run `capacity.sh` before every launch: a Ready issue, a pitch launch, a relaunch, or a design or
ad-hoc session. Take Ready issues in the order `hq focus show` prints.

## Before a launch

1. For a design pass, read the `design:` line in `hq lanes`. It shows each lane's open passes
   against its count and the next ticket for each lane. A full lane holds the launch.
2. Count the delivery sessions running on this host now, from `hq lanes`.
3. Run `scripts/capacity.sh --size <S|M|L|XL> --local-open <n>`. For a design pass, pass `--design`
   in place of `--size`, with `--design-open 0`, since hq has checked the lane. Launch an
   Investigation as an M.
4. Read `launch`:
   - `provider` set: spawn with `agent` set to `launch.agent`, on the target `launch.target` names:
     `imp` for an imp target, `local` for this host.
   - `provider` null: hold the launch. `reason` says which limit is full.

Work that reads the owner's personal data, such as his memories, the event log or Nix's
conversations, runs on Claude only, because only Claude runs under his own account: launch it only
when `launch.provider` is `claude`.

There are two design lanes. An agent pass settles a `needs-design` ticket without the owner. A
with-geoff pass works through a ticket with him: a Design-type issue, or a `needs-design` ticket
labelled `with-geoff`. A with-geoff pass the owner asks for launches at once, whatever the count:
record where he asked with `--asked`, and hq lets the run over the count. An agent lane has no such
override.

Record a design pass with `hq run add --design agent|with-geoff`; a Design-type issue with no flag
goes in the with-geoff lane. When the pass ends, close its run with `hq run done`. The next
`hq run add` on that issue turns the closed design run into the build run, and `hq run show` keeps
the pass's sessions and notes.

## Reading the output

- `imp.room` is false when less than one imp's memory (`imp.impMib`) is left uncommitted. It holds
  back only providers whose `target` is `imp`, unless they have a `localFallback`: then
  `launch.target` is `local` while fewer than that many delivery sessions run on this host.
- Each provider's `used` is its fullest usage window, in percent. `room` is true while `used` is
  below `threshold`.
- A provider with an `error` has no room. For an imp launch, Claude's reading is the imp broker's
  slot, from hq's slot reads (`hq capacity broker`). For a launch on this host, it is this host's
  own login, read from the usage endpoint. That endpoint rate-limits repeated calls, so the script
  reuses a good reading for 2 minutes and marks it `cached`. Codex's reading comes from the last
  local Codex session log.
- With no fresh read of the broker's slot, Claude's imp reading is `unknown`. It counts as room
  while the last broker proof, `hq slots broker`, is under 24 h old, and `launch.reason` says so.
  Otherwise it holds every imp launch. Record a proof with `hq slots broker <n> --proof <id>` after
  you prove the broker's slot.
- A provider with `unattended` false never gets a launch from the route, though its quota shows.

When every provider on the route is over its threshold, or a readout fails, file it with
`hq unblock add` with the soonest `resetsAt` or the `error`, once per hold, and close it with
`hq unblock done` when the hold ends. Any other hold, such as no imp room or a full design lane, is
routine: say nothing.

## The settings

Change `pacing.json` only when the owner asks, and record his words in the PR. `scripts/check-pacing.sh`
checks it against [pacing.schema.json](../pacing.schema.json) in CI; add a new field to the schema
in the same PR.

- `designSlots`: how many with-geoff design passes run at a time. It is a soft limit, since a pass
  the owner asks for goes over it.
- `agentDesignSlots`: how many agent design passes run at a time.
- `slots.imp` and `slots.local`: how many delivery sessions run on the imps and on this host. The
  imps run at most 7, since impd's 16 GiB line for agents fits 8.
- `providers.<name>.threshold`: the percent of either window at which launches on that provider
  stop.
- `providers.<name>.unattended`: whether unattended work may launch there.
- `providers.<name>.localFallback`: how many delivery sessions may run on this host when the imps
  are full.
- `providers.<name>.target`: where that provider's sessions run, `imp` or `local`. Codex runs on
  `local`, where its login lives.
- `routes`: for each size, the providers in drain order, the cheaper subscriptions first.

What the fleet works on is not a setting here: the owner sets it with `hq focus set`.
