import { Layers3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { GtfsStop } from '../data/gtfsNetwork';
import type { GeocodingResult } from '../services/geocoding';
import type { LatLng, Vehicle } from '../types';
import { AppHeader } from '../components/AppHeader';
import type { MapSearchSuggestion } from '../components/AppHeader';
import { BusMap } from '../components/BusMap';
import { ServiceCard } from '../components/ServiceCard';
import { VehicleSheet, type VehicleHeadwayInfo, type VehicleHeadwayPeer } from '../components/VehicleSheet';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicle?: Vehicle;
  selectedVehicleFallback?: Vehicle;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  userLocation: LatLng;
  userLocationAccuracy?: number;
  hasUserLocation: boolean;
  onLocateUser: () => Promise<LatLng | undefined>;
  showRouteForLine?: string;
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  searchLoading: boolean;
  searchSuggestions: MapSearchSuggestion[];
  suggestionsLoading: boolean;
  onSelectSearchSuggestion: (suggestion: MapSearchSuggestion) => void;
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
  onToggleVehicleFavorite: (vehicle: Vehicle) => void;
  onShowRoute: (vehicle: Vehicle) => void;
  onResetMap: () => void;
};

function sameVehicleRunGroup(a: Vehicle, b: Vehicle) {
  if (a.vehicleId === b.vehicleId) return false;
  if (a.routeShortName !== b.routeShortName) return false;

  if (a.routeVariantId && b.routeVariantId) return a.routeVariantId === b.routeVariantId;
  if (a.shapeId && b.shapeId) return a.shapeId === b.shapeId;

  const aDirection = (a.terminalName ?? a.direction).trim().toLowerCase();
  const bDirection = (b.terminalName ?? b.direction).trim().toLowerCase();
  return aDirection.length > 0 && aDirection === bDirection;
}

function routeOrderValue(vehicle: Vehicle) {
  if (Number.isFinite(vehicle.progress)) return vehicle.progress;
  if (vehicle.remainingKm != null && Number.isFinite(vehicle.remainingKm)) return -vehicle.remainingKm;
  return undefined;
}

function estimatedGap(current: Vehicle, peer: Vehicle, relation: 'ahead' | 'behind') {
  if (current.remainingKm != null && peer.remainingKm != null) {
    const distanceKm = Math.abs(current.remainingKm - peer.remainingKm);
    const movingSpeeds = [current.speed, peer.speed].filter((speed) => speed >= 5 && speed <= 65);
    const speedKmh = movingSpeeds.length
      ? movingSpeeds.reduce((sum, speed) => sum + speed, 0) / movingSpeeds.length
      : 18;
    return {
      minutes: Math.max(1, Math.round((distanceKm / speedKmh) * 60)),
      distanceKm: Math.round(distanceKm * 10) / 10,
      basis: 'position' as const,
    };
  }

  if (current.etaTerminalMinutes != null && peer.etaTerminalMinutes != null) {
    const etaGap = relation === 'ahead'
      ? current.etaTerminalMinutes - peer.etaTerminalMinutes
      : peer.etaTerminalMinutes - current.etaTerminalMinutes;
    if (Number.isFinite(etaGap)) {
      return { minutes: Math.max(0, Math.round(Math.abs(etaGap))), basis: 'eta' as const };
    }
  }

  return { basis: 'unavailable' as const };
}

function headwayPeer(vehicle: Vehicle, gap: ReturnType<typeof estimatedGap>): VehicleHeadwayPeer {
  return {
    vehicleId: vehicle.vehicleId,
    label: vehicle.fleetNumber ? `Vettura ${vehicle.fleetNumber}` : `Mezzo ${vehicle.vehicleId}`,
    minutes: gap.minutes,
    distanceKm: gap.distanceKm,
  };
}

