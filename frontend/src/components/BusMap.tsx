import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type MapMouseEvent } from 'maplibre-gl';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getGtfsRouteVariant, getGtfsRoutesForLine, getGtfsRoutesForRouteId, getGtfsStopEntriesForRoute, gtfsNetwork, type GtfsRouteVariant, type GtfsStop } from '../data/gtfsNetwork';
import { useGtfsNetwork } from '../data/useGtfsNetwork';
import { fetchGttStopArrivalsInfo, type GttStopArrival, type GttStopArrivalsResult } from '../services/gttRealtime';
import type { GeocodingResult } from '../services/geocoding';
import type { LatLng, Vehicle } from '../types';
import { distanceMeters, interpolatePathState, offsetPointMeters, routeProgressAtPoint } from '../utils/geo';
import { getLineColor } from '../utils/lineColors';
import { routeDisplayTextColor, routeLineOffset } from '../utils/routePalette';
import { vehicleIdentifierLabel } from '../utils/vehicleIdentity';
import { IconButton } from './IconButton';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicleId?: string;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  userLocation: LatLng;
  userLocationAccuracy?: number;
  hasUserLocation?: boolean;
  onLocateUser?: () => Promise<LatLng | undefined>;
  showRouteForLine?: string;
  searchedArea?: GeocodingResult;
  selectedStop?: GtfsStop;
  selectedStopRequest?: number;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSelectLine?: (line: string) => void;
  onStopPopupOpenChange?: (open: boolean) => void;
  onResetMap?: () => void;
};

type VehicleFrame = {
  from: LatLng;
  to: LatLng;
  startedAt: number;
  vehicle: Vehicle;
  meters: number;
  routePath?: LatLng[];
  routeVariantId?: string;
  fromRouteProgress?: number;
  toRouteProgress?: number;
  routeTotalMeters?: number;
  routeSpeedMps?: number;
  extrapolateUntilMs?: number;
  durationMs: number;
};

type VehicleRouteMemory = {
  routeVariantId?: string;
  progress: number;
};

type StopFeatureProperties = {
  id: string;
  name: string;
  code: string;
  lines: string;
  routeIds: string;
  stopSequencesByRoute: string;
};

type ActiveVehiclePopup = {
  vehicleId: string;
  vehicle: Vehicle;
  x: number;
  y: number;
};

const spriteZoomThreshold = 14.25;
const vehicleAssetBase = import.meta.env.BASE_URL;
const priorityScheduledLines = ['1510', '1511', '1432', '1085'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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
    const exactVariant = getGtfsRouteVariant(showRouteForLine);
    if (exactVariant) return [exactVariant];
    const activeRoutes = activeRouteVariantsForLine(vehicles, showRouteForLine);
    if (activeRoutes.length > 0) return activeRoutes;
    const routesById = getGtfsRoutesForRouteId(showRouteForLine);
    return compactRouteVariants(routesById.length > 0 ? routesById : getGtfsRoutesForLine(showRouteForLine));
  }
  if (selectedLine) {
    const activeRoutes = activeRouteVariantsForLine(vehicles, selectedLine);
    if (activeRoutes.length > 0) return activeRoutes;
    return compactRouteVariants(getGtfsRoutesForLine(selectedLine));
  }

  const byRoute = new Map<string, GtfsRouteVariant>();
  overviewRouteVariants().forEach((route) => byRoute.set(route.id, route));
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

function activeRouteVariantsForLine(vehicles: Vehicle[], line: string) {
  const lineKey = line.replace(/U$/, '');
  const lineVehicles = vehicles.filter((vehicle) => (
    vehicle.line === line || vehicle.routeId.replace(/^gtt-/, '').replace(/U$/, '') === lineKey
  ));
  if (lineVehicles.length === 0) return [];

  const candidates = getGtfsRoutesForLine(lineKey);
  const byDirection = new Map<string, { route: GtfsRouteVariant; score: number }>();
  candidates.forEach((route) => {
    let closeVehicles = 0;
    let assignedVehicles = 0;
    lineVehicles.forEach((vehicle) => {
      if (vehicle.routeVariantId === route.id) assignedVehicles += 1;
      const match = routeProgressAtPoint(route.path, vehicle);
      if (match && match.distanceMeters <= 260) closeVehicles += 1;
    });
    if (closeVehicles === 0 && assignedVehicles === 0) return;

    const score = closeVehicles * 100 + assignedVehicles * 8 - routeLengthMeters(route) / 600;
    const key = route.directionId || route.headsign || route.id;
    const existing = byDirection.get(key);
    if (!existing || score > existing.score) byDirection.set(key, { route, score });
  });

  return [...byDirection.values()].sort((a, b) => b.score - a.score).slice(0, 2).map((item) => item.route);
}

function compactRouteVariants(routes: GtfsRouteVariant[]) {
  const byDirection = new Map<string, GtfsRouteVariant>();
  routes.forEach((route) => {
    const key = route.directionId || route.headsign || route.id;
    const existing = byDirection.get(key);
    if (!existing || routeLengthMeters(route) < routeLengthMeters(existing)) byDirection.set(key, route);
  });
  return [...byDirection.values()].slice(0, 2);
}

const routeLengthCache = new Map<string, number>();

function routeLengthMeters(route: GtfsRouteVariant) {
  const cached = routeLengthCache.get(route.id);
  if (cached != null) return cached;
  let length = 0;
  for (let index = 1; index < route.path.length; index += 1) {
    length += distanceMeters(route.path[index - 1], route.path[index]);
  }
  routeLengthCache.set(route.id, length);
  return length;
}

