# GTFS static validation

Validation date: 2026-07-12

Official source:

- `https://www.gtt.to.it/open_data/gtt_gtfs.zip`
- Feed version: `20260711`
- Service validity: 2026-07-10 to 2026-12-31

## Source counts

- Routes: 223
- Trips: 56,044
- Shape points: 211,584
- Stops: 7,035
- Stop times: 1,672,859
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
- The dataset was regenerated from the downloaded official GTT static source.
- Display routes now keep every distinct direction and destination branch.
- When GTT publishes multiple shapes for the same direction and destination, the longest complete shape is selected instead of a partial trip.

## Post-regeneration checks

- Generated lines: 223
- Generated route variants: 894
- Generated stops: 7,035
- Duplicate route variant ids: 0
- Short generated routes under 20 points: 14
- Distinct direction/destination branches: 894
- Limited duplicate trips are excluded while generating each direction/destination branch.

Examples:

- Line 63/: complete Caio Mario direction is 10.8 km; complete Stazione Lingotto direction is 10.0 km. The 2.2 km short trip is no longer used as the main route.
- Line 1510: all 16 published Torino, Orbassano, Cumiana, Piossasco, Rivalta and Pinerolo direction/destination branches remain selectable.
- Line 4: complete main directions are 12.7 km and 11.9 km; the 3.9 km and 7.1 km partial trips are not used as the main route.

## Residual risk

Some routes are short in the GTFS source itself, not because of the export. These should be reviewed line-by-line before presenting them as fully precise live tracking.

For live vehicle positioning, BusRadar should continue to avoid forcing a vehicle onto a shape unless the realtime GPS point is very close to that shape.
