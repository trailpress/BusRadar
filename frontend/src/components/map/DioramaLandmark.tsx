import L from 'leaflet';
import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import type { Landmark } from '../../types';
import { getLandmarkLod } from '../../utils/mapLod';

type Props = {
  landmark: Landmark;
  zoom: number;
  active: boolean;
  onSelect: (id: string) => void;
};

export function DioramaLandmark({ landmark, zoom, active, onSelect }: Props) {
  const lod = getLandmarkLod(landmark, zoom, active);

  const icon = useMemo(() => {
    const size = lod.size || 1;
    const visualWidth = size * 1.18;
    const boxWidth = lod.labelMode === 'none' ? Math.max(52, visualWidth * 1.45) : Math.max(132, visualWidth * 1.62);
    const boxHeight = lod.labelMode === 'none' ? size * 1.28 : size * 1.72;
    const labelHtml = lod.labelMode === 'none' ? '' : `<span>${lod.label}</span>`;
    const visualHtml = `<em class="landmark-glyph landmark-glyph--${landmark.type}"><b></b><b></b><b></b></em>`;

    return L.divIcon({
      className: '',
      html: `<div class="diorama-landmark diorama-landmark--glyph diorama-landmark--${landmark.tier ?? 'district'} diorama-landmark--${lod.className} ${active ? 'is-active' : ''}" style="--lm-size:${size}px;--lm-visual-w:${visualWidth}px;--lm-box:${boxWidth}px;--lm-opacity:${lod.opacity}"><i>${visualHtml}</i>${labelHtml}</div>`,
      iconSize: [boxWidth, boxHeight],
      iconAnchor: [boxWidth / 2, size * 1.02],
    });
  }, [active, landmark.tier, landmark.type, lod.className, lod.label, lod.labelMode, lod.opacity, lod.size]);

  if (!lod.visible) return null;

  return (
    <Marker
      position={[landmark.lat, landmark.lon]}
      icon={icon}
      zIndexOffset={active ? 80 : landmark.tier === 'major' ? -80 : landmark.tier === 'district' ? -120 : -160}
      eventHandlers={{ click: () => onSelect(landmark.id) }}
    />
  );
}
