import type { LatLng } from '../../types';

export type GtfsShapeRow = {
  shape_id: string;
  shape_pt_lat: string | number;
  shape_pt_lon: string | number;
  shape_pt_sequence: string | number;
  shape_dist_traveled?: string | number;
};

export type GtfsRouteRow = {
  route_id: string;
  route_short_name: string;
  route_long_name?: string;
  route_type?: string;
};

export type GtfsTripRow = {
  route_id: string;
  trip_id: string;
  shape_id?: string;
  direction_id?: string;
};

export type NormalizedGtfsShape = {
  shapeId: string;
  path: LatLng[];
};

/**
 * GTFS static spike adapter.
 *
 * It normalizes already loaded GTFS rows. It intentionally performs no network
 * or file I/O in the app, so the active UI cannot accidentally call a real feed.
 */
export class GTFSStaticAdapter {
  readonly enabled = false;

  normalizeShapes(rows: GtfsShapeRow[]): NormalizedGtfsShape[] {
    const grouped = rows.reduce((groups, row) => {
      const points = groups.get(row.shape_id) ?? [];
      points.push(row);
      groups.set(row.shape_id, points);
      return groups;
    }, new Map<string, GtfsShapeRow[]>());

    return [...grouped.entries()].map(([shapeId, points]) => ({
      shapeId,
      path: points
        .sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence))
        .map((point) => ({ lat: Number(point.shape_pt_lat), lon: Number(point.shape_pt_lon) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)),
    }));
  }

  mapRoutesToShapeIds(routes: GtfsRouteRow[], trips: GtfsTripRow[]) {
    const routeById = new Map(routes.map((route) => [route.route_id, route]));
    const shapeCounts = new Map<string, Map<string, number>>();

    trips.forEach((trip) => {
      if (!trip.shape_id) return;
      const route = routeById.get(trip.route_id);
      if (!route) return;
      const counts = shapeCounts.get(route.route_short_name) ?? new Map<string, number>();
      counts.set(trip.shape_id, (counts.get(trip.shape_id) ?? 0) + 1);
      shapeCounts.set(route.route_short_name, counts);
    });

    return [...shapeCounts.entries()].map(([routeShortName, counts]) => {
      const [shapeId, tripCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { routeShortName, shapeId, tripCount };
    });
  }
}
