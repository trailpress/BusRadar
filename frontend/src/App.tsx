import { useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { vehicles as seedVehicles } from './data/demoData';
import { advanceVehicles } from './services/simulation';
import { LineDetailScreen } from './screens/LineDetailScreen';
import { LinesScreen } from './screens/LinesScreen';
import { MapScreen } from './screens/MapScreen';
import { MoreScreen } from './screens/MoreScreen';
import { RadarScreen } from './screens/RadarScreen';
import { StopsScreen } from './screens/StopsScreen';
import { VehiclesScreen } from './screens/VehiclesScreen';
import type { TabKey, TransitLine, Vehicle } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [vehicles, setVehicles] = useState(seedVehicles);
  const [search, setSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const [selectedLine, setSelectedLine] = useState<TransitLine>();
  const [lineFilter, setLineFilter] = useState<string>();
  const [showRouteForLine, setShowRouteForLine] = useState<string>();

  useEffect(() => {
    const id = window.setInterval(() => setVehicles((current) => advanceVehicles(current)), 1800);
    return () => window.clearInterval(id);
  }, []);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );

  const searchedVehicles = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return vehicles;
    return vehicles.filter(
      (vehicle) =>
        vehicle.vehicleId.includes(normalized) ||
        vehicle.line.includes(normalized) ||
        vehicle.direction.toLowerCase().includes(normalized),
    );
  }, [vehicles, search]);

  function openVehicle(vehicle: Vehicle) {
    setSelectedVehicleId(vehicle.vehicleId);
    setLineFilter(vehicle.line);
    setActiveTab('map');
  }

  function openLine(line: TransitLine) {
    setSelectedLine(line);
    setLineFilter(line.id);
    setShowRouteForLine(line.id);
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    if (tab !== 'map') setSelectedVehicleId(undefined);
    if (tab !== 'lines') setSelectedLine(undefined);
  }

  if (selectedLine) {
    return (
      <div className="app-shell">
        <LineDetailScreen line={selectedLine} vehicles={vehicles} onBack={() => setSelectedLine(undefined)} onSelectVehicle={openVehicle} />
        <BottomNav active="lines" onChange={handleTabChange} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {activeTab === 'map' && (
        <MapScreen
          vehicles={searchedVehicles}
          selectedLine={lineFilter}
          selectedVehicle={selectedVehicle}
          showRouteForLine={showRouteForLine}
          search={search}
          onSearch={setSearch}
          onRadar={() => setActiveTab('more')}
          onSelectVehicle={openVehicle}
          onClearVehicle={() => setSelectedVehicleId(undefined)}
          onFollowVehicle={(vehicle) => {
            setSelectedVehicleId(vehicle.vehicleId);
            setLineFilter(vehicle.line);
          }}
          onShowRoute={(line) => {
            setShowRouteForLine(line);
            setLineFilter(line);
          }}
        />
      )}
      {activeTab === 'lines' && <LinesScreen vehicles={vehicles} onSelectLine={openLine} />}
      {activeTab === 'stops' && <StopsScreen />}
      {activeTab === 'vehicles' && <VehiclesScreen vehicles={vehicles} onSelectVehicle={openVehicle} />}
      {activeTab === 'more' && <RadarScreen vehicles={vehicles} onSelectVehicle={openVehicle} />}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}

export default App;
