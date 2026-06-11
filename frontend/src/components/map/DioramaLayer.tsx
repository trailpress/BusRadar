import { useMemo, useState } from 'react';
import type { Landmark } from '../../types';
import { getLandmarkLod } from '../../utils/mapLod';
import { DioramaLandmark } from './DioramaLandmark';

type Props = {
  landmarks: Landmark[];
  zoom: number;
};

export function DioramaLayer({ landmarks, zoom }: Props) {
  const [activeId, setActiveId] = useState<string>();
  const visibleLandmarks = useMemo(
    () => landmarks.filter((landmark) => getLandmarkLod(landmark, zoom, landmark.id === activeId).visible),
    [activeId, landmarks, zoom],
  );

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