function overviewRouteVariants() {
  const byRoute = new Map<string, GtfsRouteVariant>();
  priorityScheduledLines.forEach((lineId) => {
    const byDirection = new Map<string, GtfsRouteVariant>();
    getGtfsRoutesForLine(lineId).forEach((route) => {
      const key = route.directionId || route.headsign || route.id;
      if (!byDirection.has(key)) byDirection.set(key, route);
    });
    byDirection.forEach((route) => byRoute.set(route.id, route));
  });
  gtfsNetwork.lines
    .filter((line) => line.stats.tripsToday >= 120)
    .sort((a, b) => b.stats.tripsToday - a.stats.tripsToday)
    .slice(0, 70)
    .forEach((line) => {
      const byDirection = new Map<string, GtfsRouteVariant>();
      getGtfsRoutesForLine(line.id).forEach((route) => {
        const key = route.directionId || route.headsign || route.id;
        if (!byDirection.has(key)) byDirection.set(key, route);
      });
      byDirection.forEach((route) => byRoute.set(route.id, route));
    });
  return [...byRoute.values()];
}

function routesToGeoJson(routes: GtfsRouteVariant[], selectedLine?: string, showRouteForLine?: string): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => {
      const highlighted = showRouteForLine === route.id || showRouteForLine === route.routeId || showRouteForLine === route.line || selectedLine === route.routeId || selectedLine === route.line;
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: route.path.map((point) => [point.lon, point.lat]) },
        properties: {
          id: route.id,
          line: route.line,
          color: getLineColor(route.line),
          casingColor: '#ffffff',
          width: highlighted ? 6.8 : 3.6,
          casingWidth: highlighted ? 10.5 : 6.4,
          opacity: highlighted ? 0.96 : 0.78,
          offset: highlighted ? 0 : routeLineOffset(route.routeId || route.line, route.directionId),
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

let overviewStopsGeoJsonCache:
  | { stopCount: number; data: GeoJSON.FeatureCollection<GeoJSON.Point, StopFeatureProperties> }
  | undefined;

function overviewStopsToGeoJson() {
  if (overviewStopsGeoJsonCache?.stopCount === gtfsNetwork.stops.length) {
    return overviewStopsGeoJsonCache.data;
  }

  const data: GeoJSON.FeatureCollection<GeoJSON.Point, StopFeatureProperties> = {
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
  overviewStopsGeoJsonCache = { stopCount: gtfsNetwork.stops.length, data };

  return data;
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

function routeMotion(vehicle: Vehicle, from: LatLng, to: LatLng, previousProgress?: VehicleRouteMemory) {
  const route = getGtfsRouteVariant(vehicle.routeVariantId);
  if (!route || route.path.length < 2) return undefined;
  const fromState = routeProgressAtPoint(route.path, from);
  const toState = routeProgressAtPoint(route.path, to);
  if (!fromState || !toState) return undefined;
  const totalMeters = toState.traveledMeters + toState.remainingMeters;
  if (totalMeters <= 0) return undefined;
  const hasPreviousProgress = previousProgress?.routeVariantId === vehicle.routeVariantId;
  const displayProgress = hasPreviousProgress
    ? previousProgress!.progress
    : fromState.traveledMeters / totalMeters;
  const feedProgress = toState.traveledMeters / totalMeters;
  const traveledDeltaMeters = (feedProgress - displayProgress) * totalMeters;
  if (Math.abs(traveledDeltaMeters) > 1500) return undefined;
  const stableToProgress = traveledDeltaMeters < -10 ? displayProgress : Math.max(displayProgress, feedProgress);
  return {
    routePath: route.path,
    routeVariantId: route.id,
    fromRouteProgress: displayProgress,
    toRouteProgress: stableToProgress,
    routeTotalMeters: totalMeters,
  };
}

function laneOffsetMetersForZoom(zoom: number) {
  void zoom;
  return 0;
}

function vehicleSeparationMeters(vehicle: Vehicle, zoom: number) {
  void vehicle;
  void zoom;
  return 0;
}

function targetVehicleSpeedMps(vehicle: Vehicle, meters: number, secondsSinceUpdate: number, previousSpeedMps?: number, hasRouteMotion = false) {
  const feedSpeedMps = vehicle.speed >= 2 && vehicle.speed <= 70 ? vehicle.speed / 3.6 : undefined;
  const measuredSpeedMps = secondsSinceUpdate > 0 && meters >= 1.5 ? meters / secondsSinceUpdate : undefined;

  let target = feedSpeedMps ?? measuredSpeedMps ?? previousSpeedMps ?? 2.8;
  if (meters < 2 && (vehicle.speed <= 2 || !Number.isFinite(vehicle.speed))) {
    target = hasRouteMotion ? Math.max(previousSpeedMps ?? 0, 1.7) : previousSpeedMps ? previousSpeedMps * 0.55 : 0.25;
  }

  const clampedTarget = clamp(target, 0.15, vehicle.vehicleType === 'tram' ? 12 : 13.5);
  return previousSpeedMps == null
    ? clampedTarget
    : previousSpeedMps * 0.72 + clampedTarget * 0.28;
}

function vehicleMovementDurationMs(meters: number, speedMps: number) {
  if (meters < 1.5) return 900;
  return clamp((meters / Math.max(0.8, speedMps)) * 1000, 2400, 8500);
}

function vehiclesToGeoJson(
  vehicles: Vehicle[],
  positions: Map<string, LatLng>,
  zoom: number,
  selectedVehicleId?: string,
  followedVehicleId?: string,
  displayRoutes: GtfsRouteVariant[] = [],
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
      const rawPosition = positions.get(vehicle.vehicleId) ?? vehicle;
      const snapped = snapVehicleToRoute(vehicle, rawPosition, displayRoutes);
      const position = snapped?.point ?? rawPosition;
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
      const rawPosition = positions.get(vehicle.vehicleId) ?? vehicle;
      const snapped = snapVehicleToRoute(vehicle, rawPosition, displayRoutes);
      const position = snapped?.point ?? rawPosition;
      const displayPosition = displayPositions.get(vehicle.vehicleId) ?? position;
      const selected = vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId;
      const bearing = snapped?.bearing ?? vehicle.bearing;
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
          textColor: routeDisplayTextColor(vehicle.line, vehicle.vehicleType),
          bearing,
          arrowBearing: bearing,
          spriteBearing: bearing - 90,
          icon: vehicleIconName(vehicle),
          selected,
          isArticulated: vehicle.vehicleLengthClass === 'articulated-18m',
          isTram: vehicle.vehicleType === 'tram',
        },
      };
    }),
  };
}

