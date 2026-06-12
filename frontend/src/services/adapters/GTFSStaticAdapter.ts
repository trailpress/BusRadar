/**
 * Placeholder for a future authorized GTFS static integration.
 *
 * Expected responsibilities:
 * - load routes, trips, shapes, stops, calendars and stop_times from an approved GTFS source;
 * - normalize agency route IDs into BusRadar route IDs;
 * - expose route geometry and stop metadata without changing UI components.
 *
 * This adapter intentionally performs no network or file I/O in the MVP.
 */
export class GTFSStaticAdapter {
  readonly enabled = false;
}
