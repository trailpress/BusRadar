import { AlertTriangle, Gauge, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GtfsRouteVariant } from '../data/gtfsNetwork';
import type { LatLng } from '../types';
import { bearingDegrees, distanceMeters, routeProgressAtPoint } from '../utils/geo';
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
  progressDeltaMeters: number;
  headingDeltaDegrees: number;
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

type RoutePreviewProvider = 'auto' | 'mapillary' | 'google';

type RoutePreviewRuntimeConfig = {
  googleMapsApiKey?: string;
  mapillaryAccessToken?: string;
  provider: RoutePreviewProvider;
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
    request: {
      location: { lat: number; lng: number };
      preference?: string;
      radius: number;
      source?: string;
    },
    callback: (data: { location?: { latLng?: GoogleLatLng; pano?: string } } | null, status: string) => void,
  ) => void;
};

type GoogleStreetViewPanorama = {
  addListener: (eventName: string, handler: () => void) => { remove: () => void };
  getStatus?: () => string;
  setPano: (pano: string) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
  setPov: (pov: { heading: number; pitch: number }) => void;
  setZoom: (zoom: number) => void;
};

type PanoramaLayer = 0 | 1;

type QueuedPanorama = {
  routeId: string;
  result: PanoramaResult;
  bearing: number;
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
    StreetViewPreference?: {
      NEAREST: string;
    };
    StreetViewService: new () => GoogleStreetViewService;
    StreetViewSource?: {
      OUTDOOR: string;
    };
    StreetViewStatus: GoogleStreetViewStatus;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsWindow;
    gm_authFailure?: () => void;
    __busRadarGoogleMapsLoaded?: () => void;
    __busRadarGoogleMapsFailed?: boolean;
    __busRadarGoogleMapsPromise?: Promise<void>;
  }
}

const fallbackRoutePreviewProvider = (import.meta.env.VITE_ROUTE_PREVIEW_PROVIDER ?? 'auto') as RoutePreviewProvider;
const routePreviewConfigUrl = import.meta.env.VITE_ROUTE_PREVIEW_CONFIG_URL
  ?? 'https://mtuwzlbxhmpnqpaahity.supabase.co/functions/v1/route-preview-config';
const panoramaSearchRadiusMeters = 32;
const mapillarySearchRadiusMeters = 55;
const mapillaryMaxHeadingDeltaDegrees = 42;
const frameStepMeters = 6;
const googleMaxOffRouteMeters = 22;
const googleMaxProgressDeltaMeters = 42;
const googleMaxHeadingDeltaDegrees = 55;
const googleCandidateFrameOffsets = [0, 1, -1, 2, -2, 3, -3];
const panoramaMinStepMeters = 14;
const panoramaMinIntervalMs = 650;
const panoramaReadyDelayMs = 180;
const panoramaLoadTimeoutMs = 4_000;
const panoramaFadeDurationMs = 360;
const minSpeedKmh = 5;
const maxSpeedKmh = 60;
const freeMonthlyDynamicStreetViewEvents = 5000;
const usageStoragePrefix = 'busradar:street-view-usage';
const googleMapsAuthFailureEvent = 'busradar:google-maps-auth-failure';
const googleMapsCallbackName = '__busRadarGoogleMapsLoaded';
const googleMapsLoadTimeoutMs = 15_000;

const panoramaCache = new Map<string, PanoramaResult | null>();
const rawPanoramaCache = new Map<string, Omit<PanoramaResult, 'progressDeltaMeters' | 'headingDeltaDegrees'> | null>();
const mapillaryImageCache = new Map<string, MapillaryImageResult | null>();
let routePreviewConfigPromise: Promise<RoutePreviewRuntimeConfig> | undefined;

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

function normalizeRoutePreviewProvider(value: unknown): RoutePreviewProvider {
  return value === 'google' || value === 'mapillary' || value === 'auto' ? value : fallbackRoutePreviewProvider;
}

function hasRuntimeValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function loadRoutePreviewConfig(): Promise<RoutePreviewRuntimeConfig> {
  if (routePreviewConfigPromise) return routePreviewConfigPromise;

  routePreviewConfigPromise = fetch(routePreviewConfigUrl, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`route-preview-config-${response.status}`);
      const payload = await response.json() as Partial<RoutePreviewRuntimeConfig>;
      return {
        googleMapsApiKey: hasRuntimeValue(payload.googleMapsApiKey) ? payload.googleMapsApiKey : undefined,
        mapillaryAccessToken: hasRuntimeValue(payload.mapillaryAccessToken) ? payload.mapillaryAccessToken : undefined,
        provider: normalizeRoutePreviewProvider(payload.provider),
      };
    })
    .catch(() => ({
      provider: fallbackRoutePreviewProvider,
    }));

  return routePreviewConfigPromise;
}

function loadGoogleMaps(apiKey?: string) {
  if (window.__busRadarGoogleMapsFailed) return Promise.reject(new Error('google-maps-auth-failed'));
  if (window.google?.maps) return Promise.resolve();
  if (!apiKey) return Promise.reject(new Error('missing-api-key'));
  if (window.__busRadarGoogleMapsPromise) return window.__busRadarGoogleMapsPromise;

  window.__busRadarGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const previousAuthFailure = window.gm_authFailure;
    let settled = false;
    let timeoutId: number | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (error) {
        window.__busRadarGoogleMapsPromise = undefined;
        reject(error);
        return;
      }
      resolve();
    };

    window.gm_authFailure = () => {
      window.__busRadarGoogleMapsFailed = true;
      previousAuthFailure?.();
      window.dispatchEvent(new Event(googleMapsAuthFailureEvent));
      finish(new Error('google-maps-auth-failed'));
    };

    window.__busRadarGoogleMapsLoaded = () => {
      if (!window.google?.maps) {
        finish(new Error('google-maps-load-failed'));
        return;
      }
      finish();
    };

    const parameters = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: googleMapsCallbackName,
      language: 'it',
      region: 'IT',
    });
    script.dataset.busradarGoogleMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters.toString()}`;
    script.async = true;
    script.onerror = () => {
      window.__busRadarGoogleMapsFailed = true;
      window.dispatchEvent(new Event(googleMapsAuthFailureEvent));
      finish(new Error('google-maps-load-failed'));
    };
    timeoutId = window.setTimeout(() => {
      finish(new Error('google-maps-timeout'));
    }, googleMapsLoadTimeoutMs);
    document.head.append(script);
  });

  return window.__busRadarGoogleMapsPromise;
}

function hasMapillaryProvider(config: RoutePreviewRuntimeConfig) {
  return config.provider !== 'google' && Boolean(config.mapillaryAccessToken);
}

function hasGoogleProvider(config: RoutePreviewRuntimeConfig) {
  return config.provider !== 'mapillary' && Boolean(config.googleMapsApiKey);
}

function prefersGoogleProvider(config: RoutePreviewRuntimeConfig) {
  return hasGoogleProvider(config) && config.provider !== 'mapillary';
}

function prefersMapillaryProvider(config: RoutePreviewRuntimeConfig) {
  return hasMapillaryProvider(config) && !prefersGoogleProvider(config);
}

function routePreviewProviderLabel(config: RoutePreviewRuntimeConfig) {
  if (hasGoogleProvider(config)) return 'Google';
  if (hasMapillaryProvider(config)) return 'Mapillary';
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

async function findMapillaryImage(accessToken: string | undefined, routeId: string, frame: StreetViewFrame) {
  const key = `mapillary:${cacheKey(routeId, frame)}`;
  if (mapillaryImageCache.has(key)) return mapillaryImageCache.get(key) ?? null;
  if (!accessToken) return null;

  const url = new URL('https://graph.mapillary.com/images');
  url.searchParams.set('access_token', accessToken);
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

function scoreGooglePanorama(result: PanoramaResult) {
  return (
    result.offRouteMeters * 3.2 +
    result.progressDeltaMeters * 1.15 +
    result.headingDeltaDegrees * 1.5
  );
}

function requestRawPanorama(service: GoogleStreetViewService, routeId: string, frame: StreetViewFrame) {
  const key = `raw:${cacheKey(routeId, frame)}`;
  if (rawPanoramaCache.has(key)) return Promise.resolve(rawPanoramaCache.get(key) ?? null);

  return new Promise<Omit<PanoramaResult, 'progressDeltaMeters' | 'headingDeltaDegrees'> | null>((resolve) => {
    service.getPanorama(
      {
        location: { lat: frame.point.lat, lng: frame.point.lon },
        preference: window.google?.maps.StreetViewPreference?.NEAREST,
        radius: panoramaSearchRadiusMeters,
        source: window.google?.maps.StreetViewSource?.OUTDOOR,
      },
      (data, status) => {
        if (status !== window.google?.maps.StreetViewStatus.OK || !data?.location?.latLng || !data.location.pano) {
          rawPanoramaCache.set(key, null);
          resolve(null);
          return;
        }

        const panoramaPoint = { lat: data.location.latLng.lat(), lon: data.location.latLng.lng() };
        const result = {
          point: panoramaPoint,
          pano: data.location.pano,
          offRouteMeters: distanceMeters(frame.point, panoramaPoint),
        };
        rawPanoramaCache.set(key, result);
        resolve(result);
      },
    );
  });
}

async function findPanorama(
  service: GoogleStreetViewService,
  route: GtfsRouteVariant,
  frames: StreetViewFrame[],
  frameIndex: number,
) {
  const frame = frames[frameIndex];
  if (!frame) return null;

  const key = cacheKey(route.id, frame);
  if (panoramaCache.has(key)) return Promise.resolve(panoramaCache.get(key) ?? null);

  const candidates: PanoramaResult[] = [];
  const seenPanos = new Set<string>();

  for (const offset of googleCandidateFrameOffsets) {
    const candidateFrame = frames[frameIndex + offset];
    if (!candidateFrame) continue;
    const raw = await requestRawPanorama(service, route.id, candidateFrame);
    if (!raw || seenPanos.has(raw.pano)) continue;
    seenPanos.add(raw.pano);

    const projection = routeProgressAtPoint(route.path, raw.point);
    if (!projection) continue;

    const progressDeltaMeters = Math.abs(projection.traveledMeters - frame.distanceMeters);
    const routeBearingDelta = headingDeltaDegrees(projection.bearing, frame.bearing);
    const offRouteMeters = projection.distanceMeters;

    if (offRouteMeters > googleMaxOffRouteMeters) continue;
    if (progressDeltaMeters > googleMaxProgressDeltaMeters) continue;
    if (routeBearingDelta > googleMaxHeadingDeltaDegrees) continue;

    candidates.push({
      ...raw,
      offRouteMeters,
      progressDeltaMeters,
      headingDeltaDegrees: routeBearingDelta,
    });
  }

  const result = candidates.sort((a, b) => scoreGooglePanorama(a) - scoreGooglePanorama(b))[0] ?? null;
  panoramaCache.set(key, result);
  return result;
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function createStreetViewPanorama(element: HTMLElement, bearing: number) {
  if (!window.google?.maps) return undefined;
  return new window.google.maps.StreetViewPanorama(element, {
    addressControl: false,
    clickToGo: true,
    disableDefaultUI: false,
    fullscreenControl: true,
    linksControl: true,
    motionTracking: false,
    motionTrackingControl: false,
    panControl: true,
    pov: { heading: bearing, pitch: -3 },
    showRoadLabels: true,
    zoom: 1,
  });
}

function prepareStreetViewPanorama(
  panorama: GoogleStreetViewPanorama,
  request: QueuedPanorama,
) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let panoReady = false;
    let statusReady = false;
    let linksReady = false;
    let readyTimer: number | undefined;
    let timeoutTimer: number | undefined;
    const listeners: Array<{ remove: () => void }> = [];

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (readyTimer) window.clearTimeout(readyTimer);
      if (timeoutTimer) window.clearTimeout(timeoutTimer);
      listeners.forEach((listener) => listener.remove());
      resolve(ready);
    };

    const scheduleReady = () => {
      if (!panoReady || !statusReady || !linksReady) return;
      if (readyTimer) window.clearTimeout(readyTimer);
      readyTimer = window.setTimeout(() => finish(true), panoramaReadyDelayMs);
    };

    listeners.push(panorama.addListener('pano_changed', () => {
      panoReady = true;
      scheduleReady();
    }));
    listeners.push(panorama.addListener('status_changed', () => {
      const status = panorama.getStatus?.();
      if (status && status !== window.google?.maps.StreetViewStatus.OK) {
        finish(false);
        return;
      }
      statusReady = true;
      scheduleReady();
    }));
    listeners.push(panorama.addListener('links_changed', () => {
      linksReady = true;
      scheduleReady();
    }));

    panorama.setPov({ heading: request.bearing, pitch: -4 });
    panorama.setZoom(1);
    panorama.setPano(request.result.pano);
    timeoutTimer = window.setTimeout(() => finish(true), panoramaLoadTimeoutMs);
  });
}

function cleanHeadsign(value: string) {
  return value.replace(/^NULL,?\s*/i, '').trim() || 'Direzione non disponibile';
}

export function RouteStreetViewPlayer({ route }: Props) {
  const primaryContainerRef = useRef<HTMLDivElement | null>(null);
  const secondaryContainerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRefs = useRef<[GoogleStreetViewPanorama | undefined, GoogleStreetViewPanorama | undefined]>([undefined, undefined]);
  const activePanoramaLayerRef = useRef<PanoramaLayer>(0);
  const pendingPanoramaRef = useRef<QueuedPanorama | undefined>(undefined);
  const stagingPanoRef = useRef<string | undefined>(undefined);
  const panoramaTransitionRunningRef = useRef(false);
  const panoramaRouteIdRef = useRef(route?.id);
  const componentMountedRef = useRef(true);
  const googleFrameVisibleRef = useRef(false);
  const panoramaFadeTimeoutRef = useRef<number | undefined>(undefined);
  const serviceRef = useRef<GoogleStreetViewService | undefined>(undefined);
  const animationRef = useRef<number | undefined>(undefined);
  const lastAnimationAtRef = useRef<number | undefined>(undefined);
  const distanceRef = useRef(0);
  const currentIndexRef = useRef(0);
  const lastPanoramaDistanceRef = useRef(0);
  const lastPanoramaAtRef = useRef(0);
  const requestIdRef = useRef(0);
  const lastDisplayedPanoRef = useRef<string | undefined>(undefined);
  const [activePanoramaLayer, setActivePanoramaLayer] = useState<PanoramaLayer>(0);
  const [leavingPanoramaLayer, setLeavingPanoramaLayer] = useState<PanoramaLayer | undefined>(undefined);
  const [googleFrameVisible, setGoogleFrameVisible] = useState(false);
  const [readyState, setReadyState] = useState<'idle' | 'loading' | 'ready' | 'missing-key' | 'error'>('idle');
  const [coverageState, setCoverageState] = useState<'idle' | 'searching' | 'covered' | 'missing' | 'blocked'>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentDistanceMeters, setCurrentDistanceMeters] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(25);
  const [playing, setPlaying] = useState(false);
  const [offRouteMeters, setOffRouteMeters] = useState<number>();
  const [mapillaryImage, setMapillaryImage] = useState<MapillaryImageResult>();
  const [activeSource, setActiveSource] = useState<'none' | 'mapillary' | 'google'>('none');
  const [runtimeConfig, setRuntimeConfig] = useState<RoutePreviewRuntimeConfig>({ provider: fallbackRoutePreviewProvider });
  const [runtimeConfigReady, setRuntimeConfigReady] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.__busRadarGoogleMapsFailed)
  ));
  const [usage, setUsage] = useState<StreetViewUsage>(() => (
    typeof window === 'undefined' ? { month: currentUsageMonth(), events: 0 } : readStreetViewUsage()
  ));
  const { frames, totalMeters } = useMemo(() => buildStreetViewFrames(route?.path ?? []), [route]);
  const currentFrame = frames[currentIndex];
  const progress = totalMeters > 0 ? currentDistanceMeters / totalMeters : 0;
  const remainingFreeEvents = Math.max(0, freeMonthlyDynamicStreetViewEvents - usage.events);
  const googleCostBlocked = remainingFreeEvents <= 0;
  const googleUsagePercent = clamp((usage.events / freeMonthlyDynamicStreetViewEvents) * 100, 0, 100);
  const effectiveRuntimeConfig = useMemo<RoutePreviewRuntimeConfig>(() => (
    googleUnavailable ? { ...runtimeConfig, googleMapsApiKey: undefined } : runtimeConfig
  ), [googleUnavailable, runtimeConfig]);

  const ensurePanorama = (layer: PanoramaLayer, bearing: number) => {
    const element = layer === 0 ? primaryContainerRef.current : secondaryContainerRef.current;
    if (!element) return undefined;
    panoramaRefs.current[layer] ??= createStreetViewPanorama(element, bearing);
    return panoramaRefs.current[layer];
  };

  const activePanorama = () => panoramaRefs.current[activePanoramaLayerRef.current];

  const processPanoramaQueue = async () => {
    if (panoramaTransitionRunningRef.current) return;
    panoramaTransitionRunningRef.current = true;

    try {
      while (componentMountedRef.current && pendingPanoramaRef.current) {
        const request = pendingPanoramaRef.current;
        pendingPanoramaRef.current = undefined;
        if (panoramaRouteIdRef.current !== request.routeId) continue;

        const nextUsage = reserveStreetViewEvent(readStreetViewUsage());
        if (!nextUsage) {
          setUsage(readStreetViewUsage());
          setCoverageState('blocked');
          setPlaying(false);
          break;
        }

        const targetLayer: PanoramaLayer = googleFrameVisibleRef.current
          ? activePanoramaLayerRef.current === 0 ? 1 : 0
          : activePanoramaLayerRef.current;
        const panorama = ensurePanorama(targetLayer, request.bearing);
        if (!panorama) break;

        stagingPanoRef.current = request.result.pano;
        const ready = await prepareStreetViewPanorama(panorama, request);
        stagingPanoRef.current = undefined;
        if (!ready || !componentMountedRef.current || panoramaRouteIdRef.current !== request.routeId) continue;

        setUsage(nextUsage);
        const previousLayer = activePanoramaLayerRef.current;
        lastDisplayedPanoRef.current = request.result.pano;
        activePanoramaLayerRef.current = targetLayer;
        setActivePanoramaLayer(targetLayer);
        if (googleFrameVisibleRef.current && previousLayer !== targetLayer) {
          if (panoramaFadeTimeoutRef.current) window.clearTimeout(panoramaFadeTimeoutRef.current);
          setLeavingPanoramaLayer(previousLayer);
          panoramaFadeTimeoutRef.current = window.setTimeout(() => {
            setLeavingPanoramaLayer(undefined);
            panoramaFadeTimeoutRef.current = undefined;
          }, panoramaFadeDurationMs);
        }
        googleFrameVisibleRef.current = true;
        setGoogleFrameVisible(true);
        setOffRouteMeters(request.result.offRouteMeters);
        setMapillaryImage(undefined);
        setActiveSource('google');
        setCoverageState('covered');
      }
    } finally {
      panoramaTransitionRunningRef.current = false;
      if (componentMountedRef.current && pendingPanoramaRef.current) void processPanoramaQueue();
    }
  };

  const queuePanorama = (request: QueuedPanorama) => {
    if (
      request.result.pano === lastDisplayedPanoRef.current
      || request.result.pano === stagingPanoRef.current
      || request.result.pano === pendingPanoramaRef.current?.result.pano
    ) return;
    pendingPanoramaRef.current = request;
    void processPanoramaQueue();
  };

  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      pendingPanoramaRef.current = undefined;
      if (panoramaFadeTimeoutRef.current) window.clearTimeout(panoramaFadeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleGoogleFailure = () => {
      setGoogleUnavailable(true);
      setMapillaryImage(undefined);
      setOffRouteMeters(undefined);
      setActiveSource('none');
      setCoverageState('missing');
    };

    window.addEventListener(googleMapsAuthFailureEvent, handleGoogleFailure);
    return () => window.removeEventListener(googleMapsAuthFailureEvent, handleGoogleFailure);
  }, []);

  useEffect(() => {
    panoramaRouteIdRef.current = route?.id;
    pendingPanoramaRef.current = undefined;
    stagingPanoRef.current = undefined;
    setPlaying(false);
    setCurrentIndex(0);
    setCurrentDistanceMeters(0);
    distanceRef.current = 0;
    currentIndexRef.current = 0;
    lastPanoramaDistanceRef.current = 0;
    lastPanoramaAtRef.current = 0;
    setCoverageState('idle');
    setOffRouteMeters(undefined);
    setMapillaryImage(undefined);
    setActiveSource('none');
    googleFrameVisibleRef.current = false;
    setGoogleFrameVisible(false);
    setLeavingPanoramaLayer(undefined);
    lastDisplayedPanoRef.current = undefined;
  }, [route?.id]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    let cancelled = false;
    setRuntimeConfigReady(false);

    loadRoutePreviewConfig()
      .then((config) => {
        if (cancelled) return;
        setRuntimeConfig(config);
        setRuntimeConfigReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRuntimeConfig({ provider: fallbackRoutePreviewProvider });
        setRuntimeConfigReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!primaryContainerRef.current || !secondaryContainerRef.current || !route || frames.length === 0) return undefined;
    let cancelled = false;

    if (!runtimeConfigReady) {
      setReadyState('loading');
      return () => {
        cancelled = true;
      };
    }

    if (hasMapillaryProvider(effectiveRuntimeConfig) && !hasGoogleProvider(effectiveRuntimeConfig)) {
      setReadyState('ready');
      return () => {
        cancelled = true;
      };
    }

    if (!hasGoogleProvider(effectiveRuntimeConfig)) {
      setReadyState('missing-key');
      return () => {
        cancelled = true;
      };
    }

    setReadyState('loading');

    loadGoogleMaps(effectiveRuntimeConfig.googleMapsApiKey)
      .then(() => {
        if (cancelled || !primaryContainerRef.current || !secondaryContainerRef.current || !window.google?.maps) return;
        ensurePanorama(0, frames[0].bearing);
        ensurePanorama(1, frames[0].bearing);
        serviceRef.current ??= new window.google.maps.StreetViewService();
        setReadyState('ready');
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error.message !== 'missing-api-key') setGoogleUnavailable(true);
        setReadyState(
          error.message === 'missing-api-key'
            ? 'missing-key'
            : hasMapillaryProvider(runtimeConfig)
              ? 'ready'
              : 'error',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveRuntimeConfig, frames, route, runtimeConfigReady]);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const showGoogleFrame = async () => {
      if (!route || !currentFrame || !primaryContainerRef.current || !secondaryContainerRef.current || !hasGoogleProvider(effectiveRuntimeConfig)) return 'unavailable';
      if (googleCostBlocked) {
        setCoverageState('blocked');
        setPlaying(false);
        setActiveSource('google');
        return 'handled';
      }

      try {
        await loadGoogleMaps(effectiveRuntimeConfig.googleMapsApiKey);
      } catch {
        setGoogleUnavailable(true);
        setActiveSource('none');
        return 'unavailable';
      }

      if (!primaryContainerRef.current || !secondaryContainerRef.current || !window.google?.maps) return 'unavailable';
      ensurePanorama(0, frames[0]?.bearing ?? currentFrame.bearing);
      ensurePanorama(1, frames[0]?.bearing ?? currentFrame.bearing);
      serviceRef.current ??= new window.google.maps.StreetViewService();

      const result = await findPanorama(serviceRef.current, route, frames, currentIndex);
      if (cancelled || requestId !== requestIdRef.current) return 'handled';
      if (!result) return 'missing';

      if (result.pano === lastDisplayedPanoRef.current) {
        const panorama = activePanorama();
        panorama?.setPov({ heading: currentFrame.bearing, pitch: -4 });
        panorama?.setZoom(1);
        setOffRouteMeters(result.offRouteMeters);
        setMapillaryImage(undefined);
        setActiveSource('google');
        setCoverageState('covered');
        return 'covered';
      }

      queuePanorama({ routeId: route.id, result, bearing: currentFrame.bearing });
      return 'handled';
    };

    if (readyState !== 'ready' || !route || !currentFrame) return undefined;

    setCoverageState('searching');

    (async () => {
      if (prefersGoogleProvider(effectiveRuntimeConfig)) {
        const googleState = await showGoogleFrame();
        if (cancelled || requestId !== requestIdRef.current) return;
        if (googleState !== 'unavailable') {
          if (googleState === 'missing') {
            setMapillaryImage(undefined);
            setOffRouteMeters(undefined);
            setActiveSource('google');
            setCoverageState('missing');
          }
          return;
        }
      }

      if (hasMapillaryProvider(effectiveRuntimeConfig)) {
        const image = await findMapillaryImage(effectiveRuntimeConfig.mapillaryAccessToken, route.id, currentFrame);
        if (cancelled || requestId !== requestIdRef.current) return;
        if (image) {
          setMapillaryImage(image);
          setOffRouteMeters(image.offRouteMeters);
          setActiveSource('mapillary');
          setCoverageState('covered');
          return;
        }
      }

      if (!prefersGoogleProvider(effectiveRuntimeConfig)) {
        const googleState = await showGoogleFrame();
        if (cancelled || requestId !== requestIdRef.current) return;
        if (googleState !== 'unavailable') return;
      }

      if (cancelled || requestId !== requestIdRef.current) return;
      {
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
  }, [currentFrame, currentIndex, effectiveRuntimeConfig, frames, googleCostBlocked, readyState, route]);

  useEffect(() => {
    if (!playing || frames.length < 2 || totalMeters <= 0) return undefined;

    const step = (timestamp: number) => {
      if (!lastAnimationAtRef.current) lastAnimationAtRef.current = timestamp;
      const elapsedSeconds = Math.min(1.4, (timestamp - lastAnimationAtRef.current) / 1000);
      lastAnimationAtRef.current = timestamp;
      distanceRef.current = clamp(distanceRef.current + (speedKmh / 3.6) * elapsedSeconds, 0, totalMeters);
      setCurrentDistanceMeters(distanceRef.current);
      const nextIndex = frameIndexAtDistance(frames, distanceRef.current);
      const nextFrame = frames[nextIndex];
      if (nextFrame && activeSource === 'google') {
        activePanorama()?.setPov({ heading: nextFrame.bearing, pitch: -4 });
      }
      const movedEnough = nextFrame
        ? Math.abs(nextFrame.distanceMeters - lastPanoramaDistanceRef.current) >= panoramaMinStepMeters
        : false;
      const waitedEnough = timestamp - lastPanoramaAtRef.current >= panoramaMinIntervalMs;
      if (nextFrame && nextIndex !== currentIndexRef.current && movedEnough && waitedEnough) {
        currentIndexRef.current = nextIndex;
        lastPanoramaDistanceRef.current = nextFrame.distanceMeters;
        lastPanoramaAtRef.current = timestamp;
        setCurrentIndex(nextIndex);
      }

      if (distanceRef.current >= totalMeters) {
        setCurrentIndex(frames.length - 1);
        setCurrentDistanceMeters(totalMeters);
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
  }, [activeSource, frames, playing, speedKmh, totalMeters]);

  const goToIndex = (index: number) => {
    const nextIndex = clamp(index, 0, Math.max(0, frames.length - 1));
    setCurrentIndex(nextIndex);
    currentIndexRef.current = nextIndex;
    const nextDistance = frames[nextIndex]?.distanceMeters ?? 0;
    distanceRef.current = nextDistance;
    lastPanoramaDistanceRef.current = nextDistance;
    lastPanoramaAtRef.current = performance.now();
    setCurrentDistanceMeters(nextDistance);
  };

  const progressChange = (value: number) => {
    const nextDistance = clamp(value, 0, 100) / 100 * totalMeters;
    const nextIndex = frameIndexAtDistance(frames, nextDistance);
    distanceRef.current = nextDistance;
    currentIndexRef.current = nextIndex;
    lastPanoramaDistanceRef.current = frames[nextIndex]?.distanceMeters ?? nextDistance;
    lastPanoramaAtRef.current = performance.now();
    setCurrentDistanceMeters(nextDistance);
    setCurrentIndex(nextIndex);
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
          {coverageState === 'blocked' ? 'Google bloccato' : coverageState === 'covered' && offRouteMeters != null ? `${activeSource === 'mapillary' ? 'Mapillary' : 'Google'} a ${Math.round(offRouteMeters)} m` : coverageState === 'missing' ? 'tratto non coperto' : coverageState === 'searching' ? 'cerco foto' : routePreviewProviderLabel(effectiveRuntimeConfig)}
        </em>
      </div>

      {(hasGoogleProvider(effectiveRuntimeConfig) || hasMapillaryProvider(effectiveRuntimeConfig)) && (
        <div className="street-view-status-strip" aria-label="Stato anteprima strada">
          {hasGoogleProvider(effectiveRuntimeConfig) && (
            <div className="street-view-status-card">
              <span>Sorgente</span>
              <strong>Google Street View</strong>
              <small>{activeSource === 'google' ? 'vista principale' : 'pronto'}</small>
            </div>
          )}
          {hasGoogleProvider(effectiveRuntimeConfig) && (
            <div className="street-view-status-card is-budget">
              <span>Budget mese</span>
              <strong>{remainingFreeEvents.toLocaleString('it-IT')} rimasti</strong>
              <meter min="0" max="100" value={googleUsagePercent} aria-label="Uso mensile Street View" />
            </div>
          )}
          {hasMapillaryProvider(effectiveRuntimeConfig) && (
            <div className="street-view-status-card is-backup">
              <span>Backup</span>
              <strong>Mapillary</strong>
              <small>{prefersMapillaryProvider(effectiveRuntimeConfig) ? 'sorgente gratuita' : 'solo se Google manca'}</small>
            </div>
          )}
        </div>
      )}

      <div className="street-view-frame">
        <div className={`street-view-google-stack${mapillaryImage || googleUnavailable || !googleFrameVisible ? ' is-hidden' : ''}`}>
          <div
            ref={primaryContainerRef}
            className={`street-view-canvas${activePanoramaLayer === 0 ? ' is-active' : ''}${leavingPanoramaLayer === 0 ? ' is-leaving' : ''}`}
            aria-hidden={activePanoramaLayer !== 0}
          />
          <div
            ref={secondaryContainerRef}
            className={`street-view-canvas${activePanoramaLayer === 1 ? ' is-active' : ''}${leavingPanoramaLayer === 1 ? ' is-leaving' : ''}`}
            aria-hidden={activePanoramaLayer !== 1}
          />
        </div>
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
            <span>Configura le chiavi della vista strada nei secret Supabase. La build pubblica non deve contenere chiavi.</span>
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
        {readyState === 'ready' && googleUnavailable && coverageState === 'missing' && !mapillaryImage && (
          <div className="street-view-overlay">
            <AlertTriangle size={22} />
            <strong>Google non caricato</strong>
            <span>La chiave Google è presente ma non viene autorizzata. Controlla in Google Cloud: Maps JavaScript API attiva, fatturazione attiva e restrizione dominio https://trailpress.github.io/*.</span>
          </div>
        )}
        {readyState === 'ready' && coverageState === 'missing' && !googleUnavailable && (
          <div className="street-view-corner-warning">
            <AlertTriangle size={15} />
            <span>Nessuna foto frontale affidabile entro {Math.max(mapillarySearchRadiusMeters, panoramaSearchRadiusMeters)} m</span>
          </div>
        )}
      </div>

      <div className="street-view-console">
        <div className="street-view-console-top">
          <div className="street-view-readout">
            <Gauge size={16} />
            <div>
              <strong>{speedKmh} km/h</strong>
              <span>velocità simulata</span>
            </div>
          </div>
          <div className="street-view-controls">
            <button type="button" aria-label="Torna all'inizio" onClick={() => goToIndex(0)}>
              <RotateCcw size={18} />
            </button>
            <button type="button" aria-label="Punto precedente" onClick={() => goToIndex(currentIndex - 1)}>
              <SkipBack size={18} />
            </button>
            <button className="street-view-play" type="button" aria-label={playing ? 'Pausa' : 'Avvia'} onClick={() => setPlaying((value) => !value)} disabled={readyState !== 'ready' || frames.length < 2}>
              {playing ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button type="button" aria-label="Punto successivo" onClick={() => goToIndex(currentIndex + 1)}>
              <SkipForward size={18} />
            </button>
          </div>
        </div>

        <label className="street-view-range">
          <span>{formatDistance(currentDistanceMeters)}</span>
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