function routeMatchesVehicle(route: GtfsRouteVariant, vehicle: Vehicle) {
  const vehicleRoute = vehicle.routeId.replace(/^gtt-/, '');
  return (
    route.id === vehicle.routeVariantId ||
    route.shapeId === vehicle.shapeId ||
    route.line === vehicle.line ||
    route.routeId === vehicleRoute ||
    route.routeId.replace(/U$/, '') === vehicleRoute.replace(/U$/, '')
  );
}

function snapVehicleToRoute(vehicle: Vehicle, position: LatLng, displayRoutes: GtfsRouteVariant[] = []) {
  const routes = displayRoutes.filter((route) => routeMatchesVehicle(route, vehicle));
  const fallbackRoute = getGtfsRouteVariant(vehicle.routeVariantId);
  if (fallbackRoute && !routes.some((route) => route.id === fallbackRoute.id)) routes.push(fallbackRoute);

  let best: { point: LatLng; bearing: number; distanceMeters: number } | undefined;
  routes.forEach((route) => {
    const match = routeProgressAtPoint(route.path, position);
    if (!match) return;
    if (!best || match.distanceMeters < best.distanceMeters) {
      best = {
        point: match.projectedPoint,
        bearing: match.bearing,
        distanceMeters: match.distanceMeters,
      };
    }
  });
  return best;
}

function createVehicleOverlayElement(vehicleId: string) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'vehicle-html-marker';
  marker.dataset.vehicleId = vehicleId;
  marker.append(document.createElement('span'), document.createElement('span'));
  marker.children[0].className = 'vehicle-html-arrow';
  marker.children[1].className = 'vehicle-html-label';
  return marker;
}

function syncVehicleOverlay(
  container: HTMLDivElement | null,
  map: maplibregl.Map,
  markerElements: Map<string, HTMLButtonElement>,
  vehicles: Vehicle[],
  positions: Map<string, LatLng>,
  selectedVehicleId?: string,
  followedVehicleId?: string,
  displayRoutes: GtfsRouteVariant[] = [],
) {
  if (!container) return;
  if (map.getZoom() >= spriteZoomThreshold) {
    markerElements.forEach((marker) => {
      marker.hidden = true;
    });
    container.setAttribute('aria-hidden', 'true');
    return;
  }
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const visibleIds = new Set<string>();
  const margin = 46;

  for (const vehicle of vehicles) {
    const rawPosition = positions.get(vehicle.vehicleId) ?? vehicle;
    const snapped = snapVehicleToRoute(vehicle, rawPosition, displayRoutes);
    const position = snapped?.point ?? rawPosition;
    const projected = map.project([position.lon, position.lat]);
    if (
      projected.x < -margin ||
      projected.x > width + margin ||
      projected.y < -margin ||
      projected.y > height + margin
    ) {
      continue;
    }

    let marker = markerElements.get(vehicle.vehicleId);
    if (!marker) {
      marker = createVehicleOverlayElement(vehicle.vehicleId);
      markerElements.set(vehicle.vehicleId, marker);
      container.appendChild(marker);
    }

    const label = marker.children[1] as HTMLSpanElement;
    if (label.textContent !== vehicle.line) label.textContent = vehicle.line;
    marker.setAttribute('aria-label', `Linea ${vehicle.line}, vettura ${vehicleIdentifierLabel(vehicle)}`);
    marker.classList.toggle('is-selected', vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId);
    marker.style.setProperty('--line-color', getLineColor(vehicle.line));
    marker.style.setProperty('--line-text-color', routeDisplayTextColor(vehicle.line, vehicle.vehicleType));
    marker.style.setProperty('--bearing', `${snapped?.bearing ?? vehicle.bearing}deg`);
    marker.style.transform = `translate3d(${projected.x}px, ${projected.y}px, 0) translate(-50%, -50%)`;
    marker.hidden = false;
    visibleIds.add(vehicle.vehicleId);
  }

  markerElements.forEach((marker, id) => {
    if (visibleIds.has(id)) return;
    marker.hidden = true;
  });
  container.setAttribute('aria-hidden', visibleIds.size === 0 ? 'true' : 'false');
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
    .map((line) => `<button type="button" class="line-badge stop-line-button" data-stop-line="${escapeHtml(line)}" style="--line-color:${getLineColor(line)};--line-text-color:${routeDisplayTextColor(line)}" aria-label="Mostra linea ${escapeHtml(line)}">${escapeHtml(line)}</button>`)
    .join('');
  const meta = checkedAt ? `<small class="stop-popup-meta">Aggiornato ${escapeHtml(checkedAt)}</small>` : '';
  return `<div class="stop-popup"><strong>${escapeHtml(name)}</strong><span>Palina ${escapeHtml(code)}</span><div class="stop-popup-lines">${lineBadges || '<em>Linee non disponibili</em>'}</div>${content}${meta}</div>`;
}

function renderArrivalItems(arrivals: GttStopArrival[]) {
  return arrivals
    .map((arrival) => `<div><button type="button" class="line-badge stop-line-button" data-stop-line="${escapeHtml(arrival.line)}" style="--line-color:${getLineColor(arrival.line)};--line-text-color:${routeDisplayTextColor(arrival.line)}" aria-label="Mostra linea ${escapeHtml(arrival.line)}">${escapeHtml(arrival.line)}</button><span>${escapeHtml(arrival.timeLabel)}</span><em>${arrival.source === 'scheduled' ? 'prog.' : arrival.minutes === 0 ? 'ora' : `${arrival.minutes} min`}</em></div>`)
    .join('');
}

