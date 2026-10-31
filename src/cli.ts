#!/usr/bin/env node
/**
 * mapport CLI.
 *
 *   mapport geocode <address>
 *   mapport reverse <latitude> <longitude>
 *   mapport search <query> [--lat n --lng n] [--radius n]
 *   mapport details <place_id>
 *   mapport distance <origin>... --to <destination>... [--mode m]
 *   mapport elevation <latitude,longitude>...
 *   mapport directions <origin> <destination> [--mode m]
 *   mapport mcp
 *
 * Reads the Google Maps key from GOOGLE_MAPS_API_KEY.
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import {
  API_KEY_ENV,
  directions,
  distanceMatrix,
  elevation,
  formatPayload,
  geocode,
  placeDetails,
  reverseGeocode,
  searchPlaces,
  VERSION,
} from "./maps.js";
import type { FetchFn, LatLng } from "./types.js";

function usage(): never {
  console.error(`Usage:
  mapport geocode <address>
  mapport reverse <latitude> <longitude>
  mapport search <query> [--lat n --lng n] [--radius n]
  mapport details <place_id>
  mapport distance <origin> [--mode m] --to <destination>
  mapport elevation <latitude,longitude> [<latitude,longitude> ...]
  mapport directions <origin> <destination> [--mode m]
  mapport mcp
  mapport --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function withoutFlags(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else out.push(args[i]);
  }
  return out;
}

function numFlag(args: string[], name: string): number | undefined {
  const raw = flagValue(args, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLatLng(raw: string): LatLng {
  const [lat, lng] = raw.split(",").map((s) => Number.parseFloat(s.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) usage();
  return { latitude: lat, longitude: lng };
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env[API_KEY_ENV];
  const known = ["geocode", "reverse", "search", "details", "distance", "elevation", "directions"];
  if (!known.includes(cmd)) usage();
  try {
    let out: Record<string, unknown>;
    if (cmd === "geocode") {
      const address = rest.join(" ").trim();
      if (!address) usage();
      out = await geocode(fetchFn, apiKey, { address });
    } else if (cmd === "reverse") {
      const latitude = Number.parseFloat(rest[0] ?? "");
      const longitude = Number.parseFloat(rest[1] ?? "");
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) usage();
      out = await reverseGeocode(fetchFn, apiKey, { latitude, longitude });
    } else if (cmd === "search") {
      const positional = withoutFlags(rest, ["--lat", "--lng", "--radius"]);
      const query = positional.join(" ").trim();
      if (!query) usage();
      const lat = numFlag(rest, "--lat");
      const lng = numFlag(rest, "--lng");
      const location = lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : undefined;
      out = await searchPlaces(fetchFn, apiKey, { query, location, radius: numFlag(rest, "--radius") });
    } else if (cmd === "details") {
      const placeId = (rest[0] ?? "").trim();
      if (!placeId) usage();
      out = await placeDetails(fetchFn, apiKey, { place_id: placeId });
    } else if (cmd === "distance") {
      const sep = rest.indexOf("--to");
      if (sep < 1 || sep + 1 >= rest.length) usage();
      const origins = withoutFlags(rest.slice(0, sep), ["--mode"]);
      const destinations = withoutFlags(rest.slice(sep + 1), ["--mode"]);
      if (origins.length === 0 || destinations.length === 0) usage();
      out = await distanceMatrix(fetchFn, apiKey, {
        origins,
        destinations,
        mode: flagValue(rest, "--mode"),
      });
    } else if (cmd === "elevation") {
      if (rest.length === 0) usage();
      out = await elevation(fetchFn, apiKey, { locations: rest.map(parseLatLng) });
    } else {
      const positional = withoutFlags(rest, ["--mode"]);
      if (positional.length < 2) usage();
      out = await directions(fetchFn, apiKey, {
        origin: positional[0],
        destination: positional.slice(1).join(" "),
        mode: flagValue(rest, "--mode"),
      });
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
