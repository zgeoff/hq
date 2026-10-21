#!/usr/bin/env bash
# Checks pacing.json against pacing.schema.json, both beside this folder, and that each
# route names only known providers, at least one lane exists, no lane name appears in both places,
# and each lane in lends exists.
# Handles the schema keywords pacing.schema.json uses; an unknown keyword fails the check.
# Usage: check-pacing.sh [<pacing JSON>]. Prints each problem and exits 1, or prints "ok".
set -euo pipefail

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
file=${1:-"$here/../pacing.json"}
schema="$here/../pacing.schema.json"

jq -r -n --slurpfile doc "$file" --slurpfile schema "$schema" '
  $schema[0] as $root
  | def resolve: if has("$ref") then $root["$defs"][."$ref" | ltrimstr("#/$defs/")] else . end;
    def kind: if type == "number" and (. == floor) then "integer" else type end;
    def known: ["$schema", "title", "description", "type", "required", "additionalProperties",
      "properties", "$ref", "$defs", "minimum", "maximum", "minProperties", "propertyNames",
      "pattern", "enum", "minItems", "items", "minLength"];
    # check($s; $path): one line per problem with the value at $path.
    def check($s; $path):
      ($s | resolve) as $s
      | . as $v
      | ([$s | keys[] | select(IN(known[]) | not)] | map("\($path): unknown schema keyword \(.)")[]),
        (if $s.type and (($s.type == "number" and ($v | type) == "number") or ($v | kind) == $s.type | not)
         then "\($path): want \($s.type), got \($v | kind)" else
          (if $s.enum and ($v | IN($s.enum[]) | not) then "\($path): \($v | tojson) is not one of \($s.enum | tojson)" else empty end),
          (if $s.minimum != null and ($v | type) == "number" and $v < $s.minimum then "\($path): \($v) is below \($s.minimum)" else empty end),
          (if $s.maximum != null and ($v | type) == "number" and $v > $s.maximum then "\($path): \($v) is above \($s.maximum)" else empty end),
          (if $s.minLength and ($v | type) == "string" and ($v | length) < $s.minLength then "\($path): too short" else empty end),
          (if ($v | type) == "array" then
            (if $s.minItems and ($v | length) < $s.minItems then "\($path): needs at least \($s.minItems) item(s)" else empty end),
            (if $s.items then ($v | to_entries[] | .key as $i | .value | check($s.items; "\($path)[\($i)]")) else empty end)
          else empty end),
          (if ($v | type) == "object" then
            (($s.required // [])[] | select(. as $k | $v | has($k) | not) | "\($path): missing \(.)"),
            (if $s.minProperties and ($v | length) < $s.minProperties then "\($path): needs at least \($s.minProperties) entr(ies)" else empty end),
            ($v | to_entries[]
              | .key as $k | .value
              | (if $s.propertyNames.pattern and ($k | test($s.propertyNames.pattern) | not)
                 then "\($path).\($k): bad name" else empty end),
                (if $s.properties[$k] then check($s.properties[$k]; "\($path).\($k)")
                 elif $s.additionalProperties == false then "\($path): unexpected key \($k)"
                 elif ($s.additionalProperties | type) == "object" then check($s.additionalProperties; "\($path).\($k)")
                 else empty end))
          else empty end)
        end);
  if ($doc | length) != 1 then "pacing: want one JSON value, got \($doc | length)\n" | halt_error(1) else . end
  | $doc[0] as $p
  | (if ($p | type) == "object" then $p else {} end) as $o
  | [ ($p | check($root; "pacing")),
      ($o.routes | objects | to_entries[] | .key as $size | .value | arrays | .[] | strings
        | select(. as $name | $o.providers | objects | has($name) | not)
        | "pacing.routes.\($size): unknown provider \(.)"),
      ($o.lanes | objects | (.imp | objects | keys) as $imp | (.local | objects | keys) as $local
        | ($imp - ($imp - $local))[] | "pacing.lanes: \(.) is in both imp and local"),
      ($o.lanes | objects | select([.imp, .local | objects | keys[]] | length == 0) | "pacing.lanes: no lanes at all"),
      ($o.lends | objects | keys[] | select(. as $lane | [$o.lanes | objects | (.imp, .local) | objects | keys[]] | index($lane) | not)
        | "pacing.lends: \(.) is not a lane")
    ] as $problems
  | if ($problems | length) == 0 then "ok" else ($problems | join("\n") + "\n" | halt_error(1)) end
'
