import L from 'leaflet';
import { Layers, LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { routes, stops, userPosition } from '../data/demoData';
import type { LatLng, Vehicle } from '../types';
import { getLineColor } from '../utils/lineColors';
import { toLeafletPoint } from '../utils/geo';
import { IconButton } from './IconButton';
import { LineBadge } from './LineBadge';

const bounds: [number, number][] = [
  [45.0005, 7.613],
  [45.126, 7.738],
];

const cityGrid: LatLng[][] = [
  [{ lat: 45.045, lon: 7.632 }, { lat: 45.057, lon: 7.658 }, { lat: 45.067, lon: 7.681 }, { lat: 45.078, lon: 7.714 }],
  [{ lat: 45.029, lon: 7.646 }, { lat: 45.052, lon: 7.665 }, { lat: 45.072, lon: 7.681 }, { lat: 45.091, lon: 7.699 }],
  [{ lat: 45.018, lon: 7.704 }, { lat: 45.049, lon: 7.69 }, { lat: 45.079, lon: 7.676 }, { lat: 45.11, lon: 7.665 }],
  [{ lat: 45.082, lon: 7.632 }, { lat: 45.074, lon: 7.661 }, { lat: 45.065, lon: 7.69 }, { lat: 45.056, lon: 7.722 }],
  [{ lat: 45.006, lon: 7.622 }, { lat: 45.038, lon: 7.65 }, { lat: 45.071, lon: 7.686 }, { lat: 45.122, lon: 7.709 }],
];

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicleId?: string;
  showRouteForLine?: string;
  onSelectVehicle: (vehicle: Vehicle) => void;
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

function RecenterButton() {
  const map = useMap();
  return (
    <div className="map-floating-controls">
      <IconButton label="Centra posizione" onClick={() => map.flyTo([userPosition.lat, userPosition.lon], 13.5)}>
        <LocateFixed size={20} />
      </IconButton>
      <IconButton label="Layer mappa">
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

export function BusMap({ vehicles, selectedLine, selectedVehicleId, showRouteForLine, onSelectVehicle }: Props) {
  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => !selectedLine || vehicle.line === selectedLine),
    [vehicles, selectedLine],
  );
  const highlightedRoutes = routes.filter((route) => !selectedLine || route.line === selectedLine);

  return (
    <div className="map-shell">
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
        {cityGrid.map((road, index) => (
          <Polyline key={`road-${index}`} positions={road.map(toLeafletPoint)} pathOptions={{ color: '#233145', weight: index === 4 ? 5 : 2, opacity: index === 4 ? 0.42 : 0.28 }} />
        ))}
        {highlightedRoutes.map((route) => (
          <Polyline key={route.id} positions={route.path.map(toLeafletPoint)} pathOptions={{ color: getLineColor(route.line), weight: showRouteForLine === route.line ? 7 : 4, opacity: showRouteForLine === route.line ? 0.92 : 0.45 }} />
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
            icon={createBusIcon(vehicle, vehicle.vehicleId === selectedVehicleId)}
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
        <RecenterButton />
        <FitRoute line={showRouteForLine} />
      </MapContainer>
    </div>
  );
}
