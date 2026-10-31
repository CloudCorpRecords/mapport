# mapport

mapport turns plain questions about places into answers from the
Google Maps Platform: an address becomes coordinates, coordinates
become an address, a text query becomes a list of places, and any two
points become a distance, a duration, or a step-by-step route. It also
reports how high a point sits above sea level. One binary serves both
a command-line interface for scripts and a stdio MCP server for
agents, and both faces share the same request logic.

A Google Maps Platform API key is required. Put it in the
`GOOGLE_MAPS_API_KEY` environment variable; it is sent to Google as
the `key` query parameter on every request and never appears in
output. When the variable is missing, every call fails with an error
that names it, before any request is made.

## Install

```bash
npx @reneturcios/mapport geocode "1600 Amphitheatre Parkway"
```

Or run the container image:

```bash
docker run -i -e GOOGLE_MAPS_API_KEY ghcr.io/cloudcorprecords/mapport
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
export GOOGLE_MAPS_API_KEY="your API key"

mapport geocode "1600 Amphitheatre Parkway, Mountain View"
mapport reverse 37.422 -122.084
mapport search "coffee near the ferry building" --lat 37.7955 --lng -122.3937 --radius 1500
mapport details ChIJ2eUgeAK6j4ARbn5u_wAGqWA
mapport distance "San Francisco" "Oakland" --to "Berkeley" --mode driving
mapport elevation 37.422,-122.084 40.0,-70.0
mapport directions "San Francisco" "San Jose" --mode transit

mapport --version
```

Each command prints the upstream JSON payload. Exit codes: `0` on
success, `1` when a call fails (including a missing
`GOOGLE_MAPS_API_KEY` or an API error), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/mapport mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "mapport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/mapport", "mcp"],
      "env": { "GOOGLE_MAPS_API_KEY": "your API key" }
    }
  }
}
```

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `maps_geocode` | `address` (string, required) | Matching locations with coordinates, formatted address, and place ID. |
| `maps_reverse_geocode` | `latitude` (number, required), `longitude` (number, required) | The nearest address for the coordinates, with its components. |
| `maps_search_places` | `query` (string, required), `location` (object, optional), `radius` (number, optional) | Places matching the query, with names, addresses, and locations. |
| `maps_place_details` | `place_id` (string, required) | Full details for one place: contact info, rating, reviews, and opening hours. |
| `maps_distance_matrix` | `origins` (string[], required), `destinations` (string[], required), `mode` (string, optional) | A matrix of distances and travel durations. |
| `maps_elevation` | `locations` (array of `{latitude, longitude}`, required) | Elevation in metres for each location. |
| `maps_directions` | `origin` (string, required), `destination` (string, required), `mode` (string, optional) | Routes with legs, steps, distance, and duration. |

Google reports most API failures inside an HTTP 200 payload, in a
top-level `status` field. mapport surfaces any status other than `OK`
or `ZERO_RESULTS` as a tool error naming the status and Google's own
message; `ZERO_RESULTS` is returned as an honest empty answer.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
