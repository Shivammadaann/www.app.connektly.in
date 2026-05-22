import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export type FeedbackPopupItem = {
  id: string;
  message: string;
  onDismiss: () => void;
  title?: string;
  tone: 'error' | 'success';
};

const TONE_STYLES = {
  error: {
    cardClassName: 'border-red-200 shadow-red-950/15',
    panelClassName: 'bg-red-50',
    iconWrapClassName: 'bg-red-100 text-red-700',
    titleClassName: 'text-red-900',
    messageClassName: 'text-red-800',
    buttonClassName: 'text-red-700 hover:bg-red-100',
    defaultTitle: 'Action failed',
  },
  success: {
    cardClassName: 'border-emerald-200 shadow-emerald-950/10',
    panelClassName: 'bg-emerald-50',
    iconWrapClassName: 'bg-emerald-100 text-emerald-700',
    titleClassName: 'text-emerald-900',
    messageClassName: 'text-emerald-800',
    buttonClassName: 'text-emerald-700 hover:bg-emerald-100',
    defaultTitle: 'Success',
  },
} as const;

export default function FeedbackPopupStack({ items }: { items: FeedbackPopupItem[] }) {
  if (typeof document === 'undefined' || items.length === 0) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed right-4 top-4 z-[125] flex w-[min(440px,calc(100vw-2rem))] flex-col gap-3">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const toneStyles = TONE_STYLES[item.tone];
          const Icon = item.tone === 'success' ? CheckCircle2 : AlertTriangle;

          return (
            <motion.div
              key={item.id}
              role="alert"
              initial={{ opacity: 0, y: -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              className={`pointer-events-auto overflow-hidden rounded-2xl border bg-white shadow-2xl ${toneStyles.cardClassName}`}
            >
              <div className={`flex items-start gap-3 px-4 py-3 ${toneStyles.panelClassName}`}>
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneStyles.iconWrapClassName}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm font-semibold ${toneStyles.titleClassName}`}>
                      {item.title || toneStyles.defaultTitle}
                    </p>
                    <button
                      type="button"
                      onClick={item.onDismiss}
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${toneStyles.buttonClassName}`}
                      aria-label="Dismiss message"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${toneStyles.messageClassName}`}>
                    {item.message}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
