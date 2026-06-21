import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type MapMouseEvent } from 'maplibre-gl';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getGtfsRouteVariant, getGtfsRoutesForLine, getGtfsRoutesForRouteId, getGtfsStopEntriesForRoute, gtfsNetwork, type GtfsRouteVariant, type GtfsStop } from '../data/gtfsNetwork';
import { fetchGttStopArrivalsInfo, type GttStopArrival, type GttStopArrivalsResult } from '../services/gttRealtime';
import type { GeocodingResult } from '../services/geocoding';
import type { LatLng, Vehicle } from '../types';
import { distanceMeters, interpolatePathState, offsetPointMeters, routeProgressAtPoint } from '../utils/geo';
import { getLineColor } from '../utils/lineColors';
import { vehicleIdentifierLabel } from '../utils/vehicleIdentity';
import { IconButton } from './IconButton';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicleId?: string;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  userLocation: LatLng;
  hasUserLocation?: boolean;
  onLocateUser?: () => Promise<LatLng | undefined>;
  showRouteForLine?: string;
  searchedArea?: GeocodingResult;
  selectedStop?: GtfsStop;
  selectedStopRequest?: number;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onResetMap?: () => void;
};

type VehicleFrame = {
  from: LatLng;
  to: LatLng;
  startedAt: number;
  vehicle: Vehicle;
  routePath?: LatLng[];
  fromRouteProgress?: number;
  toRouteProgress?: number;
  durationMs: number;
};

type StopFeatureProperties = {
  id: string;
  name: string;
  code: string;
  lines: string;
  routeIds: string;
  stopSequencesByRoute: string;
};

const spriteZoomThreshold = 14.25;
const vehicleAssetBase = import.meta.env.BASE_URL;

function createMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

function routeVariantsForVehicles(vehicles: Vehicle[], selectedLine?: string, showRouteForLine?: string) {
  if (showRouteForLine) {
    const routesById = getGtfsRoutesForRouteId(showRouteForLine);
    return routesById.length > 0 ? routesById : getGtfsRoutesForLine(showRouteForLine);
  }
  if (selectedLine) return getGtfsRoutesForLine(selectedLine);

  const byRoute = new Map<string, GtfsRouteVariant>();
  const unresolvedLines = new Set<string>();

  vehicles.forEach((vehicle) => {
    const exactVariant = getGtfsRouteVariant(vehicle.routeVariantId);
    if (exactVariant) {
      byRoute.set(exactVariant.id, exactVariant);
      return;
    }

    const routeId = vehicle.routeId.replace(/^gtt-/, '');
    const variants = getGtfsRoutesForRouteId(routeId);
    if (variants.length > 0) {
      variants.forEach((route) => byRoute.set(route.id, route));
      return;
    }

    unresolvedLines.add(vehicle.line);
  });

  unresolvedLines.forEach((line) => {
    const variantsByDirection = new Map<string, GtfsRouteVariant>();
    getGtfsRoutesForLine(line).forEach((route) => {
      const key = route.directionId || route.headsign;
      if (!variantsByDirection.has(key)) variantsByDirection.set(key, route);
    });
    variantsByDirection.forEach((route) => byRoute.set(route.id, route));
  });

  return [...byRoute.values()];
}

function routesToGeoJson(routes: GtfsRouteVariant[], selectedLine?: string, showRouteForLine?: string): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => {
      const highlighted = showRouteForLine === route.routeId || showRouteForLine === route.line || selectedLine === route.routeId || selectedLine === route.line;
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: route.path.map((point) => [point.lon, point.lat]) },
        properties: {
          id: route.id,
          line: route.line,
          color: route.color || getLineColor(route.line),
          width: highlighted ? 8 : 5,
          opacity: highlighted ? 0.95 : 0.62,
        },
      };
    }),
  };
}

function stopsForRoutes(routes: GtfsRouteVariant[]) {
  const byStop = new Map<string, { stop: GtfsStop; routeIds: Set<string>; stopSequencesByRoute: Record<string, number[]> }>();
  routes.forEach((route) => {
    getGtfsStopEntriesForRoute(route).forEach(({ stop, sequence }) => {
      const existing = byStop.get(stop.id) ?? { stop, routeIds: new Set<string>(), stopSequencesByRoute: {} };
      existing.routeIds.add(route.routeId);
      existing.routeIds.add(route.line);
      existing.stopSequencesByRoute[route.routeId] = [...(existing.stopSequencesByRoute[route.routeId] ?? []), sequence];
      existing.stopSequencesByRoute[route.line] = [...(existing.stopSequencesByRoute[route.line] ?? []), sequence];
      byStop.set(stop.id, existing);
    });
  });
  return [...byStop.values()];
}

