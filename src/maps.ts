/**
 * mapport core: seven tools against the Google Maps Platform APIs.
 *
 * Every call is a GET to one endpoint under
 * https://maps.googleapis.com/maps/api/ with the API key from
 * GOOGLE_MAPS_API_KEY sent as the `key` query parameter:
 *
 *   geocode          -> /geocode/json          (address)
 *   reverse geocode  -> /geocode/json          (latlng)
 *   place search     -> /place/textsearch/json (query, location, radius)
 *   place details    -> /place/details/json    (place_id)
 *   distance matrix  -> /distancematrix/json   (origins, destinations, mode)
 *   elevation        -> /elevation/json         (locations)
 *   directions       -> /directions/json       (origin, destination, mode)
 *
 * Google answers HTTP 200 even for API-level failures, carrying the
 * real outcome in a top-level `status` string ("OK", "ZERO_RESULTS",
 * "REQUEST_DENIED", ...). A non-OK, non-ZERO_RESULTS status is raised
 * as an error that names the status and Google's own error_message;
 * ZERO_RESULTS is an honest empty answer, not an error.
 *
 * A missing API key is an error before any request is made, and the
 * error names the GOOGLE_MAPS_API_KEY variable. All HTTP goes through
 * an injected FetchFn so request building is fully testable offline.
 */
import type {
  DirectionsOptions,
  DistanceMatrixOptions,
  ElevationOptions,
  FetchFn,
  GeocodeOptions,
  LatLng,
  PlaceDetailsOptions,
  ReverseGeocodeOptions,
  SearchPlacesOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const API_BASE = "https://maps.googleapis.com/maps/api";

export const API_KEY_ENV = "GOOGLE_MAPS_API_KEY";

export const MAX_RADIUS = 50000;

const TRAVEL_MODES = ["driving", "walking", "bicycling", "transit"];

/** The honest missing-key error. Names the variable, never a value. */
export function requireApiKey(apiKey: string | undefined): string {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY environment variable is required: set GOOGLE_MAPS_API_KEY to a Google Maps Platform API key and retry",
    );
  }
  return key;
}

function requireText(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function requireTextList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array of strings`);
  }
  return value.map((v) => requireText(v, field));
}

function requireLatLng(value: unknown, field: string): LatLng {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${field} must be an object with latitude and longitude`);
  }
  const rec = value as Record<string, unknown>;
  const latitude = rec.latitude;
  const longitude = rec.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) {
    throw new Error(`${field}.latitude must be a number`);
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) {
    throw new Error(`${field}.longitude must be a number`);
  }
  return { latitude, longitude };
}

function requireMode(mode: string | undefined): string | undefined {
  if (mode === undefined) return undefined;
  const m = mode.trim().toLowerCase();
  if (!TRAVEL_MODES.includes(m)) {
    throw new Error(`mode must be one of ${TRAVEL_MODES.join(", ")}`);
  }
  return m;
}

function latLngParam(point: LatLng): string {
  return `${point.latitude},${point.longitude}`;
}

async function callGoogle(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const key = requireApiKey(apiKey);
  const url = `${API_BASE}${path}?${new URLSearchParams({ ...params, key }).toString()}`;
  let response;
  try {
    response = await fetchFn(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    throw new Error(
      `Google Maps API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Google Maps API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Google Maps API returned a response that was not valid JSON");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Google Maps API returned an unexpected response shape");
  }
  const record = payload as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "";
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    const detail = typeof record.error_message === "string" ? `: ${record.error_message}` : "";
    throw new Error(`Google Maps API error ${status}${detail}`);
  }
  return record;
}

/** Convert an address to coordinates. */
export async function geocode(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: GeocodeOptions,
): Promise<Record<string, unknown>> {
  const address = requireText(options.address, "address");
  return callGoogle(fetchFn, apiKey, "/geocode/json", { address });
}

/** Convert coordinates to the nearest address. */
export async function reverseGeocode(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: ReverseGeocodeOptions,
): Promise<Record<string, unknown>> {
  const point = requireLatLng(options, "location");
  return callGoogle(fetchFn, apiKey, "/geocode/json", { latlng: latLngParam(point) });
}

/** Text search for places, optionally biased to a location and radius. */
export async function searchPlaces(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: SearchPlacesOptions,
): Promise<Record<string, unknown>> {
  const query = requireText(options.query, "query");
  const params: Record<string, string> = { query };
  if (options.location !== undefined) {
    params.location = latLngParam(requireLatLng(options.location, "location"));
  }
  if (options.radius !== undefined) {
    if (typeof options.radius !== "number" || !Number.isFinite(options.radius) || options.radius <= 0) {
      throw new Error("radius must be a positive number of metres");
    }
    params.radius = String(Math.min(MAX_RADIUS, Math.floor(options.radius)));
  }
  return callGoogle(fetchFn, apiKey, "/place/textsearch/json", params);
}

/** Detailed information about one place. */
export async function placeDetails(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: PlaceDetailsOptions,
): Promise<Record<string, unknown>> {
  const placeId = requireText(options.place_id, "place_id");
  return callGoogle(fetchFn, apiKey, "/place/details/json", { place_id: placeId });
}

/** Distance and duration matrix between origins and destinations. */
export async function distanceMatrix(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: DistanceMatrixOptions,
): Promise<Record<string, unknown>> {
  const origins = requireTextList(options.origins, "origins");
  const destinations = requireTextList(options.destinations, "destinations");
  const params: Record<string, string> = {
    origins: origins.join("|"),
    destinations: destinations.join("|"),
  };
  const mode = requireMode(options.mode);
  if (mode) params.mode = mode;
  return callGoogle(fetchFn, apiKey, "/distancematrix/json", params);
}

/** Elevation for one or more locations. */
export async function elevation(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: ElevationOptions,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(options.locations) || options.locations.length === 0) {
    throw new Error("locations must be a non-empty array of latitude/longitude pairs");
  }
  const points = options.locations.map((loc, i) => requireLatLng(loc, `locations[${i}]`));
  return callGoogle(fetchFn, apiKey, "/elevation/json", {
    locations: points.map(latLngParam).join("|"),
  });
}

/** Route directions between two points. */
export async function directions(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: DirectionsOptions,
): Promise<Record<string, unknown>> {
  const origin = requireText(options.origin, "origin");
  const destination = requireText(options.destination, "destination");
  const params: Record<string, string> = { origin, destination };
  const mode = requireMode(options.mode);
  if (mode) params.mode = mode;
  return callGoogle(fetchFn, apiKey, "/directions/json", params);
}

/** Render an upstream payload as the JSON text block MCP clients show. */
export function formatPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}
