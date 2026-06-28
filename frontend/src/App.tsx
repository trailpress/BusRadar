import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import type { MapSearchSuggestion } from './components/AppHeader';
import { gtfsNetwork, type GtfsStop } from './data/gtfsNetwork';
import { useGtfsNetwork } from './data/useGtfsNetwork';
import { geocodeTransitArea, geocodeTransitSuggestions, type GeocodingResult } from './services/geocoding';
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
import { isVehicleFavorite, setVehicleFavorite } from './utils/vehicleFavorites';

function isIosLikeDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function App() {
  const { revision: gtfsRevision } = useGtfsNetwork();
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<'filter' | 'place'>('filter');
  const [searchLoading, setSearchLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodingResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
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
  const [userLocationAccuracy, setUserLocationAccuracy] = useState<number>();
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [toast, setToast] = useState<string>();
  const locationWatchRef = useRef<number | undefined>(undefined);
  const locationPermissionRef = useRef<PermissionStatus | undefined>(undefined);
  const latestLocationRef = useRef<{ point: LatLng; timestamp: number; accuracy: number } | undefined>(undefined);
  const pendingLocationRequestRef = useRef<Promise<LatLng | undefined> | undefined>(undefined);
  const locationSamplesRef = useRef<Array<{ point: LatLng; timestamp: number; accuracy: number }>>([]);

  const applyUserPosition = useCallback((position: GeolocationPosition) => {
    const timestamp = position.timestamp || Date.now();
    const accuracy = position.coords.accuracy;
    if (!Number.isFinite(accuracy) || accuracy > 150) return undefined;

    const sample = {
      point: { lat: position.coords.latitude, lon: position.coords.longitude },
      timestamp,
      accuracy,
    };
    const recentSamples = [...locationSamplesRef.current, sample]
      .filter((item) => timestamp - item.timestamp <= 12_000)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6);
    locationSamplesRef.current = recentSamples;

    const best = recentSamples[0];
    const compatibleSamples = recentSamples.filter(
      (item) => distanceMeters(best.point, item.point) <= Math.max(25, best.accuracy + item.accuracy),
    );
    const weighted = compatibleSamples.reduce(
      (total, item) => {
        const weight = 1 / Math.max(25, item.accuracy * item.accuracy);
        return {
          lat: total.lat + item.point.lat * weight,
          lon: total.lon + item.point.lon * weight,
          weight: total.weight + weight,
        };
      },
      { lat: 0, lon: 0, weight: 0 },
    );
    const point = weighted.weight > 0
      ? { lat: weighted.lat / weighted.weight, lon: weighted.lon / weighted.weight }
      : best.point;
    const previous = latestLocationRef.current;
    const previousIsFresh = previous && timestamp - previous.timestamp < 15_000;
    if (
      previousIsFresh
      && previous.accuracy <= 60
      && accuracy > Math.max(80, previous.accuracy * 1.8)
    ) {
      return previous.point;
    }
    if (previousIsFresh && previous.accuracy <= best.accuracy && distanceMeters(previous.point, point) < previous.accuracy) {
      return previous.point;
    }

    latestLocationRef.current = { point, timestamp, accuracy: best.accuracy };
    setHasUserLocation(true);
    setUserLocation(point);
    setUserLocationAccuracy(best.accuracy);
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
    const cachedIsUsable = Boolean(cached && Date.now() - cached.timestamp < 30_000 && cached.accuracy <= 60);
    if (cachedIsUsable && cached) {
      startLocationWatch();
      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyUserPosition(position);
          setShowLocationHelp(position.coords.accuracy > 80);
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 },
      );
      return Promise.resolve(cached.point);
    }

    if (pendingLocationRequestRef.current) return pendingLocationRequestRef.current;

    const request = new Promise<LatLng | undefined>((resolve) => {
      let bestPosition: GeolocationPosition | undefined;
      let settled = false;
      let watchId = 0;
      let deadline = 0;
      const finish = (position?: GeolocationPosition) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(deadline);
        navigator.geolocation.clearWatch(watchId);
        if (!position) {
          if (cachedIsUsable && cached) {
            startLocationWatch();
            resolve(cached.point);
            return;
          }
          setShowLocationHelp(true);
          notify('Chrome sta fornendo una posizione approssimativa');
          resolve(undefined);
          return;
        }
        const nextLocation = applyUserPosition(position);
        if (!nextLocation) {
          setShowLocationHelp(true);
          notify(`Posizione troppo imprecisa · errore ${Math.round(position.coords.accuracy)} m`);
          resolve(undefined);
          return;
        }
        const isApproximate = position.coords.accuracy > 80;
        setShowLocationHelp(isApproximate);
        startLocationWatch();
        notify(
          isApproximate
            ? `Posizione approssimativa · errore ${Math.round(position.coords.accuracy)} m`
            : `Posizione trovata · precisione ${Math.round(position.coords.accuracy)} m`,
        );
        resolve(nextLocation);
      };
      const failPermission = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(deadline);
        navigator.geolocation.clearWatch(watchId);
        setShowLocationHelp(true);
        notify('Consenti la posizione precisa nel browser e riprova');
        resolve(undefined);
      };
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) bestPosition = position;
          if (position.coords.accuracy <= 150) finish(position);
        },
        (error) => {
          if (error.code !== error.PERMISSION_DENIED) return;
          failPermission();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 },
      );
      deadline = window.setTimeout(
        () => finish(bestPosition && bestPosition.coords.accuracy <= 150 ? bestPosition : undefined),
        4500,
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
    let refreshTimer = 0;

    async function loadRealtimeVehicles() {
      let snapshot: Awaited<ReturnType<typeof fetchGttRealtimeVehicles>>;
      try {
        snapshot = await fetchGttRealtimeVehicles();
      } catch (error) {
        console.warn('[BusRadar] Caricamento mezzi realtime fallito, ritento', error);
        snapshot = undefined;
      } finally {
        if (cancelled) return;
      }
      if (snapshot) {
        setVehicles(snapshot.vehicles.map((vehicle) => ({
          ...vehicle,
          favorite: isVehicleFavorite(vehicle.vehicleId),
        })));
      }
      refreshTimer = window.setTimeout(loadRealtimeVehicles, snapshot ? 6_000 : 3_000);
    }

    void loadRealtimeVehicles();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
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
    [gtfsRevision, searchedArea],
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
  const searchSuggestions = useMemo<MapSearchSuggestion[]>(() => {
    const normalized = search.trim().toLowerCase();
    if (normalized.length < 2) return [];
    const bias = hasUserLocation ? userLocation : { lat: 45.0706, lon: 7.6867 };
    const suggestions: MapSearchSuggestion[] = [];

    gtfsNetwork.lines
      .filter((line) => line.id.toLowerCase().startsWith(normalized) || line.name.toLowerCase().includes(normalized))
      .slice(0, 3)
      .forEach((line) => suggestions.push({
        id: `line-${line.id}`,
        kind: 'line',
        label: `Linea ${line.id}`,
        detail: `${line.direction} ↔ ${line.alternateDirection}`,
        value: line.id,
        targetId: line.id,
      }));

      gtfsNetwork.stops
        .filter((stop) => stop.code.startsWith(normalized) || stop.name.toLowerCase().includes(normalized))
      .sort((a, b) => distanceMeters(bias, a) - distanceMeters(bias, b))
      .slice(0, 4)
      .forEach((stop) => suggestions.push({
        id: `stop-${stop.id}`,
        kind: 'stop',
        label: stop.name,
        detail: `Palina ${stop.code} · ${stop.lines.slice(0, 3).join(', ')}`,
        value: stop.name,
        targetId: stop.id,
      }));

    vehicles
      .filter((vehicle) => vehicle.vehicleId.includes(normalized) || vehicle.fleetNumber?.includes(normalized) || vehicle.direction.toLowerCase().includes(normalized))
      .slice(0, 3)
      .forEach((vehicle) => suggestions.push({
        id: `vehicle-${vehicle.vehicleId}`,
        kind: 'vehicle',
        label: `Vettura ${vehicle.fleetNumber ?? vehicle.vehicleId}`,
        detail: `Linea ${vehicle.line} · ${vehicle.direction}`,
        value: vehicle.fleetNumber ?? vehicle.vehicleId,
        targetId: vehicle.vehicleId,
      }));

    addressSuggestions.forEach((result, index) => suggestions.push({
      id: `place-${result.lat}-${result.lon}-${index}`,
      kind: 'place',
      label: result.label.split(',')[0],
      detail: result.label.split(',').slice(1).join(',').trim() || 'Area di Torino',
      value: result.label,
      lat: result.lat,
      lon: result.lon,
    }));
    return suggestions.slice(0, 9);
  }, [addressSuggestions, gtfsRevision, hasUserLocation, search, userLocation, vehicles]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 3 || searchMode === 'place') {
      setAddressSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      void geocodeTransitSuggestions(query, hasUserLocation ? userLocation : undefined)
        .then((results) => {
          if (!cancelled) setAddressSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setAddressSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSuggestionsLoading(false);
        });
    }, 550);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasUserLocation, search, searchMode, userLocation]);

  function openSearchedArea(result: GeocodingResult) {
    setSearchMode('place');
    setSearch(result.label);
    setAddressSuggestions([]);
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
  }

  function selectSearchSuggestion(suggestion: MapSearchSuggestion) {
    if (suggestion.kind === 'line') {
      const line = gtfsNetwork.lines.find((item) => item.id === suggestion.targetId);
      if (line) openLine(line);
      return;
    }
    if (suggestion.kind === 'stop') {
      const stop = gtfsNetwork.stops.find((item) => item.id === suggestion.targetId);
      if (stop) openStop(stop);
      return;
    }
    if (suggestion.kind === 'vehicle') {
      const vehicle = vehicles.find((item) => item.vehicleId === suggestion.targetId);
      if (vehicle) openVehicle(vehicle);
      return;
    }
    if (suggestion.lat != null && suggestion.lon != null) {
      openSearchedArea({ lat: suggestion.lat, lon: suggestion.lon, label: suggestion.value });
    }
  }

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
      const matchingStops = gtfsNetwork.stops
        .filter((stop) => stop.name.toLowerCase().includes(query.toLowerCase()) || stop.code === query)
        .sort((a, b) => distanceMeters(hasUserLocation ? userLocation : { lat: 45.0706, lon: 7.6867 }, a) - distanceMeters(hasUserLocation ? userLocation : { lat: 45.0706, lon: 7.6867 }, b));
      const exactStop = matchingStops.find((stop) => stop.code === query || stop.name.toLowerCase() === query.toLowerCase());
      if (exactStop || matchingStops.length === 1) {
        openStop(exactStop ?? matchingStops[0]);
        return;
      }

      const result = await geocodeTransitArea(query, hasUserLocation ? userLocation : undefined);
      if (!result) {
        notify('Luogo non trovato nell’area di Torino e cintura');
        return;
      }
      openSearchedArea(result);
    } catch {
      notify('Ricerca luogo temporaneamente non disponibile');
    } finally {
      setSearchLoading(false);
    }
  }

  function openVehicle(vehicle: Vehicle) {
    setSelectedStop(undefined);
    setFollowedVehicleId(undefined);
    setSelectedVehicleId(vehicle.vehicleId);
    setSelectedVehicleFallback(vehicle);
    setLineFilter(vehicle.line);
    setShowRouteForLine(vehicle.routeId.replace(/^gtt-/, ''));
    setMapFocus({ lat: vehicle.lat, lon: vehicle.lon });
    setActiveTab('map');
  }

  function toggleVehicleFavorite(vehicle: Vehicle) {
    const favorite = !isVehicleFavorite(vehicle.vehicleId);
    setVehicleFavorite(vehicle.vehicleId, favorite);
    setVehicles((current) => current.map((item) => (
      item.vehicleId === vehicle.vehicleId ? { ...item, favorite } : item
    )));
    setSelectedVehicleFallback((current) => (
      current?.vehicleId === vehicle.vehicleId ? { ...current, favorite } : current
    ));
    notify(`${vehicle.fleetNumber ? `Vettura ${vehicle.fleetNumber}` : 'Mezzo'} ${favorite ? 'aggiunto ai' : 'rimosso dai'} preferiti`);
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
          userLocationAccuracy={userLocationAccuracy}
          hasUserLocation={hasUserLocation}
          onLocateUser={requestUserLocation}
          showRouteForLine={showRouteForLine}
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setSearchMode('filter');
            setAddressSuggestions([]);
            setSearchedArea(undefined);
            setSelectedStop(undefined);
          }}
          onSearchSubmit={() => void submitMapSearch()}
          searchLoading={searchLoading}
          searchSuggestions={searchSuggestions}
          suggestionsLoading={suggestionsLoading}
          onSelectSearchSuggestion={selectSearchSuggestion}
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
            setSelectedVehicleId(undefined);
            setSelectedVehicleFallback(undefined);
            setFollowedVehicleId(vehicle.vehicleId);
            setMapFocus({ lat: vehicle.lat, lon: vehicle.lon });
            setLineFilter(vehicle.line);
            setShowRouteForLine(vehicle.routeId.replace(/^gtt-/, ''));
          }}
          onToggleVehicleFavorite={toggleVehicleFavorite}
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
      {activeTab === 'more' && (
        <RadarScreen
          vehicles={vehicles}
          userLocation={userLocation}
          hasUserLocation={hasUserLocation}
          onLocateUser={requestUserLocation}
          onSelectVehicle={trackVehicleFromRadar}
          onBack={() => setActiveTab('map')}
        />
      )}
      {showLocationHelp && (
        <div className="location-help" role="dialog" aria-label="Abilita posizione">
          <div>
            <strong>Abilita posizione precisa</strong>
            {isIosLikeDevice() ? (
              <>
                <span>Safari può mostrare il menu permessi solo dopo un tuo tocco. Verifica anche che “Posizione precisa” sia attiva.</span>
                <ol>
                  <li>Impostazioni iPhone</li>
                  <li>Privacy e sicurezza · Localizzazione</li>
                  <li>Safari</li>
                  <li>Durante l’uso e Posizione precisa</li>
                </ol>
              </>
            ) : (
              <>
                <span>Chrome può usare una posizione approssimativa anche quando il permesso risulta attivo.</span>
                <ol>
                  <li>Apri le informazioni del sito in Chrome</li>
                  <li>Autorizzazioni · Posizione</li>
                  <li>Seleziona Consenti</li>
                  <li>In Android attiva “Usa posizione precisa”</li>
                </ol>
              </>
            )}
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
