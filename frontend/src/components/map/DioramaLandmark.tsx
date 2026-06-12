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

function getAssetUrl(landmark: Landmark) {
  if (!landmark.asset) return undefined;
  return `${import.meta.env.BASE_URL}${landmark.asset}`;
}

export function DioramaLandmark({ landmark, zoom, active, onSelect }: Props) {
  const lod = getLandmarkLod(landmark, zoom, active);
  const assetUrl = getAssetUrl(landmark);

  const icon = useMemo(() => {
    const size = lod.size || 1;
    const visualWidth = size * 1.32;
    const boxWidth = lod.labelMode === 'none' ? Math.max(70, visualWidth * 1.24) : Math.max(142, visualWidth * 1.44);
    const boxHeight = lod.labelMode === 'none' ? size * 1.18 : size * 1.58;
    const labelHtml = lod.labelMode === 'none' ? '' : `<span>${lod.label}</span>`;
    const visualHtml = assetUrl ? `<img src="${assetUrl}" alt="" loading="eager" decoding="async" />` : '';

    return L.divIcon({
      className: '',
      html: `<div class="diorama-landmark diorama-landmark--image-flat diorama-landmark--${landmark.tier ?? 'district'} diorama-landmark--${lod.className} ${active ? 'is-active' : ''}" style="--lm-size:${size}px;--lm-visual-w:${visualWidth}px;--lm-box:${boxWidth}px;--lm-opacity:${lod.opacity}"><i>${visualHtml}</i>${labelHtml}</div>`,
      iconSize: [boxWidth, boxHeight],
      iconAnchor: [boxWidth / 2, size * 0.92],
    });
  }, [active, assetUrl, landmark.tier, lod.className, lod.label, lod.labelMode, lod.opacity, lod.size]);

  if (!lod.visible || !assetUrl) return null;

  return (
    <Marker
      position={[landmark.lat, landmark.lon]}
      icon={icon}
      zIndexOffset={active ? 80 : landmark.tier === 'major' ? -80 : landmark.tier === 'district' ? -120 : -160}
      eventHandlers={{ click: () => onSelect(landmark.id) }}
    />
  );
}
