# mapport — Build Report

MCP Rebuild 100, Tier B. Clean-room rebuild of the Google Maps MCP
server (@modelcontextprotocol/server-google-maps, in
modelcontextprotocol/servers), built from the public tool spec
captured in `harness/fixtures/google-maps-tools-original.json` only.
The fixture was created for this build: it is docs-derived from the
original project's public documentation (tool names, parameter types,
required sets), corroborated by public listings of the same seven
tools, and marked `"_source": docs-derived ... not hand-probed`.
google-maps is `audited` status in TARGETS.json, but the packages-100
mcpaudit index records only its no-key behaviour verbatim
("GOOGLE_MAPS_API_KEY environment variable is not set") — no audited
tool list exists there, so no audited ground truth was claimed. Local
build only — nothing pushed or published, and no live network call
was made or claimed at any point.

Identity: repo `mapport`, npm `@reneturcios/mapport`,
MCP name `io.github.CloudCorpRecords/mapport`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `mapport: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Geocoding, places, directions,
  distance, and elevation through Google Maps." = **75 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/mapport:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/mapport"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`geocode`, `reverse`, `search`,
  `details`, `distance`, `elevation`, `directions`, `mcp`,
  `--version`; exit 2 usage / 1 API error), `src/mcp.ts`,
  `src/types.ts`, `src/maps.ts` (core logic, `VERSION = "0.1.0"`)
- `test/maps.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to mapport)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the public spec and
  break exact schema parity. Zod still validates every `tools/call`.
- The seven tools map to GET endpoints under
  `https://maps.googleapis.com/maps/api/` (`/geocode/json` for both
  geocode directions, `/place/textsearch/json`, `/place/details/json`,
  `/distancematrix/json`, `/elevation/json`, `/directions/json`) with
  the key from `GOOGLE_MAPS_API_KEY` sent as the `key` query
  parameter. Origins/destinations and elevation locations are joined
  with `|`; the search radius is clamped to the upstream maximum of
  50000 metres; travel modes are validated against
  driving/walking/bicycling/transit.
- Google answers HTTP 200 with an in-payload `status`; any status
  other than `OK` / `ZERO_RESULTS` is raised as an error naming the
  status and Google's `error_message`, while `ZERO_RESULTS` returns
  as an honest empty answer.
- A missing key throws before any request, with an error naming
  `GOOGLE_MAPS_API_KEY`; over MCP this surfaces as an `isError`
  result (verified live over stdio, see below).
- All HTTP flows through an injectable `FetchFn` (types.ts). The test
  suite uses a fake fetch returning hand-written Google-shaped JSON
  fixtures — **no live call was performed during this build**.

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with the
`#!/usr/bin/env node` shebang.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 15
ℹ pass 15
ℹ fail 0
```
Covers: missing/blank key error naming GOOGLE_MAPS_API_KEY (and no
request made without a key), geocode endpoint URL + `address`/`key`
params, reverse-geocode `latlng` shaping, place search
query/location/radius with radius clamping and omission, place
details `place_id`, distance-matrix pipe joining + mode validation +
empty-origins rejection, elevation pipe joining, directions params,
Google `REQUEST_DENIED` status errors with message detail,
`ZERO_RESULTS` as an empty answer, and HTTP-500 propagation.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage. MCP
`initialize` over stdio → `serverInfo: {"name":"mapport",
"version":"0.1.0"}`. A `tools/call` for `maps_geocode` with
`GOOGLE_MAPS_API_KEY` unset returned `isError: true` with text
"GOOGLE_MAPS_API_KEY environment variable is required: set
GOOGLE_MAPS_API_KEY to a Google Maps Platform API key and retry".
CLI calls against the live API were **not** run (offline build rule
for this wave).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/google-maps-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/mapport/dist/cli.js mcp" \
    --out .../builds/mapport/parity-out
verdict=PASS parity_pct=100.0 original_tools=7 rebuild_tools=7 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from searchport's and edited with the
file edit tool: top-level `name`, root package `name`, and root
package `bin` key changed searchport -> mapport (dependency ranges
are identical, so the tree is unchanged). **Clean lockfile regen
required before publish** (regenerate with no `node_modules`
present); do not publish from this lockfile as-is. `node_modules`
here is a `cp -a` copy of searchport's; `.bin/tsc` / `.bin/tsx`
verified working.

## Gaps / honest notes

- No live Google Maps API call was made (VM egress is blocked and no
  key is available in this environment). Request construction is
  written against the documented endpoint paths and parameter names;
  live payload drift is unverified until the publish wave can smoke
  with a real key.
- Parity is tool/schema parity against a docs-derived fixture (see
  the provenance note at the top), not a hand-probed original.
- Place search uses the classic Places text-search endpoint
  (`/place/textsearch/json`), matching the documented original's
  era; the newer Places API (New) field-mask endpoints are a
  different surface and were not the documented spec.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

## Publish-gate remediation (2026-10-27)

Recorded under Rene's 2026-10-27 decision ("Remediate the 6: add param
descriptions + capability-class vet policy, then re-gate") and
`publish/GATE-POLICY.md`, following the standing Wave 2 remediation
pattern. This is an authorized deviation from the parity-faithful
state: descriptions were added to every tool parameter that lacked
one, in the `src/mcp.ts` schema literals only — parameter names,
types and required lists are unchanged.

- Descriptions added: 18 insertion points, covering 18 served
  parameter occurrences (no shared schema consts in the served
  literals; each insertion serves exactly one occurrence). That is
  the 14 top-level parameters counted by the fresh mcpaudit's 7
  PARAMS_UNDESCRIBED issues, plus the 4 nested latitude/longitude
  properties. Insertion points: `maps_geocode` parameter `address`;
  `maps_reverse_geocode` parameters `latitude`, `longitude`;
  `maps_search_places` parameters `query`, `location` (including
  its nested `latitude` and `longitude`), `radius`;
  `maps_place_details` parameter `place_id`;
  `maps_distance_matrix` parameters `origins`, `destinations`,
  `mode`; `maps_elevation` parameter `locations` (including its
  items' nested `latitude` and `longitude`); and
  `maps_directions` parameters `origin`, `destination`, `mode`.
- Rebuild: `npm run build` exit 0; `tsc --noEmit` exit 0; full
  test suite 15/15 pass (tests 15, pass 15, fail 0).
- Parity harness re-run, verbatim: **PARTIAL, parity_pct 50.0** —
  original_tools=7 rebuild_tools=7 missing=[] extra=[]
  schema_diffs=['maps_directions', 'maps_distance_matrix',
  'maps_elevation', 'maps_geocode', 'maps_place_details',
  'maps_reverse_geocode', 'maps_search_places']. Every one of
  the 18 schema diffs is a description addition
  (`*.description: present in rebuild but not in original`); 0
  structural diffs. Structural parity proven independently:
  stripping `description` keys from BOTH the pre- and
  post-remediation tools/list deep-equals (strip-proof RESULT: PASS;
  every description present in PRE is byte-identical in POST, and
  the only additions are at inputSchema property paths — 18
  additions, 0 removals). Adjudication: the description-only diff
  is the authorized remediation itself; structural parity is
  unchanged. Full record:
  `publish/parity-remediation/mapport/parity.json` and
  `publish/parity-remediation/mapport/strip-proof.txt`.
- No publish gate was run in this remediation (no mcpaudit/mcpvet),
  and nothing was published.
