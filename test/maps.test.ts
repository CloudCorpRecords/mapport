import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  directions,
  distanceMatrix,
  elevation,
  geocode,
  placeDetails,
  requireApiKey,
  reverseGeocode,
  searchPlaces,
} from "../src/maps.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

// Hand-written fixtures in the documented shapes of the Google Maps
// Platform JSON responses: a top-level status plus a results/result
// payload per endpoint family.
const GEOCODE_PAYLOAD = {
  status: "OK",
  results: [
    {
      formatted_address: "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
      place_id: "ChIJ2eUgeAK6j4ARbn5u_wAGqWA",
      geometry: { location: { lat: 37.422, lng: -122.084 } },
    },
  ],
};

const PLACES_PAYLOAD = {
  status: "OK",
  results: [
    { name: "Ridge Cafe", formatted_address: "1 Ridge Road", place_id: "p1", rating: 4.5 },
  ],
};

const DETAILS_PAYLOAD = {
  status: "OK",
  result: { name: "Ridge Cafe", formatted_phone_number: "+1 415-555-0100", rating: 4.5 },
};

const MATRIX_PAYLOAD = {
  status: "OK",
  rows: [{ elements: [{ status: "OK", distance: { text: "10 km", value: 10000 }, duration: { text: "15 mins", value: 900 } }] }],
};

const ELEVATION_PAYLOAD = {
  status: "OK",
  results: [{ elevation: 12.5, location: { lat: 37.422, lng: -122.084 }, resolution: 4.77 }],
};

const DIRECTIONS_PAYLOAD = {
  status: "OK",
  routes: [{ summary: "US-101 S", legs: [{ distance: { text: "10 km" }, duration: { text: "15 mins" }, steps: [] }] }],
};

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
}

function fakeFetch(captured: Captured, body?: unknown): FetchFn {
  return async (url: string) => {
    captured.url = url;
    if (body !== undefined) return jsonResponse(body);
    if (url.includes("/geocode/json")) return jsonResponse(GEOCODE_PAYLOAD);
    if (url.includes("/place/textsearch/json")) return jsonResponse(PLACES_PAYLOAD);
    if (url.includes("/place/details/json")) return jsonResponse(DETAILS_PAYLOAD);
    if (url.includes("/distancematrix/json")) return jsonResponse(MATRIX_PAYLOAD);
    if (url.includes("/elevation/json")) return jsonResponse(ELEVATION_PAYLOAD);
    if (url.includes("/directions/json")) return jsonResponse(DIRECTIONS_PAYLOAD);
    return jsonResponse({ status: "NOT_FOUND" }, 404, "Not Found");
  };
}

describe("requireApiKey", () => {
  it("rejects a missing or blank key with an error naming GOOGLE_MAPS_API_KEY", () => {
    assert.throws(() => requireApiKey(undefined), /GOOGLE_MAPS_API_KEY/);
    assert.throws(() => requireApiKey("   "), /GOOGLE_MAPS_API_KEY/);
    assert.equal(requireApiKey(" test-key "), "test-key");
  });
});

describe("geocode", () => {
  it("calls the geocode endpoint with address and key params", async () => {
    const captured: Captured = {};
    const out = await geocode(fakeFetch(captured), "test-key", { address: "1600 Amphitheatre Parkway" });
    assert.equal((out.results as unknown[]).length, 1);
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/maps/api/geocode/json");
    assert.equal(url.searchParams.get("address"), "1600 Amphitheatre Parkway");
    assert.equal(url.searchParams.get("key"), "test-key");
  });

  it("fails before any request when the key is missing", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(() => geocode(spy, undefined, { address: "x" }), /GOOGLE_MAPS_API_KEY/);
    assert.equal(called, false);
  });

  it("rejects an empty address", async () => {
    await assert.rejects(() => geocode(fakeFetch({}), "k", { address: "  " }), /address/);
  });
});

describe("reverseGeocode", () => {
  it("sends latlng as a comma pair", async () => {
    const captured: Captured = {};
    await reverseGeocode(fakeFetch(captured), "k", { latitude: 37.422, longitude: -122.084 });
    const url = new URL(captured.url ?? "");
    assert.equal(url.searchParams.get("latlng"), "37.422,-122.084");
  });
});

