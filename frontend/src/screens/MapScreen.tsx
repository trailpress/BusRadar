import { Layers3 } from 'lucide-react';
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
  nearbyLines: string[];
  nearbyVehicleCount: number;
  onClearSearchedArea: () => void;
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
  nearbyLines,
  nearbyVehicleCount,
  onClearSearchedArea,
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
        onSelectVehicle={onSelectVehicle}
        onResetMap={onResetMap}
      />
      <AppHeader search={search} onSearch={onSearch} onSearchSubmit={onSearchSubmit} searchLoading={searchLoading} onRadar={onRadar} />
      {searchedArea && (
        <aside className="search-area-summary">
          <button type="button" aria-label="Chiudi area cercata" onClick={onClearSearchedArea}>×</button>
          <strong>{searchedArea.label}</strong>
          <span>{nearbyVehicleCount} mezzi realtime · {nearbyStopCount} fermate entro 1,2 km</span>
          <div>
            {nearbyLines.slice(0, 9).map((line) => <i key={line}>{line}</i>)}
            {nearbyLines.length > 9 && <em>+{nearbyLines.length - 9}</em>}
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
