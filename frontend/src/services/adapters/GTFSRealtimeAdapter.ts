/**
 * Placeholder for a future authorized GTFS-RT integration.
 *
 * Expected responsibilities:
 * - consume VehiclePositions from an approved GTFS-RT feed;
 * - map vehicle IDs and route IDs into the TransitVehicle model;
 * - preserve `source: "gtfs-rt"` for live records.
 *
 * No endpoint, scraping, key or unauthorized request is implemented in the MVP.
 */
export class GTFSRealtimeAdapter {
  readonly enabled = false;
}