function buildVehicleHeadway(vehicle: Vehicle, vehicles: Vehicle[]): VehicleHeadwayInfo {
  const currentOrder = routeOrderValue(vehicle);
  if (currentOrder == null) {
    return { peerCount: 0, basis: 'unavailable' };
  }

  const rankedVehicles = [vehicle, ...vehicles.filter((candidate) => sameVehicleRunGroup(vehicle, candidate))]
    .map((candidate) => ({
      vehicle: candidate,
      order: routeOrderValue(candidate),
      eta: candidate.etaTerminalMinutes ?? Number.POSITIVE_INFINITY,
    }))
    .filter((candidate): candidate is { vehicle: Vehicle; order: number; eta: number } => candidate.order != null)
    .sort((a, b) => {
      const orderGap = a.order - b.order;
      if (Math.abs(orderGap) > 0.0001) return orderGap;
      const etaGap = a.eta - b.eta;
      if (Number.isFinite(etaGap) && Math.abs(etaGap) > 0.01) return etaGap;
      return a.vehicle.vehicleId.localeCompare(b.vehicle.vehicleId);
    });

  const currentIndex = rankedVehicles.findIndex((candidate) => candidate.vehicle.vehicleId === vehicle.vehicleId);
  if (currentIndex < 0 || rankedVehicles.length < 2) {
    return { peerCount: rankedVehicles.length, basis: 'unavailable' };
  }

  const aheadCandidate = rankedVehicles[currentIndex + 1];
  const behindCandidate = currentIndex > 0
    ? rankedVehicles[currentIndex - 1]
    : undefined;
  const aheadGap = aheadCandidate ? estimatedGap(vehicle, aheadCandidate.vehicle, 'ahead') : undefined;
  const behindGap = behindCandidate ? estimatedGap(vehicle, behindCandidate.vehicle, 'behind') : undefined;
  const basis = aheadGap?.basis === 'eta' || behindGap?.basis === 'eta'
    ? 'eta'
    : aheadGap?.basis === 'position' || behindGap?.basis === 'position'
      ? 'position'
      : 'unavailable';

  return {
    ahead: aheadCandidate && aheadGap ? headwayPeer(aheadCandidate.vehicle, aheadGap) : undefined,
    behind: behindCandidate && behindGap ? headwayPeer(behindCandidate.vehicle, behindGap) : undefined,
    peerCount: rankedVehicles.length,
    basis,
  };
}

export function MapScreen({
  vehicles,
  selectedLine,
  selectedVehicle,
  selectedVehicleFallback,
  followedVehicleId,
  focusPoint,
  userLocation,
  userLocationAccuracy,
  hasUserLocation,
  onLocateUser,
  showRouteForLine,
  search,
  onSearch,
  onSearchSubmit,
  searchLoading,
  searchSuggestions,
  suggestionsLoading,
  onSelectSearchSuggestion,
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
  onToggleVehicleFavorite,
  onShowRoute,
  onResetMap,
}: Props) {
  const [stopPopupOpen, setStopPopupOpen] = useState(false);
  const detailVehicle = selectedVehicle ?? selectedVehicleFallback;
  const vehicleHeadway = useMemo(
    () => detailVehicle ? buildVehicleHeadway(detailVehicle, vehicles) : undefined,
    [detailVehicle, vehicles],
  );
  return (
    <main className="screen map-screen">
      <BusMap
        vehicles={vehicles}
        selectedLine={selectedLine}
        selectedVehicleId={(selectedVehicle ?? selectedVehicleFallback)?.vehicleId}
        followedVehicleId={followedVehicleId}
        focusPoint={focusPoint}
        userLocation={userLocation}
        userLocationAccuracy={userLocationAccuracy}
        hasUserLocation={hasUserLocation}
        onLocateUser={onLocateUser}
        showRouteForLine={showRouteForLine}
        searchedArea={searchedArea}
        selectedStop={selectedStop}
        selectedStopRequest={selectedStopRequest}
        onSelectVehicle={onSelectVehicle}
        onSelectLine={onSelectAreaLine}
        onStopPopupOpenChange={setStopPopupOpen}
        onResetMap={onResetMap}
      />
      <AppHeader
        search={search}
        onSearch={onSearch}
        onSearchSubmit={onSearchSubmit}
        searchLoading={searchLoading}
        suggestions={searchSuggestions}
        suggestionsLoading={suggestionsLoading}
        onSelectSuggestion={onSelectSearchSuggestion}
        onRadar={onRadar}
      />
      {searchedArea && !stopPopupOpen && (
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
      {!stopPopupOpen && !searchedArea && !followedVehicleId && (
        <ServiceCard vehicles={vehicles} selectedLine={selectedLine} />
      )}
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
      {!followedVehicleId && detailVehicle && (
        <VehicleSheet
          vehicle={detailVehicle}
          headway={vehicleHeadway}
          onClose={onClearVehicle}
          onFollow={() => onFollowVehicle(detailVehicle)}
          onToggleFavorite={() => onToggleVehicleFavorite(detailVehicle)}
          onRoute={() => onShowRoute(detailVehicle)}
        />
      )}
    </main>
  );
}
