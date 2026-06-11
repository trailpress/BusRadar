import L from 'leaflet';
import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import moleAsset from '../../assets/landmarks/mole.webp';
import portaNuovaAsset from '../../assets/landmarks/porta-nuova.webp';
import portaSusaAsset from '../../assets/landmarks/porta-susa.webp';
import granMadreAsset from '../../assets/landmarks/gran-madre.webp';
import lingottoAsset from '../../assets/landmarks/lingotto.webp';
import valentinoAsset from '../../assets/landmarks/valentino.webp';
import piazzaCastelloAsset from '../../assets/landmarks/piazza-castello.webp';
import type { Landmark } from '../../types';
import { getLandmarkLod } from '../../utils/mapLod';

const localAssets: Record<string, string> = {
  mole: moleAsset,
  'porta-nuova': portaNuovaAsset,
  'porta-susa': portaSusaAsset,
  'gran-madre': granMadreAsset,
  lingotto: lingottoAsset,
  valentino: valentinoAsset,
  castello: piazzaCastelloAsset,
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getAssetUrl(landmark: Landmark) {
  if (localAssets[landmark.id]) return localAssets[landmark.id];
  if (!landmark.asset) return undefined;
  return `${import.meta.env.BASE_URL}${landmark.asset}`;
}

type Props = {
  landmark: Landmark;
  zoom: number;
  active: boolean;
  onSelect: (id: string) => void;
};

export function DioramaLandmark({ landmark, zoom, active, onSelect }: Props) {
  const lod = getLandmarkLod(landmark, zoom, active);
  const assetUrl = getAssetUrl(landmark);
  const useImage = lod.renderMode === 'image' && landmark.display === 'image' && Boolean(assetUrl);

  const icon = useMemo(() => {
    const size = lod.size || 1;
    const visualWidth = useImage ? Math.round(size * 1.48) : size;
    const boxWidth = lod.labelMode === 'none' ? Math.max(80, Math.round(visualWidth * 1.28)) : Math.max(156, Math.round(visualWidth * 1.34));
    const boxHeight = lod.labelMode === 'none' ? Math.round(size * 1.58) : Math.round(size * 1.82);
    const labelHtml = lod.labelMode === 'none' ? '' : `<span>${lod.label}</span>`;
    const visualHtml = useImage
      ? `<img src="${assetUrl}" alt="" loading="eager" decoding="async" />`
      : `<em>${getInitials(landmark.name)}</em>`;

    return L.divIcon({
      className: '',
      html: `<div class="diorama-landmark ${useImage ? 'diorama-landmark--image' : 'diorama-landmark--pin'} diorama-landmark--${landmark.tier ?? 'district'} diorama-landmark--${lod.className} ${active ? 'is-active' : ''}" style="--lm-size:${size}px;--lm-visual-w:${visualWidth}px;--lm-box:${boxWidth}px;--lm-opacity:${lod.opacity}"><i>${visualHtml}</i>${labelHtml}</div>`,
      iconSize: [boxWidth, boxHeight],
      iconAnchor: [boxWidth / 2, useImage ? Math.round(size * 1.24) : Math.round(size * 0.82)],
    });
  }, [active, assetUrl, landmark.name, landmark.tier, lod.className, lod.label, lod.labelMode, lod.opacity, lod.renderMode, lod.size, useImage]);

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
