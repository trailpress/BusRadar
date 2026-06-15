import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type MapMouseEvent } from 'maplibre-gl';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getGtfsRoutesForLine, getGtfsRoutesForRouteId, getGtfsStopEntriesForRoute, type GtfsRouteVariant, type GtfsStop } from '../data/gtfsNetwork';
import { fetchGttStopArrivalsInfo, type GttStopArrival, type GttStopArrivalsResult } from '../services/gttRealtime';
import type { LatLng, Vehicle } from '../types';
import { getLineColor } from '../utils/lineColors';
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
  onSelectVehicle: (vehicle: Vehicle) => void;
};

type VehicleFrame = {
  from: LatLng;
  to: LatLng;
  startedAt: number;
  vehicle: Vehicle;
};

type StopFeatureProperties = {
  id: string;
  name: string;
  code: string;
  lines: string;
  routeIds: string;
  stopSequencesByRoute: string;
};

const spriteZoomThreshold = 14.75;
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
  vehicles.slice(0, 28).forEach((vehicle) => {
    const routeId = vehicle.routeId.replace(/^gtt-/, '');
    const variants = getGtfsRoutesForRouteId(routeId);
    const lineVariants = variants.length > 0 ? variants : getGtfsRoutesForLine(vehicle.line);
    lineVariants.forEach((route) => byRoute.set(route.id, route));
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

function vehiclesToGeoJson(vehicles: Vehicle[], positions: Map<string, LatLng>, selectedVehicleId?: string, followedVehicleId?: string): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((vehicle) => {
      const position = positions.get(vehicle.vehicleId) ?? vehicle;
      const selected = vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [position.lon, position.lat] },
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
      'circle-radius': ['case', ['get', 'selected'], 20, 16],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.96,
    },
  });

  map.addLayer({
    id: 'vehicle-badge-labels',
    type: 'symbol',
    source: 'vehicles',
    maxzoom: spriteZoomThreshold,
    layout: {
      'text-field': ['get', 'line'],
      'text-size': 13,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    },
    paint: { 'text-color': '#ffffff' },
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
      'text-size': 11,
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
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': [
        'case',
        ['get', 'isArticulated'],
        ['interpolate', ['linear'], ['zoom'], 14.75, 0.12, 16, 0.15, 18, 0.18],
        ['interpolate', ['linear'], ['zoom'], 14.75, 0.15, 16, 0.19, 18, 0.23],
      ],
      'icon-rotate': ['get', 'spriteBearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14.75, 0.72, 15.4, 1] },
  });

  map.addLayer({
    id: 'vehicle-vector-fallback',
    type: 'symbol',
    source: 'vehicles',
    minzoom: 14.4,
    layout: {
      'text-field': '▬',
      'text-size': [
        'case',
        ['get', 'isArticulated'],
        ['interpolate', ['linear'], ['zoom'], 14.4, 30, 18, 44],
        ['interpolate', ['linear'], ['zoom'], 14.4, 23, 18, 34],
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
    minzoom: 14.2,
    maxzoom: spriteZoomThreshold,
    filter: ['==', ['get', 'selected'], true],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': [
        'case',
        ['get', 'isArticulated'],
        ['interpolate', ['linear'], ['zoom'], 14.2, 0.11, 16, 0.15, 18, 0.18],
        ['interpolate', ['linear'], ['zoom'], 14.2, 0.14, 16, 0.19, 18, 0.23],
      ],
      'icon-rotate': ['get', 'spriteBearing'],
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
      'text-offset': [0, 1.18],
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
}

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, focusPoint, userLocation, hasUserLocation, onLocateUser, showRouteForLine, onSelectVehicle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | undefined>(undefined);
  const vehicleFramesRef = useRef<Map<string, VehicleFrame>>(new Map());
  const currentPositionsRef = useRef<Map<string, LatLng>>(new Map());
  const latestVehiclesRef = useRef<Vehicle[]>(vehicles);
  const selectedVehicleIdRef = useRef<string | undefined>(selectedVehicleId);
  const followedVehicleIdRef = useRef<string | undefined>(followedVehicleId);
  const lastFollowCameraAtRef = useRef(0);
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
    if (!showRouteForLine && !selectedLine && zoom < 15) return [];
    return stopsForRoutes(highlightedRoutes).slice(0, showRouteForLine || selectedLine ? undefined : 220);
  }, [highlightedRoutes, selectedLine, showRouteForLine, zoom]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    setSourceData(mapRef.current, 'routes', routesToGeoJson(highlightedRoutes, selectedLine, showRouteForLine));
  }, [highlightedRoutes, mapReady, selectedLine, showRouteForLine]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    setSourceData(mapRef.current, 'stops', stopsToGeoJson(routeStops));
  }, [routeStops, mapReady]);

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
      vehicleFramesRef.current.set(vehicle.vehicleId, {
        from: meters > 180 ? next : previous,
        to: next,
        startedAt: meters > 180 ? now - 18000 : now,
        vehicle,
      });
    });
  }, [visibleVehicles, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    let frameId = 0;
    const duration = 18000;
    const tick = (time: number) => {
      const animatedVehicles: Vehicle[] = [];
      vehicleFramesRef.current.forEach((frame, id) => {
        const elapsed = Math.min(1, Math.max(0, (time - frame.startedAt) / duration));
        const eased = elapsed * elapsed * (3 - 2 * elapsed);
        const position = {
          lat: frame.from.lat + (frame.to.lat - frame.from.lat) * eased,
          lon: frame.from.lon + (frame.to.lon - frame.from.lon) * eased,
        };
        currentPositionsRef.current.set(id, position);
        animatedVehicles.push(frame.vehicle);
      });
      const map = mapRef.current!;
      setSourceData(map, 'vehicles', vehiclesToGeoJson(animatedVehicles, currentPositionsRef.current, selectedVehicleIdRef.current, followedVehicleIdRef.current));
      const followedId = followedVehicleIdRef.current;
      const followedPosition = followedId ? currentPositionsRef.current.get(followedId) : undefined;
      if (followedPosition && time - lastFollowCameraAtRef.current > 180) {
        const target = new maplibregl.LngLat(followedPosition.lon, followedPosition.lat);
        const zoom = Math.max(map.getZoom(), 16.2);
        map.jumpTo({ center: target, zoom });
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
    if (!mapReady || !mapRef.current || !followedVehicleId) return;
    const vehicle = vehicles.find((item) => item.vehicleId === followedVehicleId);
    const position = currentPositionsRef.current.get(followedVehicleId) ?? vehicle;
    if (!position) return;
    lastFollowCameraAtRef.current = 0;
    mapRef.current.jumpTo({
      center: [position.lon, position.lat],
      zoom: Math.max(mapRef.current.getZoom(), 16.2),
    });
  }, [followedVehicleId, mapReady, vehicles]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const vehicleLayers = ['vehicle-selected-sprites', 'vehicle-sprites', 'vehicle-vector-fallback', 'vehicle-hit-area', 'vehicle-badges', 'vehicle-badge-labels', 'vehicle-heading', 'vehicle-sprite-labels'];
    const stopLayers = ['stops-hit-area', 'stops-circle'];
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px', offset: 18 });

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
      if (vehicle) onSelectVehicle(vehicle);
    };
    const handleStopClick = (event: MapMouseEvent) => {
      if (vehicleAtPoint(event)) return;
      const feature = queryFeaturesNearPoint(map, event.point, stopLayers, 22)[0];
      if (!feature) return;
      const properties = feature.properties as StopFeatureProperties;
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
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
    };
    const handleMove = (event: MapMouseEvent) => {
      const vehicle = vehicleAtPoint(event);
      if (vehicle) {
        hoverPopup
          .setLngLat(event.lngLat)
          .setHTML(`<div class="vehicle-tooltip"><strong>Vettura ${escapeHtml(vehicle.vehicleId)}</strong><span>Linea ${escapeHtml(vehicle.line)} · ${escapeHtml(trackingLabel(vehicle))}</span><small>${escapeHtml(vehicle.direction)}</small></div>`)
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
  }, [mapReady, onSelectVehicle, selectedLine]);

  const centerOnUser = async () => {
    const located = await onLocateUser?.();
    const target = located ?? userLocation;
    mapRef.current?.flyTo({ center: [target.lon, target.lat], zoom: 15, duration: 450 });
  };

  return (
    <div className="map-shell map-shell--standard">
      <div className="map-mode-label">Live transit map</div>
      <div ref={containerRef} className="bus-map" />
      <div className="map-floating-controls">
        <IconButton label="Centra posizione" onClick={() => void centerOnUser()}>
          <LocateFixed size={20} />
        </IconButton>
      </div>
    </div>
  );
}
