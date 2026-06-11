import type { Landmark } from '../types';

export type LandmarkLod = {
  visible: boolean;
  size: number;
  opacity: number;
  renderMode: 'pin' | 'image' | 'glyph';
  labelMode: 'none' | 'short' | 'full';
  label: string;
  className: string;
};

function getTierMinZoom(landmark: Landmark) {
  const tier = landmark.tier ?? 'district';
  if (tier === 'major') return 13;
  if (tier === 'district') return 15;
  return 17;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value: number, start: number, end: number) {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function getBaseSize(tier: Landmark['tier'], zoom: number) {
  const normalizedTier = tier ?? 'district';

  if (normalizedTier === 'major') {
    if (zoom < 15) return lerp(24, 32, smoothstep(zoom, 13, 15));
    if (zoom < 17) return lerp(32, 40, smoothstep(zoom, 15, 17));
    return lerp(40, 48, smoothstep(zoom, 17, 18));
  }

  if (normalizedTier === 'district') {
    if (zoom < 17) return lerp(22, 32, smoothstep(zoom, 15, 17));
    return lerp(32, 40, smoothstep(zoom, 17, 18));
  }

  return lerp(22, 34, smoothstep(zoom, 17, 18));
}

export function getLandmarkLod(landmark: Landmark, zoom: number, active = false): LandmarkLod {
  const minZoom = Math.max(landmark.minZoom ?? getTierMinZoom(landmark), getTierMinZoom(landmark));

  if (zoom < minZoom - 0.35) {
    return {
      visible: false,
      size: 0,
      opacity: 0,
      renderMode: 'pin',
      labelMode: 'none',
      label: '',
      className: 'is-hidden',
    };
  }

  const tier = landmark.tier ?? 'district';
  const fade = smoothstep(zoom, minZoom - 0.35, minZoom + 0.25);
  const baseSize = getBaseSize(tier, zoom);
  const activeBoost = active ? (tier === 'major' ? 6 : 5) : 0;
  const className = zoom < 15 ? 'lod-low' : zoom < 17 ? 'lod-mid' : 'lod-high';

  return {
    visible: true,
    size: Math.round(baseSize + activeBoost),
    opacity: active ? 1 : lerp(0.18, 1, fade),
    renderMode: 'glyph',
    labelMode: active ? 'full' : 'none',
    label: active ? landmark.name : '',
    className,
  };
}
