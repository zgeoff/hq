# pacing

**Delivery** launches a session only while imp capacity and provider quota both have room, and while the lane it fills has room. A design launch also needs a free design slot. `scripts/capacity.sh` reads them all and picks the provider, so you make one call before a launch instead of several. [pacing.json](../pacing.json) holds the thresholds, the routes, the design slots and the lanes.

## Before a launch

1. Count the design sessions that wait on the owner now: those pinned for a design or an audit.
2. Count the delivery sessions running on this host now, from your running work.
3. Pick the lane to fill, and read how many delivery sessions run in it now from `hq lanes status`, which counts each run by its lane. It leaves out a `blocked` run that waits on the owner (`--waits-on-geoff`) while no session of it is awake, and lists those runs on their own line; such a run counts again when its session wakes, the owner answers, or its state changes. Give a run the state it is in, never another one, to free its slot. A run it lists with no lane gets one: `hq run lane <issue> <lane>`, by its area, or `flexible` when it runs on this host. Each lane is an area:
   - `nixie-slice`: the nixie project, which holds the slices. `nixie-maintenance`: nixie maintenance.
   - `atc`, `imp` and `cloud`: that repo's projects. impz counts as `imp`.
   - `flexible`: every other area, such as security hardening, auto-mode, tools, docs and dotfiles. Every delivery session on this host counts toward it, except one in `cleanup` or `process`, which counts toward its own lane.
   - `cleanup`: only the cleanup set, in this order: first noslop cleanup and maintenance, as delivery-lead's `launch-order.md` says (GEO-1437, GEO-1438, GEO-1370, then any other open noslop issue); then GEO-1279, GEO-1280 and GEO-1281 (finished-script removals), GEO-1287 (the owner's hostnames and paths out of public repos), GEO-1284 and GEO-1282 (import-zones), GEO-1309 (the check runner), GEO-1297, GEO-1298 and GEO-1299 (comment purges), and GEO-1283. It takes an issue once it is Ready, in this order rather than launch order's priority order, takes no other work, and lends no slot to another lane. An issue in the set launches only into this lane.
   - `process`: only an issue labelled `process`: process improvement that the owner judged worth pursuing and whose design he signed off, as definitions-stewardship's `process-work.md` says. An issue so labelled launches only into this lane. With no such issue Ready, it lends its slot like any other lane, and a `process` issue takes it at the next free point.
   - `memory`: only GEO-1319, nixie memory's single subject field, and the issues it splits into, then GEO-259, retrieval tuned on the owner's real data (`z-stu`, 2026-10-18). Like `cleanup`, it takes no other work and lends no slot.
     Fill next the imp lane with the smallest share in use: its running sessions divided by its size. Break a tie in the order `pacing.json` lists the lanes. An issue launched into another area's lane, because that area had no Ready work, counts toward the lane it runs in.
4. Run `scripts/capacity.sh --size <S|M|L|XL> --design-open <n> --local-open <n> --lane <lane> --lane-open <n>`. For a design session, pass `--design` in place of `--size`. Work that reads the owner's personal data, such as his memories, the event log or Nix's conversations, runs on Claude only, never on another provider: launch it only when `launch.provider` is `claude`.
5. Read `launch`:
   - `provider` set: spawn with `agent` set to `launch.agent`, on the target `launch.target` names: `imp` for an imp target, `local` for this host. On Claude, prefer Opus. Pass `--lane <lane>` to `hq run add`, so hq counts the run in its lane.
   - `provider` null: leave the issue in Ready and try again at the next check-in. `reason` says which limit is full. When the lane is full, try the next lane.

Repeat steps 1–5 for the next issue until no lane has room or no eligible Ready issue is left.

A Design or Investigation issue has no size. Launch a Design issue with `--design`. Launch an Investigation as an M.

A design session the owner asks for launches at once, whatever the slots, and counts as an open slot while it waits on him.

## Reading the output

- `imp.room` is false when less than one imp's memory (`imp.impMib`) is left uncommitted. It holds back only providers whose `target` is `imp`, unless they have a `localFallback`: then `launch.target` is `local` while fewer than that many delivery sessions run on this host. With `--lane`, the launch runs only where its lane lives, and `localFallback` only says whether that provider can run on this host.
- Each provider's `used` is its fullest usage window, in percent. `room` is true while `used` is below `threshold`.
- A provider with an `error` has no room. The readout names its `source`:
  - Claude: an undocumented endpoint that reads only the account logged in on this host. The imps use the same account (the owner, 2026-10-13), so it covers all Claude delivery. It rate-limits repeated calls, so the script reuses a good reading for 2 minutes and marks it `cached`; a failed call is never reused.
  - Codex: the last local Codex session log, so it shows the quota as of that session.
- A provider with `unattended` false never gets a launch from the route, though its quota shows.

When `capacity.sh` holds a launch because every provider on the route is over its threshold, tell the owner as it happens, with the soonest `resetsAt`. Tell him the same way when a readout fails, with its `error`. Record each under "Waiting on Geoff" in your saved state, and tell him once per hold. Any other hold, such as no imp room or a full design slot, is routine: say nothing.

## Changing the settings

Change `pacing.json` only when the owner asks, and record his words with the change. `scripts/check-pacing.sh` checks it against [pacing.schema.json](../pacing.schema.json), and CI runs that check on every PR; add a new field to the schema in the same PR.

- `designSlots`: how many design sessions may wait on the owner at a time.
- `lanes.imp` and `lanes.local`: how many delivery sessions each lane runs, on the imps or on this host. The owner set the split on 2026-10-16; hq-private's `delivery-design.md` records it. hq-private's record of decision D-lanes holds each later change and its reason. The imps run at most 7 lanes, since impd's 16 GiB line for agents fits 8; more lanes run on this host. A run keeps the lane it launched in, so a cleanup run already on an imp finishes there.
- `process`: 1 slot on this host, taken from `flexible`, which went from 3 to 2 (decision D-process-slot).

- `lends`: each lane mapped to false neither lends its free slots to another lane nor borrows one: `cleanup` and `memory`, which each take only their own work. `hq lanes` reads it.
- `providers.<name>.threshold`: the percent of either window at which launches on that provider stop.
- `providers.<name>.unattended`: whether **Delivery** may launch unattended work there. Codex stays false until a Codex delivery brief has been proven.
- `providers.<name>.localFallback`: how many delivery sessions may run on this host when the imps are full. Claude's is 2 (the owner, 2026-10-13).
- `providers.<name>.target`: where that provider's sessions run, `imp` or `local`. Codex runs on `local`, where its login lives.
- `routes`: for each size, the providers in drain order. The cheaper subscriptions come first, and Claude last.

A lane added to or renamed in pacing.json needs its rule in hq's lanes.json too. hq refuses a pacing lane without a rule, and `hq lanes status` warns when the checkout's lanes.json differs from the installed hq's.
