import type { CSSProperties } from 'react';
import { getLineColor } from '../utils/lineColors';
import { routeDisplayTextColor } from '../utils/routePalette';

type Props = {
  line: string;
  size?: 'sm' | 'md' | 'lg';
};

export function LineBadge({ line, size = 'md' }: Props) {
  return (
    <span
      className={`line-badge line-badge--${size}`}
      style={{ '--line-color': getLineColor(line), '--line-text-color': routeDisplayTextColor(line) } as CSSProperties}
    >
      {line}
    </span>
  );
}
