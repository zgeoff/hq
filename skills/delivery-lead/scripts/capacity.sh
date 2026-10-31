#!/usr/bin/env bash
# Reads the 2 delivery limits (imp room, provider quota) and prints one JSON object. With
# --size or --design it adds a launch decision: the provider to launch on, or why nothing can
# launch. hq counts the design lanes, so --design picks only the provider.
# Usage: capacity.sh [--size S|M|L|XL | --design] [--local-open <n>]
#   --local-open   delivery sessions running on this host now (default 0)
# Reads pacing.json beside this folder. Needs jq, curl, imp and hq. Never prints a key.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
pacing=$(cat "$here/../pacing.json")
size="" design=false local_open=0
while [ $# -gt 0 ]; do
  case $1 in
    --size) size=$2; shift 2 ;;
    --design) design=true; shift ;;
    --local-open) local_open=$2; shift 2 ;;
    *) echo "capacity.sh: unknown option $1" >&2; exit 2 ;;
  esac
done

# Each reader prints {used, resetsAt, source} or {error}. used is the highest window, in percent.
imp_room() {
  imp info --json 2>/dev/null | jq -c '{budgetMib: .ramBudgetMib, committedMib: .ramCommittedMib}' \
    || echo '{"error": "imp info failed"}'
}

# The usage endpoint rate-limits (429) when a tick tries several launches in a row, so a good
# reading is reused for 2 minutes, from the active account's own copy only: the owner rotates
# accounts, and another account's reading says nothing about this one. A failed call is never
# cached: it still means no room.
claude_cache="${XDG_CACHE_HOME:-$HOME/.cache}/z-capacity/claude-usage.json"
claude_usage() {
  local token out email account="" account_cache=""
  # The token and `claude auth status` both follow CLAUDE_CONFIG_DIR, so they name one account,
  # named by a short hash of the login email (never the token).
  email=$(timeout 10 claude auth status --json 2>/dev/null | jq -r '.email // empty' 2>/dev/null) || true
  if [ -n "$email" ]; then
    account=$(printf '%s' "$email" | sha256sum | cut -c1-12)
    account_cache="${claude_cache%.json}/$account.json"
  fi
  if [ -n "$account_cache" ] && [ -f "$account_cache" ] && [ $(( $(date +%s) - $(stat -c %Y "$account_cache") )) -lt 120 ]; then
    out=$(jq -ce 'select(.used | type == "number") | . + {cached: true}' "$account_cache" 2>/dev/null) && { echo "$out"; return; }
  fi
  token=$(jq -r '.claudeAiOauth.accessToken // empty' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json" 2>/dev/null) || true
  [ -n "$token" ] || { echo '{"error": "no Claude login on this machine"}'; return; }
  out=$(curl -sf --max-time 15 https://api.anthropic.com/api/oauth/usage \
    -H "Authorization: Bearer $token" -H 'anthropic-beta: oauth-2025-04-20' \
    | jq -c '{fiveHour: .five_hour.utilization, sevenDay: .seven_day.utilization} as $w
      | {fiveHour: .five_hour.resets_at, sevenDay: .seven_day.resets_at} as $r
      | [.five_hour, .seven_day] | map(select(. != null)) | {
        used: (map(.utilization) | max),
        windows: $w,
        resets: $r,
        resetsAt: (max_by(.utilization).resets_at),
        source: "oauth usage endpoint (undocumented; active account only)"
      }' 2>/dev/null) || out=""
  if ! jq -e '.used | type == "number"' <<< "$out" > /dev/null 2>&1; then
    echo '{"error": "Claude usage endpoint failed"}'; return
  fi
  # Each reading names its account and keeps the per-account copy that hq samples for cost.
  if [ -n "$account" ]; then
    out=$(jq -c --arg account "$account" '. + {account: $account}' <<< "$out")
    mkdir -p "${claude_cache%.json}" && printf '%s\n' "$out" > "$account_cache"
  fi
  mkdir -p "$(dirname "$claude_cache")" && printf '%s\n' "$out" > "$claude_cache"
  echo "$out"
}

# Claude on imp runs on the imp broker's slot, not this machine's login: hq reads that slot's quota
# every 2 h, and hq builds the reading. With no fresh read, a broker proof under 24 h old still
# means room (unknown: true).
broker_usage() {
  hq capacity broker --json 2>/dev/null | jq -ce '.reading | objects' 2>/dev/null \
    || echo '{"error": "hq capacity broker failed"}'
}

codex_usage() {
  local file
  file=$(find ~/.codex/sessions -name '*.jsonl' -mtime -7 -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | cut -d' ' -f2- | while read -r f; do grep -q '"rate_limits"' "$f" && { echo "$f"; break; }; done)
  [ -n "$file" ] || { echo '{"error": "no Codex session log with rate limits in the last 7 days"}'; return; }
  grep '"rate_limits"' "$file" | tail -1 \
    | jq -c --arg seen "$(date -u -r "$file" +%FT%TZ)" '
        [.. | objects | select(.rate_limits? != null) | .rate_limits][0]
        | [(.primary // null), (.secondary // null)] | map(select(. != null and .used_percent != null))
        | if length == 0 then {error: "the last Codex session log has no usage windows"} else {
            used: (map(.used_percent) | max),
            resetsAt: (max_by(.used_percent).resets_at | if . then todate else null end),
            source: ("last local Codex session log, " + $seen)
          } end' 2>/dev/null || echo '{"error": "the last Codex session log could not be read"}'
}

# Runs one reader and passes on its JSON, or an error object when it printed none.
read_json() {
  local out
  out=$("$@" 2>/dev/null) || true
  if jq -se 'length == 1 and (.[0] | type == "object")' >/dev/null 2>&1 <<<"$out"; then echo "$out"
  else jq -nc --arg r "$1" '{error: ($r + " printed no usage")}'; fi
}

jq -n \
  --argjson pacing "$pacing" \
  --argjson imp "$(read_json imp_room)" \
  --argjson claude "$(read_json broker_usage)" \
  --argjson local "$(read_json claude_usage)" \
  --argjson codex "$(read_json codex_usage)" \
  --arg size "$size" --argjson design "$design" --argjson localOpen "$local_open" '
  # The broker slot reads Claude only for imp launches; a Claude that targets this host reads its login.
  {claude: (if $pacing.providers.claude.target == "imp" then $claude else $local end), codex: $codex} as $read
  | ($imp | if .error then . + {room: false} else
      . + {freeMib: (.budgetMib - .committedMib)}
      | . + {room: (.freeMib >= $pacing.imp.impMib)} end) as $impOut
  | ($pacing.providers | with_entries(
      .key as $k | .value as $p | {key: $k, value: ($read[$k] + {
        threshold: $p.threshold, unattended: $p.unattended, target: $p.target,
        room: ($read[$k].unknown == true or (($read[$k].used // null) != null and $read[$k].used < $p.threshold))
      }
      # The login on this machine, for the localFallback launches.
      + if $k == "claude" and $p.target == "imp" then {local: ($local + {
          room: (($local.used // null) != null and $local.used < $p.threshold)
        })} else {} end)})) as $providers
  # Where a provider launches now: its target while it has room there, or this host when the imps
  # or the broker quota are full and its localFallback cap and this login have room, or null.
  | def place($p): $pacing.providers[$p] as $c | $providers[$p] as $q
      | if $q.room and ($c.target != "imp" or $impOut.room) then $c.target
        elif $c.target == "imp" and ($c.localFallback // 0) > $localOpen and ($q.local // {room: false}).room then "local"
        else null end;
  # A launch on the imps with an unknown broker quota says why it still has room.
  def note($p): if place($p) == "imp" and $providers[$p].unknown == true
      then {reason: ("broker quota unknown, its proof " + $providers[$p].proof + " is " + ($providers[$p].proofAgeHours | tostring) + " h old")}
      else {} end;
  {
      checkedAt: (now | todate),
      imp: $impOut,
      providers: $providers,
      slots: $pacing.slots
    }
  | if $design then . + {launch: (
      if place("claude") != null then {provider: "claude", agent: $pacing.providers.claude.agent, target: place("claude")} + note("claude")
      elif $providers.claude.room then {provider: null, reason: "no imp room"}
      else {provider: null, reason: "Claude is at its quota threshold"} end)}
    elif $size != "" then . + {launch: (
      ($pacing.routes[$size] // error("unknown size " + $size)) as $route
      | [$route[] | select($providers[.].unattended and ($providers[.].room or ($providers[.].local // {room: false}).room))] as $open
      | [$open[] | select(place(.) != null)][0] as $pick
      | if $pick then {size: $size, provider: $pick, agent: $pacing.providers[$pick].agent, target: place($pick)} + note($pick)
        elif ($open | length) > 0 then {size: $size, provider: null,
          reason: "no imp room"}
        else {size: $size, provider: null, reason: ("no provider on the " + $size + " route has room for unattended work")} end)}
    else . end
'
