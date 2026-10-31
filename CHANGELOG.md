# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `mapport geocode|reverse|search|details|distance|elevation|directions`
  plus `mapport mcp`; the Google Maps key is read from
  `GOOGLE_MAPS_API_KEY`.
- MCP server (`mapport mcp`, stdio) with seven tools: `maps_geocode`,
  `maps_reverse_geocode`, `maps_search_places`, `maps_place_details`,
  `maps_distance_matrix`, `maps_elevation`, and `maps_directions`.
- Calls go to the Google Maps Platform endpoints under
  `https://maps.googleapis.com/maps/api/` with the key sent as the
  `key` query parameter; upstream `status` failures are surfaced as
  errors naming the status and message.
- A missing `GOOGLE_MAPS_API_KEY` fails honestly with an error naming
  the variable, before any request is made.
- All HTTP goes through an injectable fetch function, so the test suite
  runs entirely on hand-written fixtures with no network access.
