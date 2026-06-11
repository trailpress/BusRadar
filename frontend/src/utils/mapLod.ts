import type { Landmark } from '../types';

export type LandmarkLod = {
  visible: boolean;
  size: number;
  opacity: number;
  renderMode: 'pin' | 'image';
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

export function getLandmarkLod(landmark: Landmark, zoom: number, active = false): LandmarkLod {
  const minZoom = Math.max(landmark.minZoom ?? getTierMinZoom(landmark), getTierMinZoom(landmark));

  if (zoom < minZoom) {
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
  const isMajor = tier === 'major';
  const isDistrict = tier === 'district';

  if (zoom < 15) {
    return {
      visible: isMajor,
      size: 30,
      opacity: 0.86,
      renderMode: 'pin',
      labelMode: active ? 'full' : 'none',
      label: active ? landmark.name : '',
      className: 'lod-low',
    };
  }

  if (zoom < 17) {
    const size = isMajor ? 48 : isDistrict ? 32 : 0;
    return {
      visible: size > 0,
      size,
      opacity: isMajor ? 0.96 : 0.88,
      renderMode: isMajor || active ? 'image' : 'pin',
      labelMode: active ? 'full' : 'short',
      label: active ? landmark.name : landmark.shortName ?? landmark.name,
      className: 'lod-mid',
    };
  }

  return {
    visible: true,
    size: active ? 74 : isMajor ? 62 : isDistrict ? 52 : 42,
    opacity: 1,
    renderMode: 'image',
    labelMode: active ? 'full' : 'full',
    label: landmark.name,
    className: 'lod-high',
  };
}
