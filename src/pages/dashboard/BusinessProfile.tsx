import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
  type WheelEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  FolderOpen,
  Globe,
  Link as LinkIcon,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  RefreshCw,
  Share2,
  ShieldCheck,
  Store,
  Trash2,
  UserCircle,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import defaultProfilePictureUrl from '../../assets/profile.png';
import type {
  DashboardBootstrap,
  WhatsAppBusinessProfile,
  WhatsAppOfficialBusinessAccountStatus,
} from '../../lib/types';

interface BusinessProfileFormState {
  about: string;
  address: string;
  description: string;
  email: string;
  vertical: string;
  website1: string;
  website2: string;
}

const EMPTY_FORM_STATE: BusinessProfileFormState = {
  about: '',
  address: '',
  description: '',
  email: '',
  vertical: '',
  website1: '',
  website2: '',
};

interface BusinessCategoryOption {
  label: string;
  value: string;
  aliases?: string[];
}

const BUSINESS_CATEGORY_OPTIONS = [
  { label: 'Automotive', value: 'AUTO', aliases: ['AUTOMOTIVE'] },
  { label: 'Beauty, spa and salon', value: 'BEAUTY', aliases: ['BEAUTY_SPA_AND_SALON'] },
  { label: 'Clothing', value: 'APPAREL', aliases: ['CLOTHING'] },
  { label: 'Education', value: 'EDU', aliases: ['EDUCATION'] },
  { label: 'Entertainment', value: 'ENTERTAIN', aliases: ['ENTERTAINMENT'] },
  { label: 'Online gambling and gaming', value: 'ONLINE_GAMBLING', aliases: ['ONLINE_GAMBLING_AND_GAMING'] },
  {
    label: 'Non-online gambling and gaming (e.g. brick and mortar)',
    value: 'PHYSICAL_GAMBLING',
    aliases: ['NON_ONLINE_GAMBLING_AND_GAMING'],
  },
  { label: 'Event planning and service', value: 'EVENT_PLAN', aliases: ['EVENT_PLANNING_AND_SERVICE'] },
  { label: 'Matrimonial service', value: 'MATRIMONY_SERVICE', aliases: ['MATRIMONIAL_SERVICE'] },
  { label: 'Finance and banking', value: 'FINANCE', aliases: ['FINANCE_AND_BANKING'] },
  { label: 'Food and groceries', value: 'GROCERY', aliases: ['FOOD_AND_GROCERIES'] },
  { label: 'Alcoholic drinks', value: 'ALCOHOL', aliases: ['ALCOHOLIC_DRINKS'] },
  { label: 'Public service', value: 'GOVT', aliases: ['PUBLIC_SERVICE'] },
  { label: 'Hotel and lodging', value: 'HOTEL', aliases: ['HOTEL_AND_LODGING'] },
  { label: 'Medical and health', value: 'HEALTH', aliases: ['MEDICAL_AND_HEALTH'] },
  { label: 'Over-the-counter medicine', value: 'OTC_DRUGS', aliases: ['OVER_THE_COUNTER_MEDICINE'] },
  { label: 'Charity', value: 'NONPROFIT', aliases: ['CHARITY'] },
  { label: 'Professional services', value: 'PROF_SERVICES', aliases: ['PROFESSIONAL_SERVICES'] },
  { label: 'Shopping and retail', value: 'RETAIL', aliases: ['SHOPPING_AND_RETAIL'] },
  { label: 'Travel and transportation', value: 'TRAVEL', aliases: ['TRAVEL_AND_TRANSPORTATION'] },
  { label: 'Restaurant', value: 'RESTAURANT' },
  { label: 'Other', value: 'OTHER' },
] as const satisfies readonly BusinessCategoryOption[];

const MOTION_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};
const slideUp = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: MOTION_EASE },
  },
};
const fieldInputClassName =
  'min-h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out placeholder:text-gray-400 focus:border-[#1381FF]/70 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,129,255,0.08)]';
const fieldTextareaClassName =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-6 text-gray-900 outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out placeholder:text-gray-400 focus:border-[#1381FF]/70 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,129,255,0.08)]';
const MIN_PHOTO_EDITOR_ZOOM = 1;
const MAX_PHOTO_EDITOR_ZOOM = 3;
const PROFILE_PHOTO_OUTPUT_SIZE = 640;
const PHOTO_EDITOR_CROP_RATIO = 0.82;

interface PhotoEditorImageSize {
  width: number;
  height: number;
}

interface PhotoEditorDragState {
  pointerId: number;
  startX: number;
  startY: number;
  initialOffset: { x: number; y: number };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getBoundedPhotoOffset(
  offset: { x: number; y: number },
  zoom: number,
  previewSize: number,
  imageSize: PhotoEditorImageSize | null,
) {
  const naturalWidth = imageSize?.width || 1;
  const naturalHeight = imageSize?.height || 1;
  const coverScale = Math.max(previewSize / naturalWidth, previewSize / naturalHeight);
  const renderedWidth = naturalWidth * coverScale * zoom;
  const renderedHeight = naturalHeight * coverScale * zoom;
  const cropSize = previewSize * PHOTO_EDITOR_CROP_RATIO;
  const maxOffsetX = Math.max(0, (renderedWidth - cropSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - cropSize) / 2);

  return {
    x: clamp(offset.x, -maxOffsetX, maxOffsetX),
    y: clamp(offset.y, -maxOffsetY, maxOffsetY),
  };
}

function loadEditorImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the selected image.'));
    image.src = sourceUrl;
  });
}

