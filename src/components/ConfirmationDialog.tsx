import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEscapeKey } from '../lib/useEscapeKey';

type ConfirmationDialogTone = 'danger' | 'warning' | 'default';

const TONE_STYLES: Record<
  ConfirmationDialogTone,
  {
    iconClassName: string;
    confirmButtonClassName: string;
  }
> = {
  danger: {
    iconClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    confirmButtonClassName:
      'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-600/20',
  },
  warning: {
    iconClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    confirmButtonClassName:
      'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20',
  },
  default: {
    iconClassName: 'border-blue-200 bg-blue-50 text-blue-700',
    confirmButtonClassName:
      'bg-[#2364ff] text-white hover:bg-[#1d54d9] shadow-lg shadow-[#2364ff]/20',
  },
};

export default function ConfirmationDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  isLoading = false,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmationDialogTone;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isDismissable = isOpen && !isLoading;
  const toneStyles = TONE_STYLES[tone];

  useEscapeKey(isDismissable, onClose);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (typeof document === 'undefined') {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        createPortal(
          <div className="fixed inset-0 z-[220] flex items-center justify-center px-4 py-6">
            <motion.button
              type="button"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={isDismissable ? onClose : undefined}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${toneStyles.iconClassName}`}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                    <div className="mt-2 text-sm leading-6 text-gray-600">{description}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={!isDismissable}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={!isDismissable}
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.confirmButtonClassName}`}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body,
        )
      ) : null}
    </AnimatePresence>
  );
}
