import { useEffect } from 'react';

let activeLockCount = 0;
let previousBodyOverflow: string | null = null;

export function lockBodyScroll() {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  if (activeLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  activeLockCount += 1;

  return () => {
    if (activeLockCount === 0) {
      return;
    }

    activeLockCount -= 1;

    if (activeLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow ?? '';
      previousBodyOverflow = null;
    }
  };
}

export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    return lockBodyScroll();
  }, [isLocked]);
}
