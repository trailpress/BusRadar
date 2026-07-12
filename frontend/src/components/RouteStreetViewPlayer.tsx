import { AlertTriangle, Gauge, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GtfsRouteVariant } from '../data/gtfsNetwork';
import type { LatLng } from '../types';
import { bearingDegrees, distanceMeters } from '../utils/geo';
import { LineBadge } from './LineBadge';

type Props = {
  route?: GtfsRouteVariant;
};

type StreetViewFrame = {
  point: LatLng;
  bearing: number;
  distanceMeters: number;
};

type PanoramaResult = {
  point: LatLng;
  pano: string;
  offRouteMeters: number;
};

type MapillaryImageResult = {
  id: string;
  imageUrl: string;
  point: LatLng;
  offRouteMeters: number;
  compassAngle?: number;
  isPano?: boolean;
};

type StreetViewUsage = {
  month: string;
  events: number;
};

type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

type GoogleStreetViewStatus = {
  OK: string;
};

type GoogleStreetViewService = {
  getPanorama: (
    request: { location: { lat: number; lng: number }; radius: number },
    callback: (data: { location?: { latLng?: GoogleLatLng; pano?: string } } | null, status: string) => void,
  ) => void;
};

type GoogleStreetViewPanorama = {
  setPano: (pano: string) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
  setPov: (pov: { heading: number; pitch: number }) => void;
  setZoom: (zoom: number) => void;
};

type GoogleMapsWindow = {
  maps: {
    StreetViewPanorama: new (
      element: HTMLElement,
      options: {
        addressControl: boolean;
        clickToGo: boolean;
        disableDefaultUI: boolean;
        fullscreenControl: boolean;
        linksControl: boolean;
        motionTracking: boolean;
        motionTrackingControl: boolean;
        panControl: boolean;
        pov: { heading: number; pitch: number };
        showRoadLabels: boolean;
        zoom: number;
      },
    ) => GoogleStreetViewPanorama;
    StreetViewService: new () => GoogleStreetViewService;
    StreetViewStatus: GoogleStreetViewStatus;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsWindow;
    __busRadarGoogleMapsPromise?: Promise<void>;
  }
}

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const mapillaryAccessToken = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN as string | undefined;
const routePreviewProvider = (import.meta.env.VITE_ROUTE_PREVIEW_PROVIDER ?? 'auto') as 'auto' | 'mapillary' | 'google';
const panoramaSearchRadiusMeters = 70;
const mapillarySearchRadiusMeters = 85;
const mapillaryMaxHeadingDeltaDegrees = 70;
const frameStepMeters = 85;
const minSpeedKmh = 5;
const maxSpeedKmh = 60;
const freeMonthlyDynamicStreetViewEvents = 5000;
const dynamicStreetViewUsdPer1000AfterFree = 14;
const usageStoragePrefix = 'busradar:street-view-usage';

const panoramaCache = new Map<string, PanoramaResult | null>();
const mapillaryImageCache = new Map<string, MapillaryImageResult | null>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolatePosition(a: LatLng, b: LatLng, progress: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * progress,
    lon: a.lon + (b.lon - a.lon) * progress,
  };
}

function buildStreetViewFrames(path: LatLng[]) {
  if (path.length < 2) return { frames: [] as StreetViewFrame[], totalMeters: 0 };

  const frames: StreetViewFrame[] = [];
  let traveledBeforeSegment = 0;
  let nextSampleDistance = 0;

  path.slice(0, -1).forEach((start, index) => {
    const end = path[index + 1];
    const segmentMeters = distanceMeters(start, end);
    if (segmentMeters <= 0) return;
    const bearing = bearingDegrees(start, end);
    const segmentEndDistance = traveledBeforeSegment + segmentMeters;

    while (nextSampleDistance <= segmentEndDistance) {
      const localProgress = clamp((nextSampleDistance - traveledBeforeSegment) / segmentMeters, 0, 1);
      frames.push({
        point: interpolatePosition(start, end, localProgress),
        bearing,
        distanceMeters: nextSampleDistance,
      });
      nextSampleDistance += frameStepMeters;
    }

    traveledBeforeSegment = segmentEndDistance;
  });

  const lastPoint = path[path.length - 1];
  const previousPoint = path[path.length - 2];
  const totalMeters = traveledBeforeSegment;
  const lastFrame = frames[frames.length - 1];
  if (!lastFrame || Math.abs(lastFrame.distanceMeters - totalMeters) > 4) {
    frames.push({
      point: lastPoint,
      bearing: bearingDegrees(previousPoint, lastPoint),
      distanceMeters: totalMeters,
    });
  }

  return { frames, totalMeters };
}