function stopsToGeoJson(stops: ReturnType<typeof stopsForRoutes>): GeoJSON.FeatureCollection<GeoJSON.Point, StopFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: stops.map(({ stop, routeIds, stopSequencesByRoute }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      properties: {
        id: stop.id,
        name: stop.name,
        code: stop.code,
        lines: stop.lines.slice(0, 8).join(', '),
        routeIds: JSON.stringify([...routeIds]),
        stopSequencesByRoute: JSON.stringify(stopSequencesByRoute),
      },
    })),
  };
}

let overviewStopsGeoJsonCache: GeoJSON.FeatureCollection<GeoJSON.Point, StopFeatureProperties> | undefined;

function overviewStopsToGeoJson() {
  if (overviewStopsGeoJsonCache) return overviewStopsGeoJsonCache;

  overviewStopsGeoJsonCache = {
    type: 'FeatureCollection',
    features: gtfsNetwork.stops.map((stop) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      properties: {
        id: stop.id,
        name: stop.name,
        code: stop.code,
        lines: stop.lines.slice(0, 8).join(', '),
        routeIds: JSON.stringify(stop.lines),
        stopSequencesByRoute: '{}',
      },
    })),
  };

  return overviewStopsGeoJsonCache;
}

function vehicleIconName(vehicle: Vehicle) {
  if (vehicle.vehicleType === 'tram') return 'tram-top';
  if (vehicle.vehicleLivery === 'electric-compact') return 'bus-electric';
  if (vehicle.vehicleLivery === 'interurban-blue') return vehicle.vehicleLengthClass === 'articulated-18m' ? 'interurban-articulated' : 'interurban-bus';
  return vehicle.vehicleLengthClass === 'articulated-18m' ? 'bus-articulated' : 'bus-top';
}

