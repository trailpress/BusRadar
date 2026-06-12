import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { routes, stops, userPosition } from '../data/demoData';
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

function createBusIcon(vehicle: Vehicle, selected: boolean) {
  const color = getLineColor(vehicle.line);
  return L.divIcon({
    className: 'vehicle-marker-shell',
    html: `<div class="vehicle-marker vehicle-marker--${vehicle.vehicleType} ${selected ? 'is-selected' : ''}" style="--line-color:${color};--bearing:${vehicle.bearing}deg"><i></i><span>${vehicle.line}</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
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
    const route = routes.find((item) => item.line === line);
    if (!route) return;
    map.fitBounds(route.path.map(toLeafletPoint), { paddingTopLeft: [40, 120], paddingBottomRight: [40, 220] });
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

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, focusPoint, showRouteForLine, onSelectVehicle }: Props) {
  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => !selectedLine || vehicle.line === selectedLine),
    [vehicles, selectedLine],
  );
  const highlightedRoutes = routes.filter((route) => !selectedLine || route.line === selectedLine);
  const followedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === followedVehicleId);

  return (
    <div className="map-shell map-shell--standard">
      <div className="map-mode-label">Mappa bus demo</div>
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
          <Polyline key={route.id} positions={route.path.map(toLeafletPoint)} pathOptions={{ color: getLineColor(route.line), weight: showRouteForLine === route.line ? 8 : 4, opacity: showRouteForLine === route.line ? 0.95 : 0.62 }} />
        ))}
        {stops
          .filter((stop) => !selectedLine || stop.lines.includes(selectedLine))
          .map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lon]}
              icon={L.divIcon({ className: '', html: '<div class="stop-marker"></div>', iconSize: [12, 12], iconAnchor: [6, 6] })}
            >
              <Popup>{stop.name}</Popup>
            </Marker>
          ))}
        <Marker
          position={[userPosition.lat, userPosition.lon]}
          icon={L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })}
        />
        {visibleVehicles.map((vehicle) => (
          <Marker
            key={vehicle.vehicleId}
            position={[vehicle.lat, vehicle.lon]}
            icon={createBusIcon(vehicle, vehicle.vehicleId === selectedVehicleId || vehicle.vehicleId === followedVehicleId)}
            eventHandlers={{ click: () => onSelectVehicle(vehicle) }}
          >
            <Popup>
              <div className="map-popup">
                <LineBadge line={vehicle.line} />
                <strong>Vettura {vehicle.vehicleId}</strong>
                <span>{vehicle.vehicleType === 'tram' ? 'Tram' : 'Bus'} · {vehicle.direction} · {vehicle.source}</span>
              </div>
            </Popup>
          </Marker>
        ))}
        <RecenterButton />
        <FitRoute line={showRouteForLine} />
        <FollowVehicle vehicle={followedVehicle} />
        <FocusPoint point={focusPoint} />
      </MapContainer>
    </div>
  );
}
