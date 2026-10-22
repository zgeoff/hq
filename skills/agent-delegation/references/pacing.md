# pacing

A session launches only while imp capacity and provider quota both have room, and a design launch
also needs a free design slot. `scripts/capacity.sh` reads them all and picks the provider, so one
call stands in for several. [pacing.json](../pacing.json) holds the slot counts, the thresholds,
the routes and the design slots.

hq fills each free slot from Ready itself, in the order `hq focus show` prints, with the same
check. Run `capacity.sh` yourself only for a launch you make: a pitch launch, a relaunch, or a design
or ad-hoc session.

## Before a launch

1. Count the design sessions that wait on the owner now: those pinned for a design or an audit.
2. Count the delivery sessions running on this host now, from `hq lanes`.
3. Run `scripts/capacity.sh --size <S|M|L|XL> --design-open <n> --local-open <n>`. For a design
   session, pass `--design` in place of `--size`. Launch an Investigation as an M.
4. Read `launch`:
   - `provider` set: spawn with `agent` set to `launch.agent`, on the target `launch.target` names:
     `imp` for an imp target, `local` for this host. On Claude, prefer Opus.
   - `provider` null: hold the launch. `reason` says which limit is full.

Work that reads the owner's personal data, such as his memories, the event log or Nix's
conversations, runs on Claude only, because only Claude runs under his own account: launch it only
when `launch.provider` is `claude`.

A design session the owner asks for launches at once, whatever the slots, and counts as an open
slot while it waits on him.

## Reading the output

- `imp.room` is false when less than one imp's memory (`imp.impMib`) is left uncommitted. It holds
  back only providers whose `target` is `imp`, unless they have a `localFallback`: then
  `launch.target` is `local` while fewer than that many delivery sessions run on this host.
- Each provider's `used` is its fullest usage window, in percent. `room` is true while `used` is
  below `threshold`.
- A provider with an `error` has no room. Claude's reading comes from an endpoint that reads only
  the account logged in on this host, which the imps share; it rate-limits repeated calls, so the
  script reuses a good reading for 2 minutes and marks it `cached`. Codex's reading comes from the
  last local Codex session log.
- A provider with `unattended` false never gets a launch from the route, though its quota shows.

When every provider on the route is over its threshold, or a readout fails, file it with
`hq unblock add` with the soonest `resetsAt` or the `error`, once per hold, and close it with
`hq unblock done` when the hold ends. Any other hold, such as no imp room or a full design slot, is
routine: say nothing.

## The settings

Change `pacing.json` only when the owner asks, and record his words in the PR. `scripts/check-pacing.sh`
checks it against [pacing.schema.json](../pacing.schema.json) in CI; add a new field to the schema
in the same PR.

- `designSlots`: how many design sessions may wait on the owner at a time.
- `slots.imp` and `slots.local`: how many delivery sessions run on the imps and on this host. The
  imps run at most 7, since impd's 16 GiB line for agents fits 8.
- `providers.<name>.threshold`: the percent of either window at which launches on that provider
  stop.
- `providers.<name>.unattended`: whether hq or you may launch unattended work there.
- `providers.<name>.localFallback`: how many delivery sessions may run on this host when the imps
  are full.
- `providers.<name>.target`: where that provider's sessions run, `imp` or `local`. Codex runs on
  `local`, where its login lives.
- `routes`: for each size, the providers in drain order, the cheaper subscriptions first.

What the fleet works on is not a setting here: the owner sets it with `hq focus set`.