function vehicleKind(vehicle: Vehicle) {
  return vehicle.vehicleFleetLabel ?? (vehicle.vehicleType === 'tram' ? 'Tram' : vehicle.vehicleLengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus');
}

function trackingLabel(vehicle: Vehicle) {
  if (vehicle.routeMatchStatus === 'on-route') return 'su percorso GTFS';
  if (vehicle.routeMatchStatus === 'gps-only') return 'GPS reale, fuori shape';
  return 'GPS reale';
}

function routeMotion(vehicle: Vehicle, from: LatLng, to: LatLng) {
  const route = getGtfsRouteVariant(vehicle.routeVariantId);
  if (!route || route.path.length < 2) return undefined;
  const fromState = routeProgressAtPoint(route.path, from);
  const toState = routeProgressAtPoint(route.path, to);
  if (!fromState || !toState) return undefined;
  const totalMeters = toState.traveledMeters + toState.remainingMeters;
  const traveledDelta = toState.traveledMeters - fromState.traveledMeters;
  if (totalMeters <= 0 || traveledDelta > 1500) return undefined;
  const stableToProgress = traveledDelta < 0
    ? fromState.traveledMeters / totalMeters
    : toState.traveledMeters / totalMeters;
  return {
    routePath: route.path,
    fromRouteProgress: fromState.traveledMeters / totalMeters,
    toRouteProgress: stableToProgress,
  };
}

function laneOffsetMetersForZoom(zoom: number) {
  if (zoom < 14.5) return 0;
  if (zoom < 16) return 0.8 + ((zoom - 14.5) / 1.5) * 0.8;
  if (zoom < 18) return 1.6 + ((zoom - 16) / 2) * 0.35;
  return 1.95;
}

function vehicleSeparationMeters(vehicle: Vehicle, zoom: number) {
  const baseLength = vehicle.vehicleLengthClass === 'articulated-18m' ? 15 : vehicle.vehicleType === 'tram' ? 13 : 10;
  if (zoom < 14.5) return 0;
  if (zoom < 16) return baseLength * 0.55;
  if (zoom < 18) return baseLength * 0.75;
  return baseLength;
}

function vehiclesToGeoJson(
  vehicles: Vehicle[],
  positions: Map<string, LatLng>,
  zoom: number,
  selectedVehicleId?: string,
  followedVehicleId?: string,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const laneOffsetMeters = laneOffsetMetersForZoom(zoom);
  const collisionCellMeters = 24;
  const placedVehicles = new Map<string, Array<{ position: LatLng; separation: number }>>();
  const displayPositions = new Map<string, LatLng>();
  const collisionCell = (point: LatLng) => {
    const metersPerDegreeLon = 111320 * Math.cos((point.lat * Math.PI) / 180);
    return {
      x: Math.floor((point.lon * metersPerDegreeLon) / collisionCellMeters),
      y: Math.floor((point.lat * 111320) / collisionCellMeters),
    };
  };
  const nearbyPlacedVehicles = (point: LatLng) => {
    const cell = collisionCell(point);
    const nearby: Array<{ position: LatLng; separation: number }> = [];
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        nearby.push(...(placedVehicles.get(`${cell.x + xOffset}:${cell.y + yOffset}`) ?? []));
      }
    }
    return nearby;
  };

  [...vehicles]
    .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId, undefined, { numeric: true }))
    .forEach((vehicle) => {
      const position = positions.get(vehicle.vehicleId) ?? vehicle;
      const lanePosition = offsetPointMeters(position, vehicle.bearing + 90, laneOffsetMeters);
      const separation = vehicleSeparationMeters(vehicle, zoom);
      let displayPosition = lanePosition;

      if (separation > 0) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const overlaps = nearbyPlacedVehicles(displayPosition).some(
            (placed) => distanceMeters(displayPosition, placed.position) < Math.max(separation, placed.separation),
          );
          if (!overlaps) break;

          const slot = Math.floor(attempt / 2) + 1;
          const direction = attempt % 2 === 0 ? 1 : -1;
          displayPosition = offsetPointMeters(
            lanePosition,
            vehicle.bearing + (direction > 0 ? 0 : 180),
            slot * separation,
          );
        }
      }

      displayPositions.set(vehicle.vehicleId, displayPosition);
      const cell = collisionCell(displayPosition);
      const cellKey = `${cell.x}:${cell.y}`;
      placedVehicles.set(cellKey, [...(placedVehicles.get(cellKey) ?? []), { position: displayPosition, separation }]);
    });

  return {
    type: 'FeatureCollection',
    features: vehicles.map((vehicle) => {
      const position = positions.get(vehicle.vehicleId) ?? vehicle;
      const displayPosition = displayPositions.get(vehicle.vehicleId) ?? position;
      const selected = vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [displayPosition.lon, displayPosition.lat] },
        properties: {
          id: vehicle.vehicleId,
          line: vehicle.line,
          direction: vehicle.direction || 'Direzione non disponibile',
          tracking: trackingLabel(vehicle),
          color: getLineColor(vehicle.line),
          routeColor: getLineColor(vehicle.line),
          bearing: vehicle.bearing,
          spriteBearing: vehicle.bearing - 90,
          icon: vehicleIconName(vehicle),
          selected,
          isArticulated: vehicle.vehicleLengthClass === 'articulated-18m',
          isTram: vehicle.vehicleType === 'tram',
        },
      };
    }),
  };
}

function emptyPointCollection(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: 'FeatureCollection', features: [] };
}

