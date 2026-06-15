# GTFS static validation

Validation date: 2026-06-15

Source used locally:

- `/private/tmp/busradar-gtfs/extracted/routes.txt`
- `/private/tmp/busradar-gtfs/extracted/trips.txt`
- `/private/tmp/busradar-gtfs/extracted/shapes.txt`
- `/private/tmp/busradar-gtfs/extracted/stops.txt`
- `/private/tmp/busradar-gtfs/extracted/stop_times.txt`

## Source counts

- Routes: 216
- Trips: 46,181
- Shapes: 1,434
- Shape points: 208,180
- Stops: 7,049
- Stop times: 1,386,014
- Trips without shape: 0

## Findings

- The GTFS static source contains real `shapes.txt` geometry and is suitable for route rendering.
- The previous generated dataset had duplicate route-variant ids such as `63U-0` for different shapes.
- The previous line length statistic was generated from point counts, not meters.
- The previous route simplification was too aggressive for high-zoom map tracking.

## Fixes applied

- Route variant ids now include `shape_id`.
- Line length is now calculated from haversine distance along the route path.
- Shape simplification now preserves up to 1,200 points before thinning, instead of 260.
- The dataset was regenerated from the local GTFS static source.

## Post-regeneration checks

- Generated lines: 216
- Generated route variants: 714
- Generated stops: 7,049
- Duplicate route variant ids: 0
- Short generated routes under 20 points: 14

Examples:

- Line 63: 12.8 km average, 4 variants, 38-42 stops per main direction.
- Line 1510: 23.7 km average, 4 variants, 61 stops on the main Torino/Cumiana variants.
- Line 4: 11.0 km average, 4 variants.

## Residual risk

Some routes are short in the GTFS source itself, not because of the export. These should be reviewed line-by-line before presenting them as fully precise live tracking.

For live vehicle positioning, BusRadar should continue to avoid forcing a vehicle onto a shape unless the realtime GPS point is very close to that shape.
