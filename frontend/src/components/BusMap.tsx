import L from 'leaflet';
import { Layers, LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { landmarks, routes, stops, userPosition } from '../data/demoData';
import type { Landmark, MapLayerMode, Vehicle } from '../types';
import { getLineColor } from '../utils/lineColors';
import { toLeafletPoint } from '../utils/geo';
import { IconButton } from './IconButton';
import { LineBadge } from './LineBadge';
import { notify } from '../utils/notify';

const bounds: [number, number][] = [
  [45.0005, 7.613],
  [45.126, 7.738],
];

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicleId?: string;
  followedVehicleId?: string;
  showRouteForLine?: string;
  onSelectVehicle: (vehicle: Vehicle) => void;
};

const tileLayers: Record<MapLayerMode, { url: string; attribution: string }> = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  diorama: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
};

function createBusIcon(vehicle: Vehicle, selected: boolean) {
  const color = getLineColor(vehicle.line);
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker ${selected ? 'is-selected' : ''}" style="--line-color:${color}"><span>${vehicle.line}</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createLandmarkIcon(landmark: Landmark) {
  return L.divIcon({
    className: '',
    html: `<div class="landmark-marker landmark-marker--${landmark.type}"><i></i><span>${landmark.name}</span></div>`,
    iconSize: [120, 42],
    iconAnchor: [22, 34],
  });
}

function RecenterButton({ mode, onToggleMode }: { mode: MapLayerMode; onToggleMode: () => void }) {
  const map = useMap();
  return (
    <div className="map-floating-controls">
      <IconButton label="Centra posizione" onClick={() => map.flyTo([userPosition.lat, userPosition.lon], 13.5)}>
        <LocateFixed size={20} />
      </IconButton>
      <IconButton label="Layer mappa" active={mode === 'diorama'} onClick={onToggleMode}>
        <Layers size={20} />
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
    map.flyTo([vehicle.lat, vehicle.lon], 14.8, { duration: 0.8 });
  }, [map, vehicle?.lat, vehicle?.lon, vehicle?.vehicleId]);

  return null;
}

export function BusMap({ vehicles, selectedLine, selectedVehicleId, followedVehicleId, showRouteForLine, onSelectVehicle }: Props) {
  const [mode, setMode] = useState<MapLayerMode>('diorama');
  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => !selectedLine || vehicle.line === selectedLine),
    [vehicles, selectedLine],
  );
  const highlightedRoutes = routes.filter((route) => !selectedLine || route.line === selectedLine);
  const followedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === followedVehicleId);
  const tileLayer = tileLayers[mode];

  return (
    <div className={`map-shell map-shell--${mode}`}>
      <MapContainer
        center={[45.0706, 7.6867]}
        zoom={13}
        minZoom={11}
        maxZoom={16}
        maxBounds={bounds}
        zoomControl={false}
        attributionControl={false}
        className="bus-map"
      >
        <TileLayer
          key={mode}
          url={tileLayer.url}
          attribution={tileLayer.attribution}
          opacity={mode === 'diorama' ? 0.92 : 1}
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
                <span>{vehicle.direction}</span>
              </div>
            </Popup>
          </Marker>
        ))}
        {mode === 'diorama' &&
          landmarks.map((landmark) => (
            <Marker key={landmark.id} position={[landmark.lat, landmark.lon]} icon={createLandmarkIcon(landmark)} interactive={false} />
          ))}
        <RecenterButton
          mode={mode}
          onToggleMode={() => {
            setMode((current) => {
              const next = current === 'diorama' ? 'standard' : 'diorama';
              notify(next === 'diorama' ? 'Layer Diorama attivo' : 'Layer Standard attivo');
              return next;
            });
          }}
        />
        <FitRoute line={showRouteForLine} />
        <FollowVehicle vehicle={followedVehicle} />
      </MapContainer>
    </div>
  );
}
