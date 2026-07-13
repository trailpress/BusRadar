import type { ReactNode } from 'react';
import { notify } from '../utils/notify';

type Props = {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
};

export function IconButton({ label, children, onClick, active }: Props) {
  return (
    <button className={`icon-button ${active ? 'is-active' : ''}`} type="button" aria-label={label} title={label} onClick={onClick ?? (() => notify(label))}>
      {children}
    </button>
  );
}