function frameIndexAtDistance(frames: StreetViewFrame[], distance: number) {
  if (frames.length === 0) return 0;
  let bestIndex = 0;
  for (let index = 1; index < frames.length; index += 1) {
    if (Math.abs(frames[index].distanceMeters - distance) < Math.abs(frames[bestIndex].distanceMeters - distance)) {
      bestIndex = index;
    }
    if (frames[index].distanceMeters > distance) break;
  }
  return bestIndex;
}

function cacheKey(routeId: string, frame: StreetViewFrame) {
  return `${routeId}:${frame.point.lat.toFixed(5)}:${frame.point.lon.toFixed(5)}`;
}

function currentUsageMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function usageStorageKey(month = currentUsageMonth()) {
  return `${usageStoragePrefix}:${month}`;
}

function readStreetViewUsage(): StreetViewUsage {
  const month = currentUsageMonth();
  try {
    const stored = window.localStorage.getItem(usageStorageKey(month));
    const parsed = stored ? JSON.parse(stored) as Partial<StreetViewUsage> : undefined;
    return {
      month,
      events: Math.max(0, Math.floor(Number(parsed?.events) || 0)),
    };
  } catch {
    return { month, events: 0 };
  }
}

function writeStreetViewUsage(usage: StreetViewUsage) {
  try {
    window.localStorage.setItem(usageStorageKey(usage.month), JSON.stringify(usage));
  } catch {
    // If storage is blocked, keep the in-memory counter visible for this session.
  }
}

function reserveStreetViewEvent(currentUsage: StreetViewUsage) {
  if (currentUsage.events >= freeMonthlyDynamicStreetViewEvents) return undefined;
  const nextUsage = { ...currentUsage, events: currentUsage.events + 1 };
  writeStreetViewUsage(nextUsage);
  return nextUsage;
}

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (!apiKey) return Promise.reject(new Error('missing-api-key'));
  if (window.__busRadarGoogleMapsPromise) return window.__busRadarGoogleMapsPromise;

  window.__busRadarGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('google-maps-load-failed'));
    document.head.append(script);
  });

  return window.__busRadarGoogleMapsPromise;
}

function hasMapillaryProvider() {
  return routePreviewProvider !== 'google' && Boolean(mapillaryAccessToken);
}

function hasGoogleProvider() {
  return routePreviewProvider !== 'mapillary' && Boolean(apiKey);
}

function routePreviewProviderLabel() {
  if (hasMapillaryProvider()) return 'Mapillary';
  if (hasGoogleProvider()) return 'Google';
  return 'Nessuna sorgente';
}

function bboxAroundPoint(point: LatLng, radiusMeters: number) {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  return [
    point.lon - longitudeDelta,
    point.lat - latitudeDelta,
    point.lon + longitudeDelta,
    point.lat + latitudeDelta,
  ].join(',');
}

