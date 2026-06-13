import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { userPosition } from '../data/demoData';
import { getGtfsRoutesForLine, getGtfsRoutesForRouteId, getGtfsStopEntriesForRoute, type GtfsRouteVariant, type GtfsStop } from '../data/gtfsNetwork';
import { fetchGttStopArrivals, type GttStopArrival } from '../services/gttRealtime';
import type { LatLng, Vehicle } from '../types';
import { getLineColor } from '../utils/lineColors';
import { toLeafletPoint } from '../utils/geo';
import { IconButton } from './IconButton';
import { LineBadge } from './LineBadge';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicleId?: string;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  showRouteForLine?: string;
  onSelectVehicle: (vehicle: Vehicle) => void;
};

const tileLayer = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
};

const vehicleAssetBase = import.meta.env.BASE_URL;

function createBusIcon(vehicle: Vehicle, selected: boolean) {
  const color = getLineColor(vehicle.line);
  const asset = vehicle.vehicleType === 'tram' ? `${vehicleAssetBase}assets/vehicles/tram-top.png` : `${vehicleAssetBase}assets/vehicles/bus-top.png`;
  return L.divIcon({
    className: 'vehicle-marker-shell',
    html: `<div class="vehicle-marker vehicle-marker--${vehicle.vehicleType} ${selected ? 'is-selected' : ''}" style="--line-color:${color};--bearing:${vehicle.bearing}deg;--label-bearing:${-vehicle.bearing}deg"><img src="${asset}" alt="" /><span>${vehicle.line}</span></div>`,
    iconSize: vehicle.vehicleType === 'tram' ? [74, 42] : [58, 38],
    iconAnchor: vehicle.vehicleType === 'tram' ? [37, 21] : [29, 19],
  });
}

function createVehiclePopup(vehicle: Vehicle) {
  const color = getLineColor(vehicle.line);
  return `
    <div class="map-popup">
      <span class="line-badge" style="--line-color:${color}">${vehicle.line}</span>
      <strong>Vettura ${vehicle.vehicleId}</strong>
      <span>${vehicle.vehicleType === 'tram' ? 'Tram' : 'Bus'} · ${vehicle.direction} · ${vehicle.source}</span>
    </div>
  `;
}

function updateVehicleMarkerElement(marker: L.Marker, vehicle: Vehicle, selected: boolean) {
  const element = marker.getElement()?.querySelector<HTMLElement>('.vehicle-marker');
  if (!element) return;

  element.classList.toggle('is-selected', selected);
  element.style.setProperty('--bearing', `${vehicle.bearing}deg`);
  element.style.setProperty('--label-bearing', `${-vehicle.bearing}deg`);
  element.querySelector('span')?.replaceChildren(document.createTextNode(vehicle.line));
}

function RecenterButton() {
  const map = useMap();
  return (
    <div className="map-floating-controls">
      <IconButton label="Centra posizione" onClick={() => map.flyTo([userPosition.lat, userPosition.lon], 13.5)}>
        <LocateFixed size={20} />
      </IconButton>
    </div>
  );
}

function FitRoute({ line }: { line?: string }) {
  const map = useMap();

  useEffect(() => {
    if (!line) return;
    const routeBounds = getGtfsRoutesForLine(line).flatMap((route) => route.path.map(toLeafletPoint));
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
  onSelectVehicle,
}: {
  vehicles: Vehicle[];
  selectedVehicleId?: string;
  followedVehicleId?: string;
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
          icon: createBusIcon(vehicle, selected),
          zIndexOffset: selected ? 700 : 520,
          riseOnHover: true,
        }).addTo(map);

        marker.bindPopup(createVehiclePopup(vehicle));
        marker.on('click', () => latestSelectRef.current(markersRef.current.get(vehicle.vehicleId)?.vehicle ?? vehicle));
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
      updateVehicleMarkerElement(existing.marker, vehicle, selected);
      existing.marker.setPopupContent(createVehiclePopup(vehicle));
    });
  }, [vehicles, selectedVehicleId, followedVehicleId, map]);

  useEffect(() => {
    let frameId = 0;
    const duration = 1000;

    const tick = (time: number) => {
      markersRef.current.forEach((entry) => {
        const elapsed = Math.min(1, Math.max(0, (time - entry.startedAt) / duration));
        const lat = entry.from.lat + (entry.to.lat - entry.from.lat) * elapsed;
        const lng = entry.from.lng + (entry.to.lng - entry.from.lng) * elapsed;
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
  if (showRouteForLine) return getGtfsRoutesForLine(showRouteForLine);
  if (selectedLine) return getGtfsRoutesForLine(selectedLine);

  const byRoute = new Map<string, GtfsRouteVariant>();
  vehicles.slice(0, 120).forEach((vehicle) => {
    const routeId = vehicle.routeId.replace(/^gtt-/, '');
    getGtfsRoutesForRouteId(routeId).forEach((route) => byRoute.set(route.id, route));
  });

  return [...byRoute.values()];
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
        {arrivals?.length === 0 && <small>Feed realtime senza previsioni pubblicate per questa palina ora</small>}
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

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, focusPoint, showRouteForLine, onSelectVehicle }: Props) {
  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => !selectedLine || vehicle.line === selectedLine),
    [vehicles, selectedLine],
  );
  const highlightedRoutes = useMemo(
    () => routeVariantsForVehicles(visibleVehicles, selectedLine, showRouteForLine),
    [visibleVehicles, selectedLine, showRouteForLine],
  );
  const routeStops = useMemo(() => {
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
  }, [highlightedRoutes]);
  const followedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === followedVehicleId);

  return (
    <div className="map-shell map-shell--standard">
      <div className="map-mode-label">Live transit map</div>
      <MapContainer
        center={[45.0706, 7.6867]}
        zoom={13}
        minZoom={3}
        maxZoom={18}
        zoomSnap={0.5}
        zoomDelta={1}
        zoomControl={false}
        markerZoomAnimation
        attributionControl={false}
        className="bus-map"
      >
        <TileLayer
          url={tileLayer.url}
          attribution={tileLayer.attribution}
          opacity={1}
          maxNativeZoom={18}
          updateWhenZooming={false}
          updateWhenIdle
          keepBuffer={2}
        />
        {highlightedRoutes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.path.map(toLeafletPoint)}
            pathOptions={{
              color: route.color || getLineColor(route.line),
              weight: showRouteForLine === route.line || selectedLine === route.line ? 7 : 4,
              opacity: showRouteForLine === route.line || selectedLine === route.line ? 0.92 : 0.5,
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
          position={[userPosition.lat, userPosition.lon]}
          icon={L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })}
        />
        <VehicleMarkers
          vehicles={visibleVehicles}
          selectedVehicleId={selectedVehicleId}
          followedVehicleId={followedVehicleId}
          onSelectVehicle={onSelectVehicle}
        />
        <RecenterButton />
        <FitRoute line={showRouteForLine} />
        <FollowVehicle vehicle={followedVehicle} />
        <FocusPoint point={focusPoint} />
      </MapContainer>
    </div>
  );
}