async function createAdjustedProfilePhotoFile({
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
  const image = await loadEditorImage(sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_PHOTO_OUTPUT_SIZE;
  canvas.height = PROFILE_PHOTO_OUTPUT_SIZE;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to prepare the adjusted profile photo.');
  }

  const safePreviewSize = previewSize > 0 ? previewSize : PROFILE_PHOTO_OUTPUT_SIZE;
  const previewCoverScale = Math.max(
    safePreviewSize / image.naturalWidth,
    safePreviewSize / image.naturalHeight,
  );
  const cropSize = safePreviewSize * PHOTO_EDITOR_CROP_RATIO;
  const outputOffsetScale = PROFILE_PHOTO_OUTPUT_SIZE / cropSize;
  const scaledWidth = image.naturalWidth * previewCoverScale * zoom * outputOffsetScale;
  const scaledHeight = image.naturalHeight * previewCoverScale * zoom * outputOffsetScale;
  const drawX = (PROFILE_PHOTO_OUTPUT_SIZE - scaledWidth) / 2 + offset.x * outputOffsetScale;
  const drawY = (PROFILE_PHOTO_OUTPUT_SIZE - scaledHeight) / 2 + offset.y * outputOffsetScale;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PROFILE_PHOTO_OUTPUT_SIZE, PROFILE_PHOTO_OUTPUT_SIZE);
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

function mapForm(profile: WhatsAppBusinessProfile | null): BusinessProfileFormState {
  return {
    about: profile?.about || '',
    address: profile?.address || '',
    description: profile?.description || '',
    email: profile?.email || '',
    vertical: profile?.vertical || '',
    website1: profile?.websites[0] || '',
    website2: profile?.websites[1] || '',
  };
}

function formatVerticalLabel(value: string | null | undefined) {
  return (value || '')
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCategoryToken(value: string | null | undefined) {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function findCategoryOption(value: string | null | undefined) {
  const normalized = normalizeCategoryToken(value);

  if (!normalized) {
    return null;
  }

  return (
    BUSINESS_CATEGORY_OPTIONS.find((option) => {
      const aliases = 'aliases' in option ? option.aliases : [];

      return (
        normalizeCategoryToken(option.value) === normalized ||
        normalizeCategoryToken(option.label) === normalized ||
        aliases.some((alias) => normalizeCategoryToken(alias) === normalized)
      );
    }) || null
  );
}

function getCategoryLabel(value: string | null | undefined) {
  return findCategoryOption(value)?.label || formatVerticalLabel(value) || 'Category not set yet';
}

function getDisplayNameStatusMeta(value: string | null | undefined) {
  const normalized = (value || '').trim().toUpperCase();

  if (!normalized) {
    return {
      label: 'Not available',
      badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-600',
    };
  }

  if (normalized.includes('REJECT')) {
    return {
      label: 'Rejected',
      badgeClassName: 'border border-red-200 bg-red-50 text-red-700',
    };
  }

  if (normalized.includes('PENDING') || normalized.includes('REVIEW')) {
    return {
      label: 'Under review',
      badgeClassName: 'border border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (normalized.includes('APPROVED') || normalized.includes('AVAILABLE')) {
    return {
      label: 'Approved',
      badgeClassName: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  return {
    label: formatVerticalLabel(normalized),
    badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-700',
  };
}

function getOfficialBusinessAccountStatusMeta(status: WhatsAppOfficialBusinessAccountStatus | null | undefined) {
  const normalized = (status?.obaStatus || '').trim().toUpperCase();

  if (normalized === 'APPROVED') {
    return {
      label: 'Blue tick active',
      badgeClassName: 'border border-blue-200 bg-blue-50 text-blue-700',
      message: status?.statusMessage || 'This WhatsApp profile is an approved Official Business Account.',
      isApproved: true,
    };
  }

  if (normalized === 'PENDING' || normalized === 'UNDER_REVIEW') {
    return {
      label: normalized === 'PENDING' ? 'Pending' : 'Under review',
      badgeClassName: 'border border-amber-200 bg-amber-50 text-amber-700',
      message: status?.statusMessage || 'Meta is reviewing this Official Business Account status.',
      isApproved: false,
    };
  }

  if (normalized === 'REJECTED') {
    return {
      label: 'Rejected',
      badgeClassName: 'border border-red-200 bg-red-50 text-red-700',
      message: status?.statusMessage || 'Meta rejected the latest Official Business Account request.',
      isApproved: false,
    };
  }

  if (normalized === 'EXPIRED' || normalized === 'CANCELLED') {
    return {
      label: formatVerticalLabel(normalized),
      badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-700',
      message: status?.statusMessage || 'The Official Business Account request is no longer active.',
      isApproved: false,
    };
  }

  if (status?.lastError) {
    return {
      label: 'Unavailable',
      badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-600',
      message: status.lastError,
      isApproved: false,
    };
  }

  return {
    label: status?.statusMessage ? 'Unavailable' : 'Not approved',
    badgeClassName: 'border border-slate-200 bg-slate-50 text-slate-600',
    message: status?.statusMessage || 'Meta has not returned an approved Official Business Account status.',
    isApproved: false,
  };
}

function getPreviewName(
  businessProfile: WhatsAppBusinessProfile | null,
  bootstrap: DashboardBootstrap,
) {
  return (
    businessProfile?.verifiedName ||
    businessProfile?.businessAccountName ||
    bootstrap.channel?.verifiedName ||
    bootstrap.profile?.companyName ||
    'Business Profile'
  );
}

function PreviewDetailRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm leading-6 text-slate-700">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Keep page-specific UI helpers local so cleanup stays visual-only and does not alter API/data contracts.
function getStatusDotClassName(className: string) {
  if (className.includes('red')) return 'bg-red-500';
  if (className.includes('amber')) return 'bg-amber-500';
  if (className.includes('emerald')) return 'bg-emerald-500';
  if (className.includes('blue')) return 'bg-blue-500';
  return 'bg-slate-400';
}

function ActionButton({
  children,
  className = '',
  type = 'button',
  variant = 'secondary',
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const variantClassName =
    variant === 'primary'
      ? 'bg-[#1381FF] text-white shadow-[0_10px_24px_rgba(19,129,255,0.22)] hover:bg-[#4a35e8]'
      : variant === 'ghost'
        ? 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50';

  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all duration-200 ease-out hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 ${variantClassName} ${className}`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-gray-400" /> : null}
          <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
        </div>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function ProfileSection({
  title,
  description,
  icon,
  action,
  children,
  shouldReduceMotion,
  className = '',
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  shouldReduceMotion: boolean | null;
  className?: string;
}) {
  return (
    <motion.section
      variants={slideUp}
      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
      className={`relative border-b border-gray-100 py-6 first:pt-0 last:border-b-0 last:pb-0 ${className}`}
    >
      <SectionHeader title={title} description={description} icon={icon} action={action} />
      {children}
    </motion.section>
  );
}

function FormField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      {description ? <span className="mt-1 block text-xs leading-5 text-gray-500">{description}</span> : null}
      <span className="mt-2 block">{children}</span>
    </div>
  );
}

function StatusSummary({
  label,
  className,
  icon,
  pulse = false,
}: {
  label: string;
  className: string;
  icon?: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-gray-50 px-2.5 text-xs font-medium text-gray-700 transition-colors duration-200">
      {icon || <span className={`h-2 w-2 rounded-full ${getStatusDotClassName(className)} ${pulse ? 'animate-pulse' : ''}`} />}
      {label}
    </span>
  );
}

function SnapshotRow({
  icon: Icon,
  value,
  label,
  iconClassName,
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  iconClassName?: string;
}) {
  return (
    <div className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-gray-50">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClassName || 'text-gray-400'}`} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{value}</p>
        <p className="mt-0.5 text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}



function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

function BusinessProfileSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="space-y-6">
          <LoadingBlock className="h-8 w-48" />
          <LoadingBlock className="h-24 w-full" />
          <LoadingBlock className="h-px w-full rounded-none" />
          <LoadingBlock className="h-40 w-full" />
          <LoadingBlock className="h-px w-full rounded-none" />
          <LoadingBlock className="h-44 w-full" />
          <LoadingBlock className="h-10 w-32" />
        </div>
      </div>

      <div className="space-y-4">
        <LoadingBlock className="h-[520px] w-full" />
        <LoadingBlock className="h-48 w-full" />
      </div>
    </div>
  );
}

export default function BusinessProfile() {
  const {
    bootstrap,
    businessProfile,
    isBusinessProfileLoading,
    businessProfileError,
    refreshBusinessProfile,
    setBusinessProfile,
  } = useAppData();
  const shouldReduceMotion = useReducedMotion();
  const [form, setForm] = useState<BusinessProfileFormState>(() => mapForm(businessProfile));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(
    () => businessProfile?.displayNameRequest?.requestedName || businessProfile?.verifiedName || bootstrap?.channel?.verifiedName || '',
  );
  const [isDisplayNameDirty, setIsDisplayNameDirty] = useState(false);
  const [isSubmittingDisplayName, setIsSubmittingDisplayName] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false);
  const [photoEditorSourceUrl, setPhotoEditorSourceUrl] = useState<string | null>(null);
  const [photoEditorFileName, setPhotoEditorFileName] = useState('profile-photo.jpg');
  const [photoEditorZoom, setPhotoEditorZoom] = useState(MIN_PHOTO_EDITOR_ZOOM);
  const [photoEditorOffset, setPhotoEditorOffset] = useState({ x: 0, y: 0 });
  const [photoEditorImageSize, setPhotoEditorImageSize] = useState<PhotoEditorImageSize | null>(null);
  const [photoEditorDragState, setPhotoEditorDragState] = useState<PhotoEditorDragState | null>(null);
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dismissedBusinessProfileError, setDismissedBusinessProfileError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const takePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const photoMenuRef = useRef<HTMLDivElement | null>(null);
  const photoEditorPreviewRef = useRef<HTMLDivElement | null>(null);

  const serverForm = useMemo(() => mapForm(businessProfile), [businessProfile]);
  const currentDisplayName =
    businessProfile?.verifiedName ||
    bootstrap?.channel?.verifiedName ||
    bootstrap?.profile?.companyName ||
    '';
  const editableDisplayName = businessProfile?.displayNameRequest?.requestedName || currentDisplayName;

  useEffect(() => {
    if (!businessProfile) {
      if (!isBusinessProfileLoading) {
        setForm(EMPTY_FORM_STATE);
        setIsDirty(false);
      }
      return;
    }

    if (!isDirty) {
      setForm(serverForm);
    }
  }, [businessProfile, isBusinessProfileLoading, isDirty, serverForm]);

  useEffect(() => {
    if (!avatarPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!photoEditorSourceUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(photoEditorSourceUrl);
    };
  }, [photoEditorSourceUrl]);

  useEffect(() => {
    if (!photoEditorSourceUrl) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isUploadingPhoto) {
        return;
      }

      event.preventDefault();
      setPhotoEditorDragState(null);
      setPhotoEditorSourceUrl(null);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUploadingPhoto, photoEditorSourceUrl]);

  useEffect(() => {
    if (!isPhotoMenuOpen) {
      return;
    }

    const handleWindowMouseDown = (event: MouseEvent) => {
      if (photoMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsPhotoMenuOpen(false);
    };

    window.addEventListener('mousedown', handleWindowMouseDown);

    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [isPhotoMenuOpen]);

  useEffect(() => {
    if (!isDisplayNameDirty) {
      setDisplayNameDraft(editableDisplayName);
    }
  }, [editableDisplayName, isDisplayNameDirty]);

  if (!bootstrap?.channel) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <UserCircle className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-5 text-2xl font-bold text-gray-900">Connect WhatsApp first</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
            The Business Profile page works on your connected WhatsApp Business phone number. Connect the channel first, then this page will stay synced with the live Meta profile.
          </p>
          <Link
            to="/onboarding/channel-connection"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1381FF] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/30 transition hover:bg-[#4a35e8]"
          >
            Open channel setup
          </Link>
        </div>
      </div>
    );
  }

  const handleFieldChange = (field: keyof BusinessProfileFormState, value: string) => {
    setIsDirty(true);
    setError(null);
    setSuccess(null);
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSync = async () => {
    setError(null);
    setSuccess(null);

    const nextProfile = await refreshBusinessProfile();

    if (!nextProfile) {
      return;
    }

    setAvatarPreviewUrl(nextProfile.profilePictureUrl || null);
    setIsPhotoRemoved(false);
    setSuccess(
      isDirty
        ? 'Latest Meta data synced in the background. Your unsaved edits were preserved.'
        : 'Business profile synced from Meta.',
    );
  };

  const handleDisplayNameDraftChange = (value: string) => {
    setDisplayNameDraft(value);
    setIsDisplayNameDirty(true);
    setError(null);
    setSuccess(null);
  };

  const handleSubmitDisplayName = async () => {
    const nextDisplayName = displayNameDraft.trim();

    if (nextDisplayName.length < 3) {
      setError('Display name must be at least 3 characters.');
      setSuccess(null);
      return;
    }

    try {
      setIsSubmittingDisplayName(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.updateWhatsAppDisplayName({
        displayName: nextDisplayName,
      });

      setBusinessProfile(() => response.profile);
      setDisplayNameDraft(response.profile.displayNameRequest?.requestedName || response.profile.verifiedName || nextDisplayName);
      setIsDisplayNameDirty(false);
      setSuccess('Display name submitted to Meta for review.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit display name.');
    } finally {
      setIsSubmittingDisplayName(false);
    }
  };

  const handlePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Profile photo must be a PNG or JPEG image.');
      setSuccess(null);
      input.value = '';
      return;
    }

    setError(null);
    setSuccess(null);
    setIsPhotoMenuOpen(false);
    setPhotoEditorSourceUrl(URL.createObjectURL(file));
    setPhotoEditorFileName(file.name || 'profile-photo.jpg');
    setPhotoEditorZoom(MIN_PHOTO_EDITOR_ZOOM);
    setPhotoEditorOffset({ x: 0, y: 0 });
    setPhotoEditorImageSize(null);
    setPhotoEditorDragState(null);
    input.value = '';
  };

  const handleViewPhoto = () => {
    const nextPhotoUrl = previewAvatarUrl || defaultProfilePictureUrl;

    setIsPhotoMenuOpen(false);
    window.open(nextPhotoUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRemovePhoto = async () => {
    setIsPhotoMenuOpen(false);
    setPhotoEditorSourceUrl(null);

    if (!previewAvatarUrl) {
      return;
    }

    try {
      setIsRemovingPhoto(true);
      setSuccess(null);
      setError(null);

      const response = await appApi.updateBusinessProfile({ profilePictureHandle: '' });

      setBusinessProfile(() => response.profile);
      setAvatarPreviewUrl(null);
      setIsPhotoRemoved(true);
      setSuccess('Profile photo removed from WhatsApp.');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove profile photo.');
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  const getPhotoEditorPreviewSize = () => photoEditorPreviewRef.current?.getBoundingClientRect().width || 360;

  const handlePhotoEditorPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isUploadingPhoto) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setPhotoEditorDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffset: photoEditorOffset,
    });
  };

  const handlePhotoEditorPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!photoEditorDragState || photoEditorDragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const previewSize = getPhotoEditorPreviewSize();
    setPhotoEditorOffset(
      getBoundedPhotoOffset({
        x: photoEditorDragState.initialOffset.x + event.clientX - photoEditorDragState.startX,
        y: photoEditorDragState.initialOffset.y + event.clientY - photoEditorDragState.startY,
      }, photoEditorZoom, previewSize, photoEditorImageSize),
    );
  };

  const handlePhotoEditorPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (photoEditorDragState?.pointerId === event.pointerId) {
      setPhotoEditorDragState(null);
    }
  };

  const handlePhotoEditorZoomChange = (delta: number) => {
    const previewSize = getPhotoEditorPreviewSize();

    setPhotoEditorZoom((currentZoom) => {
      const nextZoom = clamp(currentZoom + delta, MIN_PHOTO_EDITOR_ZOOM, MAX_PHOTO_EDITOR_ZOOM);
      setPhotoEditorOffset((currentOffset) =>
        getBoundedPhotoOffset(currentOffset, nextZoom, previewSize, photoEditorImageSize),
      );
      return nextZoom;
    });
  };

  const handlePhotoEditorImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const nextImageSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };
    const previewSize = getPhotoEditorPreviewSize();

    setPhotoEditorImageSize(nextImageSize);
    setPhotoEditorOffset((currentOffset) =>
      getBoundedPhotoOffset(currentOffset, photoEditorZoom, previewSize, nextImageSize),
    );
  };

  const handlePhotoEditorWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (isUploadingPhoto) {
      return;
    }

    event.preventDefault();
    handlePhotoEditorZoomChange(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const handleClosePhotoEditor = () => {
    if (isUploadingPhoto) {
      return;
    }

    setPhotoEditorDragState(null);
    setPhotoEditorSourceUrl(null);
    setPhotoEditorImageSize(null);
  };

  const handlePhotoEditorUpload = async () => {
    if (!photoEditorSourceUrl) {
      return;
    }

    try {
      setIsUploadingPhoto(true);
      setError(null);
      setSuccess(null);

      const adjustedFile = await createAdjustedProfilePhotoFile({
        sourceUrl: photoEditorSourceUrl,
        fileName: photoEditorFileName,
        zoom: photoEditorZoom,
        offset: photoEditorOffset,
        previewSize: getPhotoEditorPreviewSize(),
      });
      const localPreviewUrl = URL.createObjectURL(adjustedFile);

      setAvatarPreviewUrl(localPreviewUrl);
      setIsPhotoRemoved(false);

      const response = await appApi.uploadBusinessProfilePhoto(adjustedFile);
      setBusinessProfile(() => response.profile);
      setAvatarPreviewUrl(response.profile.profilePictureUrl || localPreviewUrl);
      setPhotoEditorSourceUrl(null);
      setSuccess('Profile photo updated in Meta.');
    } catch (uploadError) {
      setAvatarPreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to update profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.updateBusinessProfile({
        about: form.about,
        address: form.address,
        description: form.description,
        email: form.email,
        vertical: findCategoryOption(form.vertical)?.value || form.vertical,
        websites: [form.website1, form.website2].map((value) => value.trim()).filter(Boolean),
      });

      setBusinessProfile(() => response.profile);
      setForm(mapForm(response.profile));
      setAvatarPreviewUrl(response.profile.profilePictureUrl || null);
      setIsPhotoRemoved(false);
      setIsDirty(false);
      setSuccess('Business profile updated in Meta.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save business profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const categoryOptions = (() => {
    const matchedOption = findCategoryOption(form.vertical);

    if (!form.vertical.trim() || matchedOption) {
      return BUSINESS_CATEGORY_OPTIONS;
    }

    return [
      {
        label: `${formatVerticalLabel(form.vertical)} (Current)`,
        value: form.vertical,
      },
      ...BUSINESS_CATEGORY_OPTIONS,
    ];
  })();

  const previewName =
    isDisplayNameDirty && displayNameDraft.trim()
      ? displayNameDraft.trim()
      : getPreviewName(businessProfile, bootstrap);
  const previewPhone =
    businessProfile?.displayPhoneNumber ||
    bootstrap.channel.displayPhoneNumber ||
    bootstrap.channel.phoneNumberId;
  const previewSummary =
    form.description.trim() ||
    form.about.trim() ||
    'Add a business description to show customers what you do before they start a chat.';
  const previewCategory = getCategoryLabel(form.vertical || bootstrap.profile?.industry || '');
  const previewEmail = form.email.trim();
  const previewAddress = form.address.trim();
  const previewWebsites = [form.website1, form.website2].map((value) => value.trim()).filter(Boolean);
  const previewAvatarUrl = isPhotoRemoved ? null : avatarPreviewUrl || businessProfile?.profilePictureUrl;
  const activeBusinessProfileError =
    businessProfileError && businessProfileError !== dismissedBusinessProfileError ? businessProfileError : null;
  const activeError = error || activeBusinessProfileError;
  const showSkeleton = isBusinessProfileLoading && !businessProfile;
  const displayNameStatus = getDisplayNameStatusMeta(businessProfile?.displayNameStatus);
  const displayNameRequest = businessProfile?.displayNameRequest || null;
  const officialBusinessAccountStatus = businessProfile?.officialBusinessAccountStatus || null;
  const officialBusinessAccountMeta = getOfficialBusinessAccountStatusMeta(officialBusinessAccountStatus);
  const showOfficialBlueTick = officialBusinessAccountMeta.isApproved;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      variants={staggerContainer}
      className="mx-auto max-w-6xl space-y-6"
    >
      <motion.div variants={slideUp} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Business Profile</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Manage the public WhatsApp profile customers see before they start a conversation.
          </p>
        </div>
        <ActionButton
          onClick={() => void handleSync()}
          disabled={isBusinessProfileLoading || isSaving || isUploadingPhoto || isRemovingPhoto}
        >
          <RefreshCw className={`h-4 w-4 ${isBusinessProfileLoading ? 'animate-spin' : ''}`} />
          Sync now
        </ActionButton>
      </motion.div>

      <FeedbackPopupStack
        items={
          activeError
            ? [
                {
                  id: `business-profile-error:${activeError}`,
                  message: activeError,
                  tone: 'error',
                  onDismiss: () => {
                    if (error) {
                      setError(null);
                      return;
                    }

                    setDismissedBusinessProfileError(activeBusinessProfileError);
                  },
                },
              ]
            : success
              ? [
                  {
                    id: `business-profile-success:${success}`,
                    message: success,
                    tone: 'success',
                    onDismiss: () => setSuccess(null),
                  },
                ]
              : []
        }
      />

      {showSkeleton ? (
        <BusinessProfileSkeleton />
      ) : (
        <motion.div variants={staggerContainer} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div variants={slideUp} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div>
                <ProfileSection
                  title="Identity"
                  description="Profile image and display name shown on WhatsApp."
                  icon={UserCircle}
                  shouldReduceMotion={shouldReduceMotion}
                  className={isPhotoMenuOpen ? 'z-50' : 'z-10'}
                  action={<StatusSummary label={displayNameStatus.label} className={displayNameStatus.badgeClassName} />}
                >
                  <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="flex justify-center lg:justify-start">
                      <div ref={photoMenuRef} className="relative z-50 flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => setIsPhotoMenuOpen((current) => !current)}
                          disabled={isUploadingPhoto || isRemovingPhoto || isSaving}
                          className="group relative h-32 w-32 rounded-full outline-none transition duration-200 hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-[#1381FF]/20 disabled:cursor-not-allowed disabled:opacity-70"
                          aria-haspopup="menu"
                          aria-expanded={isPhotoMenuOpen}
                        >
                          <span className="block h-full w-full overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-100">
                            <img
                              src={previewAvatarUrl || defaultProfilePictureUrl}
                              alt={previewAvatarUrl ? previewName : `${previewName} default profile`}
                              className="h-full w-full object-cover"
                              draggable={false}
                              onError={(event) => {
                                event.currentTarget.src = defaultProfilePictureUrl;
                              }}
                            />
                          </span>
                          <span className="absolute -bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-sm font-semibold text-[#00A884] shadow-sm transition group-hover:border-[#00A884]/40 group-hover:bg-[#f0fff8]">
                            <Camera className={`h-4 w-4 ${isUploadingPhoto ? 'animate-pulse' : ''}`} />
                            {isUploadingPhoto ? 'Uploading' : isRemovingPhoto ? 'Removing' : 'Edit'}
                          </span>
                        </button>

                        <p className="mt-7 text-center text-xs leading-5 text-gray-500">PNG or JPEG only.</p>

                        <AnimatePresence>
                          {isPhotoMenuOpen ? (
                            <motion.div
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.16, ease: MOTION_EASE }}
                              className="absolute left-1/2 top-[calc(100%+0.5rem)] z-[120] w-56 -translate-x-1/2 overflow-hidden rounded-2xl border border-black/10 bg-[#202124] py-2 text-sm font-semibold text-gray-300 shadow-2xl lg:left-3/4"
                              role="menu"
                            >
                              <button type="button" onClick={handleViewPhoto} className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-white/5 hover:text-white" role="menuitem">
                                <Eye className="h-5 w-5 text-gray-400" />
                                View photo
                              </button>
                              <button type="button" onClick={() => { setIsPhotoMenuOpen(false); takePhotoInputRef.current?.click(); }} className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-white/5 hover:text-white" role="menuitem">
                                <Camera className="h-5 w-5 text-gray-400" />
                                Take photo
                              </button>
                              <button type="button" onClick={() => { setIsPhotoMenuOpen(false); photoInputRef.current?.click(); }} className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-white/5 hover:text-white" role="menuitem">
                                <FolderOpen className="h-5 w-5 text-gray-400" />
                                Upload photo
                              </button>
                              <div className="my-2 border-t border-white/10" />
                              <button
                                type="button"
                                onClick={() => void handleRemovePhoto()}
                                disabled={!previewAvatarUrl || isRemovingPhoto}
                                className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                                role="menuitem"
                              >
                                {isRemovingPhoto ? <RefreshCw className="h-5 w-5 animate-spin text-gray-400" /> : <Trash2 className="h-5 w-5 text-gray-400" />}
                                {isRemovingPhoto ? 'Removing photo' : 'Remove photo'}
                              </button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <input
                          ref={takePhotoInputRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          capture="environment"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-xl font-semibold text-gray-900">{previewName}</h2>
                        {showOfficialBlueTick ? (
                          <BadgeCheck
                            aria-label="Official Business Account approved"
                            className="h-5 w-5 shrink-0 fill-blue-500 text-white"
                          />
                        ) : null}
                      </div>

                      <FormField
                        label="Display name"
                        description="Meta reviews public display name changes before customers see them."
                      >
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative min-w-0 flex-1">
                          <Pencil className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={displayNameDraft}
                            onChange={(event) => handleDisplayNameDraftChange(event.target.value)}
                            maxLength={100}
                            placeholder="Enter WhatsApp display name"
                            className={`${fieldInputClassName} pl-9`}
                          />
                        </div>
                        <ActionButton
                          variant="primary"
                          onClick={() => void handleSubmitDisplayName()}
                          disabled={
                            isSubmittingDisplayName ||
                            isBusinessProfileLoading ||
                            !isDisplayNameDirty ||
                            displayNameDraft.trim().length < 3
                          }
                        >
                          {isSubmittingDisplayName ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Submit for review
                        </ActionButton>
                      </div>
                      </FormField>

                      {displayNameRequest ? (
                        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          Last submitted: <span className="font-semibold">{displayNameRequest.requestedName}</span>
                          {' on '}
                          {new Date(displayNameRequest.requestedAt).toLocaleString()}
                          {displayNameRequest.status ? ` \u2022 ${displayNameRequest.status}` : ''}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </ProfileSection>

                <ProfileSection
                  title="Marketing"
                  description="Short profile copy customers use to understand your business."
                  icon={Store}
                  shouldReduceMotion={shouldReduceMotion}
                >
                <div className="grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Category</label>
                    <DropdownSelect
                      value={form.vertical}
                      onChange={(nextValue) => handleFieldChange('vertical', nextValue)}
                      options={[
                        { value: '', label: 'Select a category' },
                        ...categoryOptions.map((option) => ({
                          value: option.value,
                          label: option.label,
                        })),
                      ]}
                      placeholder="Select a category"
                      ariaLabel="Select business category"
                      buttonClassName={fieldInputClassName}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(event) => handleFieldChange('description', event.target.value)}
                      rows={4}
                      placeholder="Describe the business in the same way you want it to appear in WhatsApp."
                      className={fieldTextareaClassName}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">About (Status)</label>
                    <input
                      type="text"
                      value={form.about}
                      onChange={(event) => handleFieldChange('about', event.target.value)}
                      placeholder="Short line customers see about your business"
                      className={fieldInputClassName}
                    />
                  </div>
                </div>
                </ProfileSection>

                <ProfileSection
                  title="Communication"
                  description="Public contact details customers can use outside chat."
                  icon={MessageSquare}
                  shouldReduceMotion={shouldReduceMotion}
                >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => handleFieldChange('email', event.target.value)}
                      placeholder="hello@yourbrand.com"
                      className={fieldInputClassName}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Address</label>
                    <textarea
                      value={form.address}
                      onChange={(event) => handleFieldChange('address', event.target.value)}
                      rows={3}
                      placeholder="Add the business address customers should see."
                      className={fieldTextareaClassName}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Website 1</label>
                    <div className="relative">
                      <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        value={form.website1}
                        onChange={(event) => handleFieldChange('website1', event.target.value)}
                        placeholder="https://example.com"
                        className={`${fieldInputClassName} pl-9`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Website 2</label>
                    <div className="relative">
                      <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        value={form.website2}
                        onChange={(event) => handleFieldChange('website2', event.target.value)}
                        placeholder="https://another-link.com"
                        className={`${fieldInputClassName} pl-9`}
                      />
                    </div>
                  </div>
                </div>
                </ProfileSection>

                <ProfileSection
                  title="Trust"
                  description="Meta review and verification signals for this profile."
                  icon={ShieldCheck}
                  shouldReduceMotion={shouldReduceMotion}
                >
                  <div className="divide-y divide-gray-100 rounded-2xl bg-gray-50/70">
                    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Display name approval</p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Public name status returned by Meta.</p>
                      </div>
                      <StatusSummary label={displayNameStatus.label} className={displayNameStatus.badgeClassName} />
                    </div>

                    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Official Business Account</p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">{officialBusinessAccountMeta.message}</p>
                      </div>
                      <StatusSummary
                        label={officialBusinessAccountMeta.label}
                        className={officialBusinessAccountMeta.badgeClassName}
                        icon={showOfficialBlueTick ? <BadgeCheck className="h-4 w-4 shrink-0 fill-blue-500 text-white" /> : undefined}
                      />
                    </div>
                  </div>
                </ProfileSection>

                <motion.div
                  variants={slideUp}
                  className="sticky bottom-0 -mx-6 mt-2 flex flex-col gap-3 border-t border-gray-100 bg-white/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-gray-500">
                    {isDirty ? 'Unsaved changes in progress.' : 'Everything is in sync with the last saved profile.'}
                  </p>
                  <ActionButton
                    variant="primary"
                    onClick={() => void handleSave()}
                    disabled={isSaving || isBusinessProfileLoading || isUploadingPhoto}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </ActionButton>
                </motion.div>
              </div>
            </motion.div>

          <motion.aside variants={slideUp} className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[30px] bg-[#edf2f7] p-3 shadow-inner">
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                className="overflow-hidden rounded-[24px] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.10)]"
              >
                <div className="flex items-center justify-between px-4 py-3 text-slate-500">
                  <ArrowLeft className="h-5 w-5" />
                  <MoreVertical className="h-5 w-5" />
                </div>

                <div className="px-5 pb-5 text-center">
                  {previewAvatarUrl ? (
                    <img
                      src={previewAvatarUrl}
                      alt={previewName}
                      className="mx-auto h-20 w-20 rounded-full object-cover shadow-lg"
                      onError={(event) => {
                        event.currentTarget.src = defaultProfilePictureUrl;
                      }}
                    />
                  ) : (
                    <img
                      src={defaultProfilePictureUrl}
                      alt={`${previewName} default profile`}
                      className="mx-auto h-20 w-20 rounded-full object-cover shadow-lg"
                      draggable={false}
                    />
                  )}

                  <div className="mt-4 flex min-w-0 items-center justify-center gap-2">
                    <h2 className="min-w-0 truncate text-[28px] font-bold tracking-tight text-slate-900">
                      {previewName}
                    </h2>
                    {showOfficialBlueTick ? (
                      <BadgeCheck
                        aria-label="Official Business Account approved"
                        className="h-6 w-6 shrink-0 fill-blue-500 text-white"
                      />
                    ) : null}
                  </div>
                  <p className="mt-2 text-base font-medium text-slate-700">{previewPhone}</p>

                  <div className="mt-4 flex justify-center">
                    <motion.div
                      whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                      className="inline-flex flex-col items-center rounded-2xl border border-slate-200 px-5 py-3 text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <Share2 className="h-5 w-5" />
                      <span className="mt-1 text-sm font-medium">Share</span>
                    </motion.div>
                  </div>

                  {form.about.trim() ? (
                    <p className="mx-auto mt-4 max-w-[230px] truncate text-sm text-slate-500" title={form.about.trim()}>
                      {form.about.trim()}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-3 border-t border-slate-200 bg-slate-50/80 px-4 py-4">
                  <PreviewDetailRow icon={Store}>
                    <p className="max-h-16 overflow-hidden">{previewSummary}</p>
                  </PreviewDetailRow>
                  <PreviewDetailRow icon={Building2}>
                    <p>{previewCategory}</p>
                  </PreviewDetailRow>
                  {previewEmail ? (
                    <PreviewDetailRow icon={Mail}>
                      <p className="break-all text-[#2563eb]">{previewEmail}</p>
                    </PreviewDetailRow>
                  ) : null}
                  {previewWebsites.map((website) => (
                    <div key={website}>
                      <PreviewDetailRow icon={Globe}>
                        <p className="break-all text-[#2563eb]">{website}</p>
                      </PreviewDetailRow>
                    </div>
                  ))}
                  {previewAddress ? (
                    <PreviewDetailRow icon={MapPin}>
                      <p className="max-h-16 overflow-hidden">{previewAddress}</p>
                    </PreviewDetailRow>
                  ) : null}
                </div>
              </motion.div>

              <p className="mt-3 text-center text-xs text-slate-500">
                This preview updates instantly while you edit and may look slightly different across devices.
              </p>
            </div>

            <motion.div
              variants={slideUp}
              whileHover={shouldReduceMotion ? undefined : { y: -1 }}
              className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <SectionHeader title="Connection" description="Current WhatsApp channel details." />
              <div className="space-y-1">
                <SnapshotRow icon={MessageSquare} value={previewPhone} label="Connected phone number" iconClassName="text-[#25D366]" />
                <SnapshotRow icon={ShieldCheck} value={displayNameStatus.label} label="Display name approval" iconClassName="text-blue-500" />
                <SnapshotRow
                  icon={BadgeCheck}
                  value={officialBusinessAccountMeta.label}
                  label="Official Business Account"
                  iconClassName={showOfficialBlueTick ? 'fill-blue-500 text-white' : 'text-slate-400'}
                />
                <SnapshotRow
                  icon={Store}
                  value={businessProfile?.businessAccountName || bootstrap.channel.businessAccountName || 'Business account'}
                  label="WhatsApp Business account"
                  iconClassName="text-violet-500"
                />
              </div>
            </motion.div>
          </motion.aside>
        </motion.div>
      )}

      <AnimatePresence>
        {photoEditorSourceUrl ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          >
            <motion.div
              initial={shouldReduceMotion ? false : { y: 16, scale: 0.98 }}
              animate={shouldReduceMotion ? undefined : { y: 0, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { y: 16, scale: 0.98 }}
              transition={{ duration: 0.2, ease: MOTION_EASE }}
              className="flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-[#111312] text-white shadow-2xl"
            >
              <div className="flex min-h-12 items-center border-b border-white/10 px-3 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleClosePhotoEditor}
                    disabled={isUploadingPhoto}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Close photo editor"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <h2 className="truncate text-base font-semibold">Drag the image to adjust</h2>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#06100d] px-4 py-4">
                <div
                  ref={photoEditorPreviewRef}
                  onPointerDown={handlePhotoEditorPointerDown}
                  onPointerMove={handlePhotoEditorPointerMove}
                  onPointerUp={handlePhotoEditorPointerUp}
                  onPointerCancel={handlePhotoEditorPointerUp}
                  onWheel={handlePhotoEditorWheel}
                  className="relative aspect-square w-full max-w-[390px] touch-none cursor-grab overflow-hidden bg-black active:cursor-grabbing"
                >
                  <img
                    src={photoEditorSourceUrl}
                    alt="Selected profile preview"
                    className="absolute max-w-none select-none"
                    draggable={false}
                    onLoad={handlePhotoEditorImageLoad}
                    style={{
                      left: `calc(50% + ${photoEditorOffset.x}px)`,
                      top: `calc(50% + ${photoEditorOffset.y}px)`,
                      width: `${Math.max(1, (photoEditorImageSize?.width || 1) / (photoEditorImageSize?.height || 1)) * photoEditorZoom * 100}%`,
                      height: `${Math.max(1, (photoEditorImageSize?.height || 1) / (photoEditorImageSize?.width || 1)) * photoEditorZoom * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.48)] ring-1 ring-white/10" />
                </div>

                <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-black/40 text-white shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => handlePhotoEditorZoomChange(0.1)}
                    disabled={isUploadingPhoto || photoEditorZoom >= MAX_PHOTO_EDITOR_ZOOM}
                    className="inline-flex h-10 w-10 items-center justify-center transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-5 w-5" />
                  </button>
                  <div className="mx-3 border-t border-white/15" />
                  <button
                    type="button"
                    onClick={() => handlePhotoEditorZoomChange(-0.1)}
                    disabled={isUploadingPhoto || photoEditorZoom <= MIN_PHOTO_EDITOR_ZOOM}
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
                  onClick={() => void handlePhotoEditorUpload()}
                  disabled={isUploadingPhoto}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#21c667] text-white shadow-lg shadow-[#21c667]/20 transition hover:scale-105 hover:bg-[#19b85c] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  aria-label="Upload adjusted photo"
                >
                  {isUploadingPhoto ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-6 w-6" />}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
