import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export const APP_MODAL_LAYER_CLASS = 'z-[200]';

export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
}
