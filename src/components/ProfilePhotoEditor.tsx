import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type SyntheticEvent,
  type WheelEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const OUTPUT_SIZE = 640;
const CROP_RATIO = 0.82;
const MOTION_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

interface ImageSize {
  width: number;
  height: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  initialOffset: { x: number; y: number };
}

interface ProfilePhotoEditorProps {
  sourceUrl: string | null;
  fileName: string;
  isSaving: boolean;
  onCancel: () => void;
  onError?: (message: string) => void;
  onSave: (file: File) => void | Promise<void>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getBoundedOffset(
  offset: { x: number; y: number },
  zoom: number,
  previewSize: number,
  imageSize: ImageSize | null,
) {
  const naturalWidth = imageSize?.width || 1;
  const naturalHeight = imageSize?.height || 1;
  const coverScale = Math.max(previewSize / naturalWidth, previewSize / naturalHeight);
  const renderedWidth = naturalWidth * coverScale * zoom;
  const renderedHeight = naturalHeight * coverScale * zoom;
  const cropSize = previewSize * CROP_RATIO;

  return {
    x: clamp(offset.x, -(renderedWidth - cropSize) / 2, (renderedWidth - cropSize) / 2),
    y: clamp(offset.y, -(renderedHeight - cropSize) / 2, (renderedHeight - cropSize) / 2),
  };
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the selected image.'));
    image.src = sourceUrl;
  });
}

async function createAdjustedPhoto({
  sourceUrl,
  fileName,
  zoom,
  offset,
  previewSize,
}: {
  sourceUrl: string;
  fileName: string;
  zoom: number;
  offset: { x: number; y: number };
  previewSize: number;
}) {
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to prepare the adjusted profile photo.');
  }

  const safePreviewSize = previewSize > 0 ? previewSize : OUTPUT_SIZE;
  const previewCoverScale = Math.max(
    safePreviewSize / image.naturalWidth,
    safePreviewSize / image.naturalHeight,
  );
  const outputScale = OUTPUT_SIZE / (safePreviewSize * CROP_RATIO);
  const scaledWidth = image.naturalWidth * previewCoverScale * zoom * outputScale;
  const scaledHeight = image.naturalHeight * previewCoverScale * zoom * outputScale;
  const drawX = (OUTPUT_SIZE - scaledWidth) / 2 + offset.x * outputScale;
  const drawY = (OUTPUT_SIZE - scaledHeight) / 2 + offset.y * outputScale;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error('Unable to export the adjusted profile photo.'));
      }
    }, 'image/jpeg', 0.92);
  });
  const normalizedFileName = `${fileName.replace(/\.[^.]+$/, '') || 'profile-photo'}.jpg`;

  return new File([blob], normalizedFileName, { type: 'image/jpeg' });
}

export default function ProfilePhotoEditor({
  sourceUrl,
  fileName,
  isSaving,
  onCancel,
  onError,
  onSave,
}: ProfilePhotoEditorProps) {
  const shouldReduceMotion = useReducedMotion();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setImageSize(null);
    setDragState(null);
  }, [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onCancel, sourceUrl]);

  const getPreviewSize = () => previewRef.current?.getBoundingClientRect().width || 360;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isSaving) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffset: offset,
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setOffset(
      getBoundedOffset(
        {
          x: dragState.initialOffset.x + event.clientX - dragState.startX,
          y: dragState.initialOffset.y + event.clientY - dragState.startY,
        },
        zoom,
        getPreviewSize(),
        imageSize,
      ),
    );
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
  };

  const changeZoom = (delta: number) => {
    const previewSize = getPreviewSize();

    setZoom((currentZoom) => {
      const nextZoom = clamp(currentZoom + delta, MIN_ZOOM, MAX_ZOOM);
      setOffset((currentOffset) => getBoundedOffset(currentOffset, nextZoom, previewSize, imageSize));
      return nextZoom;
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (isSaving) {
      return;
    }

    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const nextImageSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };

    setImageSize(nextImageSize);
    setOffset((currentOffset) =>
      getBoundedOffset(currentOffset, zoom, getPreviewSize(), nextImageSize),
    );
  };

  const handleSave = async () => {
    if (!sourceUrl || isSaving) {
      return;
    }

    try {
      const adjustedFile = await createAdjustedPhoto({
        sourceUrl,
        fileName,
        zoom,
        offset,
        previewSize: getPreviewSize(),
      });
      await onSave(adjustedFile);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Unable to prepare the adjusted profile photo.');
    }
  };

  const imageAspectRatio = (imageSize?.width || 1) / (imageSize?.height || 1);

  return (
    <AnimatePresence>
      {sourceUrl ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: MOTION_EASE }}
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 p-4"
        >
          <motion.div
            initial={shouldReduceMotion ? false : { y: 16, scale: 0.98 }}
            animate={shouldReduceMotion ? undefined : { y: 0, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: MOTION_EASE }}
            className="flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-[#111312] text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-photo-editor-title"
          >
            <div className="flex min-h-12 items-center border-b border-white/10 px-3 sm:px-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close photo editor"
              >
                <X className="h-5 w-5" />
              </button>
              <h2 id="profile-photo-editor-title" className="ml-2.5 truncate text-base font-semibold">
                Drag the image to adjust
              </h2>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#06100d] px-4 py-4">
              <div
                ref={previewRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                className="relative aspect-square w-full max-w-[390px] touch-none cursor-grab overflow-hidden bg-black active:cursor-grabbing"
              >
                <img
                  src={sourceUrl}
                  alt="Selected profile preview"
                  className="absolute max-w-none select-none"
                  draggable={false}
                  onLoad={handleImageLoad}
                  style={{
                    left: `calc(50% + ${offset.x}px)`,
                    top: `calc(50% + ${offset.y}px)`,
                    width: `${Math.max(1, imageAspectRatio) * zoom * 100}%`,
                    height: `${Math.max(1, 1 / imageAspectRatio) * zoom * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.48)] ring-1 ring-white/10" />
              </div>

              <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-black/40 text-white shadow-lg backdrop-blur">
                <button
                  type="button"
                  onClick={() => changeZoom(0.1)}
                  disabled={isSaving || zoom >= MAX_ZOOM}
                  className="inline-flex h-10 w-10 items-center justify-center transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <div className="mx-3 border-t border-white/15" />
                <button
                  type="button"
                  onClick={() => changeZoom(-0.1)}
                  disabled={isSaving || zoom <= MIN_ZOOM}
                  className="inline-flex h-10 w-10 items-center justify-center transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex min-h-16 items-center justify-end bg-[#191b1a] px-5 py-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#21c667] text-white shadow-lg shadow-[#21c667]/20 transition hover:scale-105 hover:bg-[#19b85c] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                aria-label="Save adjusted photo"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-6 w-6" />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