function renderStopArrivals(result: GttStopArrivalsResult) {
  if (result.arrivals.length > 0) {
    const label = result.source === 'realtime'
      ? 'Previsioni realtime GTFS-RT'
      : result.source === 'mixed'
        ? 'Realtime dove disponibile · programmato sulle altre linee'
        : 'Orari programmati GTFS statico';
    return `<div class="stop-popup-source">${label}</div><div class="arrival-list">${renderArrivalItems(result.arrivals)}</div>`;
  }

  return '<div class="stop-popup-source">Orario GTFS statico consultato</div><div class="arrival-list"><small>Nessuna corsa programmata nelle prossime 30 ore per questa palina e per il calendario di servizio attivo.</small></div>';
}

function renderVehiclePopup(vehicle: Vehicle, withAction = false) {
  const vehicleId = escapeHtml(vehicle.vehicleId);
  const action = withAction
    ? `<a href="#vehicle-${vehicleId}" role="button" class="vehicle-tooltip-action" data-open-vehicle="${vehicleId}" onclick="window.dispatchEvent(new CustomEvent('busradar:open-vehicle-detail',{detail:'${vehicleId}'}));return false;" ontouchend="window.dispatchEvent(new CustomEvent('busradar:open-vehicle-detail',{detail:'${vehicleId}'}));return false;">Apri dettaglio vettura</a>`
    : '';
  const close = withAction
    ? '<button type="button" class="vehicle-tooltip-close" data-close-vehicle-popup aria-label="Chiudi popup vettura">×</button>'
    : '';
  return `<div class="vehicle-tooltip">${close}<strong>${escapeHtml(vehicleIdentifierLabel(vehicle))}</strong><span>Linea ${escapeHtml(vehicle.line)} · ${escapeHtml(trackingLabel(vehicle))}</span><small>${escapeHtml(vehicle.direction)}</small>${action}</div>`;
}

function bindVehiclePopupActions(popup: maplibregl.Popup, vehicle: Vehicle, onSelectVehicle: (vehicle: Vehicle) => void) {
  const popupElement = popup.getElement();
  let opened = false;
  const listeners: Array<{ target: EventTarget; eventName: string; handler: EventListener; options?: AddEventListenerOptions | boolean }> = [];
  const addListener = (target: EventTarget, eventName: string, handler: EventListener, options?: AddEventListenerOptions | boolean) => {
    target.addEventListener(eventName, handler, options);
    listeners.push({ target, eventName, handler, options });
  };
  const contain = (event: Event) => {
    event.stopPropagation();
  };
  const closePopup = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-close-vehicle-popup]')) return;
    event.preventDefault();
    event.stopPropagation();
    popup.remove();
  };
  const openDetails = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-open-vehicle]')) return;
    event.preventDefault();
    event.stopPropagation();
    if (opened) return;
    opened = true;
    popup.remove();
    onSelectVehicle(vehicle);
  };

  ['pointerdown', 'mousedown', 'touchstart', 'dblclick'].forEach((eventName) => {
    addListener(popupElement, eventName, contain, true);
  });
  ['pointerup', 'touchend', 'click'].forEach((eventName) => {
    addListener(popupElement, eventName, closePopup, true);
    addListener(popupElement, eventName, openDetails, true);
  });

  requestAnimationFrame(() => {
    const button = popupElement.querySelector<HTMLButtonElement>('[data-open-vehicle]');
    if (!button) return;
    const directOpen = (event: Event) => openDetails(event);
    ['pointerup', 'touchend', 'click'].forEach((eventName) => {
      addListener(button, eventName, directOpen, { capture: true });
    });
    const closeButton = popupElement.querySelector<HTMLButtonElement>('[data-close-vehicle-popup]');
    if (!closeButton) return;
    const directClose = (event: Event) => closePopup(event);
    ['pointerup', 'touchend', 'click'].forEach((eventName) => {
      addListener(closeButton, eventName, directClose, { capture: true });
    });
  });

  popup.on('close', () => {
    listeners.forEach(({ target, eventName, handler, options }) => {
      target.removeEventListener(eventName, handler, options);
    });
  });
}

