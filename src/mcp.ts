/**
 * mapport MCP server. Tools: maps_geocode, maps_reverse_geocode,
 * maps_search_places, maps_place_details, maps_distance_matrix,
 * maps_elevation, maps_directions.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set. Tool names,
 * parameters, and required sets are taken from the public spec.
 *
 * The Google Maps key is read from GOOGLE_MAPS_API_KEY at call time; a
 * missing key returns an honest isError result naming the variable
 * instead of failing the handshake.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
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
import type { FetchFn } from "./types.js";

const LatLngSchema = z.object({ latitude: z.number(), longitude: z.number() });

const GeocodeArgs = z.object({ address: z.string() });
const ReverseGeocodeArgs = z.object({ latitude: z.number(), longitude: z.number() });
const SearchPlacesArgs = z.object({
  query: z.string(),
  location: LatLngSchema.optional(),
  radius: z.number().optional(),
});
const PlaceDetailsArgs = z.object({ place_id: z.string() });
const DistanceMatrixArgs = z.object({
  origins: z.array(z.string()),
  destinations: z.array(z.string()),
  mode: z.string().optional(),
});
const ElevationArgs = z.object({ locations: z.array(LatLngSchema) });
const DirectionsArgs = z.object({
  origin: z.string(),
  destination: z.string(),
  mode: z.string().optional(),
});

const TOOLS = [
  {
    name: "maps_geocode",
    description: "Convert a street address into geographic coordinates, a formatted address, and a place ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "Street address to convert into geographic coordinates; must be a non-empty string.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "maps_reverse_geocode",
    description: "Convert geographic coordinates into the nearest human-readable address.",
    inputSchema: {
      type: "object" as const,
      properties: {
        latitude: {
          type: "number",
          description: "Latitude in decimal degrees of the point to convert into an address.",
        },
        longitude: {
          type: "number",
          description: "Longitude in decimal degrees of the point to convert into an address.",
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  {
    name: "maps_search_places",
    description: "Search for places matching a text query, optionally centred on a location within a radius.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Text query to search for places, for example a place name or category; must be a non-empty string.",
        },
        location: {
          type: "object",
          description: "Optional centre point for the search, as an object with latitude and longitude in decimal degrees.",
          properties: {
            latitude: {
              type: "number",
              description: "Latitude in decimal degrees of the search centre point.",
            },
            longitude: {
              type: "number",
              description: "Longitude in decimal degrees of the search centre point.",
            },
          },
          required: ["latitude", "longitude"],
        },
        radius: {
          type: "number",
          description: "Optional search radius in metres around location; must be positive and is clamped to a maximum of 50000.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "maps_place_details",
    description: "Fetch detailed information about one place, including contact details, ratings, and opening hours.",
    inputSchema: {
      type: "object" as const,
      properties: {
        place_id: {
          type: "string",
          description: "Google Maps place ID of the place to fetch details for; must be a non-empty string.",
        },
      },
      required: ["place_id"],
    },
  },
  {
    name: "maps_distance_matrix",
    description: "Calculate travel distances and durations between sets of origins and destinations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        origins: {
          type: "array",
          items: { type: "string" },
          description: "Non-empty array of origin addresses or place strings to calculate distances and durations from.",
        },
        destinations: {
          type: "array",
          items: { type: "string" },
          description: "Non-empty array of destination addresses or place strings to calculate distances and durations to.",
        },
        mode: {
          type: "string",
          description: "Optional travel mode for the calculations: one of 'driving', 'walking', 'bicycling', or 'transit'.",
        },
      },
      required: ["origins", "destinations"],
    },
  },
  {
    name: "maps_elevation",
    description: "Look up the elevation above sea level for one or more geographic coordinates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        locations: {
          type: "array",
          description: "Non-empty array of geographic coordinates to look up elevation for, each as an object with latitude and longitude.",
          items: {
            type: "object",
            properties: {
              latitude: {
                type: "number",
                description: "Latitude in decimal degrees of a point to look up elevation for.",
              },
              longitude: {
                type: "number",
                description: "Longitude in decimal degrees of a point to look up elevation for.",
              },
            },
            required: ["latitude", "longitude"],
          },
        },
      },
      required: ["locations"],
    },
  },
  {
    name: "maps_directions",
    description: "Get route directions between an origin and a destination, with steps, distance, and duration.",
    inputSchema: {
      type: "object" as const,
      properties: {
        origin: {
          type: "string",
          description: "Starting address or place for the route; must be a non-empty string.",
        },
        destination: {
          type: "string",
          description: "Ending address or place for the route; must be a non-empty string.",
        },
        mode: {
          type: "string",
          description: "Optional travel mode for the route: one of 'driving', 'walking', 'bicycling', or 'transit'.",
        },
      },
      required: ["origin", "destination"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "mapport", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  try {
    let out: Record<string, unknown>;
    if (name === "maps_geocode") {
      out = await geocode(fetchFn, apiKey, GeocodeArgs.parse(args ?? {}));
    } else if (name === "maps_reverse_geocode") {
      out = await reverseGeocode(fetchFn, apiKey, ReverseGeocodeArgs.parse(args ?? {}));
    } else if (name === "maps_search_places") {
      out = await searchPlaces(fetchFn, apiKey, SearchPlacesArgs.parse(args ?? {}));
    } else if (name === "maps_place_details") {
      out = await placeDetails(fetchFn, apiKey, PlaceDetailsArgs.parse(args ?? {}));
    } else if (name === "maps_distance_matrix") {
      out = await distanceMatrix(fetchFn, apiKey, DistanceMatrixArgs.parse(args ?? {}));
    } else if (name === "maps_elevation") {
      out = await elevation(fetchFn, apiKey, ElevationArgs.parse(args ?? {}));
    } else if (name === "maps_directions") {
      out = await directions(fetchFn, apiKey, DirectionsArgs.parse(args ?? {}));
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
