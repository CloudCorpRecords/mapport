/**
 * mapport types.
 *
 * Each tool maps to one Google Maps Platform endpoint. Coordinates are
 * plain {latitude, longitude} pairs; origins, destinations, and query
 * strings stay as the caller wrote them. HTTP access is described by a
 * minimal response surface so tests can inject a fake fetch and never
 * touch the network.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GeocodeOptions {
  address: string;
}

export interface ReverseGeocodeOptions {
  latitude: number;
  longitude: number;
}

export interface SearchPlacesOptions {
  query: string;
  location?: LatLng;
  /** Search radius in metres (upstream maximum 50000). */
  radius?: number;
}

export interface PlaceDetailsOptions {
  place_id: string;
}

export interface DistanceMatrixOptions {
  origins: string[];
  destinations: string[];
  /** Travel mode: driving, walking, bicycling, or transit. */
  mode?: string;
}

export interface ElevationOptions {
  locations: LatLng[];
}

export interface DirectionsOptions {
  origin: string;
  destination: string;
  /** Travel mode: driving, walking, bicycling, or transit. */
  mode?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
