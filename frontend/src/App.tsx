import { useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { lines, vehicles as seedVehicles } from './data/demoData';
import { advanceVehicles } from './services/simulation';
import { LineDetailScreen } from './screens/LineDetailScreen';
import { LinesScreen } from './screens/LinesScreen';
import { MapScreen } from './screens/MapScreen';
import { MoreScreen } from './screens/MoreScreen';
import { RadarScreen } from './screens/RadarScreen';
import { StopsScreen } from './screens/StopsScreen';
import { VehiclesScreen } from './screens/VehiclesScreen';
import type { LatLng, Stop, TabKey, TransitLine, Vehicle } from './types';
import { notify } from './utils/notify';

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [vehicles, setVehicles] = useState(seedVehicles);
  const [search, setSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const [selectedLine, setSelectedLine] = useState<TransitLine>();
  const [lineFilter, setLineFilter] = useState<string>();
  const [showRouteForLine, setShowRouteForLine] = useState<string>();
  const [followedVehicleId, setFollowedVehicleId] = useState<string>();
  const [mapFocus, setMapFocus] = useState<LatLng>();
  const [toast, setToast] = useState<string>();

  useEffect(() => {
    const id = window.setInterval(() => setVehicles((current) => advanceVehicles(current)), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      setToast((event as CustomEvent<string>).detail);
      window.setTimeout(() => setToast(undefined), 2200);
    };
    window.addEventListener('busradar:toast', onToast);
    return () => window.removeEventListener('busradar:toast', onToast);
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
    notify(`Vettura ${vehicle.vehicleId} aperta`);
  }

  function trackVehicleFromRadar(vehicle: Vehicle) {
    setSelectedVehicleId(undefined);
    setFollowedVehicleId(vehicle.vehicleId);
    setLineFilter(vehicle.line);
    setShowRouteForLine(vehicle.line);
    setActiveTab('map');
    notify(`Linea ${vehicle.line} in movimento sul radar`);
  }

  function openLine(line: TransitLine) {
    setSelectedLine(line);
    setLineFilter(line.id);
    setShowRouteForLine(line.id);
    notify(`Linea ${line.id} selezionata`);
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    if (tab !== 'map') setSelectedVehicleId(undefined);
    if (tab !== 'lines') setSelectedLine(undefined);
    if (tab !== 'map') setFollowedVehicleId(undefined);
  }

  function openStop(stop: Stop) {
    setMapFocus({ lat: stop.lat, lon: stop.lon });
    setSelectedVehicleId(undefined);
    setFollowedVehicleId(undefined);
    setLineFilter(undefined);
    setShowRouteForLine(undefined);
    setActiveTab('map');
    notify(`Fermata ${stop.name} centrata sulla mappa`);
  }

  if (selectedLine) {
    return (
      <div className="app-shell">
        <LineDetailScreen line={selectedLine} vehicles={vehicles} onBack={() => setSelectedLine(undefined)} onSelectVehicle={openVehicle} />
        {toast && <div className="toast">{toast}</div>}
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
          followedVehicleId={followedVehicleId}
          focusPoint={mapFocus}
          showRouteForLine={showRouteForLine}
          search={search}
          onSearch={setSearch}
          onRadar={() => setActiveTab('more')}
          onSelectVehicle={openVehicle}
          onClearVehicle={() => setSelectedVehicleId(undefined)}
          onFollowVehicle={(vehicle) => {
            setSelectedVehicleId(undefined);
            setFollowedVehicleId(vehicle.vehicleId);
            setLineFilter(vehicle.line);
            setShowRouteForLine(vehicle.line);
            notify(`Segui vettura ${vehicle.vehicleId} attivo`);
          }}
          onShowRoute={(line) => {
            const routeLine = lines.find((item) => item.id === line);
            if (routeLine) setSelectedLine(routeLine);
            setShowRouteForLine(line);
            setLineFilter(line);
            setSelectedVehicleId(undefined);
            setFollowedVehicleId(undefined);
            notify(`Percorso linea ${line} mostrato`);
          }}
        />
      )}
      {activeTab === 'lines' && <LinesScreen vehicles={vehicles} onSelectLine={openLine} />}
      {activeTab === 'stops' && <StopsScreen onSelectStop={openStop} />}
      {activeTab === 'vehicles' && <VehiclesScreen vehicles={vehicles} onSelectVehicle={openVehicle} />}
      {activeTab === 'more' && <RadarScreen vehicles={vehicles} onSelectVehicle={trackVehicleFromRadar} onBack={() => setActiveTab('map')} />}
      {toast && <div className="toast">{toast}</div>}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}

export default App;