function showStopPopup(
  map: maplibregl.Map,
  properties: StopFeatureProperties,
  coordinates: [number, number],
  onOpenChange?: (open: boolean) => void,
  onSelectLine?: (line: string) => void,
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
  const popupElement = popup.getElement();
  const containPopupInteraction = (event: Event) => event.stopPropagation();
  ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick', 'wheel']
    .forEach((eventName) => popupElement.addEventListener(eventName, containPopupInteraction, { passive: true }));
  popupElement.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const lineButton = target?.closest<HTMLButtonElement>('[data-stop-line]');
    const line = lineButton?.dataset.stopLine;
    if (!line) return;
    popup.remove();
    onSelectLine?.(line);
  });
  onOpenChange?.(true);
  popup.on('close', () => onOpenChange?.(false));
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
    id: 'routes-casing',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'casingColor'],
      'line-width': ['get', 'casingWidth'],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 13, 0.72, 16, 0.86],
      'line-offset': ['get', 'offset'],
    },
  });

  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'width'],
      'line-opacity': ['get', 'opacity'],
      'line-offset': ['get', 'offset'],
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
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        7.4,
        ['case', ['get', 'selected'], 8.5, 6.5],
        8.8,
        ['case', ['get', 'selected'], 10, 7.5],
        10.5,
        ['case', ['get', 'selected'], 12, 9],
        12,
        ['case', ['get', 'selected'], 14, 11],
        16,
        ['case', ['get', 'selected'], 12, 9],
        20,
        ['case', ['get', 'selected'], 11, 8],
      ],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['case', ['get', 'selected'], 2.4, 1.8],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7.2, 0, 7.9, 0.72, 9.1, 0.82, 10.5, 0.9, 14, 0.92],
    },
  });

  map.addLayer({
    id: 'vehicle-badge-arrows',
    type: 'symbol',
    source: 'vehicles',
    maxzoom: spriteZoomThreshold,
    layout: {
      visibility: 'none',
      'text-field': '▲',
      'text-size': ['interpolate', ['linear'], ['zoom'], 7.4, 6.2, 8.8, 7.2, 11, 8.2, 14, 8.8],
      'text-offset': [0, -1.24],
      'text-rotate': ['get', 'arrowBearing'],
      'text-rotation-alignment': 'viewport',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': ['get', 'color'],
      'text-halo-width': 1.45,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 7.2, 0, 7.8, 0.96, 9.1, 1, 14.2, 0.98],
    },
  });

  map.addLayer({
    id: 'vehicle-badge-labels',
    type: 'symbol',
    source: 'vehicles',
    maxzoom: spriteZoomThreshold,
    layout: {
      visibility: 'none',
      'text-field': ['get', 'line'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 7.4, 6.5, 8.8, 7.4, 10.5, 8.8, 12, 9.8, 14, 9],
      'text-offset': [0, 0],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': ['get', 'textColor'],
      'text-halo-color': ['get', 'color'],
      'text-halo-width': 0.3,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 7.2, 0, 7.9, 0.9, 9.1, 0.96, 10.5, 1, 14.2, 0.9],
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
    id: 'user-accuracy',
    type: 'circle',
    source: 'user',
    paint: {
      'circle-radius': ['get', 'accuracyPixels'],
      'circle-color': '#2f7dff',
      'circle-opacity': 0.1,
      'circle-stroke-color': '#2f7dff',
      'circle-stroke-opacity': 0.35,
      'circle-stroke-width': 1.5,
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

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, focusPoint, userLocation, userLocationAccuracy, hasUserLocation, onLocateUser, showRouteForLine, searchedArea, selectedStop, selectedStopRequest, onSelectVehicle, onSelectLine, onStopPopupOpenChange, onResetMap }: Props) {
  const { revision: gtfsRevision } = useGtfsNetwork();
  const containerRef = useRef<HTMLDivElement>(null);
  const vehicleOverlayRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | undefined>(undefined);
  const vehicleFramesRef = useRef<Map<string, VehicleFrame>>(new Map());
  const currentPositionsRef = useRef<Map<string, LatLng>>(new Map());
  const vehicleRouteProgressRef = useRef<Map<string, VehicleRouteMemory>>(new Map());
  const vehicleOverlayElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const latestVehiclesRef = useRef<Vehicle[]>(vehicles);
  const visibleVehiclesRef = useRef<Vehicle[]>([]);
  const highlightedRoutesRef = useRef<GtfsRouteVariant[]>([]);
  const onSelectLineRef = useRef(onSelectLine);
  const stopPopupRef = useRef<maplibregl.Popup | undefined>(undefined);
  const vehicleClickPopupRef = useRef<maplibregl.Popup | undefined>(undefined);
  const selectedVehicleIdRef = useRef<string | undefined>(selectedVehicleId);
  const followedVehicleIdRef = useRef<string | undefined>(followedVehicleId);
  const followedVehicleStartedRef = useRef<string | undefined>(undefined);
  const vehicleLastSeenAtRef = useRef<Map<string, number>>(new Map());
  const lastFollowCameraAtRef = useRef(0);
  const lastVehicleRenderAtRef = useRef(0);
  const lastVehicleOverlayAtRef = useRef(0);
  const lastVehiclePopupRenderAtRef = useRef(0);
  const suppressVehicleClicksUntilRef = useRef(0);
  const userCenterRefinementUntilRef = useRef(0);
  const hadFocusedViewRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(13);
  const [locatingUser, setLocatingUser] = useState(false);
  const [activeVehiclePopup, setActiveVehiclePopup] = useState<ActiveVehiclePopup | undefined>();
  const activeVehiclePopupRef = useRef<ActiveVehiclePopup | undefined>(undefined);

  latestVehiclesRef.current = vehicles;
  onSelectLineRef.current = onSelectLine;
  selectedVehicleIdRef.current = selectedVehicleId;
  followedVehicleIdRef.current = followedVehicleId;
  activeVehiclePopupRef.current = activeVehiclePopup;

  const vehiclePopupPoint = (vehicle: Vehicle) => {
    const map = mapRef.current;
    if (!map) return undefined;
    const rawPosition = currentPositionsRef.current.get(vehicle.vehicleId) ?? vehicle;
    const position = snapVehicleToRoute(vehicle, rawPosition, highlightedRoutesRef.current)?.point ?? rawPosition;
    const projected = map.project([position.lon, position.lat]);
    const rect = map.getContainer().getBoundingClientRect();
    return {
      x: Math.min(Math.max(projected.x, 148), Math.max(148, rect.width - 148)),
      y: Math.min(Math.max(projected.y - 118, 92), Math.max(92, rect.height - 180)),
    };
  };

  useEffect(() => {
    const openVehicleById = (vehicleId?: string) => {
      const vehicle = latestVehiclesRef.current.find((item) => item.vehicleId === vehicleId);
      if (!vehicle) return false;

      vehicleClickPopupRef.current?.remove();
      vehicleClickPopupRef.current = undefined;
      setActiveVehiclePopup(undefined);
      onSelectVehicle(vehicle);
      return true;
    };

    const openVehicleFromPopup = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const action = target?.closest<HTMLElement>('[data-open-vehicle]');
      if (!action) return;

      if (!openVehicleById(action.dataset.openVehicle)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const openVehicleFromCustomEvent = (event: Event) => {
      const vehicleId = (event as CustomEvent<string>).detail;
      openVehicleById(vehicleId);
    };
    const closeVehiclePopup = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-close-vehicle-popup]')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      vehicleClickPopupRef.current?.remove();
      vehicleClickPopupRef.current = undefined;
    };

    document.addEventListener('pointerup', closeVehiclePopup, true);
    document.addEventListener('touchend', closeVehiclePopup, true);
    document.addEventListener('click', closeVehiclePopup, true);
    document.addEventListener('pointerup', openVehicleFromPopup, true);
    document.addEventListener('touchend', openVehicleFromPopup, true);
    document.addEventListener('click', openVehicleFromPopup, true);
    window.addEventListener('busradar:open-vehicle-detail', openVehicleFromCustomEvent as EventListener);
    return () => {
      document.removeEventListener('pointerup', closeVehiclePopup, true);
      document.removeEventListener('touchend', closeVehiclePopup, true);
      document.removeEventListener('click', closeVehiclePopup, true);
      document.removeEventListener('pointerup', openVehicleFromPopup, true);
      document.removeEventListener('touchend', openVehicleFromPopup, true);
      document.removeEventListener('click', openVehicleFromPopup, true);
      window.removeEventListener('busradar:open-vehicle-detail', openVehicleFromCustomEvent as EventListener);
    };
  }, [onSelectVehicle]);

  useEffect(() => {
    const overlay = vehicleOverlayRef.current;
    if (!overlay) return;

    const openOverlayVehicle = (event: MouseEvent) => {
      const marker = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-vehicle-id]');
      if (!marker) return;
      const vehicle = latestVehiclesRef.current.find((item) => item.vehicleId === marker.dataset.vehicleId);
      const map = mapRef.current;
      if (!vehicle || !map) return;

      event.preventDefault();
      event.stopPropagation();
      stopPopupRef.current?.remove();
      stopPopupRef.current = undefined;
      vehicleClickPopupRef.current?.remove();
      vehicleClickPopupRef.current = undefined;
      const rawPosition = currentPositionsRef.current.get(vehicle.vehicleId) ?? vehicle;
      const position = snapVehicleToRoute(vehicle, rawPosition, highlightedRoutesRef.current)?.point ?? rawPosition;
      const projected = map.project([position.lon, position.lat]);
      setActiveVehiclePopup({
        vehicleId: vehicle.vehicleId,
        vehicle,
        x: Math.min(Math.max(projected.x, 148), Math.max(148, map.getCanvas().clientWidth - 148)),
        y: Math.max(92, projected.y - 98),
      });
    };

    overlay.addEventListener('click', openOverlayVehicle);
    return () => overlay.removeEventListener('click', openOverlayVehicle);
  }, []);

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
      vehicleOverlayElementsRef.current.clear();
      setMapReady(false);
    };
  }, []);

  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => !selectedLine || vehicle.line === selectedLine),
    [vehicles, selectedLine],
  );
  visibleVehiclesRef.current = visibleVehicles;

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const renderOverlay = () => {
      syncVehicleOverlay(
        vehicleOverlayRef.current,
        map,
        vehicleOverlayElementsRef.current,
        visibleVehiclesRef.current,
        currentPositionsRef.current,
        selectedVehicleIdRef.current,
        followedVehicleIdRef.current,
        highlightedRoutesRef.current,
      );
    };
    map.on('render', renderOverlay);
    return () => {
      map.off('render', renderOverlay);
    };
  }, [mapReady]);

  const highlightedRoutes = useMemo(
    () => routeVariantsForVehicles(visibleVehicles, selectedLine, showRouteForLine),
    [gtfsRevision, visibleVehicles, selectedLine, showRouteForLine],
  );
  highlightedRoutesRef.current = highlightedRoutes;

  const routeStops = useMemo(() => {
    if (!showRouteForLine && !selectedLine) return [];
    return stopsForRoutes(highlightedRoutes);
  }, [highlightedRoutes, selectedLine, showRouteForLine]);
  const showOverviewStops = !showRouteForLine && !selectedLine && zoom >= 16;
  const userAccuracyPixels = useMemo(() => {
    if (!userLocationAccuracy) return 12;
    const metersPerPixel = (
      156543.03392
      * Math.cos((userLocation.lat * Math.PI) / 180)
    ) / (2 ** zoom);
    return Math.min(180, Math.max(12, userLocationAccuracy / metersPerPixel));
  }, [userLocation.lat, userLocationAccuracy, zoom]);

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
  }, [gtfsRevision, mapReady, routeStops, selectedLine, showOverviewStops, showRouteForLine]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    setSourceData(
      mapRef.current,
      'user',
      hasUserLocation
        ? {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [userLocation.lon, userLocation.lat] },
            properties: { accuracyPixels: userAccuracyPixels },
          }],
        }
        : emptyPointCollection(),
    );
  }, [hasUserLocation, mapReady, userAccuracyPixels, userLocation.lat, userLocation.lon]);

  useEffect(() => {
    const shouldRefineCenter = performance.now() < userCenterRefinementUntilRef.current;
    if ((!locatingUser && !shouldRefineCenter) || !hasUserLocation || !mapReady || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 220,
    });
  }, [hasUserLocation, locatingUser, mapReady, userLocation.lat, userLocation.lon]);

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
    if (!mapRef.current) return;
    const map = mapRef.current;
    const now = performance.now();
    const active = new Set(visibleVehicles.map((vehicle) => vehicle.vehicleId));
    visibleVehicles.forEach((vehicle) => vehicleLastSeenAtRef.current.set(vehicle.vehicleId, now));
    vehicleFramesRef.current.forEach((_, id) => {
      const isFollowed = id === followedVehicleIdRef.current;
      const lastSeenAt = vehicleLastSeenAtRef.current.get(id) ?? 0;
      const keepDuringFeedGap = isFollowed && now - lastSeenAt <= 45_000;
      if (!active.has(id) && !keepDuringFeedGap) {
        vehicleFramesRef.current.delete(id);
        currentPositionsRef.current.delete(id);
        vehicleRouteProgressRef.current.delete(id);
        vehicleLastSeenAtRef.current.delete(id);
      }
    });
    visibleVehicles.forEach((vehicle) => {
      const previousFrame = vehicleFramesRef.current.get(vehicle.vehicleId);
      const previous = currentPositionsRef.current.get(vehicle.vehicleId) ?? vehicle;
      const next = { lat: vehicle.lat, lon: vehicle.lon };
      if (!currentPositionsRef.current.has(vehicle.vehicleId)) {
        currentPositionsRef.current.set(vehicle.vehicleId, next);
      }
      const meters = new maplibregl.LngLat(previous.lon, previous.lat).distanceTo(new maplibregl.LngLat(next.lon, next.lat));
      const isPlausibleUpdate = meters <= 420;
      const motion = isPlausibleUpdate ? routeMotion(vehicle, previous, next, vehicleRouteProgressRef.current.get(vehicle.vehicleId)) : undefined;
      const secondsSinceUpdate = previousFrame
        ? clamp((now - previousFrame.startedAt) / 1000, 3, 24)
        : 6;
      const routeDistanceMeters = motion?.fromRouteProgress != null && motion.toRouteProgress != null && motion.routeTotalMeters
        ? Math.max(0, (motion.toRouteProgress - motion.fromRouteProgress) * motion.routeTotalMeters)
        : meters;
      const routeSpeedMps = targetVehicleSpeedMps(
        vehicle,
        isPlausibleUpdate ? Math.max(meters, routeDistanceMeters) : 0,
        secondsSinceUpdate,
        previousFrame?.routeSpeedMps,
        Boolean(motion?.routePath),
      );
      const durationMs = isPlausibleUpdate ? vehicleMovementDurationMs(Math.max(meters, routeDistanceMeters), routeSpeedMps) : 900;
      vehicleFramesRef.current.set(vehicle.vehicleId, {
        from: isPlausibleUpdate ? previous : next,
        to: next,
        startedAt: isPlausibleUpdate ? now : now - 1,
        vehicle,
        meters: isPlausibleUpdate ? meters : 0,
        durationMs,
        routeSpeedMps,
        extrapolateUntilMs: now + 12_000,
        ...motion,
      });
    });
    syncVehicleOverlay(
      vehicleOverlayRef.current,
      map,
      vehicleOverlayElementsRef.current,
      visibleVehicles,
      currentPositionsRef.current,
      selectedVehicleIdRef.current,
      followedVehicleIdRef.current,
      highlightedRoutes,
    );
  }, [highlightedRoutes, visibleVehicles]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    let frameId = 0;
    const tick = (time: number) => {
      if (time - lastVehicleRenderAtRef.current < 33) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      lastVehicleRenderAtRef.current = time;
      const animatedVehicles: Vehicle[] = [];
      vehicleFramesRef.current.forEach((frame, id) => {
        const rawElapsed = Math.max(0, (time - frame.startedAt) / frame.durationMs);
        const elapsed = Math.min(1, rawElapsed);
        let routeProgress = frame.fromRouteProgress != null && frame.toRouteProgress != null
          ? frame.fromRouteProgress + (frame.toRouteProgress - frame.fromRouteProgress) * elapsed
          : undefined;
        if (
          routeProgress != null
          && frame.toRouteProgress != null
          && frame.routeTotalMeters
          && frame.routeSpeedMps
          && time > frame.startedAt + frame.durationMs
          && time <= (frame.extrapolateUntilMs ?? 0)
        ) {
          const extraSeconds = (time - frame.startedAt - frame.durationMs) / 1000;
          const extraProgress = Math.min(75, Math.max(0, frame.routeSpeedMps * extraSeconds)) / frame.routeTotalMeters;
          routeProgress = frame.toRouteProgress + extraProgress;
        }
        routeProgress = routeProgress == null ? undefined : Math.min(0.999999, Math.max(0, routeProgress));
        const routeState = frame.routePath && routeProgress != null
          ? interpolatePathState(frame.routePath, routeProgress)
          : undefined;
        const linearPosition = {
          lat: frame.from.lat + (frame.to.lat - frame.from.lat) * elapsed,
          lon: frame.from.lon + (frame.to.lon - frame.from.lon) * elapsed,
        };
        const position = routeState?.point ?? linearPosition;
        currentPositionsRef.current.set(id, position);
        if (frame.routeVariantId && routeProgress != null) {
          vehicleRouteProgressRef.current.set(id, {
            routeVariantId: frame.routeVariantId,
            progress: routeProgress,
          });
        }
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
          highlightedRoutesRef.current,
        ),
      );
      if (time - lastVehicleOverlayAtRef.current > 16) {
        lastVehicleOverlayAtRef.current = time;
        syncVehicleOverlay(
          vehicleOverlayRef.current,
          map,
          vehicleOverlayElementsRef.current,
          animatedVehicles,
          currentPositionsRef.current,
          selectedVehicleIdRef.current,
          followedVehicleIdRef.current,
          highlightedRoutesRef.current,
        );
      }
      const activePopup = activeVehiclePopupRef.current;
      if (activePopup && time - lastVehiclePopupRenderAtRef.current > 120) {
        const liveVehicle = latestVehiclesRef.current.find((item) => item.vehicleId === activePopup.vehicleId);
        if (liveVehicle) {
          const point = vehiclePopupPoint(liveVehicle);
          if (point) {
            lastVehiclePopupRenderAtRef.current = time;
            setActiveVehiclePopup((current) => (
              current?.vehicleId === activePopup.vehicleId
                ? { vehicleId: liveVehicle.vehicleId, vehicle: liveVehicle, x: point.x, y: point.y }
                : current
            ));
          }
        }
      }
      const followedId = followedVehicleIdRef.current;
      const followedVehicle = followedId ? latestVehiclesRef.current.find((vehicle) => vehicle.vehicleId === followedId) : undefined;
      const rawFollowedPosition = followedId ? currentPositionsRef.current.get(followedId) : undefined;
      const followedPosition = followedVehicle && rawFollowedPosition
        ? snapVehicleToRoute(followedVehicle, rawFollowedPosition, highlightedRoutesRef.current)?.point ?? rawFollowedPosition
        : rawFollowedPosition;
      if (followedPosition && time - lastFollowCameraAtRef.current > 250) {
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
    stopPopupRef.current?.remove();
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
      onStopPopupOpenChange,
      (line) => onSelectLineRef.current?.(line),
    );
    stopPopupRef.current = popup;
    return () => {
      if (stopPopupRef.current === popup) {
        popup.remove();
        stopPopupRef.current = undefined;
      }
    };
  }, [mapReady, onStopPopupOpenChange, selectedStop, selectedStopRequest]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !followedVehicleId) return;
    if (followedVehicleStartedRef.current === followedVehicleId) return;
    const vehicle = vehicles.find((item) => item.vehicleId === followedVehicleId);
    const position = currentPositionsRef.current.get(followedVehicleId) ?? vehicle;
    if (!position) return;
    followedVehicleStartedRef.current = followedVehicleId;
    lastFollowCameraAtRef.current = 0;
    mapRef.current.jumpTo({
      center: [position.lon, position.lat],
      zoom: Math.max(mapRef.current.getZoom(), 16.2),
    });
  }, [followedVehicleId, mapReady, vehicles]);

  useEffect(() => {
    if (followedVehicleId) {
      suppressVehicleClicksUntilRef.current = performance.now() + 900;
    } else {
      followedVehicleStartedRef.current = undefined;
    }
  }, [followedVehicleId]);

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
    const vehicleLayers = ['vehicle-selected-sprites', 'vehicle-sprites', 'vehicle-hit-area', 'vehicle-badges', 'vehicle-badge-arrows', 'vehicle-badge-labels', 'vehicle-sprite-labels'];
    const stopLayers = ['stops-hit-area', 'stops-circle'];
    const hoverPopup = new maplibregl.Popup({
      className: 'vehicle-hover-popup',
      closeButton: false,
      closeOnClick: false,
      maxWidth: '260px',
      offset: 18,
    });

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
      if (performance.now() < suppressVehicleClicksUntilRef.current) return;
      const vehicle = vehicleAtPoint(event);
      if (!vehicle) return;
      if (vehicle.vehicleId === followedVehicleIdRef.current) return;
      stopPopupRef.current?.remove();
      stopPopupRef.current = undefined;
      hoverPopup.remove();
      vehicleClickPopupRef.current?.remove();
      vehicleClickPopupRef.current = undefined;
      const point = vehiclePopupPoint(vehicle);
      setActiveVehiclePopup({
        vehicleId: vehicle.vehicleId,
        vehicle,
        x: point?.x ?? event.point.x,
        y: point?.y ?? event.point.y,
      });
    };
    const handleStopClick = (event: MapMouseEvent) => {
      if (vehicleAtPoint(event)) return;
      const feature = queryFeaturesNearPoint(map, event.point, stopLayers, 22)[0];
      if (!feature) return;
      const properties = feature.properties as StopFeatureProperties;
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      stopPopupRef.current?.remove();
      stopPopupRef.current = showStopPopup(map, properties, coordinates, onStopPopupOpenChange, (line) => onSelectLineRef.current?.(line));
    };
    const handleMove = (event: MapMouseEvent) => {
      const vehicle = vehicleAtPoint(event);
      if (vehicle) {
        hoverPopup
          .setLngLat(event.lngLat)
          .setHTML(renderVehiclePopup(vehicle))
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
    };
  }, [mapReady, onStopPopupOpenChange, selectedLine]);

  const centerOnUser = async () => {
    userCenterRefinementUntilRef.current = performance.now() + 5000;
    if (hasUserLocation) {
      mapRef.current?.easeTo({ center: [userLocation.lon, userLocation.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 280 });
    }
    setLocatingUser(true);
    try {
      const located = await onLocateUser?.();
      if (!located) return;
      mapRef.current?.easeTo({ center: [located.lon, located.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: hasUserLocation ? 220 : 380 });
    } finally {
      setLocatingUser(false);
    }
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
    <div className={`map-shell map-shell--standard${followedVehicleId ? ' is-following' : ''}`}>
      {!selectedLine && !showRouteForLine && !followedVehicleId && !searchedArea && (
        <button type="button" className="map-mode-label" onClick={resetToOverview}>
          Live transit
        </button>
      )}
      <div ref={containerRef} className="bus-map" />
      <div ref={vehicleOverlayRef} className="vehicle-html-overlay" aria-hidden="true" />
      {activeVehiclePopup && (
        <aside
          className="vehicle-react-popup"
          style={{ left: activeVehiclePopup.x, top: activeVehiclePopup.y }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          aria-label={`Popup vettura ${activeVehiclePopup.vehicle.vehicleId}`}
        >
          <button
            type="button"
            className="vehicle-react-popup-close"
            aria-label="Chiudi popup vettura"
            onClick={() => setActiveVehiclePopup(undefined)}
          >
            ×
          </button>
          <strong>{vehicleIdentifierLabel(activeVehiclePopup.vehicle)}</strong>
          <span>Linea {activeVehiclePopup.vehicle.line} · {trackingLabel(activeVehiclePopup.vehicle)}</span>
          <small>{activeVehiclePopup.vehicle.direction}</small>
          <button
            type="button"
            className="vehicle-tooltip-action"
            onClick={() => {
              const vehicle = latestVehiclesRef.current.find((item) => item.vehicleId === activeVehiclePopup.vehicleId) ?? activeVehiclePopup.vehicle;
              setActiveVehiclePopup(undefined);
              onSelectVehicle(vehicle);
            }}
          >
            Apri dettaglio vettura
          </button>
        </aside>
      )}
      <div className="map-floating-controls">
        <IconButton label={locatingUser ? 'Ricerca posizione precisa in corso' : userLocationAccuracy ? `Centra posizione · precisione ${Math.round(userLocationAccuracy)} m` : 'Centra posizione'} active={hasUserLocation || locatingUser} onClick={() => void centerOnUser()}>
          <LocateFixed size={20} className={locatingUser ? 'is-locating' : undefined} />
        </IconButton>
      </div>
    </div>
  );
}