function headingDeltaDegrees(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

async function findMapillaryImage(routeId: string, frame: StreetViewFrame) {
  const key = `mapillary:${cacheKey(routeId, frame)}`;
  if (mapillaryImageCache.has(key)) return mapillaryImageCache.get(key) ?? null;
  if (!mapillaryAccessToken) return null;

  const url = new URL('https://graph.mapillary.com/images');
  url.searchParams.set('access_token', mapillaryAccessToken);
  url.searchParams.set('fields', 'id,computed_geometry,thumb_2048_url,computed_compass_angle,is_pano');
  url.searchParams.set('bbox', bboxAroundPoint(frame.point, mapillarySearchRadiusMeters));
  url.searchParams.set('limit', '30');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      mapillaryImageCache.set(key, null);
      return null;
    }

    const payload = await response.json() as {
      data?: Array<{
        id?: string;
        computed_geometry?: { coordinates?: [number, number] };
        thumb_2048_url?: string;
        computed_compass_angle?: number;
        is_pano?: boolean;
      }>;
    };

    const candidates = (payload.data ?? [])
      .map((image): MapillaryImageResult | undefined => {
        const coordinates = image.computed_geometry?.coordinates;
        if (!image.id || !image.thumb_2048_url || !coordinates || !Number.isFinite(image.computed_compass_angle)) return undefined;
        const point = { lon: coordinates[0], lat: coordinates[1] };
        const offRouteMeters = distanceMeters(frame.point, point);
        if (offRouteMeters > mapillarySearchRadiusMeters) return undefined;
        const headingDelta = headingDeltaDegrees(image.computed_compass_angle ?? 0, frame.bearing);
        if (headingDelta > mapillaryMaxHeadingDeltaDegrees) return undefined;
        return {
          id: image.id,
          imageUrl: image.thumb_2048_url,
          point,
          offRouteMeters,
          compassAngle: image.computed_compass_angle,
          isPano: image.is_pano,
        };
      })
      .filter((image): image is MapillaryImageResult => Boolean(image))
      .sort((a, b) => {
        const aHeadingDelta = headingDeltaDegrees(a.compassAngle ?? frame.bearing, frame.bearing);
        const bHeadingDelta = headingDeltaDegrees(b.compassAngle ?? frame.bearing, frame.bearing);
        const aScore = a.offRouteMeters + aHeadingDelta * 1.4 + (a.isPano ? -18 : 12);
        const bScore = b.offRouteMeters + bHeadingDelta * 1.4 + (b.isPano ? -18 : 12);
        return aScore - bScore;
      });

    const result = candidates[0] ?? null;
    mapillaryImageCache.set(key, result);
    return result;
  } catch {
    mapillaryImageCache.set(key, null);
    return null;
  }
}

