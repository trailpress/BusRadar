import type { LatLng, Vehicle } from '../types';
import { AppHeader } from '../components/AppHeader';
import { BusMap } from '../components/BusMap';
import { ServiceCard } from '../components/ServiceCard';
import { VehicleSheet } from '../components/VehicleSheet';

type Props = {
  vehicles: Vehicle[];
  selectedLine?: string;
  selectedVehicle?: Vehicle;
  followedVehicleId?: string;
  focusPoint?: LatLng;
  showRouteForLine?: string;
  search: string;
  onSearch: (value: string) => void;
  onRadar: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onClearVehicle: () => void;
  onFollowVehicle: (vehicle: Vehicle) => void;
  onShowRoute: (line: string) => void;
};

export function MapScreen({
  vehicles,
  selectedLine,
  selectedVehicle,
  followedVehicleId,
  focusPoint,
  showRouteForLine,
  search,
  onSearch,
  onRadar,
  onSelectVehicle,
  onClearVehicle,
  onFollowVehicle,
  onShowRoute,
}: Props) {
  return (
    <main className="screen map-screen">
      <BusMap
        vehicles={vehicles}
        selectedLine={selectedLine}
        selectedVehicleId={selectedVehicle?.vehicleId}
        followedVehicleId={followedVehicleId}
        focusPoint={focusPoint}
        showRouteForLine={showRouteForLine}
        onSelectVehicle={onSelectVehicle}
      />
      <AppHeader search={search} onSearch={onSearch} onRadar={onRadar} />
      <ServiceCard vehicles={vehicles} selectedLine={selectedLine} />
      {followedVehicleId && (
        <div className="follow-banner">
          <strong>Seguendo vettura {followedVehicleId}</strong>
          <span>La mappa resta centrata sul mezzo simulato</span>
        </div>
      )}
      {selectedVehicle && (
        <VehicleSheet
          vehicle={selectedVehicle}
          onClose={onClearVehicle}
          onFollow={() => onFollowVehicle(selectedVehicle)}
          onRoute={() => onShowRoute(selectedVehicle.line)}
        />
      )}
    </main>
  );
}
