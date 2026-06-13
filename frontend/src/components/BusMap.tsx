import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { getGtfsRoutesForLine, getGtfsRoutesForRouteId, getGtfsStopEntriesForRoute, type GtfsRouteVariant, type GtfsStop } from '../data/gtfsNetwork';
import { fetchGttStopArrivals, type GttStopArrival } from '../services/gttRealtime';
import type { LatLng, Vehicle } from '../types';
import { getLineColor } from '../utils/lineColors';
import { toLeafletPoint } from '../utils/geo';
import { IconButton } from './IconButton';
import { LineBadge } from './LineBadge';

type ViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicleId?: string;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  userLocation: LatLng;
  showRouteForLine?: string;
  onSelectVehicle: (vehicle: Vehicle) => void;
};

const tileLayer = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
};

const vehicleAssetBase = import.meta.env.BASE_URL;

function createBusIcon(vehicle: Vehicle, selected: boolean, zoom: number) {
  const color = getLineColor(vehicle.line);
  const isArticulated = vehicle.vehicleLengthClass === 'articulated-18m';
  const isInterurbanBlue = vehicle.vehicleLivery === 'interurban-blue';
  const isElectricCompact = vehicle.vehicleLivery === 'electric-compact';
  const useSprite = zoom >= 17.25;
  const spriteBearing = vehicle.bearing - 90;
  const asset = vehicle.vehicleType === 'tram'
    ? `${vehicleAssetBase}assets/vehicles/tram-top.png`
    : isElectricCompact
      ? `${vehicleAssetBase}assets/vehicles/bus-electric-compact-top.png`
    : isInterurbanBlue
      ? `${vehicleAssetBase}assets/vehicles/${isArticulated ? 'interurban-blue-articulated-top.png' : 'interurban-blue-bus-top.png'}`
      : `${vehicleAssetBase}assets/vehicles/${isArticulated ? 'bus-articulated-top.png' : 'bus-top.png'}`;
  const iconSize: [number, number] = useSprite
    ? vehicle.vehicleType === 'tram'
      ? [72, 28]
      : isElectricCompact
        ? [50, 16]
      : isArticulated
        ? [92, isInterurbanBlue ? 18 : 22]
        : [isInterurbanBlue ? 70 : 58, isInterurbanBlue ? 20 : 18]
    : [42, 38];
  const iconAnchor: [number, number] = [iconSize[0] / 2, iconSize[1] / 2];
  return L.divIcon({
    className: 'vehicle-marker-shell',
    html: `<button class="vehicle-marker vehicle-marker--${vehicle.vehicleType} ${isArticulated ? 'vehicle-marker--articulated' : ''} ${isInterurbanBlue ? 'vehicle-marker--interurban' : ''} ${isElectricCompact ? 'vehicle-marker--electric' : ''} ${useSprite ? 'vehicle-marker--sprite' : ''} ${selected ? 'is-selected' : ''}" type="button" style="--line-color:${color};--bearing:${vehicle.bearing}deg;--sprite-bearing:${spriteBearing}deg" aria-label="${vehicle.vehicleType === 'tram' ? 'Tram' : isArticulated ? 'Bus 18m' : 'Bus'} linea ${vehicle.line}">${useSprite ? `<img src="${asset}" alt="" />` : '<i></i>'}<strong>${vehicle.line}</strong>${isArticulated && !useSprite ? '<em>18</em>' : ''}<span class="vehicle-tooltip"><b>Vettura ${vehicle.vehicleId}</b><small>${vehicle.direction || 'Direzione non disponibile'}</small></span></button>`,
    iconSize,
    iconAnchor,
  });
}

function createVehiclePopup(vehicle: Vehicle) {
  const color = getLineColor(vehicle.line);
  const labelSuffix = vehicle.realtimeVehicleLabel && vehicle.realtimeVehicleLabel !== vehicle.vehicleId ? ` · label ${vehicle.realtimeVehicleLabel}` : '';
  return `
    <div class="map-popup">
      <span class="line-badge" style="--line-color:${color}">${vehicle.line}</span>
      <strong>Vettura ${vehicle.vehicleId}</strong>
      <span>${vehicle.vehicleType === 'tram' ? 'Tram' : vehicle.vehicleLengthClass === 'articulated-18m' ? 'Bus 18m' : 'Bus'} · ${vehicle.direction} · ${vehicle.source}${labelSuffix}</span>
    </div>
  `;
}