function setSourceData(map: maplibregl.Map, sourceId: string, data: GeoJSON.GeoJSON) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function queryFeaturesNearPoint(map: maplibregl.Map, point: maplibregl.PointLike, layers: string[], radius = 18) {
  const { x, y } = point as { x: number; y: number };
  return map.queryRenderedFeatures([[x - radius, y - radius], [x + radius, y + radius]], { layers });
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatStopLines(lines: string) {
  return lines.split(',').map((line) => line.trim()).filter(Boolean).slice(0, 10);
}

function renderStopPopup(name: string, code: string, lines: string, content: string, checkedAt?: string) {
  const lineBadges = formatStopLines(lines)
    .map((line) => `<span class="line-badge" style="--line-color:${getLineColor(line)}">${escapeHtml(line)}</span>`)
    .join('');
  const meta = checkedAt ? `<small class="stop-popup-meta">Aggiornato ${escapeHtml(checkedAt)}</small>` : '';
  return `<div class="stop-popup"><strong>${escapeHtml(name)}</strong><span>Palina ${escapeHtml(code)}</span><div class="stop-popup-lines">${lineBadges || '<em>Linee non disponibili</em>'}</div>${content}${meta}</div>`;
}

function renderArrivalItems(arrivals: GttStopArrival[]) {
  return arrivals
    .map((arrival) => `<div><span class="line-badge" style="--line-color:${getLineColor(arrival.line)}">${escapeHtml(arrival.line)}</span><span>${escapeHtml(arrival.timeLabel)}</span><em>${arrival.source === 'scheduled' ? 'prog.' : arrival.minutes === 0 ? 'ora' : `${arrival.minutes} min`}</em></div>`)
    .join('');
}

function renderStopArrivals(result: GttStopArrivalsResult) {
  if (result.arrivals.length > 0) {
    const label = result.source === 'realtime' ? 'Previsioni realtime GTFS-RT' : 'Orari programmati GTFS statico';
    return `<div class="stop-popup-source">${label}</div><div class="arrival-list">${renderArrivalItems(result.arrivals)}</div>`;
  }

  return '<div class="stop-popup-source">Dati disponibili: fermata e linee</div><div class="arrival-list"><small>Nessun passaggio pubblicato nei prossimi minuti o nelle prossime ore del calendario caricato.</small></div>';
}

function showStopPopup(
  map: maplibregl.Map,
  properties: StopFeatureProperties,
  coordinates: [number, number],
) {
  const popup = new maplibregl.Popup({
    className: 'stop-map-popup',
    closeButton: true,
    closeOnClick: false,
    closeOnMove: false,
    focusAfterOpen: false,
    maxWidth: '360px',
  })
    .setLngLat(coordinates)
    .setHTML(renderStopPopup(properties.name, properties.code, properties.lines, '<div class="arrival-list"><small>Carico passaggi...</small></div>'))
    .addTo(map);
  let routeIds: string[] = [];
  let stopSequencesByRoute: Record<string, number[]> = {};
  try {
    routeIds = JSON.parse(properties.routeIds);
    stopSequencesByRoute = JSON.parse(properties.stopSequencesByRoute);
  } catch {
    routeIds = [];
  }
  void fetchGttStopArrivalsInfo(properties.id, routeIds, stopSequencesByRoute)
    .then((result) => {
      popup.setHTML(renderStopPopup(properties.name, properties.code, properties.lines, renderStopArrivals(result), result.checkedAt));
    })
    .catch(() => {
      popup.setHTML(renderStopPopup(
        properties.name,
        properties.code,
        properties.lines,
        '<div class="stop-popup-source">Dati disponibili: fermata e linee</div><div class="arrival-list"><small>Passaggi non caricabili ora. Riprova tra qualche secondo.</small></div>',
      ));
    });
  return popup;
}

function boundsFromRoutes(routes: GtfsRouteVariant[]): LngLatBoundsLike | undefined {
  const points = routes.flatMap((route) => route.path);
  if (points.length === 0) return undefined;
  const bounds = new maplibregl.LngLatBounds();
  points.forEach((point) => bounds.extend([point.lon, point.lat]));
  return bounds;
}

async function loadVehicleImages(map: maplibregl.Map) {
  const images: Array<[string, string]> = [
    ['bus-top', `${vehicleAssetBase}assets/vehicles/bus-top.png`],
    ['bus-articulated', `${vehicleAssetBase}assets/vehicles/bus-articulated-top.png`],
    ['bus-electric', `${vehicleAssetBase}assets/vehicles/bus-electric-compact-top.png`],
    ['interurban-bus', `${vehicleAssetBase}assets/vehicles/interurban-blue-bus-top.png`],
    ['interurban-articulated', `${vehicleAssetBase}assets/vehicles/interurban-blue-articulated-top.png`],
    ['tram-top', `${vehicleAssetBase}assets/vehicles/tram-top.png`],
  ];

  await Promise.all(images.map(([name, url]) => new Promise<void>((resolve) => {
    if (map.hasImage(name)) {
      resolve();
      return;
    }
    void map.loadImage(url)
      .then((image) => {
        if (image && !map.hasImage(name)) map.addImage(name, image.data);
        resolve();
      })
      .catch(() => resolve());
  })));
}

function installTransitLayers(map: maplibregl.Map) {
  map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('stops', { type: 'geojson', data: emptyPointCollection() });
  map.addSource('vehicles', { type: 'geojson', data: emptyPointCollection() });
  map.addSource('user', { type: 'geojson', data: emptyPointCollection() });
  map.addSource('search-area', { type: 'geojson', data: emptyPointCollection() });

  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'width'],
      'line-opacity': ['get', 'opacity'],
    },
  });

  map.addLayer({
    id: 'stops-circle',
    type: 'circle',
    source: 'stops',
    minzoom: 15,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 5],
      'circle-color': '#111827',
      'circle-stroke-color': '#cbd5e1',
      'circle-stroke-width': 2,
      'circle-opacity': 0.92,
    },
  });

  map.addLayer({
    id: 'stops-hit-area',
    type: 'circle',
    source: 'stops',
    minzoom: 14,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 16, 18, 24],
      'circle-color': '#000000',
      'circle-opacity': 0,
    },
  });

  map.addLayer({
    id: 'vehicle-badges',
    type: 'circle',
    source: 'vehicles',
    maxzoom: spriteZoomThreshold,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12,
        ['case', ['get', 'selected'], 20, 17],
        16,
        ['case', ['get', 'selected'], 19, 16],
        20,
        ['case', ['get', 'selected'], 17, 15],
      ],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.98, 14, 0.94, 16, 0.58, 20, 0.42],
    },
  });

  map.addLayer({
    id: 'vehicle-badge-labels',
    type: 'symbol',
    source: 'vehicles',
    maxzoom: spriteZoomThreshold,
    layout: {
      'text-field': ['get', 'line'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 14, 16, 13, 20, 12],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': '#ffffff',
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 0.96, 20, 0.86],
    },
  });

  map.addLayer({
    id: 'vehicle-hit-area',
    type: 'circle',
    source: 'vehicles',
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 30, 24],
      'circle-color': '#000000',
      'circle-opacity': 0,
    },
  });

  map.addLayer({
    id: 'vehicle-heading',
    type: 'symbol',
    source: 'vehicles',
    maxzoom: spriteZoomThreshold,
    layout: {
      'text-field': '▲',
      'text-size': 13,
      'text-rotate': ['get', 'bearing'],
      'text-offset': [0, -1.55],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1 },
  });

  map.addLayer({
    id: 'vehicle-sprites',
    type: 'symbol',
    source: 'vehicles',
    minzoom: spriteZoomThreshold,
    filter: ['==', ['get', 'selected'], false],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': [
        'interpolate',
        ['exponential', 1.35],
        ['zoom'],
        14.25,
        ['case', ['get', 'isArticulated'], 0.032, 0.04],
        16,
        ['case', ['get', 'isArticulated'], 0.05, 0.065],
        18,
        ['case', ['get', 'isArticulated'], 0.08, 0.105],
        20,
        ['case', ['get', 'isArticulated'], 0.12, 0.16],
      ],
      'icon-rotate': ['get', 'spriteBearing'],
      'icon-offset': [0, 4],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14.25, 0.82, 14.8, 1] },
  });

  map.addLayer({
    id: 'vehicle-vector-fallback',
    type: 'symbol',
    source: 'vehicles',
    minzoom: 13.6,
    maxzoom: 14,
    layout: {
      'text-field': '▬',
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13.6,
        ['case', ['get', 'isArticulated'], 30, 24],
        18,
        ['case', ['get', 'isArticulated'], 44, 36],
      ],
      'text-rotate': ['get', 'spriteBearing'],
      'text-rotation-alignment': 'map',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-opacity': 0.42,
      'text-halo-color': ['get', 'color'],
      'text-halo-width': 1.8,
    },
  });

  map.addLayer({
    id: 'vehicle-selected-sprites',
    type: 'symbol',
    source: 'vehicles',
    minzoom: spriteZoomThreshold,
    filter: ['==', ['get', 'selected'], true],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': [
        'interpolate',
        ['exponential', 1.35],
        ['zoom'],
        14.25,
        ['case', ['get', 'isArticulated'], 0.035, 0.044],
        16,
        ['case', ['get', 'isArticulated'], 0.055, 0.072],
        18,
        ['case', ['get', 'isArticulated'], 0.088, 0.115],
        20,
        ['case', ['get', 'isArticulated'], 0.132, 0.175],
      ],
      'icon-rotate': ['get', 'spriteBearing'],
      'icon-offset': [0, 4],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.98 },
  });

  map.addLayer({
    id: 'vehicle-sprite-labels',
    type: 'symbol',
    source: 'vehicles',
    minzoom: spriteZoomThreshold,
    layout: {
      'text-field': ['get', 'line'],
      'text-size': 10,
      'text-offset': [0, 2.8],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': ['get', 'color'],
      'text-halo-width': 2,
    },
  });

  map.addLayer({
    id: 'user-circle',
    type: 'circle',
    source: 'user',
    paint: {
      'circle-radius': 9,
      'circle-color': '#2f7dff',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 3,
      'circle-opacity': 0.95,
    },
  });

  map.addLayer({
    id: 'search-area-marker',
    type: 'circle',
    source: 'search-area',
    paint: {
      'circle-radius': 10,
      'circle-color': '#2f7dff',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 3,
    },
  });
}

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, focusPoint, userLocation, hasUserLocation, onLocateUser, showRouteForLine, searchedArea, selectedStop, selectedStopRequest, onSelectVehicle, onResetMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | undefined>(undefined);
  const vehicleFramesRef = useRef<Map<string, VehicleFrame>>(new Map());
  const currentPositionsRef = useRef<Map<string, LatLng>>(new Map());
  const latestVehiclesRef = useRef<Vehicle[]>(vehicles);
  const selectedVehicleIdRef = useRef<string | undefined>(selectedVehicleId);
  const followedVehicleIdRef = useRef<string | undefined>(followedVehicleId);
  const lastFollowCameraAtRef = useRef(0);
  const hadFocusedViewRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(13);

  latestVehiclesRef.current = vehicles;
  selectedVehicleIdRef.current = selectedVehicleId;
  followedVehicleIdRef.current = followedVehicleId;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(),
      center: [7.6867, 45.0706],
      zoom: 13,
      minZoom: 3,
      maxZoom: 20,
      attributionControl: false,
      fadeDuration: 0,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      void loadVehicleImages(map).then(() => {
        if (!mapRef.current) return;
        installTransitLayers(map);
        setMapReady(true);
      });
    });

    const updateViewState = () => {
      setZoom(map.getZoom());
    };
    map.on('moveend', updateViewState);
    map.on('zoomend', updateViewState);

    return () => {
      map.remove();
      mapRef.current = undefined;
      setMapReady(false);
    };
  }, []);

  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => !selectedLine || vehicle.line === selectedLine),
    [vehicles, selectedLine],
  );

  const highlightedRoutes = useMemo(
    () => routeVariantsForVehicles(visibleVehicles, selectedLine, showRouteForLine),
    [visibleVehicles, selectedLine, showRouteForLine],
  );

  const routeStops = useMemo(() => {
    if (!showRouteForLine && !selectedLine) return [];
    return stopsForRoutes(highlightedRoutes);
  }, [highlightedRoutes, selectedLine, showRouteForLine]);
  const showOverviewStops = !showRouteForLine && !selectedLine && zoom >= 16;

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    setSourceData(mapRef.current, 'routes', routesToGeoJson(highlightedRoutes, selectedLine, showRouteForLine));
  }, [highlightedRoutes, mapReady, selectedLine, showRouteForLine]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const stopsData = showRouteForLine || selectedLine
      ? stopsToGeoJson(routeStops)
      : showOverviewStops
        ? overviewStopsToGeoJson()
        : emptyPointCollection();
    setSourceData(mapRef.current, 'stops', stopsData);
  }, [mapReady, routeStops, selectedLine, showOverviewStops, showRouteForLine]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    setSourceData(
      mapRef.current,
      'user',
      hasUserLocation
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [userLocation.lon, userLocation.lat] }, properties: {} }] }
        : emptyPointCollection(),
    );
  }, [hasUserLocation, mapReady, userLocation.lat, userLocation.lon]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    setSourceData(
      mapRef.current,
      'search-area',
      searchedArea
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [searchedArea.lon, searchedArea.lat] }, properties: {} }] }
        : emptyPointCollection(),
    );
  }, [mapReady, searchedArea]);

  useEffect(() => {
    if (!mapReady) return;
    const now = performance.now();
    const active = new Set(visibleVehicles.map((vehicle) => vehicle.vehicleId));
    vehicleFramesRef.current.forEach((_, id) => {
      if (!active.has(id)) {
        vehicleFramesRef.current.delete(id);
        currentPositionsRef.current.delete(id);
      }
    });
    visibleVehicles.forEach((vehicle) => {
      const previous = currentPositionsRef.current.get(vehicle.vehicleId) ?? vehicle;
      const next = { lat: vehicle.lat, lon: vehicle.lon };
      const meters = new maplibregl.LngLat(previous.lon, previous.lat).distanceTo(new maplibregl.LngLat(next.lon, next.lat));
      const isPlausibleUpdate = meters <= 600;
      const motion = isPlausibleUpdate ? routeMotion(vehicle, previous, next) : undefined;
      vehicleFramesRef.current.set(vehicle.vehicleId, {
        from: isPlausibleUpdate ? previous : next,
        to: next,
        startedAt: isPlausibleUpdate ? now : now - 14500,
        vehicle,
        durationMs: 14500,
        ...motion,
      });
    });
  }, [visibleVehicles, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    let frameId = 0;
    const tick = (time: number) => {
      const animatedVehicles: Vehicle[] = [];
      vehicleFramesRef.current.forEach((frame, id) => {
        const elapsed = Math.min(1, Math.max(0, (time - frame.startedAt) / frame.durationMs));
        const routeState = frame.routePath && frame.fromRouteProgress != null && frame.toRouteProgress != null
          ? interpolatePathState(
            frame.routePath,
            frame.fromRouteProgress + (frame.toRouteProgress - frame.fromRouteProgress) * elapsed,
          )
          : undefined;
        const position = routeState?.point ?? {
          lat: frame.from.lat + (frame.to.lat - frame.from.lat) * elapsed,
          lon: frame.from.lon + (frame.to.lon - frame.from.lon) * elapsed,
        };
        currentPositionsRef.current.set(id, position);
        animatedVehicles.push(routeState ? { ...frame.vehicle, bearing: routeState.bearing } : frame.vehicle);
      });
      const map = mapRef.current!;
      setSourceData(
        map,
        'vehicles',
        vehiclesToGeoJson(
          animatedVehicles,
          currentPositionsRef.current,
          map.getZoom(),
          selectedVehicleIdRef.current,
          followedVehicleIdRef.current,
        ),
      );
      const followedId = followedVehicleIdRef.current;
      const followedPosition = followedId ? currentPositionsRef.current.get(followedId) : undefined;
      if (followedPosition && time - lastFollowCameraAtRef.current > 100) {
        const target = new maplibregl.LngLat(followedPosition.lon, followedPosition.lat);
        map.jumpTo({ center: target });
        lastFollowCameraAtRef.current = time;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !showRouteForLine || followedVehicleId) return;
    const bounds = boundsFromRoutes(highlightedRoutes);
    if (!bounds) return;
    mapRef.current.fitBounds(bounds, { padding: { top: 120, bottom: 220, left: 40, right: 40 }, maxZoom: 15, duration: 550 });
  }, [followedVehicleId, highlightedRoutes, mapReady, showRouteForLine]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusPoint) return;
    mapRef.current.flyTo({ center: [focusPoint.lon, focusPoint.lat], zoom: 16, duration: 550 });
  }, [focusPoint, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedStop) return;
    const map = mapRef.current;
    map.flyTo({ center: [selectedStop.lon, selectedStop.lat], zoom: 17, duration: 450 });
    const popup = showStopPopup(
      map,
      {
        id: selectedStop.id,
        name: selectedStop.name,
        code: selectedStop.code,
        lines: selectedStop.lines.slice(0, 8).join(', '),
        routeIds: JSON.stringify(selectedStop.lines),
        stopSequencesByRoute: '{}',
      },
      [selectedStop.lon, selectedStop.lat],
    );
    return () => {
      popup.remove();
    };
  }, [mapReady, selectedStop, selectedStopRequest]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !followedVehicleId) return;
    const vehicle = vehicles.find((item) => item.vehicleId === followedVehicleId);
    const position = currentPositionsRef.current.get(followedVehicleId) ?? vehicle;
    if (!position) return;
    lastFollowCameraAtRef.current = 0;
    mapRef.current.easeTo({
      center: [position.lon, position.lat],
      zoom: Math.max(mapRef.current.getZoom(), 16.2),
      duration: 500,
    });
  }, [followedVehicleId, mapReady, vehicles]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const hasFocusedView = Boolean(selectedLine || showRouteForLine || followedVehicleId);
    if (hadFocusedViewRef.current && !hasFocusedView) {
      mapRef.current.easeTo({
        center: [7.6867, 45.0706],
        zoom: 13,
        duration: 650,
      });
    }
    hadFocusedViewRef.current = hasFocusedView;
  }, [followedVehicleId, mapReady, selectedLine, showRouteForLine]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const vehicleLayers = ['vehicle-selected-sprites', 'vehicle-sprites', 'vehicle-vector-fallback', 'vehicle-hit-area', 'vehicle-badges', 'vehicle-badge-labels', 'vehicle-heading', 'vehicle-sprite-labels'];
    const stopLayers = ['stops-hit-area', 'stops-circle'];
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px', offset: 18 });
    const clickPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '280px', offset: 20 });

    const vehicleAtPoint = (event: MapMouseEvent) => {
      const feature = queryFeaturesNearPoint(map, event.point, vehicleLayers, 22)[0];
      const vehicleId = feature?.properties?.id as string | undefined;
      const layerVehicle = latestVehiclesRef.current.find((item) => item.vehicleId === vehicleId);
      if (layerVehicle) return layerVehicle;

      let nearest: { vehicle: Vehicle; distance: number } | undefined;
      latestVehiclesRef.current.forEach((vehicle) => {
        if (selectedLine && vehicle.line !== selectedLine) return;
        const position = currentPositionsRef.current.get(vehicle.vehicleId) ?? vehicle;
        const projected = map.project([position.lon, position.lat]);
        const distance = Math.hypot(projected.x - event.point.x, projected.y - event.point.y);
        if (!nearest || distance < nearest.distance) nearest = { vehicle, distance };
      });
      const threshold = map.getZoom() >= 14.5 ? 46 : 30;
      return nearest && nearest.distance <= threshold ? nearest.vehicle : undefined;
    };

    const handleVehicleClick = (event: MapMouseEvent) => {
      const vehicle = vehicleAtPoint(event);
      if (!vehicle) return;
      const position = currentPositionsRef.current.get(vehicle.vehicleId) ?? vehicle;
      hoverPopup.remove();
      clickPopup
        .setLngLat([position.lon, position.lat])
        .setHTML(`<div class="vehicle-tooltip vehicle-tooltip-click"><strong>${escapeHtml(vehicleIdentifierLabel(vehicle))}</strong><span>Linea ${escapeHtml(vehicle.line)} · ${escapeHtml(trackingLabel(vehicle))}</span><small>${escapeHtml(vehicle.direction)}</small></div>`)
        .addTo(map);
      onSelectVehicle(vehicle);
    };
    const handleStopClick = (event: MapMouseEvent) => {
      if (vehicleAtPoint(event)) return;
      const feature = queryFeaturesNearPoint(map, event.point, stopLayers, 22)[0];
      if (!feature) return;
      const properties = feature.properties as StopFeatureProperties;
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      showStopPopup(map, properties, coordinates);
    };
    const handleMove = (event: MapMouseEvent) => {
      const vehicle = vehicleAtPoint(event);
      if (vehicle) {
        hoverPopup
          .setLngLat(event.lngLat)
          .setHTML(`<div class="vehicle-tooltip"><strong>${escapeHtml(vehicleIdentifierLabel(vehicle))}</strong><span>Linea ${escapeHtml(vehicle.line)} · ${escapeHtml(trackingLabel(vehicle))}</span><small>${escapeHtml(vehicle.direction)}</small></div>`)
          .addTo(map);
      } else {
        hoverPopup.remove();
      }
      const hover = Boolean(vehicle) || queryFeaturesNearPoint(map, event.point, stopLayers, 12).length > 0;
      map.getCanvas().style.cursor = hover ? 'pointer' : '';
    };
    map.on('click', handleVehicleClick);
    map.on('click', handleStopClick);
    map.on('mousemove', handleMove);
    return () => {
      map.off('click', handleVehicleClick);
      map.off('click', handleStopClick);
      map.off('mousemove', handleMove);
      hoverPopup.remove();
      clickPopup.remove();
    };
  }, [mapReady, onSelectVehicle, selectedLine]);

  const centerOnUser = async () => {
    const located = await onLocateUser?.();
    const target = located ?? userLocation;
    mapRef.current?.flyTo({ center: [target.lon, target.lat], zoom: 15, duration: 450 });
  };

  const resetToOverview = () => {
    onResetMap?.();
    mapRef.current?.easeTo({
      center: [7.6867, 45.0706],
      zoom: 13,
      duration: 650,
    });
  };

  return (
    <div className="map-shell map-shell--standard">
      <button type="button" className="map-mode-label" onClick={resetToOverview}>
        Live transit map
      </button>
      <div ref={containerRef} className="bus-map" />
      <div className="map-floating-controls">
        <IconButton label="Centra posizione" onClick={() => void centerOnUser()}>
          <LocateFixed size={20} />
        </IconButton>
      </div>
    </div>
  );
}
