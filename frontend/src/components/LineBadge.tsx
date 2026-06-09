import type { CSSProperties } from 'react';
import { getLineColor } from '../utils/lineColors';

type Props = {
  line: string;
  size?: 'sm' | 'md' | 'lg';
};

export function LineBadge({ line, size = 'md' }: Props) {
  return (
    <span className={`line-badge line-badge--${size}`} style={{ '--line-color': getLineColor(line) } as CSSProperties}>
      {line}
    </span>
  );
}