function updateVehicleMarkerElement(marker: L.Marker, vehicle: Vehicle, selected: boolean) {
  const element = marker.getElement()?.querySelector<HTMLElement>('.vehicle-marker');
  if (!element) return;

  element.classList.toggle('is-selected', selected);
  element.classList.toggle('vehicle-marker--articulated', vehicle.vehicleLengthClass === 'articulated-18m');
  element.classList.toggle('vehicle-marker--interurban', vehicle.vehicleLivery === 'interurban-blue');
  element.classList.toggle('vehicle-marker--electric', vehicle.vehicleLivery === 'electric-compact');
  element.style.setProperty('--bearing', `${vehicle.bearing}deg`);
  element.style.setProperty('--sprite-bearing', `${vehicle.bearing - 90}deg`);
  element.querySelector('strong')?.replaceChildren(document.createTextNode(vehicle.line));
  element.querySelector('.vehicle-tooltip b')?.replaceChildren(document.createTextNode(`Vettura ${vehicle.vehicleId}`));
  element.querySelector('.vehicle-tooltip small')?.replaceChildren(document.createTextNode(vehicle.direction || 'Direzione non disponibile'));
  const articulatedBadge = element.querySelector('em');
  if (vehicle.vehicleLengthClass === 'articulated-18m' && !articulatedBadge) {
    element.insertAdjacentHTML('beforeend', '<em>18</em>');
  } else if (vehicle.vehicleLengthClass !== 'articulated-18m') {
    articulatedBadge?.remove();
  }
}

function RecenterButton({ userLocation }: { userLocation: LatLng }) {
  const map = useMap();
  return (
    <div className="map-floating-controls">
      <IconButton label="Centra posizione" onClick={() => map.flyTo([userLocation.lat, userLocation.lon], 15)}>
        <LocateFixed size={20} />
      </IconButton>
    </div>
  );
}

function FitRoute({ line }: { line?: string }) {
  const map = useMap();

  useEffect(() => {
    if (!line) return;
    const routesById = getGtfsRoutesForRouteId(line);
    const routes = routesById.length > 0 ? routesById : getGtfsRoutesForLine(line);
    const routeBounds = routes.flatMap((route) => route.path.map(toLeafletPoint));
    if (routeBounds.length === 0) return;
    map.fitBounds(routeBounds, { paddingTopLeft: [40, 120], paddingBottomRight: [40, 220], maxZoom: 15 });
  }, [line, map]);

  return null;
}

function FollowVehicle({ vehicle }: { vehicle?: Vehicle }) {
  const map = useMap();

  useEffect(() => {
    if (!vehicle) return;
    map.flyTo([vehicle.lat, vehicle.lon], Math.max(map.getZoom(), 14.2), { duration: 0.65 });
  }, [map, vehicle?.vehicleId]);

  return null;
}

function FocusPoint({ point }: { point?: LatLng }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    map.flyTo([point.lat, point.lon], 16, { duration: 0.9 });
  }, [map, point?.lat, point?.lon]);

  return null;
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });

  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);

  return null;
}

