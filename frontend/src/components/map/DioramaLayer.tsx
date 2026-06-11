import { useMemo, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Landmark } from '../../types';
import { getLandmarkLod } from '../../utils/mapLod';
import { DioramaLandmark } from './DioramaLandmark';

type Props = {
  landmarks: Landmark[];
  zoom: number;
};

function getTierPriority(landmark: Landmark) {
  if (landmark.tier === 'major') return 3;
  if (landmark.tier === 'district') return 2;
  return 1;
}

function getCollisionRadius(size: number, zoom: number, active: boolean) {
  if (active) return 0;
  const visualWidth = size * 1.48;
  const zoomRelief = zoom >= 17 ? 0.72 : zoom >= 15 ? 0.86 : 1;
  return visualWidth * zoomRelief;
}

export function DioramaLayer({ landmarks, zoom }: Props) {
  const map = useMap();
  const [activeId, setActiveId] = useState<string>();
  const visibleLandmarks = useMemo(() => {
    const candidates = landmarks
      .map((landmark, index) => {
        const active = landmark.id === activeId;
        const lod = getLandmarkLod(landmark, zoom, active);
        const point = map.project(L.latLng(landmark.lat, landmark.lon), Math.round(zoom));
        return { landmark, lod, point, active, index };
      })
      .filter((item) => item.lod.visible)
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        const priorityDiff = getTierPriority(b.landmark) - getTierPriority(a.landmark);
        if (priorityDiff !== 0) return priorityDiff;
        const zoomDiff = (b.landmark.minZoom ?? 0) - (a.landmark.minZoom ?? 0);
        if (zoomDiff !== 0) return zoomDiff;
        return a.index - b.index;
      });

    const accepted: typeof candidates = [];
    candidates.forEach((candidate) => {
      const candidateRadius = getCollisionRadius(candidate.lod.size, zoom, candidate.active);
      const collides = accepted.some((kept) => {
        const keptRadius = getCollisionRadius(kept.lod.size, zoom, kept.active);
        const minDistance = candidateRadius + keptRadius;
        return candidate.point.distanceTo(kept.point) < minDistance;
      });
      if (!collides || candidate.active) accepted.push(candidate);
    });

    return accepted.map((item) => item.landmark);
  }, [activeId, landmarks, map, zoom]);

  return (
    <>
      {visibleLandmarks.map((landmark) => (
        <DioramaLandmark
          key={landmark.id}
          landmark={landmark}
          zoom={zoom}
          active={landmark.id === activeId}
          onSelect={(id) => setActiveId((current) => (current === id ? undefined : id))}
        />
      ))}
    </>
  );
}