function findPanorama(service: GoogleStreetViewService, routeId: string, frame: StreetViewFrame) {
  const key = cacheKey(routeId, frame);
  if (panoramaCache.has(key)) return Promise.resolve(panoramaCache.get(key) ?? null);

  return new Promise<PanoramaResult | null>((resolve) => {
    service.getPanorama(
      {
        location: { lat: frame.point.lat, lng: frame.point.lon },
        radius: panoramaSearchRadiusMeters,
      },
      (data, status) => {
        if (status !== window.google?.maps.StreetViewStatus.OK || !data?.location?.latLng || !data.location.pano) {
          panoramaCache.set(key, null);
          resolve(null);
          return;
        }

        const panoramaPoint = { lat: data.location.latLng.lat(), lon: data.location.latLng.lng() };
        const result = {
          point: panoramaPoint,
          pano: data.location.pano,
          offRouteMeters: distanceMeters(frame.point, panoramaPoint),
        };
        panoramaCache.set(key, result);
        resolve(result);
      },
    );
  });
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function cleanHeadsign(value: string) {
  return value.replace(/^NULL,?\s*/i, '').trim() || 'Direzione non disponibile';
}

export function RouteStreetViewPlayer({ route }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<GoogleStreetViewPanorama | undefined>(undefined);
  const serviceRef = useRef<GoogleStreetViewService | undefined>(undefined);
  const animationRef = useRef<number | undefined>(undefined);
  const lastAnimationAtRef = useRef<number | undefined>(undefined);
  const distanceRef = useRef(0);
  const requestIdRef = useRef(0);
  const lastDisplayedPanoRef = useRef<string | undefined>(undefined);
  const [readyState, setReadyState] = useState<'idle' | 'loading' | 'ready' | 'missing-key' | 'error'>('idle');
  const [coverageState, setCoverageState] = useState<'idle' | 'searching' | 'covered' | 'missing' | 'blocked'>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(25);
  const [playing, setPlaying] = useState(false);
  const [offRouteMeters, setOffRouteMeters] = useState<number>();
  const [mapillaryImage, setMapillaryImage] = useState<MapillaryImageResult>();
  const [activeSource, setActiveSource] = useState<'none' | 'mapillary' | 'google'>('none');
  const [usage, setUsage] = useState<StreetViewUsage>(() => (
    typeof window === 'undefined' ? { month: currentUsageMonth(), events: 0 } : readStreetViewUsage()
  ));
  const { frames, totalMeters } = useMemo(() => buildStreetViewFrames(route?.path ?? []), [route]);
  const currentFrame = frames[currentIndex];
  const progress = totalMeters > 0 && currentFrame ? currentFrame.distanceMeters / totalMeters : 0;
  const remainingFreeEvents = Math.max(0, freeMonthlyDynamicStreetViewEvents - usage.events);
  const googleCostBlocked = remainingFreeEvents <= 0;

  useEffect(() => {
    setPlaying(false);
    setCurrentIndex(0);
    distanceRef.current = 0;
    setCoverageState('idle');
    setOffRouteMeters(undefined);
    setMapillaryImage(undefined);
    setActiveSource('none');
    lastDisplayedPanoRef.current = undefined;
  }, [route?.id]);

  useEffect(() => {
    if (!containerRef.current || !route || frames.length === 0) return undefined;
    let cancelled = false;

    if (hasMapillaryProvider()) {
      setReadyState('ready');
      return () => {
        cancelled = true;
      };
    }

    if (!hasGoogleProvider()) {
      setReadyState('missing-key');
      return () => {
        cancelled = true;
      };
    }

    setReadyState('loading');

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        panoramaRef.current ??= new window.google.maps.StreetViewPanorama(containerRef.current, {
          addressControl: false,
          clickToGo: true,
          disableDefaultUI: false,
          fullscreenControl: true,
          linksControl: true,
          motionTracking: false,
          motionTrackingControl: false,
          panControl: true,
          pov: { heading: frames[0].bearing, pitch: -3 },
          showRoadLabels: true,
          zoom: 1,
        });
        serviceRef.current ??= new window.google.maps.StreetViewService();
        setReadyState('ready');
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setReadyState(error.message === 'missing-api-key' ? 'missing-key' : 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [frames, route]);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const showGoogleFrame = async () => {
      if (!route || !currentFrame || !containerRef.current || !hasGoogleProvider()) return false;
      if (googleCostBlocked) {
        setCoverageState('blocked');
        setPlaying(false);
        setActiveSource('google');
        return true;
      }

      await loadGoogleMaps();
      if (!containerRef.current || !window.google?.maps) return false;
      panoramaRef.current ??= new window.google.maps.StreetViewPanorama(containerRef.current, {
        addressControl: false,
        clickToGo: true,
        disableDefaultUI: false,
        fullscreenControl: true,
        linksControl: true,
        motionTracking: false,
        motionTrackingControl: false,
        panControl: true,
        pov: { heading: frames[0]?.bearing ?? currentFrame.bearing, pitch: -3 },
        showRoadLabels: true,
        zoom: 1,
      });
      serviceRef.current ??= new window.google.maps.StreetViewService();

      const result = await findPanorama(serviceRef.current, route.id, currentFrame);
      if (cancelled || requestId !== requestIdRef.current || !panoramaRef.current) return true;
      if (!result) return false;

      if (result.pano !== lastDisplayedPanoRef.current) {
        const nextUsage = reserveStreetViewEvent(readStreetViewUsage());
        if (!nextUsage) {
          setUsage(readStreetViewUsage());
          setCoverageState('blocked');
          setPlaying(false);
          return;
        }
        setUsage(nextUsage);
        lastDisplayedPanoRef.current = result.pano;
        panoramaRef.current.setPano(result.pano);
      }
      panoramaRef.current.setPosition({ lat: result.point.lat, lng: result.point.lon });
      panoramaRef.current.setPov({ heading: currentFrame.bearing, pitch: -4 });
      panoramaRef.current.setZoom(1);
      setOffRouteMeters(result.offRouteMeters);
      setMapillaryImage(undefined);
      setActiveSource('google');
      setCoverageState('covered');
      return true;
    };

    if (readyState !== 'ready' || !route || !currentFrame) return undefined;

    setCoverageState('searching');

    (async () => {
      if (hasMapillaryProvider()) {
        const image = await findMapillaryImage(route.id, currentFrame);
        if (cancelled || requestId !== requestIdRef.current) return;
        if (image) {
          setMapillaryImage(image);
          setOffRouteMeters(image.offRouteMeters);
          setActiveSource('mapillary');
          setCoverageState('covered');
          return;
        }
      }

      const googleCovered = await showGoogleFrame();
      if (cancelled || requestId !== requestIdRef.current) return;
      if (!googleCovered) {
        setMapillaryImage(undefined);
        setOffRouteMeters(undefined);
        setActiveSource('none');
        setCoverageState('missing');
      }
    })().catch(() => {
      if (cancelled || requestId !== requestIdRef.current) return;
      setMapillaryImage(undefined);
      setOffRouteMeters(undefined);
      setActiveSource('none');
      setCoverageState('missing');
    });

    return () => {
      cancelled = true;
    };
  }, [currentFrame, frames, googleCostBlocked, readyState, route]);

  useEffect(() => {
    if (!playing || frames.length < 2 || totalMeters <= 0) return undefined;

    const step = (timestamp: number) => {
      if (!lastAnimationAtRef.current) lastAnimationAtRef.current = timestamp;
      const elapsedSeconds = Math.min(1.4, (timestamp - lastAnimationAtRef.current) / 1000);
      lastAnimationAtRef.current = timestamp;
      distanceRef.current = clamp(distanceRef.current + (speedKmh / 3.6) * elapsedSeconds, 0, totalMeters);
      const nextIndex = frameIndexAtDistance(frames, distanceRef.current);
      setCurrentIndex((previous) => (previous === nextIndex ? previous : nextIndex));

      if (distanceRef.current >= totalMeters) {
        setPlaying(false);
        lastAnimationAtRef.current = undefined;
        return;
      }
      animationRef.current = window.requestAnimationFrame(step);
    };

    animationRef.current = window.requestAnimationFrame(step);
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      lastAnimationAtRef.current = undefined;
    };
  }, [frames, playing, speedKmh, totalMeters]);

  const goToIndex = (index: number) => {
    const nextIndex = clamp(index, 0, Math.max(0, frames.length - 1));
    setCurrentIndex(nextIndex);
    distanceRef.current = frames[nextIndex]?.distanceMeters ?? 0;
  };

  const progressChange = (value: number) => {
    const nextDistance = clamp(value, 0, 100) / 100 * totalMeters;
    distanceRef.current = nextDistance;
    setCurrentIndex(frameIndexAtDistance(frames, nextDistance));
  };

  if (!route) {
    return (
      <section className="street-view-panel">
        <div className="street-view-empty">
          <AlertTriangle size={20} />
          <strong>Seleziona una direzione della linea</strong>
          <span>La vista strada usa un solo capolinea alla volta per mantenere corretta la direzione di marcia.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="street-view-panel" aria-label={`Vista strada linea ${route.line}`}>
      <div className="street-view-header">
        <LineBadge line={route.line} />
        <div>
          <strong>{cleanHeadsign(route.headsign)}</strong>
          <span>{formatDistance(totalMeters)} · {frames.length} punti guida</span>
        </div>
        <em className={`street-coverage-pill is-${coverageState}`}>
          {coverageState === 'blocked' ? 'Google bloccato' : coverageState === 'covered' && offRouteMeters != null ? `${activeSource === 'mapillary' ? 'Mapillary' : 'Google'} a ${Math.round(offRouteMeters)} m` : coverageState === 'missing' ? 'tratto non coperto' : coverageState === 'searching' ? 'cerco foto' : routePreviewProviderLabel()}
        </em>
      </div>

      {hasMapillaryProvider() && (
        <div className="street-view-cost-guard is-free-source">
          <div>
            <strong>Mapillary attivo</strong>
            <span>Nessun consumo Google</span>
          </div>
          <small>Il player prova prima Mapillary. Se una tratta non ha immagini e Google e configurato, Google viene usato solo come fallback controllato.</small>
        </div>
      )}

      {hasGoogleProvider() && (
        <div className="street-view-cost-guard">
          <div>
            <strong>Fallback Google</strong>
            <span>{remainingFreeEvents.toLocaleString('it-IT')} panorami rimasti su {freeMonthlyDynamicStreetViewEvents.toLocaleString('it-IT')} questo mese</span>
          </div>
          <meter min="0" max={freeMonthlyDynamicStreetViewEvents} value={usage.events} aria-label="Uso mensile Street View" />
          <small>Dopo la soglia gratuita stimata, Google indica circa {dynamicStreetViewUsdPer1000AfterFree} USD ogni 1.000 panorami Dynamic Street View. Il blocco forte va impostato anche nelle quote Google Cloud.</small>
        </div>
      )}

      <div className="street-view-frame">
        <div ref={containerRef} className={`street-view-canvas${mapillaryImage ? ' is-hidden' : ''}`} />
        {mapillaryImage && (
          <>
            <img className="street-view-mapillary-image" src={mapillaryImage.imageUrl} alt={`Anteprima Mapillary linea ${route.line}`} />
            <span className="street-view-mapillary-credit">Mapillary contributors</span>
          </>
        )}
        {readyState === 'missing-key' && (
          <div className="street-view-overlay">
            <AlertTriangle size={22} />
            <strong>Serve una sorgente immagini</strong>
            <span>Imposta `VITE_MAPILLARY_ACCESS_TOKEN` per usare Mapillary. Google resta opzionale con `VITE_GOOGLE_MAPS_API_KEY` solo come fallback.</span>
          </div>
        )}
        {readyState === 'loading' && (
          <div className="street-view-overlay">
            <strong>Carico anteprima percorso...</strong>
          </div>
        )}
        {readyState === 'error' && (
          <div className="street-view-overlay">
            <AlertTriangle size={22} />
            <strong>Anteprima non disponibile</strong>
            <span>Controlla connessione, token Mapillary o chiave Google opzionale.</span>
          </div>
        )}
        {readyState === 'ready' && coverageState === 'blocked' && (
          <div className="street-view-overlay">
            <AlertTriangle size={22} />
            <strong>Soglia gratuita raggiunta</strong>
            <span>Mapillary non ha trovato immagini per questo punto e il fallback Google è fermo per evitare costi. Puoi proseguire sul percorso: il player continuerà a cercare foto Mapillary nei punti successivi.</span>
          </div>
        )}
        {readyState === 'ready' && coverageState === 'missing' && (
          <div className="street-view-corner-warning">
            <AlertTriangle size={15} />
            <span>Nessuna foto frontale affidabile entro {Math.max(mapillarySearchRadiusMeters, panoramaSearchRadiusMeters)} m</span>
          </div>
        )}
      </div>

      <div className="street-view-console">
        <div className="street-view-controls">
          <button type="button" aria-label="Torna all'inizio" onClick={() => goToIndex(0)}>
            <RotateCcw size={18} />
          </button>
          <button type="button" aria-label="Punto precedente" onClick={() => goToIndex(currentIndex - 1)}>
            <SkipBack size={18} />
          </button>
          <button className="street-view-play" type="button" aria-label={playing ? 'Pausa' : 'Avvia'} onClick={() => setPlaying((value) => !value)} disabled={readyState !== 'ready' || frames.length < 2}>
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          <button type="button" aria-label="Punto successivo" onClick={() => goToIndex(currentIndex + 1)}>
            <SkipForward size={18} />
          </button>
        </div>

        <label className="street-view-range">
          <span>{formatDistance(currentFrame?.distanceMeters ?? 0)}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={Number.isFinite(progress) ? progress * 100 : 0}
            onChange={(event) => progressChange(Number(event.target.value))}
          />
          <span>{formatDistance(totalMeters)}</span>
        </label>

        <label className="street-view-speed">
          <Gauge size={16} />
          <span>{speedKmh} km/h</span>
          <input
            type="range"
            min={minSpeedKmh}
            max={maxSpeedKmh}
            step="1"
            value={speedKmh}
            onChange={(event) => setSpeedKmh(Number(event.target.value))}
          />
        </label>
      </div>
    </section>
  );
}