function ViewportTracker({ onViewport }: { onViewport: (bounds: ViewportBounds) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds().pad(0.25);
      onViewport({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
    zoomend: () => {
      const bounds = map.getBounds().pad(0.25);
      onViewport({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
  });

  useEffect(() => {
    const bounds = map.getBounds().pad(0.25);
    onViewport({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
  }, [map, onViewport]);

  return null;
}

type VehicleMarkerEntry = {
  marker: L.Marker;
  from: L.LatLng;
  to: L.LatLng;
  startedAt: number;
  vehicle: Vehicle;
};

function VehicleMarkers({
  vehicles,
  selectedVehicleId,
  followedVehicleId,
  zoom,
  onSelectVehicle,
}: {
  vehicles: Vehicle[];
  selectedVehicleId?: string;
  followedVehicleId?: string;
  zoom: number;
  onSelectVehicle: (vehicle: Vehicle) => void;
}) {
  const map = useMap();
  const markersRef = useRef<Map<string, VehicleMarkerEntry>>(new Map());
  const latestSelectRef = useRef(onSelectVehicle);

  latestSelectRef.current = onSelectVehicle;

  useEffect(() => {
    const markers = markersRef.current;
    const activeIds = new Set(vehicles.map((vehicle) => vehicle.vehicleId));
    const now = performance.now();

    markers.forEach((entry, vehicleId) => {
      if (!activeIds.has(vehicleId)) {
        entry.marker.remove();
        markers.delete(vehicleId);
      }
    });

    vehicles.forEach((vehicle) => {
      const nextLatLng = L.latLng(vehicle.lat, vehicle.lon);
      const selected = vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId;
      const existing = markers.get(vehicle.vehicleId);

      if (!existing) {
        const marker = L.marker(nextLatLng, {
          icon: createBusIcon(vehicle, selected, zoom),
          zIndexOffset: selected ? 700 : 520,
          riseOnHover: true,
        }).addTo(map);

        marker.bindPopup(createVehiclePopup(vehicle));
        const selectVehicle = () => latestSelectRef.current(markersRef.current.get(vehicle.vehicleId)?.vehicle ?? vehicle);
        marker.on('click', selectVehicle);
        marker.getElement()?.addEventListener('click', (event) => {
          event.stopPropagation();
          selectVehicle();
        });
        markers.set(vehicle.vehicleId, {
          marker,
          from: nextLatLng,
          to: nextLatLng,
          startedAt: now,
          vehicle,
        });
        return;
      }

      existing.from = existing.marker.getLatLng();
      existing.to = nextLatLng;
      existing.startedAt = now;
      existing.vehicle = vehicle;
      existing.marker.setZIndexOffset(selected ? 700 : 520);
      existing.marker.setIcon(createBusIcon(vehicle, selected, zoom));
      updateVehicleMarkerElement(existing.marker, vehicle, selected);
      existing.marker.setPopupContent(createVehiclePopup(vehicle));
    });
  }, [vehicles, selectedVehicleId, followedVehicleId, map, zoom]);

  useEffect(() => {
    let frameId = 0;
    const duration = 14500;

    const tick = (time: number) => {
      markersRef.current.forEach((entry) => {
        const elapsed = Math.min(1, Math.max(0, (time - entry.startedAt) / duration));
        const eased = elapsed * elapsed * (3 - 2 * elapsed);
        const lat = entry.from.lat + (entry.to.lat - entry.from.lat) * eased;
        const lng = entry.from.lng + (entry.to.lng - entry.from.lng) * eased;
        entry.marker.setLatLng([lat, lng]);
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      markersRef.current.forEach((entry) => entry.marker.remove());
      markersRef.current.clear();
    };
  }, []);

  return null;
}

function routeVariantsForVehicles(vehicles: Vehicle[], selectedLine?: string, showRouteForLine?: string) {
  if (showRouteForLine) {
    const routesById = getGtfsRoutesForRouteId(showRouteForLine);
    return routesById.length > 0 ? routesById : getGtfsRoutesForLine(showRouteForLine);
  }
  if (selectedLine) return getGtfsRoutesForLine(selectedLine);

  const byRoute = new Map<string, GtfsRouteVariant>();
  vehicles.slice(0, 90).forEach((vehicle) => {
    const routeId = vehicle.routeId.replace(/^gtt-/, '');
    const variants = getGtfsRoutesForRouteId(routeId);
    const lineVariants = variants.length > 0 ? variants : getGtfsRoutesForLine(vehicle.line);
    lineVariants.forEach((route) => byRoute.set(route.id, route));
  });

  return [...byRoute.values()];
}

function displayRoutePath(route: GtfsRouteVariant, highlighted: boolean, zoom: number) {
  if (highlighted || zoom >= 15.5 || route.path.length <= 180) return route.path.map(toLeafletPoint);

  const step = zoom < 12.8 ? 12 : zoom < 14.2 ? 8 : 4;
  return route.path
    .filter((_, index) => index === 0 || index === route.path.length - 1 || index % step === 0)
    .map(toLeafletPoint);
}

function StopPopup({ stop, routeIds, stopSequencesByRoute }: { stop: GtfsStop; routeIds: string[]; stopSequencesByRoute: Record<string, number[]> }) {
  const [arrivals, setArrivals] = useState<GttStopArrival[]>();

  useEffect(() => {
    let cancelled = false;
    setArrivals(undefined);
    fetchGttStopArrivals(stop.id, routeIds, stopSequencesByRoute)
      .then((items) => {
        if (!cancelled) setArrivals(items);
      })
      .catch(() => {
        if (!cancelled) setArrivals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stop.id, routeIds.join('|'), JSON.stringify(stopSequencesByRoute)]);

  return (
    <div className="stop-popup">
      <strong>{stop.name}</strong>
      <span>Palina {stop.code}</span>
      <div className="stop-popup-lines">
        {stop.lines.slice(0, 6).map((line) => <LineBadge key={line} line={line} size="sm" />)}
      </div>
      <div className="arrival-list">
        {!arrivals && <small>Carico passaggi reali...</small>}
        {arrivals?.length === 0 && (
          <small>Il feed realtime GTT non pubblica passaggi per questa palina in questo momento.</small>
        )}
        {arrivals?.map((arrival) => (
          <div key={`${arrival.tripId}-${arrival.routeId}-${arrival.timeLabel}`}>
            <LineBadge line={arrival.line} size="sm" />
            <span>{arrival.timeLabel}</span>
            <em>{arrival.minutes === 0 ? 'ora' : `${arrival.minutes} min`}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, focusPoint, userLocation, showRouteForLine, onSelectVehicle }: Props) {
  const [zoom, setZoom] = useState(13);
  const [viewport, setViewport] = useState<ViewportBounds>();
  const visibleVehicles = useMemo(
    () => vehicles
      .filter((vehicle) => !selectedLine || vehicle.line === selectedLine)
      .filter((vehicle) => {
        if (!viewport || selectedLine || showRouteForLine) return true;
        if (vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId) return true;
        return vehicle.lat >= viewport.south && vehicle.lat <= viewport.north && vehicle.lon >= viewport.west && vehicle.lon <= viewport.east;
      }),
    [vehicles, selectedLine, showRouteForLine, viewport, selectedVehicleId, followedVehicleId],
  );
  const highlightedRoutes = useMemo(
    () => routeVariantsForVehicles(visibleVehicles, selectedLine, showRouteForLine),
    [visibleVehicles, selectedLine, showRouteForLine],
  );
  const routeStops = useMemo(() => {
    if (!showRouteForLine && !selectedLine && zoom < 15) return [];
    const byStop = new Map<string, { stop: GtfsStop; routeIds: Set<string>; stopSequencesByRoute: Record<string, number[]> }>();
    highlightedRoutes.forEach((route) => {
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
  }, [highlightedRoutes, selectedLine, showRouteForLine, zoom]);
  const followedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === followedVehicleId);
  const routeIsHighlighted = (route: GtfsRouteVariant) => (
    showRouteForLine === route.routeId ||
    showRouteForLine === route.line ||
    selectedLine === route.routeId ||
    selectedLine === route.line
  );

  return (
    <div className="map-shell map-shell--standard">
      <div className="map-mode-label">Live transit map</div>
      <MapContainer
        center={[45.0706, 7.6867]}
        zoom={13}
        minZoom={3}
        maxZoom={18}
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={90}
        zoomControl={false}
        markerZoomAnimation
        zoomAnimation
        fadeAnimation
        inertia
        inertiaDeceleration={2400}
        easeLinearity={0.18}
        preferCanvas
        attributionControl={false}
        className="bus-map"
      >
        <TileLayer
          url={tileLayer.url}
          attribution={tileLayer.attribution}
          opacity={1}
          maxNativeZoom={18}
          updateWhenZooming
          updateWhenIdle
          keepBuffer={4}
        />
        {highlightedRoutes.map((route) => (
          <Polyline
            key={route.id}
            positions={displayRoutePath(route, routeIsHighlighted(route), zoom)}
            pathOptions={{
              color: route.color || getLineColor(route.line),
              weight: routeIsHighlighted(route) ? 8 : 5,
              opacity: routeIsHighlighted(route) ? 0.94 : 0.68,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}
        {routeStops
          .slice(0, showRouteForLine || selectedLine ? routeStops.length : 220)
          .map(({ stop, routeIds, stopSequencesByRoute }) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lon]}
              icon={L.divIcon({ className: '', html: '<div class="stop-marker"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })}
            >
              <Popup>
                <StopPopup stop={stop} routeIds={[...routeIds]} stopSequencesByRoute={stopSequencesByRoute} />
              </Popup>
            </Marker>
          ))}
        <Marker
          position={[userLocation.lat, userLocation.lon]}
          icon={L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })}
        />
        <VehicleMarkers
          vehicles={visibleVehicles}
          selectedVehicleId={selectedVehicleId}
          followedVehicleId={followedVehicleId}
          zoom={zoom}
          onSelectVehicle={onSelectVehicle}
        />
        <ZoomTracker onZoom={setZoom} />
        <ViewportTracker onViewport={setViewport} />
        <RecenterButton userLocation={userLocation} />
        <FitRoute line={showRouteForLine} />
        <FollowVehicle vehicle={followedVehicle} />
        <FocusPoint point={focusPoint} />
      </MapContainer>
    </div>
  );
}
