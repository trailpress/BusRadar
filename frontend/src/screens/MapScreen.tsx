import { Layers3 } from 'lucide-react';
import type { GtfsStop } from '../data/gtfsNetwork';
import type { GeocodingResult } from '../services/geocoding';
import type { LatLng, Vehicle } from '../types';
import { AppHeader } from '../components/AppHeader';
import { BusMap } from '../components/BusMap';
import { ServiceCard } from '../components/ServiceCard';
import { VehicleSheet } from '../components/VehicleSheet';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicle?: Vehicle;
  selectedVehicleFallback?: Vehicle;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  userLocation: LatLng;
  hasUserLocation: boolean;
  onLocateUser: () => Promise<LatLng | undefined>;
  showRouteForLine?: string;
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  searchLoading: boolean;
  searchedArea?: GeocodingResult;
  nearbyStopCount: number;
  nearbyStops: Array<{ stop: GtfsStop; distance: number }>;
  nearbyLines: string[];
  nearbyVehicleCount: number;
  onClearSearchedArea: () => void;
  onSelectAreaLine: (line: string) => void;
  onSelectAreaStop: (stop: GtfsStop) => void;
  selectedStop?: GtfsStop;
  selectedStopRequest: number;
  onRadar: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onClearVehicle: () => void;
  onFollowVehicle: (vehicle: Vehicle) => void;
  onShowRoute: (line: string) => void;
  onResetMap: () => void;
};

export function MapScreen({
  vehicles,
  selectedLine,
  selectedVehicle,
  selectedVehicleFallback,
  followedVehicleId,
  focusPoint,
  userLocation,
  hasUserLocation,
  onLocateUser,
  showRouteForLine,
  search,
  onSearch,
  onSearchSubmit,
  searchLoading,
  searchedArea,
  nearbyStopCount,
  nearbyStops,
  nearbyLines,
  nearbyVehicleCount,
  onClearSearchedArea,
  onSelectAreaLine,
  onSelectAreaStop,
  selectedStop,
  selectedStopRequest,
  onRadar,
  onSelectVehicle,
  onClearVehicle,
  onFollowVehicle,
  onShowRoute,
  onResetMap,
}: Props) {
  return (
    <main className="screen map-screen">
      <BusMap
        vehicles={vehicles}
        selectedLine={selectedLine}
        selectedVehicleId={(selectedVehicle ?? selectedVehicleFallback)?.vehicleId}
        followedVehicleId={followedVehicleId}
        focusPoint={focusPoint}
        userLocation={userLocation}
        hasUserLocation={hasUserLocation}
        onLocateUser={onLocateUser}
        showRouteForLine={showRouteForLine}
        searchedArea={searchedArea}
        selectedStop={selectedStop}
        selectedStopRequest={selectedStopRequest}
        onSelectVehicle={onSelectVehicle}
        onResetMap={onResetMap}
      />
      <AppHeader search={search} onSearch={onSearch} onSearchSubmit={onSearchSubmit} searchLoading={searchLoading} onRadar={onRadar} />
      {searchedArea && (
        <aside className="search-area-summary">
          <button type="button" aria-label="Chiudi area cercata" onClick={onClearSearchedArea}>×</button>
          <strong>{searchedArea.label}</strong>
          <span>{nearbyVehicleCount} mezzi realtime · {nearbyStopCount} fermate entro 1,2 km</span>
          <div className="search-area-lines">
            {nearbyLines.map((line) => (
              <button
                type="button"
                className={selectedLine === line ? 'is-active' : undefined}
                key={line}
                onClick={() => onSelectAreaLine(line)}
                aria-pressed={selectedLine === line}
                aria-label={`Mostra linea ${line} e mezzi realtime`}
              >
                {line}
              </button>
            ))}
          </div>
          <div className="search-area-stops">
            {nearbyStops.slice(0, 8).map(({ stop, distance }) => (
              <button type="button" key={stop.id} onClick={() => onSelectAreaStop(stop)}>
                <span><strong>{stop.name}</strong><small>Palina {stop.code} · {Math.round(distance)} m</small></span>
                <em>{stop.lines.slice(0, 3).join(' · ') || 'Info'}</em>
              </button>
            ))}
          </div>
          <small>Ricerca e dati cartografici © OpenStreetMap</small>
        </aside>
      )}
      <ServiceCard vehicles={vehicles} selectedLine={selectedLine} />
      {(selectedLine || showRouteForLine || followedVehicleId) && (
        <button type="button" className={`map-reset-button${followedVehicleId ? ' with-follow' : ''}`} onClick={onResetMap}>
          <Layers3 size={16} />
          Tutte le linee
        </button>
      )}
      {followedVehicleId && (
        <div className="follow-banner">
          <strong>Seguendo vettura {followedVehicleId}</strong>
          <span>La mappa resta centrata sul mezzo realtime</span>
        </div>
      )}
      {(selectedVehicle ?? selectedVehicleFallback) && (
        <VehicleSheet
          vehicle={(selectedVehicle ?? selectedVehicleFallback)!}
          onClose={onClearVehicle}
          onFollow={() => {
            onFollowVehicle((selectedVehicle ?? selectedVehicleFallback)!);
            onClearVehicle();
          }}
          onRoute={() => onShowRoute((selectedVehicle ?? selectedVehicleFallback)!.line)}
        />
      )}
    </main>
  );
}