describe("searchPlaces", () => {
  it("sends query, location, and radius, clamping radius to 50000", async () => {
    const captured: Captured = {};
    const out = await searchPlaces(fakeFetch(captured), "k", {
      query: "cafe",
      location: { latitude: 37.4, longitude: -122.1 },
      radius: 999999,
    });
    assert.equal((out.results as unknown[]).length, 1);
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/maps/api/place/textsearch/json");
    assert.equal(url.searchParams.get("query"), "cafe");
    assert.equal(url.searchParams.get("location"), "37.4,-122.1");
    assert.equal(url.searchParams.get("radius"), "50000");
  });

  it("omits location and radius when not given", async () => {
    const captured: Captured = {};
    await searchPlaces(fakeFetch(captured), "k", { query: "cafe" });
    const url = new URL(captured.url ?? "");
    assert.equal(url.searchParams.get("location"), null);
    assert.equal(url.searchParams.get("radius"), null);
  });
});

describe("placeDetails", () => {
  it("sends place_id to the details endpoint", async () => {
    const captured: Captured = {};
    const out = await placeDetails(fakeFetch(captured), "k", { place_id: "p1" });
    assert.equal((out.result as { name: string }).name, "Ridge Cafe");
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/maps/api/place/details/json");
    assert.equal(url.searchParams.get("place_id"), "p1");
  });
});

describe("distanceMatrix", () => {
  it("joins origins and destinations with pipes and passes mode", async () => {
    const captured: Captured = {};
    await distanceMatrix(fakeFetch(captured), "k", {
      origins: ["A", "B"],
      destinations: ["C"],
      mode: "walking",
    });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/maps/api/distancematrix/json");
    assert.equal(url.searchParams.get("origins"), "A|B");
    assert.equal(url.searchParams.get("destinations"), "C");
    assert.equal(url.searchParams.get("mode"), "walking");
  });

  it("rejects an unknown travel mode and empty origins", async () => {
    await assert.rejects(
      () => distanceMatrix(fakeFetch({}), "k", { origins: ["A"], destinations: ["B"], mode: "flying" }),
      /mode must be one of/,
    );
    await assert.rejects(
      () => distanceMatrix(fakeFetch({}), "k", { origins: [], destinations: ["B"] }),
      /origins/,
    );
  });
});

describe("elevation", () => {
  it("joins location pairs with pipes", async () => {
    const captured: Captured = {};
    const out = await elevation(fakeFetch(captured), "k", {
      locations: [
        { latitude: 37.422, longitude: -122.084 },
        { latitude: 40, longitude: -70 },
      ],
    });
    assert.equal((out.results as { elevation: number }[])[0].elevation, 12.5);
    const url = new URL(captured.url ?? "");
    assert.equal(url.searchParams.get("locations"), "37.422,-122.084|40,-70");
  });
});

describe("directions", () => {
  it("sends origin, destination, and mode to the directions endpoint", async () => {
    const captured: Captured = {};
    await directions(fakeFetch(captured), "k", { origin: "A", destination: "B", mode: "transit" });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/maps/api/directions/json");
    assert.equal(url.searchParams.get("origin"), "A");
    assert.equal(url.searchParams.get("destination"), "B");
    assert.equal(url.searchParams.get("mode"), "transit");
  });
});

describe("upstream error handling", () => {
  it("raises Google status errors with the error_message detail", async () => {
    const failing = fakeFetch({}, { status: "REQUEST_DENIED", error_message: "key invalid", results: [] });
    await assert.rejects(() => geocode(failing, "k", { address: "x" }), /REQUEST_DENIED.*key invalid/);
  });

  it("treats ZERO_RESULTS as an honest empty answer, not an error", async () => {
    const empty = fakeFetch({}, { status: "ZERO_RESULTS", results: [] });
    const out = await geocode(empty, "k", { address: "nowhere" });
    assert.deepEqual(out.results, []);
  });

  it("propagates HTTP failures", async () => {
    const failing: FetchFn = async () => jsonResponse({}, 500, "Internal Server Error");
    await assert.rejects(() => geocode(failing, "k", { address: "x" }), /HTTP 500/);
  });
});
