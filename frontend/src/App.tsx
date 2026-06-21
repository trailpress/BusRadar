import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { gtfsNetwork, type GtfsStop } from './data/gtfsNetwork';
import { geocodeTransitArea, type GeocodingResult } from './services/geocoding';
import { fetchGttRealtimeVehicles } from './services/gttRealtime';
import { LineDetailScreen } from './screens/LineDetailScreen';
import { LinesScreen } from './screens/LinesScreen';
import { MapScreen } from './screens/MapScreen';
import { MoreScreen } from './screens/MoreScreen';
import { RadarScreen } from './screens/RadarScreen';
import { StopsScreen } from './screens/StopsScreen';
import { VehiclesScreen } from './screens/VehiclesScreen';
import type { LatLng, Stop, TabKey, TransitLine, Vehicle } from './types';
import { distanceMeters } from './utils/geo';
import { notify } from './utils/notify';

function isIosLikeDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<'filter' | 'place'>('filter');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedArea, setSearchedArea] = useState<GeocodingResult>();
  const [selectedStop, setSelectedStop] = useState<GtfsStop>();
  const [selectedStopRequest, setSelectedStopRequest] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const [selectedVehicleFallback, setSelectedVehicleFallback] = useState<Vehicle>();
  const [selectedLine, setSelectedLine] = useState<TransitLine>();
  const [lineFilter, setLineFilter] = useState<string>();
  const [showRouteForLine, setShowRouteForLine] = useState<string>();
  const [followedVehicleId, setFollowedVehicleId] = useState<string>();
  const [mapFocus, setMapFocus] = useState<LatLng>();
  const [userLocation, setUserLocation] = useState<LatLng>({ lat: 45.0706, lon: 7.6867 });
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [toast, setToast] = useState<string>();
  const locationWatchRef = useRef<number | undefined>(undefined);
  const locationPermissionRef = useRef<PermissionStatus | undefined>(undefined);
  const latestLocationRef = useRef<{ point: LatLng; timestamp: number; accuracy: number } | undefined>(undefined);
  const pendingLocationRequestRef = useRef<Promise<LatLng | undefined> | undefined>(undefined);

  const applyUserPosition = useCallback((position: GeolocationPosition) => {
    const point = { lat: position.coords.latitude, lon: position.coords.longitude };
    latestLocationRef.current = {
      point,
      timestamp: position.timestamp || Date.now(),
      accuracy: position.coords.accuracy,
    };
    setHasUserLocation(true);
    setUserLocation(point);
    return point;
  }, []);

  const startLocationWatch = useCallback(() => {
    if (!navigator.geolocation) return;
    if (locationWatchRef.current != null) return;
    locationWatchRef.current = navigator.geolocation.watchPosition(
      applyUserPosition,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          locationWatchRef.current = undefined;
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );
  }, [applyUserPosition]);

  const restartLocationWatch = useCallback(() => {
    if (locationWatchRef.current != null) {
      navigator.geolocation?.clearWatch(locationWatchRef.current);
      locationWatchRef.current = undefined;
    }
    startLocationWatch();
  }, [startLocationWatch]);

  const refreshLocationPermission = useCallback(async () => {
    if (!navigator.permissions?.query || !navigator.geolocation) return;
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      locationPermissionRef.current = permission;
      if (permission.state === 'granted') {
        setShowLocationHelp(false);
        restartLocationWatch();
      }
    } catch {
      // Safari may omit Permissions API: a previously authorized watch can still restart.
      if (latestLocationRef.current) restartLocationWatch();
    }
  }, [restartLocationWatch]);

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      notify('Geolocalizzazione non disponibile su questo browser');
      if (isIosLikeDevice()) setShowLocationHelp(true);
      return Promise.resolve(undefined);
    }

    const isSecure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isSecure) {
      notify('Apri BusRadar in HTTPS per usare la posizione su iPhone');
      if (isIosLikeDevice()) setShowLocationHelp(true);
      return Promise.resolve(undefined);
    }

    const cached = latestLocationRef.current;
    const cachedIsUsable = cached && Date.now() - cached.timestamp < 120_000;
    if (cachedIsUsable) {
      startLocationWatch();
      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyUserPosition(position);
          setShowLocationHelp(false);
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
      return Promise.resolve(cached.point);
    }

    if (pendingLocationRequestRef.current) return pendingLocationRequestRef.current;

    const request = new Promise<LatLng | undefined>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation = applyUserPosition(position);
          setShowLocationHelp(false);
          startLocationWatch();
          notify(`Posizione trovata · precisione ${Math.round(position.coords.accuracy)} m`);
          resolve(nextLocation);
        },
        (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? 'Consenti la posizione per Safari/iPhone e riprova'
            : error.code === error.TIMEOUT
              ? 'GPS lento: riprova tra qualche secondo'
              : 'Posizione iPhone non disponibile ora';
          if (isIosLikeDevice() || error.code === error.PERMISSION_DENIED) setShowLocationHelp(true);
          notify(message);
          resolve(undefined);
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5000 },
      );
    }).finally(() => {
      pendingLocationRequestRef.current = undefined;
    });

    pendingLocationRequestRef.current = request;
    return request;
  }, [applyUserPosition, startLocationWatch]);

  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then((permission) => {
        locationPermissionRef.current = permission;
        if (permission.state === 'granted') restartLocationWatch();
        permission.onchange = () => {
          if (permission.state === 'granted') {
            setShowLocationHelp(false);
            restartLocationWatch();
          }
        };
      })
      .catch(() => undefined);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshLocationPermission();
    };
    window.addEventListener('focus', refreshLocationPermission);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (locationWatchRef.current != null) navigator.geolocation?.clearWatch(locationWatchRef.current);
      if (locationPermissionRef.current) locationPermissionRef.current.onchange = null;
      window.removeEventListener('focus', refreshLocationPermission);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshLocationPermission, restartLocationWatch]);

  useEffect(() => {
    let cancelled = false;

    async function loadRealtimeVehicles() {
      const snapshot = await fetchGttRealtimeVehicles();
      if (cancelled) return;
      if (!snapshot) {
        return;
      }
      setVehicles(snapshot.vehicles);
    }

    void loadRealtimeVehicles();
    const id = window.setInterval(loadRealtimeVehicles, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
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
    if (searchMode === 'place') return vehicles;
    const normalized = search.trim().toLowerCase();
    if (!normalized) return vehicles;
    return vehicles.filter(
      (vehicle) =>
        vehicle.vehicleId.includes(normalized) ||
        vehicle.line.includes(normalized) ||
        vehicle.direction.toLowerCase().includes(normalized),
    );
  }, [vehicles, search, searchMode]);
  const nearbyAreaStops = useMemo(
    () => searchedArea
      ? gtfsNetwork.stops
        .map((stop) => ({ stop, distance: distanceMeters(searchedArea, stop) }))
        .filter((item) => item.distance <= 1200)
        .sort((a, b) => a.distance - b.distance)
      : [],
    [searchedArea],
  );
  const nearbyAreaVehicles = useMemo(
    () => searchedArea
      ? vehicles.filter((vehicle) => distanceMeters(searchedArea, vehicle) <= 1200)
      : [],
    [searchedArea, vehicles],
  );
  const nearbyAreaLines = useMemo(
    () => [...new Set([
      ...nearbyAreaStops.flatMap(({ stop }) => stop.lines),
      ...nearbyAreaVehicles.map((vehicle) => vehicle.line),
    ])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [nearbyAreaStops, nearbyAreaVehicles],
  );

  async function submitMapSearch() {
    const query = search.trim();
    if (!query) return;

    const exactVehicle = vehicles.find((vehicle) => vehicle.vehicleId === query || vehicle.fleetNumber === query);
    if (exactVehicle) {
      setSearchMode('filter');
      setSearchedArea(undefined);
      setSelectedStop(undefined);
      openVehicle(exactVehicle);
      return;
    }
    const exactLine = gtfsNetwork.lines.find((line) => line.id.toLowerCase() === query.toLowerCase());
    if (exactLine) {
      setSearchMode('filter');
      setSearchedArea(undefined);
      setSelectedStop(undefined);
      openLine(exactLine);
      return;
    }

    setSearchLoading(true);
    try {
      const result = await geocodeTransitArea(query);
      if (!result) {
        notify('Luogo non trovato nell’area di Torino e cintura');
        return;
      }
      setSearchMode('place');
      setSearchedArea(result);
      setSelectedStop(undefined);
      setMapFocus({ lat: result.lat, lon: result.lon });
      setSelectedVehicleId(undefined);
      setSelectedVehicleFallback(undefined);
      setFollowedVehicleId(undefined);
      setLineFilter(undefined);
      setShowRouteForLine(undefined);
      setActiveTab('map');
      notify(`Area trovata: ${result.label}`);
    } catch {
      notify('Ricerca luogo temporaneamente non disponibile');
    } finally {
      setSearchLoading(false);
    }
  }

  function openVehicle(vehicle: Vehicle) {
    setSelectedStop(undefined);
    setSelectedVehicleId(vehicle.vehicleId);
    setSelectedVehicleFallback(vehicle);
    setLineFilter(vehicle.line);
    setShowRouteForLine(vehicle.routeId.replace(/^gtt-/, ''));
    setMapFocus({ lat: vehicle.lat, lon: vehicle.lon });
    setActiveTab('map');
  }

  function trackVehicleFromRadar(vehicle: Vehicle) {
    setSelectedVehicleId(undefined);
    setSelectedVehicleFallback(undefined);
    setFollowedVehicleId(vehicle.vehicleId);
    setLineFilter(vehicle.line);
    setShowRouteForLine(vehicle.routeId.replace(/^gtt-/, ''));
    setActiveTab('map');
    notify(`Linea ${vehicle.line} in movimento sul radar`);
  }

  function openLine(line: TransitLine) {
    setSelectedStop(undefined);
    setSelectedLine(line);
    setSelectedVehicleFallback(undefined);
    setLineFilter(line.id);
    setShowRouteForLine(line.id);
    notify(`Linea ${line.id} selezionata`);
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    if (tab !== 'map') {
      setSelectedVehicleId(undefined);
      setSelectedVehicleFallback(undefined);
    }
    if (tab !== 'lines') setSelectedLine(undefined);
    if (tab !== 'map') setFollowedVehicleId(undefined);
  }

  function openStop(stop: Stop) {
    setSelectedStop(gtfsNetwork.stops.find((item) => item.id === stop.id));
    setSelectedLine(undefined);
    setMapFocus({ lat: stop.lat, lon: stop.lon });
    setSelectedVehicleId(undefined);
    setSelectedVehicleFallback(undefined);
    setFollowedVehicleId(undefined);
    setLineFilter(undefined);
    setShowRouteForLine(undefined);
    setActiveTab('map');
    notify(`Fermata ${stop.name} centrata sulla mappa`);
  }

  if (selectedLine) {
    return (
      <div className="app-shell">
        <LineDetailScreen line={selectedLine} vehicles={vehicles} userLocation={userLocation} onBack={() => setSelectedLine(undefined)} onSelectVehicle={openVehicle} onSelectStop={openStop} />
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
          selectedVehicleFallback={selectedVehicleFallback}
          followedVehicleId={followedVehicleId}
          focusPoint={mapFocus}
          userLocation={userLocation}
          hasUserLocation={hasUserLocation}
          onLocateUser={requestUserLocation}
          showRouteForLine={showRouteForLine}
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setSearchMode('filter');
            setSearchedArea(undefined);
            setSelectedStop(undefined);
          }}
          onSearchSubmit={() => void submitMapSearch()}
          searchLoading={searchLoading}
          searchedArea={searchedArea}
          nearbyStopCount={nearbyAreaStops.length}
          nearbyStops={nearbyAreaStops}
          nearbyLines={nearbyAreaLines}
          nearbyVehicleCount={nearbyAreaVehicles.length}
          onClearSearchedArea={() => {
            setSearchedArea(undefined);
            setSelectedStop(undefined);
            setSearchMode('filter');
            setSearch('');
          }}
          onSelectAreaLine={(line) => {
            const realtimeCount = vehicles.filter((vehicle) => vehicle.line === line).length;
            setSelectedStop(undefined);
            setSelectedVehicleId(undefined);
            setSelectedVehicleFallback(undefined);
            setFollowedVehicleId(undefined);
            setLineFilter(line);
            setShowRouteForLine(line);
            setActiveTab('map');
            notify(
              realtimeCount > 0
                ? `Linea ${line}: ${realtimeCount} mezzi realtime sul percorso`
                : `Linea ${line}: percorso programmato, nessun mezzo realtime ora`,
            );
          }}
          selectedStop={selectedStop}
          selectedStopRequest={selectedStopRequest}
          onSelectAreaStop={(stop) => {
            setSelectedStop(stop);
            setSelectedStopRequest((request) => request + 1);
            setMapFocus({ lat: stop.lat, lon: stop.lon });
            notify(`Palina ${stop.code}: carico i passaggi`);
          }}
          onRadar={() => setActiveTab('more')}
          onSelectVehicle={openVehicle}
          onClearVehicle={() => {
            setSelectedVehicleId(undefined);
            setSelectedVehicleFallback(undefined);
          }}
          onFollowVehicle={(vehicle) => {
            setSelectedVehicleId(vehicle.vehicleId);
            setSelectedVehicleFallback(vehicle);
            setFollowedVehicleId(vehicle.vehicleId);
            setMapFocus({ lat: vehicle.lat, lon: vehicle.lon });
            setLineFilter(vehicle.line);
            setShowRouteForLine(vehicle.routeId.replace(/^gtt-/, ''));
          }}
          onShowRoute={(vehicle) => {
            const routeKey = vehicle.routeVariantId || vehicle.routeId.replace(/^gtt-/, '') || vehicle.line;
            setSelectedLine(undefined);
            setSelectedStop(undefined);
            setSelectedVehicleId(undefined);
            setSelectedVehicleFallback(undefined);
            setFollowedVehicleId(undefined);
            setLineFilter(vehicle.line);
            setShowRouteForLine(routeKey);
            setMapFocus(undefined);
            setActiveTab('map');
            notify(`Percorso linea ${vehicle.line} mostrato sulla mappa`);
          }}
          onResetMap={() => {
            setSelectedVehicleId(undefined);
            setSelectedVehicleFallback(undefined);
            setFollowedVehicleId(undefined);
            setLineFilter(undefined);
            setShowRouteForLine(undefined);
            setSelectedLine(undefined);
            setMapFocus(undefined);
            setSearch('');
            setSearchMode('filter');
            setSearchedArea(undefined);
            setSelectedStop(undefined);
            notify('Vista generale: tutte le linee');
          }}
        />
      )}
      {activeTab === 'lines' && <LinesScreen vehicles={vehicles} onSelectLine={openLine} />}
      {activeTab === 'stops' && <StopsScreen onSelectStop={openStop} />}
      {activeTab === 'vehicles' && <VehiclesScreen vehicles={vehicles} onSelectVehicle={openVehicle} />}
      {activeTab === 'more' && <RadarScreen vehicles={vehicles} userLocation={userLocation} onSelectVehicle={trackVehicleFromRadar} onBack={() => setActiveTab('map')} />}
      {showLocationHelp && (
        <div className="location-help" role="dialog" aria-label="Abilita posizione">
          <div>
            <strong>Abilita posizione su iPhone</strong>
            <span>Safari puo mostrare il menu permessi solo dopo un tuo tocco. Se hai gia negato, abilita da Impostazioni.</span>
            <ol>
              <li>Impostazioni iPhone</li>
              <li>Privacy e sicurezza</li>
              <li>Localizzazione</li>
              <li>Safari: Consenti durante l'uso</li>
            </ol>
            <div>
              <button type="button" onClick={() => void requestUserLocation()}>Riprova autorizzazione</button>
              <button type="button" className="secondary" onClick={() => setShowLocationHelp(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}

export default App;
