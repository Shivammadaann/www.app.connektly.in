import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Search,
  Send,
  Smile,
  Star,
  Tag,
  ToggleLeft,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import {
  canRequestCallPermissionFromResponse,
  canStartCallFromPermissionResponse,
  getCallPermissionUnavailableMessage,
} from '../../lib/call-permissions';
import {
  mapConversationMessageRecord,
  mergeConversationMessages,
  removeConversationMessage,
  replaceConversationMessage,
  upsertConversationMessage,
  upsertConversationThread,
} from '../../lib/conversations';
import { useAppData } from '../../context/AppDataContext';
import { useCallManager } from '../../context/CallManagerContext';
import { getCachedSession, supabase } from '../../lib/supabase';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { getConversationDisplayDetail, getConversationDisplayName } from '../../lib/conversation-display';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import type { ChannelBrand } from '../../components/ChannelBrandIcon';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { lockBodyScroll } from '../../lib/useBodyScrollLock';
import defaultProfilePictureUrl from '../../assets/profile.png';
import type {
  ConversationMessage,
  ConversationThread,
  MetaTemplate,
  SendMediaMessageInput,
  WhatsAppBlockedUser,
} from '../../lib/types';

const EMOJI_CHOICES = ['\u{1F600}', '\u{1F602}', '\u{1F60D}', '\u{1F64F}', '\u{1F525}', '\u{1F389}', '\u{1F44D}', '\u{2764}\u{FE0F}', '\u{2728}', '\u{1F91D}', '\u{1F4E6}', '\u{1F680}'];
const AUTO_SCROLL_THRESHOLD_PX = 96;
const MEDIA_PREVIEW_MIN_ZOOM = 1;
const MEDIA_PREVIEW_MAX_ZOOM = 3;
const MEDIA_PREVIEW_ZOOM_STEP = 0.25;
const TEMPLATE_HEADER_MEDIA_PREVIEW_KEY = '__connektly_header_media_preview';

interface PendingAttachment {
  mediaId: string;
  mediaType: SendMediaMessageInput['mediaType'];
  fileName: string;
  mimeType: string;
  previewUrl: string | null;
}

type InboxThreadFilter = 'all' | 'unread' | 'starred';
type InboxChannelFilter = 'all' | 'whatsapp' | 'instagram' | 'messenger';
type TemplateMediaHeaderType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ContactDetailsSection = 'contact' | 'labels' | 'crm';

interface HeaderMediaPreviewMetadata {
  previewUrl?: string;
  fileName?: string;
  mimeType?: string;
}

const STARRED_THREADS_STORAGE_KEY = 'connektly-inbox-starred-threads';
const ACTIVE_THREAD_POLL_INTERVAL_MS = 600;
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONVERSATION_WINDOW_TICK_MS = 60 * 1000;
const THREAD_FILTER_OPTIONS: Array<{ id: InboxThreadFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
];
const CHANNEL_FILTER_OPTIONS: Array<{ id: InboxChannelFilter; label: string; icon?: ChannelBrand }> = [
  { id: 'all', label: 'All Channels' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram' },
  { id: 'messenger', label: 'Messenger', icon: 'messenger' },
];
const MOTION_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const layoutStaggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
};
const panelRiseVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: MOTION_EASE },
  },
};

function getThreadChannel(thread: ConversationThread | null | undefined): Exclude<InboxChannelFilter, 'all'> {
  const source = thread?.source?.trim().toLowerCase() || '';

  if (source === 'messenger' || thread?.contactWaId?.startsWith('messenger:')) {
    return 'messenger';
  }

  if (source === 'instagram' || thread?.contactWaId?.startsWith('instagram:')) {
    return 'instagram';
  }

  return 'whatsapp';
}

function getChannelLabel(channel: Exclude<InboxChannelFilter, 'all'>) {
  switch (channel) {
    case 'messenger':
      return 'Messenger';
    case 'instagram':
      return 'Instagram';
    case 'whatsapp':
    default:
      return 'WhatsApp';
  }
}

function DetailsAccordionSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:text-gray-950"
      >
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-gray-900">
          <span className="text-gray-400">{icon}</span>
          <span className="truncate">{title}</span>
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="pb-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function ContactDetailsContent({
  activeThread,
  activeThreadChannel,
  activeThreadChannelLabel,
  ownerName,
  openSections,
  onToggleSection,
  onAddLabel,
  onAssignOwner,
  onToggleMarketingOptIn,
  isMarketingOptUpdating = false,
}: {
  activeThread: ConversationThread | null;
  activeThreadChannel: Exclude<InboxChannelFilter, 'all'> | null;
  activeThreadChannelLabel: string;
  ownerName: string;
  openSections: Record<ContactDetailsSection, boolean>;
  onToggleSection: (section: ContactDetailsSection) => void;
  onAddLabel?: () => void;
  onAssignOwner?: () => void;
  onToggleMarketingOptIn?: () => void;
  isMarketingOptUpdating?: boolean;
}) {
  const isMarketingOptedIn = !activeThread?.marketingOptedOut;
  const isExternalMessagingThread =
    activeThreadChannel === 'instagram' || activeThreadChannel === 'messenger';
  const usernameLabel = activeThreadChannel === 'instagram' ? 'Instagram Username' : 'Messenger Name';
  const usernameValue =
    activeThread?.username ||
    (isExternalMessagingThread ? getConversationDisplayDetail(activeThread) : null);

  return (
    <div className="h-full bg-white px-4 py-3">
      <div className="group mb-2 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-3">
          <ConversationAvatar thread={activeThread} size="panel" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-gray-900">
              {activeThread ? getConversationDisplayName(activeThread) : 'No contact selected'}
            </h2>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs font-medium text-gray-500">
              {activeThreadChannel ? <ChannelBrandIcon channel={activeThreadChannel} className="h-4 w-4 shrink-0" alt="" /> : null}
              <span className="truncate">{activeThreadChannel ? getChannelLabel(activeThreadChannel) : activeThreadChannelLabel}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={onAddLabel}
              disabled={!activeThread || !onAddLabel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Add label"
              title="Add label"
            >
              <Tag className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onAssignOwner}
              disabled={!activeThread || !onAssignOwner}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Assign owner"
              title="Assign owner"
            >
              <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <DetailsAccordionSection
          title="Contact Info"
          icon={<Phone className="h-4 w-4" />}
          isOpen={openSections.contact}
          onToggle={() => onToggleSection('contact')}
        >
          <div className="space-y-1">
            {isExternalMessagingThread ? (
              <div className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 rounded-lg px-2 py-1.5 transition hover:bg-gray-50">
                <User className="mt-0.5 h-4 w-4 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-400">{usernameLabel}</p>
                  <p className="truncate text-sm font-medium text-gray-900">{usernameValue || 'Username unavailable'}</p>
                </div>
              </div>
            ) : (
              <div className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 rounded-lg px-2 py-1.5 transition hover:bg-gray-50">
                <Phone className="mt-0.5 h-4 w-4 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-400">Phone</p>
                  <p className="truncate text-sm font-medium text-gray-900">{getConversationDisplayDetail(activeThread) || 'No phone available'}</p>
                </div>
              </div>
            )}
            <div className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 rounded-lg px-2 py-1.5 transition hover:bg-gray-50">
              <Mail className="mt-0.5 h-4 w-4 text-gray-400" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-400">Email</p>
                <p className="truncate text-sm font-medium text-gray-900">No email synced</p>
              </div>
            </div>
            {activeThreadChannel === 'whatsapp' ? (
              <div className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 rounded-lg px-2 py-2 transition hover:bg-gray-50">
                <ToggleLeft className="mt-0.5 h-4 w-4 text-gray-400" />
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-400">WhatsApp Marketing</p>
                      <p className="mt-0.5 text-sm font-medium text-gray-900">
                        {isMarketingOptedIn ? 'Opted In' : 'Opted Out'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isMarketingOptedIn}
                      onClick={onToggleMarketingOptIn}
                      disabled={!activeThread || !onToggleMarketingOptIn || isMarketingOptUpdating}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isMarketingOptedIn ? 'border-emerald-400 bg-emerald-500' : 'border-gray-300 bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          isMarketingOptedIn ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {activeThread?.marketingOptedOut
                      ? 'Marketing template campaigns are blocked for this contact.'
                      : 'This contact can receive WhatsApp marketing campaign templates.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </DetailsAccordionSection>

        <DetailsAccordionSection
          title="Labels"
          icon={<Tag className="h-4 w-4" />}
          isOpen={openSections.labels}
          onToggle={() => onToggleSection('labels')}
        >
          <div className="flex flex-wrap gap-2">
            {(activeThread?.labels || []).length > 0 ? (
              activeThread?.labels.map((label) => (
                <span key={label} className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                  <Tag className="h-3 w-3 text-gray-400" /> {label}
                </span>
              ))
            ) : (
              <button
                type="button"
                onClick={onAddLabel}
                disabled={!activeThread || !onAddLabel}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Add label
              </button>
            )}
          </div>
        </DetailsAccordionSection>

        <DetailsAccordionSection
          title="CRM Properties"
          icon={<User className="h-4 w-4" />}
          isOpen={openSections.crm}
          onToggle={() => onToggleSection('crm')}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-400">Source</p>
              <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{activeThread?.source || activeThreadChannelLabel}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-400">Status</p>
              <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{activeThread?.status || 'New Lead'}</p>
            </div>
            <div className="min-w-0 col-span-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-400">Owner</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{activeThread?.ownerName || ownerName}</p>
                </div>
                <button
                  type="button"
                  onClick={onAssignOwner}
                  disabled={!activeThread || !onAssignOwner}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Assign owner"
                  title="Assign owner"
                >
                  <User className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </DetailsAccordionSection>
      </div>
    </div>
  );
}

function TypingDots({ shouldReduceMotion }: { shouldReduceMotion: boolean | null }) {
  return (
    <div className="flex items-center gap-1 px-1" aria-label="Typing">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          animate={shouldReduceMotion ? undefined : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.12, ease: MOTION_EASE }}
          className="h-1.5 w-1.5 rounded-full bg-slate-400"
        />
      ))}
    </div>
  );
}

function getAvatarToneClass(thread: ConversationThread | null | undefined) {
  const channel = getThreadChannel(thread);

  switch (channel) {
    case 'messenger':
      return 'bg-blue-50 text-blue-700 ring-blue-100';
    case 'instagram':
      return 'bg-pink-50 text-pink-700 ring-pink-100';
    case 'whatsapp':
    default:
      return 'bg-[#25D366]/10 text-[#25D366] ring-green-100';
  }
}

function ConversationAvatar({
  thread,
  size = 'list',
}: {
  thread: ConversationThread | null | undefined;
  size?: 'list' | 'panel' | 'detail';
}) {
  const avatarUrl = thread?.avatarUrl?.trim() || null;
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const shouldShowImage = Boolean(avatarUrl && failedAvatarUrl !== avatarUrl);
  const sizeClass = size === 'detail' ? 'h-20 w-20 text-2xl' : size === 'panel' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm';

  useEffect(() => {
    if (failedAvatarUrl && failedAvatarUrl !== avatarUrl) {
      setFailedAvatarUrl(null);
    }
  }, [avatarUrl, failedAvatarUrl]);

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ${getAvatarToneClass(thread)}`}
    >
      {shouldShowImage ? (
        <img
          src={avatarUrl!}
          alt={thread ? `${getConversationDisplayName(thread)} profile` : 'Profile'}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedAvatarUrl(avatarUrl)}
        />
      ) : (
        <img
          src={defaultProfilePictureUrl}
          alt={thread ? `${getConversationDisplayName(thread)} default profile` : 'Default profile'}
          className="h-full w-full object-cover"
          draggable={false}
        />
      )}
    </div>
  );
}

function getThreadWaId(thread: ConversationThread | null) {
  return thread?.contactWaId || thread?.displayPhone || '';
}

function getMessageTimestampMs(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getMessageDateKey(value: string | null) {
  const timestampMs = getMessageTimestampMs(value);

  if (timestampMs === null) {
    return 'unknown';
  }

  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatMessageDateHeader(value: string | null) {
  const timestampMs = getMessageTimestampMs(value);

  if (timestampMs === null) {
    return 'Unknown date';
  }

  return new Date(timestampMs).toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMessageTime(value: string | null) {
  const timestampMs = getMessageTimestampMs(value);

  if (timestampMs === null) {
    return '';
  }

  return new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatConversationWindowTimeLeft(expiresAtMs: number | null, currentTimeMs: number) {
  if (!expiresAtMs) {
    return null;
  }

  const remainingMs = Math.max(expiresAtMs - currentTimeMs, 0);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getConversationWindowState(messages: ConversationMessage[], currentTimeMs: number) {
  let latestInboundMessageAtMs: number | null = null;

  for (const message of messages) {
    if (message.direction !== 'inbound' || message.messageType === 'call_summary') {
      continue;
    }

    const createdAtMs = getMessageTimestampMs(message.createdAt);

    if (createdAtMs === null) {
      continue;
    }

    if (latestInboundMessageAtMs === null || createdAtMs > latestInboundMessageAtMs) {
      latestInboundMessageAtMs = createdAtMs;
    }
  }

  if (latestInboundMessageAtMs === null) {
    return {
      isActive: false,
      expiresAtMs: null,
    };
  }

  const expiresAtMs = latestInboundMessageAtMs + CUSTOMER_SERVICE_WINDOW_MS;

  return {
    isActive: currentTimeMs < expiresAtMs,
    expiresAtMs,
  };
}

function isSendableTemplate(template: MetaTemplate) {
  const status = template.status?.trim().toUpperCase();
  return !status || status === 'APPROVED';
}

function getEmptyThreadMessage({
  channelFilter,
  threadFilter,
  hasWhatsAppChannel,
  hasInstagramChannel,
  hasMessengerChannel,
}: {
  channelFilter: InboxChannelFilter;
  threadFilter: InboxThreadFilter;
  hasWhatsAppChannel: boolean;
  hasInstagramChannel: boolean;
  hasMessengerChannel: boolean;
}) {
  if (channelFilter === 'instagram') {
    if (!hasInstagramChannel) {
      return 'Connect Instagram first so incoming DMs can create conversations here.';
    }

    if (threadFilter === 'unread') {
      return 'No unread Instagram conversations match the current filters.';
    }

    if (threadFilter === 'starred') {
      return 'No starred Instagram conversations match the current filters.';
    }

    return 'No Instagram conversations match the current filters yet.';
  }

  if (channelFilter === 'messenger') {
    if (!hasMessengerChannel) {
      return 'Connect Messenger first so incoming Page messages can create conversations here.';
    }

    if (threadFilter === 'unread') {
      return 'No unread Messenger conversations match the current filters.';
    }

    if (threadFilter === 'starred') {
      return 'No starred Messenger conversations match the current filters.';
    }

    return 'No Messenger conversations match the current filters yet.';
  }

  if (channelFilter === 'all' && !hasWhatsAppChannel && !hasInstagramChannel && !hasMessengerChannel) {
    return 'Connect a channel first so inbound traffic can create real conversations here.';
  }

  if (channelFilter === 'whatsapp' && !hasWhatsAppChannel) {
    return 'Connect WhatsApp first so inbound webhook traffic can create real conversations here.';
  }

  if (threadFilter === 'unread') {
    return 'No unread conversations match the current filters.';
  }

  if (threadFilter === 'starred') {
    return 'No starred conversations match the current filters.';
  }

  return 'No conversations match the current filters yet.';
}

function getMediaPayload(raw: Record<string, unknown>) {
  const type = typeof raw.type === 'string' ? raw.type : null;

  if (!type || !['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    return null;
  }

  const payload = raw[type] as { id?: string; mime_type?: string; filename?: string; caption?: string } | undefined;

  if (!payload?.id) {
    return null;
  }

  return {
    mediaId: payload.id,
    mediaType: type,
    mimeType: payload.mime_type || null,
    fileName: payload.filename || null,
    caption: payload.caption || null,
  };
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return [];
  }

  const components = raw.components;

  return Array.isArray(components)
    ? components.filter((component): component is Record<string, unknown> => Boolean(component) && typeof component === 'object' && !Array.isArray(component))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getMediaHeaderType(value: string | null | undefined): TemplateMediaHeaderType | null {
  const normalizedValue = value?.trim().toUpperCase();

  if (normalizedValue === 'IMAGE' || normalizedValue === 'VIDEO' || normalizedValue === 'DOCUMENT') {
    return normalizedValue;
  }

  return null;
}

function normalizeTemplateHeaderMediaUrl(value: string) {
  if (typeof window === 'undefined') {
    return value;
  }

  try {
    const parsed = new URL(value, window.location.origin);

    if (parsed.pathname.startsWith('/api/template-header-media/')) {
      return `${parsed.pathname}${parsed.search}`;
    }

    if (parsed.pathname.startsWith('/template-header-media/')) {
      return `/api/template-header-media${parsed.pathname.slice('/template-header-media'.length)}${parsed.search}`;
    }
  } catch {
    return value;
  }

  return value;
}

function normalizeHeaderMediaPreview(value: unknown): HeaderMediaPreviewMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const previewUrl =
    typeof value.previewUrl === 'string' && value.previewUrl.trim()
      ? value.previewUrl.trim()
      : typeof value.url === 'string' && value.url.trim()
        ? value.url.trim()
        : '';

  if (!previewUrl) {
    return null;
  }

  return {
    previewUrl: normalizeTemplateHeaderMediaUrl(previewUrl),
    fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
  };
}

function getStoredHeaderMediaPreview(raw: Record<string, unknown> | null | undefined): HeaderMediaPreviewMetadata | null {
  return normalizeHeaderMediaPreview(raw?.[TEMPLATE_HEADER_MEDIA_PREVIEW_KEY]) || normalizeHeaderMediaPreview(raw?.headerMediaPreview);
}

function getTemplateHeaderMediaPreviewFromPayload(value: unknown): HeaderMediaPreviewMetadata | null {
  if (!isRecord(value) || !Array.isArray(value.components)) {
    return null;
  }

  const headerComponent = value.components.find((component): component is Record<string, unknown> => {
    return isRecord(component) && typeof component.type === 'string' && component.type.toLowerCase() === 'header';
  });

  if (!headerComponent || !Array.isArray(headerComponent.parameters)) {
    return null;
  }

  const mediaParameter = headerComponent.parameters.find((parameter): parameter is Record<string, unknown> => {
    if (!isRecord(parameter) || typeof parameter.type !== 'string') {
      return false;
    }

    const type = parameter.type.toLowerCase();
    return type === 'image' || type === 'video' || type === 'document';
  });

  if (!mediaParameter || typeof mediaParameter.type !== 'string') {
    return null;
  }

  const mediaType = mediaParameter.type.toLowerCase();
  const mediaObject = mediaParameter[mediaType];

  if (!isRecord(mediaObject)) {
    return null;
  }

  const previewUrl = typeof mediaObject.link === 'string' && mediaObject.link.trim() ? mediaObject.link.trim() : '';

  if (!previewUrl) {
    return null;
  }

  return {
    previewUrl: normalizeTemplateHeaderMediaUrl(previewUrl),
    fileName: typeof mediaObject.filename === 'string' ? mediaObject.filename : undefined,
  };
}

function normalizeTemplateSnapshot(
  raw: Record<string, unknown> | null | undefined,
  fallback?: { name?: string | null; language?: string | null },
) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallback?.name) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallback?.name || null,
    language: typeof raw?.language === 'string' ? raw.language : fallback?.language || null,
    components,
    headerMediaPreview: getStoredHeaderMediaPreview(raw),
  };
}

function getTemplateTextComponent(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  type: 'HEADER' | 'BODY' | 'FOOTER',
) {
  if (!snapshot) {
    return null;
  }

  return snapshot.components.find((component) => component.type === type) || null;
}

function getTemplateButtons(snapshot: ReturnType<typeof normalizeTemplateSnapshot>) {
  if (!snapshot) {
    return [];
  }

  const buttonsComponent = snapshot.components.find((component) => component.type === 'BUTTONS');
  const buttons = buttonsComponent?.buttons;

  return Array.isArray(buttons)
    ? buttons.filter((button): button is Record<string, unknown> => Boolean(button) && typeof button === 'object' && !Array.isArray(button))
    : [];
}

function getTemplatePreviewText(snapshot: ReturnType<typeof normalizeTemplateSnapshot>, fallbackName?: string | null) {
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';

  if (bodyText) {
    return bodyText.replace(/\s+/g, ' ').slice(0, 140);
  }

  if (headerText) {
    return headerText.replace(/\s+/g, ' ').slice(0, 140);
  }

  return fallbackName ? `Template: ${fallbackName}` : 'Template message';
}

function resolveTemplateSnapshot(message: ConversationMessage, templates: MetaTemplate[]) {
  const fromMessage = normalizeTemplateSnapshot(
    message.raw.template_snapshot as Record<string, unknown> | undefined,
    { name: message.templateName, language: null },
  );
  const runtimeHeaderMediaPreview = getTemplateHeaderMediaPreviewFromPayload(message.raw.template);
  const template = message.templateName ? templates.find((entry) => entry.name === message.templateName) || null : null;
  const fromTemplate = template
    ? normalizeTemplateSnapshot(template.raw, {
        name: template.name,
        language: template.language,
      })
    : null;

  if (fromMessage) {
    return {
      ...fromMessage,
      headerMediaPreview:
        fromMessage.headerMediaPreview ||
        runtimeHeaderMediaPreview ||
        fromTemplate?.headerMediaPreview ||
        null,
    };
  }

  if (!fromTemplate) {
    return null;
  }

  return {
    ...fromTemplate,
    headerMediaPreview: runtimeHeaderMediaPreview || fromTemplate.headerMediaPreview || null,
  };
}

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD_PX;
}

function clampMediaPreviewZoom(value: number) {
  return Math.min(MEDIA_PREVIEW_MAX_ZOOM, Math.max(MEDIA_PREVIEW_MIN_ZOOM, value));
}

function getContactCardLines(contact: Record<string, unknown>) {
  const lines: string[] = [];
  const phones = Array.isArray(contact.phones)
    ? contact.phones.filter(
        (phone): phone is { phone?: string; wa_id?: string; type?: string } =>
          Boolean(phone) && typeof phone === 'object' && !Array.isArray(phone),
      )
    : [];
  const emails = Array.isArray(contact.emails)
    ? contact.emails.filter(
        (email): email is { email?: string } =>
          Boolean(email) && typeof email === 'object' && !Array.isArray(email),
      )
    : [];
  const organization =
    contact.org && typeof contact.org === 'object' && !Array.isArray(contact.org)
      ? (contact.org as { company?: string })
      : null;

  const primaryPhone = phones[0]?.phone || phones[0]?.wa_id || null;
  const secondaryPhone =
    phones[0]?.phone && phones[0]?.wa_id && phones[0]?.phone !== phones[0]?.wa_id ? phones[0].wa_id : null;
  const email = emails[0]?.email || null;

  if (primaryPhone) {
    lines.push(primaryPhone);
  }

  if (secondaryPhone) {
    lines.push(`WhatsApp: ${secondaryPhone}`);
  }

  if (email) {
    lines.push(email);
  }

  if (organization?.company) {
    lines.push(organization.company);
  }

  return lines.length > 0 ? lines : ['Contact details shared'];
}

function getUnsupportedMessageText(raw: Record<string, unknown>) {
  const errors = Array.isArray(raw.errors) ? raw.errors.filter(isRecord) : [];
  const firstError = errors[0] || null;
  const errorData = firstError && isRecord(firstError.error_data) ? firstError.error_data : null;
  const details =
    typeof errorData?.details === 'string' && errorData.details.trim()
      ? errorData.details.trim()
      : typeof firstError?.message === 'string' && firstError.message.trim()
        ? firstError.message.trim()
        : typeof firstError?.title === 'string' && firstError.title.trim()
          ? firstError.title.trim()
          : null;

  return details || 'This incoming WhatsApp message type is not supported by the API.';
}

function getSystemMessageText(raw: Record<string, unknown>) {
  const system = isRecord(raw.system) ? raw.system : null;

  if (!system) {
    return null;
  }

  if (typeof system.body === 'string' && system.body.trim()) {
    return system.body.trim();
  }

  const identity = typeof system.identity === 'string' && system.identity.trim() ? system.identity.trim() : null;
  const oldWaId = typeof system.wa_id === 'string' && system.wa_id.trim() ? system.wa_id.trim() : null;
  const newWaId = typeof system.new_wa_id === 'string' && system.new_wa_id.trim() ? system.new_wa_id.trim() : null;

  if (oldWaId && newWaId) {
    return `WhatsApp system notice: ${oldWaId} changed to ${newWaId}`;
  }

  if (identity) {
    return `WhatsApp system notice for ${identity}`;
  }

  return null;
}

function getNestedText(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getTextObjectText(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return isRecord(value) ? getNestedText(value, 'text') || getNestedText(value, 'body') : null;
}

function isGenericInteractiveText(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'interactive reply' || normalized === 'interactive message';
}

function isGenericSystemText(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'whatsapp system message' || normalized === 'system message';
}

function getInteractiveMessageText(raw: Record<string, unknown>) {
  const interactive = isRecord(raw.interactive) ? raw.interactive : null;

  if (!interactive) {
    return null;
  }

  const header = isRecord(interactive.header) ? interactive.header : null;
  const footer = isRecord(interactive.footer) ? interactive.footer : null;
  const buttonReply = isRecord(interactive.button_reply) ? interactive.button_reply : null;
  const listReply = isRecord(interactive.list_reply) ? interactive.list_reply : null;
  const nfmReply = isRecord(interactive.nfm_reply) ? interactive.nfm_reply : null;
  const action = isRecord(interactive.action) ? interactive.action : null;
  const parameters = isRecord(action?.parameters) ? action.parameters : null;

  const text =
    getTextObjectText(interactive.body) ||
    getNestedText(header, 'text') ||
    getTextObjectText(footer) ||
    getNestedText(nfmReply, 'body') ||
    getNestedText(buttonReply, 'title') ||
    getNestedText(listReply, 'title') ||
    getNestedText(listReply, 'description') ||
    getNestedText(parameters, 'display_text') ||
    getNestedText(parameters, 'text') ||
    getNestedText(parameters, 'body') ||
    getNestedText(parameters, 'title');

  return isGenericInteractiveText(text) ? null : text;
}

function getInteractiveType(raw: Record<string, unknown>) {
  const interactive = isRecord(raw.interactive) ? raw.interactive : null;
  return getNestedText(interactive, 'type')?.toLowerCase() || null;
}

function looksLikeWhatsAppSystemNotice(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    normalized.includes('end-to-end encrypted') ||
    normalized.includes('security code') ||
    normalized.includes('disappearing messages') ||
    normalized.includes('view once') ||
    normalized.includes('chat lock') ||
    normalized.includes('silence unknown callers') ||
    normalized.includes('this business') ||
    normalized.includes('business account') ||
    normalized.includes('permission') ||
    normalized.includes('blocked this business') ||
    normalized.includes('managed by other companies') ||
    normalized.includes('only admins can send messages') ||
    normalized.includes('community created') ||
    normalized.includes('admin deleted this message') ||
    normalized.includes('message was deleted') ||
    normalized.includes('waiting for this message') ||
    normalized.includes('forwarded many times') ||
    normalized.includes('changed your phone number') ||
    normalized.includes('pinned message') ||
    normalized.includes('starred message') ||
    normalized.includes('media visibility') ||
    normalized.includes('linked devices') ||
    normalized.includes('companion mode') ||
    normalized.includes('syncing messages') ||
    normalized.includes('restoring backup') ||
    normalized.includes('restore chat history') ||
    normalized.includes('not in your contacts') ||
    normalized.includes('block or report') ||
    normalized.includes('unknown accounts') ||
    normalized.includes('potential spam') ||
    normalized.includes('suspicious link')
  );
}

function getWhatsAppNoticeText(message: ConversationMessage) {
  if (message.messageType === 'system') {
    return getSystemMessageText(message.raw);
  }

  if (message.messageType !== 'interactive') {
    return null;
  }

  const interactiveType = getInteractiveType(message.raw);
  const interactiveText = getInteractiveMessageText(message.raw);
  const body = typeof message.body === 'string' && !isGenericInteractiveText(message.body) ? message.body.trim() : null;
  const text = interactiveText || body;

  if (
    interactiveType === 'call_permission_request' ||
    interactiveType === 'call_permission_response' ||
    interactiveType === 'call_permission_request_response' ||
    looksLikeWhatsAppSystemNotice(text)
  ) {
    return text;
  }

  return null;
}

function getSpecialMessageText(message: ConversationMessage) {
  if (message.messageType === 'unsupported') {
    return getUnsupportedMessageText(message.raw);
  }

  if (message.messageType === 'system') {
    return getSystemMessageText(message.raw);
  }

  if (message.messageType === 'interactive') {
    return getInteractiveMessageText(message.raw);
  }

  return null;
}

function getVisibleMessageBody(message: ConversationMessage, media: ReturnType<typeof getMediaPayload>) {
  if (message.messageType === 'call_summary') {
    return null;
  }

  const specialMessageText = getSpecialMessageText(message);
  const body = typeof message.body === 'string' ? message.body.trim() : '';

  if (message.messageType === 'interactive' && isGenericInteractiveText(body)) {
    return specialMessageText;
  }

  if (message.messageType === 'system' && isGenericSystemText(body)) {
    return specialMessageText;
  }

  if (!body) {
    return specialMessageText;
  }

  if (specialMessageText && body.toLowerCase() === `${message.messageType} message`) {
    return specialMessageText;
  }

  if (!media) {
    return body;
  }

  if (media.caption) {
    return body;
  }

  const normalizedBody = body.toLowerCase();

  if (
    normalizedBody === 'image attachment' ||
    normalizedBody === 'video attachment' ||
    normalizedBody === 'audio attachment' ||
    normalizedBody === 'document attachment' ||
    normalizedBody === 'sticker'
  ) {
    return null;
  }

  if (media.mediaType === 'document' && media.fileName && body === media.fileName) {
    return null;
  }

  return body;
}

function formatCallDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatCallDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getCallSummaryStateLabel(value: unknown) {
  switch (value) {
    case 'incoming':
      return 'Incoming';
    case 'dialing':
      return 'Dialing';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting';
    case 'ongoing':
      return 'Ongoing';
    case 'ending':
      return 'Ending';
    case 'ended':
      return 'Ended';
    case 'rejected':
      return 'Rejected';
    case 'missed':
      return 'Missed';
    case 'failed':
      return 'Failed';
    default:
      return 'Call';
  }
}

function getOutgoingMessageReceiptState(message: ConversationMessage) {
  if (message.direction !== 'outbound') {
    return null;
  }

  switch (message.status) {
    case 'sending':
      return 'pending';
    case 'read':
      return 'read';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    case 'accepted':
    case 'queued':
    case 'warning':
      return null;
    case 'held_for_quality_assessment':
      return 'held';
    case 'paused':
      return 'paused';
    case 'sent':
      return 'sent';
    default:
      return null;
  }
}

function getMessageStatusErrorRecord(message: ConversationMessage) {
  const statusPayload = isRecord(message.raw.whatsapp_status)
    ? message.raw.whatsapp_status
    : isRecord(message.raw.status)
      ? message.raw.status
      : null;
  const errors = Array.isArray(statusPayload?.errors) ? statusPayload.errors.filter(isRecord) : [];

  return errors[0] || null;
}

function getMessageStatusErrorText(message: ConversationMessage) {
  if (message.status !== 'failed') {
    return null;
  }

  const error = getMessageStatusErrorRecord(message);

  if (!error) {
    return null;
  }

  const errorData = isRecord(error.error_data) ? error.error_data : null;
  const code = typeof error.code === 'number' || typeof error.code === 'string' ? String(error.code) : '';
  const title = typeof error.title === 'string' ? error.title.trim() : '';
  const details = typeof errorData?.details === 'string' ? errorData.details.trim() : '';
  const messageText = typeof error.message === 'string' ? error.message.trim() : '';
  const baseMessage = details || messageText || title;

  if (code === '131049') {
    return 'Meta blocked this marketing template for this recipient to maintain healthy ecosystem engagement.';
  }

  if (code === '131042') {
    return 'Meta could not deliver this template because the WhatsApp Business Account has a billing or payment issue.';
  }

  if (code === '131026') {
    return 'Meta could not deliver this template to the recipient. The number may be unreachable or unable to receive this message type.';
  }

  if (!baseMessage) {
    return code ? `Meta delivery failed with code ${code}.` : 'Meta marked this message as failed.';
  }

  return code ? `${baseMessage} (code ${code})` : baseMessage;
}

function MessageReceiptStatus({ message }: { message: ConversationMessage }) {
  const receiptState = getOutgoingMessageReceiptState(message);
  const failureReason = getMessageStatusErrorText(message);

  if (!receiptState || receiptState === 'pending') {
    return null;
  }

  if (receiptState === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-rose-500" title={failureReason || undefined}>
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Failed</span>
      </span>
    );
  }

  if (receiptState === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-[#2b7de9]" aria-label="Read" />;
  }

  if (receiptState === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 text-slate-400" aria-label="Delivered by WhatsApp" />;
  }

  if (receiptState === 'sent') {
    return <Check className="h-3.5 w-3.5 text-slate-400" aria-label="Sent to WhatsApp" />;
  }

  if (receiptState === 'held') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-500" title="Meta is holding this marketing message for quality assessment">
        <Clock className="h-3.5 w-3.5" />
        <span>Held</span>
      </span>
    );
  }

  if (receiptState === 'paused') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-500" title="Meta paused this marketing message">
        <Clock className="h-3.5 w-3.5" />
        <span>Paused</span>
      </span>
    );
  }

  return null;
}

function isContextualReplyableMessage(message: ConversationMessage) {
  return Boolean(message.waMessageId && message.waMessageId.startsWith('wamid.'));
}

function getContextualReplyMessageId(message: ConversationMessage) {
  const context =
    message.raw.context && typeof message.raw.context === 'object' && !Array.isArray(message.raw.context)
      ? (message.raw.context as { message_id?: unknown })
      : null;

  return typeof context?.message_id === 'string' && context.message_id.trim()
    ? context.message_id
    : null;
}

function formatMessageTypeLabel(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function getContextualReplyPreviewText(message: ConversationMessage, templates: MetaTemplate[]) {
  if (message.messageType === 'template') {
    return getTemplatePreviewText(resolveTemplateSnapshot(message, templates), message.templateName);
  }

  if (message.messageType === 'call_summary') {
    return message.body || 'WhatsApp call';
  }

  const media = getMediaPayload(message.raw);
  const visibleBody = getVisibleMessageBody(message, media);

  if (visibleBody) {
    return visibleBody;
  }

  if (media?.fileName) {
    return media.fileName;
  }

  if (message.body) {
    return message.body;
  }

  switch (message.messageType) {
    case 'location':
      return 'Shared location';
    case 'contacts':
      return 'Shared contact card';
    case 'interactive':
      return getInteractiveMessageText(message.raw) || 'WhatsApp notice';
    case 'button':
      return 'Button reply';
    default:
      return `${formatMessageTypeLabel(message.messageType)} message`;
  }
}

function getContextualReplySenderLabel(message: ConversationMessage, contactName: string) {
  return message.direction === 'outbound' ? 'You' : message.senderName || contactName || 'Contact';
}

function ContextualReplyBubble({
  message,
  referencedMessage,
  isOutbound,
  contactName,
  templates,
}: {
  message: ConversationMessage;
  referencedMessage: ConversationMessage | null;
  isOutbound: boolean;
  contactName: string;
  templates: MetaTemplate[];
}) {
  const replyMessageId = getContextualReplyMessageId(message);

  if (!replyMessageId) {
    return null;
  }

  const senderLabel = referencedMessage
    ? getContextualReplySenderLabel(referencedMessage, contactName)
    : 'Previous message';
  const previewText = referencedMessage
    ? getContextualReplyPreviewText(referencedMessage, templates)
    : 'Original message unavailable';

  return (
    <div
      className={`rounded-2xl border-l-4 px-3 py-2 ${
        isOutbound
          ? 'border-white/65 bg-white/14 text-white'
          : 'border-[#1381FF] bg-[#f4f1ff] text-slate-700'
      }`}
    >
      <p className={`text-[11px] font-semibold ${isOutbound ? 'text-white/85' : 'text-[#1381FF]'}`}>
        {senderLabel}
      </p>
      <p className={`mt-1 text-xs leading-5 break-words ${isOutbound ? 'text-white/78' : 'text-slate-600'}`}>
        {previewText}
      </p>
    </div>
  );
}

function getCallSummaryPayload(message: ConversationMessage) {
  if (message.messageType !== 'call_summary') {
    return null;
  }

  const payload =
    message.raw.call_summary &&
    typeof message.raw.call_summary === 'object' &&
    !Array.isArray(message.raw.call_summary)
      ? (message.raw.call_summary as Record<string, unknown>)
      : null;

  if (!payload) {
    return null;
  }

  return {
    callId: typeof payload.call_id === 'string' ? payload.call_id : null,
    direction: payload.direction === 'incoming' ? 'incoming' : 'outgoing',
    state: getCallSummaryStateLabel(payload.state),
    startedAt: typeof payload.started_at === 'string' ? payload.started_at : null,
    durationSeconds:
      typeof payload.duration_seconds === 'number'
        ? payload.duration_seconds
        : Number(payload.duration_seconds || 0),
    phone:
      typeof payload.phone === 'string'
        ? payload.phone
        : message.recipientWaId || message.senderWaId || null,
  };
}

function CallSummaryCard({
  message,
  isOutbound,
  isPending,
}: {
  message: ConversationMessage;
  isOutbound: boolean;
  isPending: boolean;
}) {
  const summary = getCallSummaryPayload(message);

  if (!summary) {
    return null;
  }

  const directionMeta =
    summary.direction === 'incoming'
      ? {
          label: 'Incoming',
          icon: summary.state === 'Missed' ? PhoneMissed : PhoneIncoming,
          accent: isOutbound ? 'bg-white/16 text-white' : 'bg-emerald-50 text-emerald-600',
        }
      : {
          label: 'Outgoing',
          icon: PhoneOutgoing,
          accent: isOutbound ? 'bg-white/16 text-white' : 'bg-violet-50 text-violet-600',
        };
  const StateIcon = directionMeta.icon;
  const stateTone =
    summary.state === 'Missed' || summary.state === 'Failed' || summary.state === 'Rejected'
      ? isOutbound
        ? isPending
          ? 'bg-rose-50 text-rose-700'
          : 'bg-white/12 text-white'
        : 'bg-rose-50 text-rose-700'
      : isOutbound
        ? isPending
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-white/12 text-white'
        : 'bg-emerald-50 text-emerald-700';
  const surfaceClassName = isOutbound
    ? isPending
      ? 'border-[#bfd2ff] bg-[#edf3ff] text-[#29446e]'
      : 'border-white/12 bg-white/10 text-white'
    : 'border-slate-200 bg-slate-50 text-slate-900';
  const mutedTextClassName = isOutbound ? (isPending ? 'text-[#5d7498]' : 'text-white/72') : 'text-slate-500';

  return (
    <div className={`w-[min(100%,320px)] rounded-xl border px-3 py-2.5 ${surfaceClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${directionMeta.accent}`}>
            <StateIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{directionMeta.label} call</p>
            {summary.phone ? <p className={`mt-0.5 truncate text-xs ${mutedTextClassName}`}>{summary.phone}</p> : null}
          </div>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${stateTone}`}>{summary.state}</span>
      </div>

      <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${mutedTextClassName}`}>
        <span>{formatCallDateTime(summary.startedAt)}</span>
        <span>{formatCallDuration(summary.durationSeconds)}</span>
      </div>
    </div>
  );
}

function createClientTempId() {
  return globalThis.crypto?.randomUUID?.() || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createOptimisticThread(thread: ConversationThread, previewText: string, createdAt: string): ConversationThread {
  return {
    ...thread,
    status: 'Connected',
    lastMessageText: previewText,
    lastMessageAt: createdAt,
    unreadCount: 0,
  };
}

function getThreadChronologyMs(thread: ConversationThread) {
  const timestamp = thread.lastMessageAt || thread.updatedAt || thread.createdAt;
  const parsed = Date.parse(timestamp);

  return Number.isFinite(parsed) ? parsed : 0;
}

function sortThreadsReverseChronological(left: ConversationThread, right: ConversationThread) {
  const delta = getThreadChronologyMs(right) - getThreadChronologyMs(left);

  return delta !== 0 ? delta : right.id.localeCompare(left.id);
}

function createOptimisticMessage({
  clientTempId,
  threadId,
  messageType,
  body,
  currentUserName,
  senderWaId,
  recipientWaId,
  createdAt,
  raw,
  templateName,
}: {
  clientTempId: string;
  threadId: string;
  messageType: string;
  body: string | null;
  currentUserName: string;
  senderWaId: string | null;
  recipientWaId: string;
  createdAt: string;
  raw?: Record<string, unknown>;
  templateName?: string | null;
}): ConversationMessage {
  return {
    id: clientTempId,
    threadId,
    waMessageId: null,
    direction: 'outbound',
    messageType,
    body,
    senderName: currentUserName,
    senderWaId,
    recipientWaId,
    templateName: templateName || null,
    status: 'sending',
    createdAt,
    raw: {
      client_temp_id: clientTempId,
      ...(raw || {}),
    },
  };
}

function areMessagesEquivalent(left: ConversationMessage[], right: ConversationMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const next = right[index];

    return (
      message.id === next.id &&
      message.status === next.status &&
      message.body === next.body &&
      message.createdAt === next.createdAt &&
      JSON.stringify(message.raw) === JSON.stringify(next.raw)
    );
  });
}

function areThreadsEquivalent(left: ConversationThread, right: ConversationThread) {
  return (
    left.id === right.id &&
    left.contactWaId === right.contactWaId &&
    left.contactName === right.contactName &&
    left.username === right.username &&
    left.displayPhone === right.displayPhone &&
    left.email === right.email &&
    left.source === right.source &&
    left.remark === right.remark &&
    left.avatarUrl === right.avatarUrl &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.ownerName === right.ownerName &&
    left.lastMessageText === right.lastMessageText &&
    left.lastMessageAt === right.lastMessageAt &&
    left.unreadCount === right.unreadCount &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.labels.length === right.labels.length &&
    left.labels.every((label, index) => label === right.labels[index])
  );
}

function RichText({ value }: { value: string }) {
  const lines = value.split('\n');

  const renderInline = (line: string) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).filter(Boolean);

    return parts.map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        );
      }

      if (part.startsWith('_') && part.endsWith('_')) {
        return (
          <em key={`${part}-${index}`} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {renderInline(line)}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function MessageMediaAttachment({ message }: { message: ConversationMessage }) {
  const media = useMemo(() => getMediaPayload(message.raw), [message.raw]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(MEDIA_PREVIEW_MIN_ZOOM);
  const modalRoot = typeof document === 'undefined' ? null : document.body;

  useEffect(() => {
    if (!media || !['image', 'video', 'audio', 'sticker'].includes(media.mediaType)) {
      return;
    }

    let cancelled = false;
    let currentUrl: string | null = null;

    const loadMedia = async () => {
      try {
        setIsLoading(true);
        setDownloadError(null);
        const response = await appApi.downloadMedia(media.mediaId, media.fileName || undefined);
        currentUrl = URL.createObjectURL(response.blob);

        if (!cancelled) {
          setBlobUrl(currentUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setDownloadError(error instanceof Error ? error.message : 'Failed to load media.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadMedia();

    return () => {
      cancelled = true;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [media]);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const releaseBodyScrollLock = lockBodyScroll();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
        setPreviewZoom(MEDIA_PREVIEW_MIN_ZOOM);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      releaseBodyScrollLock();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewOpen]);

  if (!media) {
    return null;
  }

  const canOpenPreview = Boolean(blobUrl) && ['image', 'video', 'sticker'].includes(media.mediaType);

  const openPreview = () => {
    if (!canOpenPreview) {
      return;
    }

    setPreviewZoom(MEDIA_PREVIEW_MIN_ZOOM);
    setIsPreviewOpen(true);
  };

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewZoom(MEDIA_PREVIEW_MIN_ZOOM);
  };

  const handleDownload = async () => {
    try {
      setDownloadError(null);
      const response = await appApi.downloadMedia(media.mediaId, media.fileName || undefined);
      const url = URL.createObjectURL(response.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = response.filename || media.fileName || `${media.mediaType}-attachment`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Failed to download media.');
    }
  };

  return (
    <>
      <div className="space-y-2">
        {media.mediaType === 'image' ? (
          blobUrl ? (
            <button
              type="button"
              onClick={openPreview}
              className="block overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2"
            >
              <img src={blobUrl} alt={media.fileName || 'Image attachment'} className="max-h-72 rounded-2xl object-cover" />
            </button>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-6 text-sm text-gray-500">{isLoading ? 'Loading image...' : 'Image unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'sticker' ? (
          blobUrl ? (
            <button
              type="button"
              onClick={openPreview}
              className="inline-flex max-w-[220px] overflow-hidden rounded-2xl bg-white/80 p-2 focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2"
            >
              <img src={blobUrl} alt={media.fileName || 'Sticker'} className="max-h-40 w-full object-contain" />
            </button>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-6 text-sm text-gray-500">{isLoading ? 'Loading sticker...' : 'Sticker unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'video' ? (
          blobUrl ? (
            <button
              type="button"
              onClick={openPreview}
              className="block overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#93c5fd] focus:ring-offset-2"
              aria-label="Open video preview"
            >
              <video className="max-h-72 rounded-2xl" muted playsInline preload="metadata">
                <source src={blobUrl} type={media.mimeType || undefined} />
              </video>
            </button>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-6 text-sm text-gray-500">{isLoading ? 'Loading video...' : 'Video unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'audio' ? (
          blobUrl ? (
            <audio controls className="w-full">
              <source src={blobUrl} type={media.mimeType || undefined} />
            </audio>
          ) : (
            <div className="rounded-2xl bg-gray-100 px-4 py-4 text-sm text-gray-500">{isLoading ? 'Loading audio...' : 'Audio unavailable'}</div>
          )
        ) : null}

        {media.mediaType === 'document' ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-gray-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{media.fileName || `${media.mediaType} attachment`}</p>
                <p className="text-xs text-gray-500">{media.mimeType || media.mediaType}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="rounded-lg bg-gray-100 p-2 text-gray-700 hover:bg-gray-200"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {['image', 'video', 'audio', 'sticker'].includes(media.mediaType) ? (
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        ) : null}

        {downloadError ? <p className="text-xs text-red-600">{downloadError}</p> : null}
      </div>

      {isPreviewOpen && blobUrl && canOpenPreview && modalRoot
        ? createPortal(
          <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-8">
            <button type="button" onClick={closePreview} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" aria-label="Close media preview" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 text-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{media.fileName || `${media.mediaType} preview`}</p>
                  <p className="text-xs text-slate-400">{media.mimeType || media.mediaType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((currentZoom) => clampMediaPreviewZoom(currentZoom - MEDIA_PREVIEW_ZOOM_STEP))}
                    disabled={previewZoom <= MEDIA_PREVIEW_MIN_ZOOM}
                    className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((currentZoom) => clampMediaPreviewZoom(currentZoom + MEDIA_PREVIEW_ZOOM_STEP))}
                    disabled={previewZoom >= MEDIA_PREVIEW_MAX_ZOOM}
                    className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={closePreview}
                    className="rounded-full border border-white/10 p-2 text-slate-200 transition hover:bg-white/10"
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="scrollbar-hide flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/60 px-4 py-6">
                <div className="flex min-h-full min-w-full items-center justify-center">
                  {media.mediaType === 'video' ? (
                    <video
                      controls
                      autoPlay
                      className="max-h-full max-w-full rounded-[1.5rem] transition-transform duration-200"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: 'center center' }}
                    >
                      <source src={blobUrl} type={media.mimeType || undefined} />
                    </video>
                  ) : (
                    <img
                      src={blobUrl}
                      alt={media.fileName || `${media.mediaType} preview`}
                      className="max-h-full max-w-full rounded-[1.5rem] object-contain transition-transform duration-200"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: 'center center' }}
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-300">
                <span>{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </motion.div>
            </motion.div>
          </AnimatePresence>,
            modalRoot,
          )
        : null}
    </>
  );
}

function MessageDetails({ message }: { message: ConversationMessage }) {
  const type = message.messageType;

  if (type === 'location') {
    const location = message.raw.location as { latitude?: number; longitude?: number; name?: string; address?: string } | undefined;
    return (
      <div className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">
        <p className="font-medium">{location?.name || 'Shared location'}</p>
        <p>{location?.address || `${location?.latitude || ''}, ${location?.longitude || ''}`}</p>
      </div>
    );
  }

  if (type === 'contacts') {
    const contacts =
      (message.raw.contacts as Array<Record<string, unknown>> | undefined)?.filter(
        (contact): contact is Record<string, unknown> => Boolean(contact) && typeof contact === 'object' && !Array.isArray(contact),
      ) || [];
    return (
      <div className="space-y-2">
        {contacts.map((contact, index) => {
          const contactName = ((contact.name as { formatted_name?: string } | undefined)?.formatted_name || 'Shared contact') as string;

          return (
            <div key={`${contactName}-${index}`} className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">
              <p className="font-medium">{contactName}</p>
              {getContactCardLines(contact).map((line, lineIndex) => (
                <p key={`${line}-${lineIndex}`}>{line}</p>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'button') {
    const button = message.raw.button as { text?: string } | undefined;
    return <div className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">Reply: {button?.text || message.body}</div>;
  }

  if (type === 'interactive') {
    const title = getInteractiveMessageText(message.raw);

    return title ? <div className="rounded-xl bg-gray-100/70 px-3 py-2 text-xs text-gray-700">{title}</div> : null;
  }

  return null;
}

function TemplateHeaderMediaPreview({
  headerType,
  preview,
  isOutbound,
  isPending,
}: {
  headerType: TemplateMediaHeaderType;
  preview: HeaderMediaPreviewMetadata;
  isOutbound: boolean;
  isPending: boolean;
}) {
  const previewUrl = preview.previewUrl;
  const [hasPreviewError, setHasPreviewError] = useState(false);

  if (hasPreviewError) {
    return (
      <div
        className={`mb-4 flex h-40 flex-col items-center justify-center gap-2 rounded-2xl px-4 text-center text-sm font-medium ${
          isOutbound
            ? isPending
              ? 'bg-[#dbe7ff] text-[#4d669f]'
              : 'bg-white/10 text-white/75'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        <FileText className="h-5 w-5" />
        <span>{`${headerType.charAt(0)}${headerType.slice(1).toLowerCase()} header preview unavailable`}</span>
      </div>
    );
  }

  if (headerType === 'IMAGE' && previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={preview.fileName || 'Template header image'}
        onError={() => setHasPreviewError(true)}
        className="mb-4 h-40 w-full rounded-2xl bg-slate-100 object-cover"
      />
    );
  }

  if (headerType === 'VIDEO' && previewUrl) {
    return (
      <video
        src={previewUrl}
        controls
        onError={() => setHasPreviewError(true)}
        className="mb-4 h-40 w-full rounded-2xl bg-slate-950 object-cover"
      />
    );
  }

  if (headerType === 'DOCUMENT' && previewUrl) {
    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
          isOutbound
            ? isPending
              ? 'border-[#b8ceff] bg-[#dbe7ff] text-[#274574]'
              : 'border-white/15 bg-white/10 text-white'
            : 'border-slate-200 bg-slate-50 text-slate-800'
        }`}
      >
        <FileText className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{preview.fileName || 'Document header'}</p>
          {preview.mimeType ? <p className="mt-0.5 truncate text-xs opacity-70">{preview.mimeType}</p> : null}
        </div>
      </a>
    );
  }

  return null;
}

function TemplateMessageCard({
  snapshot,
  isOutbound,
  isPending,
}: {
  snapshot: NonNullable<ReturnType<typeof normalizeTemplateSnapshot>>;
  isOutbound: boolean;
  isPending: boolean;
}) {
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const footerComponent = getTemplateTextComponent(snapshot, 'FOOTER');
  const buttons = getTemplateButtons(snapshot);
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text : null;
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text : null;
  const footerText = typeof footerComponent?.text === 'string' ? footerComponent.text : null;
  const mediaHeaderType = getMediaHeaderType(typeof headerComponent?.format === 'string' ? headerComponent.format : null);
  const mediaHeaderLabel = mediaHeaderType ? `${mediaHeaderType.toLowerCase()} header` : null;
  const headerMediaPreview = snapshot.headerMediaPreview;

  return (
    <div className="w-[min(100%,340px)]">
      {mediaHeaderType && headerMediaPreview?.previewUrl ? (
        <TemplateHeaderMediaPreview
          headerType={mediaHeaderType}
          preview={headerMediaPreview}
          isOutbound={isOutbound}
          isPending={isPending}
        />
      ) : mediaHeaderLabel ? (
        <div
          className={`mb-3 rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            isOutbound
              ? isPending
                ? 'bg-[#bfd2ff] text-[#4d669f]'
                : 'bg-white/12 text-white/75'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {mediaHeaderLabel}
        </div>
      ) : null}

      <div className="space-y-4">
        {headerText ? (
          <div
            className={`text-[15px] font-semibold leading-6 ${
              isOutbound ? (isPending ? 'text-[#274574]' : 'text-white') : 'text-slate-900'
            }`}
          >
            <RichText value={headerText} />
          </div>
        ) : null}

        {bodyText ? (
          <div
            className={`text-[15px] leading-7 ${
              isOutbound ? (isPending ? 'text-[#3c5b8c]' : 'text-white/95') : 'text-slate-800'
            }`}
          >
            <RichText value={bodyText} />
          </div>
        ) : null}

        {footerText ? (
          <div
            className={`text-[13px] italic leading-6 ${
              isOutbound ? (isPending ? 'text-[#6e87b7]' : 'text-white/60') : 'text-slate-400'
            }`}
          >
            <RichText value={footerText} />
          </div>
        ) : null}
      </div>

      {buttons.length > 0 ? (
        <div
          className={`mt-4 border-t pt-3 ${
            isOutbound ? (isPending ? 'border-[#b8ceff]' : 'border-white/15') : 'border-slate-200/90'
          }`}
        >
          <div className="space-y-1">
            {buttons.map((button, index) => {
              const text = typeof button.text === 'string' ? button.text : `Action ${index + 1}`;
              const type = typeof button.type === 'string' ? button.type : 'QUICK_REPLY';

              if (type === 'URL') {
                const href = typeof button.url === 'string' ? button.url : '#';

                return (
                  <a
                    key={`${text}-${index}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 rounded-xl px-2 py-2 text-[14px] font-medium transition-colors ${
                      isOutbound
                        ? isPending
                          ? 'text-[#355ea1] hover:bg-[#d3e1ff]'
                          : 'text-white/90 hover:bg-white/10'
                        : 'text-[#2b7de9] hover:bg-slate-100/80'
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    <span>{text}</span>
                  </a>
                );
              }

              return (
                <div
                  key={`${text}-${index}`}
                  className={`flex items-center gap-2 rounded-xl px-2 py-2 text-[14px] font-medium ${
                    isOutbound ? (isPending ? 'text-[#355ea1]' : 'text-white/90') : 'text-[#2b7de9]'
                  }`}
                >
                  <CornerDownLeft className="h-4 w-4" />
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  currentUserName,
  contactName,
  contactAvatarUrl,
  templates,
  messageLookupByWaId,
  onReply,
  showAvatar = true,
}: {
  message: ConversationMessage;
  currentUserName: string;
  contactName: string;
  contactAvatarUrl?: string | null;
  templates: MetaTemplate[];
  messageLookupByWaId: Map<string, ConversationMessage>;
  onReply?: (message: ConversationMessage) => void;
  showAvatar?: boolean;
}) {
  const isOutbound = message.direction === 'outbound';
  const isPending = isOutbound && message.status === 'sending';
  const inboundAvatarUrl = !isOutbound && typeof contactAvatarUrl === 'string' && contactAvatarUrl.trim()
    ? contactAvatarUrl.trim()
    : null;
  const [failedBubbleAvatarUrl, setFailedBubbleAvatarUrl] = useState<string | null>(null);
  const media = getMediaPayload(message.raw);
  const visibleMessageBody = getVisibleMessageBody(message, media);
  const whatsappNoticeText = getWhatsAppNoticeText(message);
  const templateSnapshot = message.messageType === 'template' ? resolveTemplateSnapshot(message, templates) : null;
  const callSummary = getCallSummaryPayload(message);
  const usesTemplateCard = Boolean(templateSnapshot);
  const usesCallSummaryCard = Boolean(callSummary);
  const fallbackCallSummaryText = message.messageType === 'call_summary' && !callSummary ? message.body : null;
  const replyMessageId = getContextualReplyMessageId(message);
  const referencedMessage = replyMessageId ? messageLookupByWaId.get(replyMessageId) || null : null;
  const canReply = Boolean(onReply) && isContextualReplyableMessage(message);
  const failureReason = getMessageStatusErrorText(message);

  const metadataShouldStayVisible = isPending || Boolean(failureReason);

  useEffect(() => {
    if (failedBubbleAvatarUrl && failedBubbleAvatarUrl !== inboundAvatarUrl) {
      setFailedBubbleAvatarUrl(null);
    }
  }, [inboundAvatarUrl, failedBubbleAvatarUrl]);

  if (whatsappNoticeText) {
    return (
      <div className="flex w-full justify-center px-4">
        <div className="max-w-[min(82%,520px)] rounded-xl bg-slate-200/80 px-4 py-2 text-center text-xs font-medium leading-5 text-slate-600 shadow-sm ring-1 ring-slate-300/40">
          {whatsappNoticeText}
        </div>
      </div>
    );
  }

  if (
    (message.messageType === 'system' || message.messageType === 'interactive') &&
    !visibleMessageBody &&
    !media &&
    !usesTemplateCard &&
    !usesCallSummaryCard &&
    !fallbackCallSummaryText
  ) {
    return null;
  }

  return (
    <div className={`group flex max-w-[85%] gap-2 ${isOutbound ? 'ml-auto flex-row-reverse' : ''}`}>
      {showAvatar ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-gray-100">
          <img
            src={inboundAvatarUrl && failedBubbleAvatarUrl !== inboundAvatarUrl ? inboundAvatarUrl : defaultProfilePictureUrl}
            alt={`${isOutbound ? currentUserName : contactName} profile`}
            className="h-full w-full object-cover"
            referrerPolicy={inboundAvatarUrl ? 'no-referrer' : undefined}
            onError={() => {
              if (inboundAvatarUrl) {
                setFailedBubbleAvatarUrl(inboundAvatarUrl);
              }
            }}
            draggable={false}
          />
        </div>
      ) : (
        <div className="h-8 w-8 shrink-0" />
      )}
      <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-end gap-2 ${isOutbound ? 'flex-row-reverse' : ''}`}>
          <div
            className={`space-y-3 rounded-2xl px-3 py-2.5 shadow-sm ${
              isOutbound
                ? isPending
                  ? 'rounded-tr-none border border-[#bfd2ff] bg-[#e8f0ff] text-[#355385]'
                  : 'rounded-tr-none bg-[#2563eb] text-white'
                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
            }`}
          >
            {replyMessageId ? (
              <ContextualReplyBubble
                message={message}
                referencedMessage={referencedMessage}
                isOutbound={isOutbound}
                contactName={contactName}
                templates={templates}
              />
            ) : null}
            {usesTemplateCard && templateSnapshot ? (
              <TemplateMessageCard snapshot={templateSnapshot} isOutbound={isOutbound} isPending={isPending} />
            ) : null}
            {!usesTemplateCard && usesCallSummaryCard ? (
              <CallSummaryCard message={message} isOutbound={isOutbound} isPending={isPending} />
            ) : null}
            {!usesTemplateCard && !usesCallSummaryCard && media ? <MessageMediaAttachment message={message} /> : null}
            {!usesTemplateCard && !usesCallSummaryCard && visibleMessageBody ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                <RichText value={visibleMessageBody} />
              </div>
            ) : null}
            {!usesTemplateCard && !usesCallSummaryCard && fallbackCallSummaryText ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                <RichText value={fallbackCallSummaryText} />
              </div>
            ) : null}
            {!usesTemplateCard && !usesCallSummaryCard && !message.body && !media ? <div className="text-sm">{message.messageType}</div> : null}
            {!usesTemplateCard && !usesCallSummaryCard ? <MessageDetails message={message} /> : null}
          </div>
          {canReply ? (
            <button
              type="button"
              onClick={() => onReply?.(message)}
              className="mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-0 shadow-sm transition-all duration-150 ease-out hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 group-hover:opacity-100 group-focus-within:opacity-100"
              aria-label="Reply to this message"
            >
              <CornerDownLeft className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 px-1 text-[10px] text-gray-400 transition-opacity ${
            metadataShouldStayVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          } ${isOutbound ? 'justify-end' : 'justify-start'}`}
        >
          <span>{isPending ? 'Sending...' : formatMessageTime(message.createdAt)}</span>
          {isOutbound ? (
            <div className="flex items-center">
              <MessageReceiptStatus message={message} />
            </div>
          ) : null}
        </div>
        {failureReason ? (
          <p className={`mt-1 max-w-[min(80vw,360px)] px-1 text-[11px] leading-4 text-rose-500 ${isOutbound ? 'text-right' : ''}`}>
            {failureReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function Inbox() {
  const { bootstrap, setBootstrap } = useAppData();
  const { startOutgoingCall } = useCallManager();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const modalRoot = typeof document === 'undefined' ? null : document.body;
  const [threadFilter, setThreadFilter] = useState<InboxThreadFilter>('all');
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );
  const [mobileView, setMobileView] = useState<'threads' | 'chat'>('threads');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoadedForThreadId, setMessagesLoadedForThreadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<InboxChannelFilter>('all');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isExpiredWindowInfoOpen, setIsExpiredWindowInfoOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [labelModalError, setLabelModalError] = useState<string | null>(null);
  const [newChatOption, setNewChatOption] = useState<'existing' | 'manual'>('existing');
  const [selectedContact, setSelectedContact] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [composerTemplateId, setComposerTemplateId] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [replyToWaMessageId, setReplyToWaMessageId] = useState<string | null>(null);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [isThreadListCollapsed, setIsThreadListCollapsed] = useState(false);
  const [isConversationActionsOpen, setIsConversationActionsOpen] = useState(false);
  const [pendingBlockConfirmation, setPendingBlockConfirmation] = useState<{
    waId: string;
    contactName: string;
  } | null>(null);
  const [openContactDetailSections, setOpenContactDetailSections] = useState<Record<ContactDetailsSection, boolean>>({
    contact: true,
    labels: false,
    crm: false,
  });
  const [isComposerActionsOpen, setIsComposerActionsOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isTemplateTrayOpen, setIsTemplateTrayOpen] = useState(false);
  const [isTemplateSendModalOpen, setIsTemplateSendModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<WhatsAppBlockedUser[]>([]);
  const [blockActionWaId, setBlockActionWaId] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [starredThreadIds, setStarredThreadIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STARRED_THREADS_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });
  const deferredQuery = useDeferredValue(searchQuery);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const templateTrayRef = useRef<HTMLDivElement | null>(null);
  const conversationActionsRef = useRef<HTMLDivElement | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const conversations = bootstrap?.conversations || [];
  const templates = bootstrap?.templates || [];
  const sendableTemplates = useMemo(() => templates.filter(isSendableTemplate), [templates]);
  const selectedComposerTemplate = useMemo(
    () => sendableTemplates.find((template) => template.id === composerTemplateId) || null,
    [composerTemplateId, sendableTemplates],
  );
  const currentUserName = bootstrap?.profile?.fullName || 'User';
  const currentUserWaId = bootstrap?.channel?.phoneNumberId || null;
  const starredThreadIdSet = useMemo(() => new Set(starredThreadIds), [starredThreadIds]);
  const activeThread = conversations.find((thread) => thread.id === selectedThreadId) || null;
  const activeThreadIsStarred = activeThread ? starredThreadIdSet.has(activeThread.id) : false;
  const canUseWhatsAppActions = Boolean(bootstrap?.channel) && (channelFilter === 'all' || channelFilter === 'whatsapp');
  const activeThreadChannel = activeThread ? getThreadChannel(activeThread) : null;
  const activeThreadChannelLabel = activeThreadChannel ? getChannelLabel(activeThreadChannel) : 'Conversation';
  const activeThreadSupportsWhatsAppActions = activeThreadChannel === 'whatsapp';
  const activeThreadUsesCustomerServiceWindow =
    activeThreadChannel === 'whatsapp' ||
    activeThreadChannel === 'instagram' ||
    activeThreadChannel === 'messenger';
  const activeThreadWaId = activeThreadSupportsWhatsAppActions ? getThreadWaId(activeThread) : '';
  const activeThreadMessages = useMemo(
    () => (activeThread ? messages.filter((message) => message.threadId === activeThread.id) : []),
    [activeThread, messages],
  );
  const activeThreadMessagesReady = Boolean(activeThread && messagesLoadedForThreadId === activeThread.id);
  const activeConversationWindow = useMemo(
    () => getConversationWindowState(activeThreadMessages, currentTimeMs),
    [activeThreadMessages, currentTimeMs],
  );
  const activeThreadHasExpiredCustomerServiceWindow = Boolean(
    activeThread &&
      activeThreadUsesCustomerServiceWindow &&
      activeThreadMessagesReady &&
      !activeConversationWindow.isActive,
  );
  const activeConversationWindowTimeLeft = activeConversationWindow.isActive
    ? formatConversationWindowTimeLeft(activeConversationWindow.expiresAtMs, currentTimeMs)
    : null;
  const activeThreadIsCheckingCustomerServiceWindow = Boolean(
    activeThread && activeThreadUsesCustomerServiceWindow && !activeThreadMessagesReady,
  );
  const blockedUserWaIdSet = useMemo(
    () => new Set(blockedUsers.map((user) => user.waId)),
    [blockedUsers],
  );
  const replyTargetMessage = useMemo(
    () =>
      replyToWaMessageId
        ? activeThreadMessages.find((message) => message.waMessageId === replyToWaMessageId) || null
        : null,
    [activeThreadMessages, replyToWaMessageId],
  );
  const messageLookupByWaId = useMemo(() => {
    const next = new Map<string, ConversationMessage>();

    for (const message of activeThreadMessages) {
      if (message.waMessageId) {
        next.set(message.waMessageId, message);
      }
    }

    return next;
  }, [activeThreadMessages]);
  const activeThreadIsBlocked = activeThreadSupportsWhatsAppActions && Boolean(activeThreadWaId && blockedUserWaIdSet.has(activeThreadWaId));
  const activeThreadWindowStatus = activeThreadIsCheckingCustomerServiceWindow
    ? 'Checking window'
    : activeThreadUsesCustomerServiceWindow
      ? activeConversationWindow.isActive
        ? 'Active window'
        : 'Window expired'
      : activeThread?.status || 'Active';
  const expiredWindowNotice = activeThreadSupportsWhatsAppActions
    ? 'Chats are marked as expired 24 hours after the last received customer message. WhatsApp allows only template messages to be sent in such chats.'
    : `${activeThreadChannelLabel} chats are marked as expired 24 hours after the last received customer message. You can reply after the customer sends a new message.`;
  const selectedChannelFilterLabel = CHANNEL_FILTER_OPTIONS.find((option) => option.id === channelFilter)?.label || 'All channels';
  const shouldHideThreadList = (isMobileViewport && mobileView !== 'threads') || (!isMobileViewport && isThreadListCollapsed);

  useEscapeKey(
    Boolean(
      isAddLabelModalOpen ||
        isExpiredWindowInfoOpen ||
        isNewChatModalOpen ||
        isTemplateSendModalOpen ||
        (isMobileViewport && isContactPanelOpen) ||
        isEmojiOpen ||
        isComposerActionsOpen ||
        isConversationActionsOpen,
    ),
    () => {
      if (isAddLabelModalOpen) {
        closeAddLabelModal();
        return;
      }

      if (isExpiredWindowInfoOpen) {
        setIsExpiredWindowInfoOpen(false);
        return;
      }

      if (isNewChatModalOpen) {
        setIsNewChatModalOpen(false);
        return;
      }

      if (isTemplateSendModalOpen) {
        setIsTemplateSendModalOpen(false);
        return;
      }

      if (isEmojiOpen) {
        setIsEmojiOpen(false);
        return;
      }

      if (isComposerActionsOpen) {
        setIsComposerActionsOpen(false);
        return;
      }

      if (isConversationActionsOpen) {
        setIsConversationActionsOpen(false);
        return;
      }

      if (isMobileViewport && isContactPanelOpen) {
        setIsContactPanelOpen(false);
      }
    },
  );

  useEffect(() => {
    closeAddLabelModal();
    setIsConversationActionsOpen(false);
    setPendingBlockConfirmation(null);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!isConversationActionsOpen || typeof document === 'undefined') {
      return;
    }

    const handleOutsidePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;

      if (target && conversationActionsRef.current?.contains(target)) {
        return;
      }

      setIsConversationActionsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsidePointerDown);
    document.addEventListener('touchstart', handleOutsidePointerDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointerDown);
      document.removeEventListener('touchstart', handleOutsidePointerDown);
    };
  }, [isConversationActionsOpen]);

  useEffect(() => {
    if (!activeThreadHasExpiredCustomerServiceWindow) {
      setIsExpiredWindowInfoOpen(false);
    }
  }, [activeThreadHasExpiredCustomerServiceWindow, selectedThreadId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewportMode = () => {
      const nextIsMobileViewport = window.innerWidth < 1024;
      setIsMobileViewport(nextIsMobileViewport);

      if (nextIsMobileViewport) {
        setIsContactPanelOpen(false);
      }
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);

    return () => {
      window.removeEventListener('resize', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, CONVERSATION_WINDOW_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!bootstrap?.channel?.phoneNumberId) {
      setBlockedUsers([]);
      return;
    }

    let cancelled = false;

    const loadBlockedUsers = async () => {
      try {
        const response = await appApi.getBlockedUsers();

        if (!cancelled) {
          setBlockedUsers(response.data);
        }
      } catch {
        // Keep the current block list if Meta cannot return it; blocking/unblocking still reports errors inline.
      }
    };

    void loadBlockedUsers();

    return () => {
      cancelled = true;
    };
  }, [bootstrap?.channel?.phoneNumberId]);

  const scrollMessagesToBottom = (behavior: ScrollBehavior = 'auto') => {
    const viewport = messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    });
  };

  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    shouldStickToBottomRef.current = isNearBottom(viewport);
  };

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
    setIsConversationActionsOpen(false);
  }, [selectedThreadId]);

  const toggleContactDetailSection = (section: ContactDetailsSection) => {
    setOpenContactDetailSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const updateActiveThreadContact = async (payload: Parameters<typeof appApi.updateContact>[1], successMessage: string) => {
    if (!activeThread) {
      return false;
    }

    try {
      setIsBusy('contact-update');
      setError(null);
      const response = await appApi.updateContact(activeThread.id, payload);
      setBootstrap((current) => current ? ({
        ...current,
        conversations: upsertConversationThread(current.conversations, response.contact),
      }) : current);
      setNotice(successMessage);
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update contact details.');
      return false;
    } finally {
      setIsBusy((current) => current === 'contact-update' ? null : current);
    }
  };

  const closeAddLabelModal = () => {
    setIsAddLabelModalOpen(false);
    setLabelDraft('');
    setLabelModalError(null);
  };

  const openAddLabelModal = () => {
    if (!activeThread) {
      return;
    }

    navigate('/dashboard/settings?tab=labels-attributes');
  };

  const handleAddActiveThreadLabel = async (event: FormEvent) => {
    event.preventDefault();

    if (!activeThread) {
      return;
    }

    const nextLabel = labelDraft.trim();

    if (!nextLabel) {
      setLabelModalError('Enter a label name.');
      return;
    }

    const existingLabels = activeThread.labels || [];
    const hasExistingLabel = existingLabels.some((label) => label.toLowerCase() === nextLabel.toLowerCase());

    if (hasExistingLabel) {
      setLabelModalError('This conversation already has that label.');
      return;
    }

    setLabelModalError(null);
    const didUpdate = await updateActiveThreadContact({ labels: [...existingLabels, nextLabel] }, 'Label added.');

    if (didUpdate) {
      closeAddLabelModal();
    }
  };

  const handleAssignActiveThreadOwner = async () => {
    if (!activeThread || typeof window === 'undefined') {
      return;
    }

    const nextOwner = window.prompt('Assign owner', activeThread.ownerName || bootstrap?.profile?.fullName || '')?.trim();

    if (nextOwner === undefined) {
      return;
    }

    await updateActiveThreadContact({ ownerName: nextOwner }, 'Owner updated.');
  };

  const handleToggleActiveThreadMarketingOptIn = async () => {
    if (!activeThread) {
      return;
    }

    await updateActiveThreadContact(
      { marketingOptedOut: !activeThread.marketingOptedOut },
      activeThread.marketingOptedOut
        ? 'Contact opted in to WhatsApp marketing campaigns.'
        : 'Contact opted out of WhatsApp marketing campaigns.',
    );
  };

  useEffect(() => {
    setReplyToWaMessageId(null);
  }, [selectedThreadId]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });
  }, [selectedThreadId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STARRED_THREADS_STORAGE_KEY, JSON.stringify(starredThreadIds));
  }, [starredThreadIds]);

  useEffect(() => {
    if (!isTemplateTrayOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!templateTrayRef.current?.contains(event.target as Node)) {
        setIsTemplateTrayOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTemplateTrayOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTemplateTrayOpen]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      setMessagesLoadedForThreadId(null);
      return;
    }

    let isCancelled = false;
    setMessagesLoadedForThreadId(null);

    const loadMessages = async () => {
      try {
        setIsBusy('messages');
        const response = await appApi.getMessages(selectedThreadId, { markRead: true });

        if (!isCancelled) {
          setMessages((current) => {
            const currentThreadMessages = current.filter((message) => message.threadId === selectedThreadId);
            const mergedMessages = mergeConversationMessages(currentThreadMessages, response.messages);
            return areMessagesEquivalent(current, mergedMessages) ? current : mergedMessages;
          });
          setMessagesLoadedForThreadId(selectedThreadId);
          setBootstrap((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              conversations: upsertConversationThread(current.conversations, response.thread),
            };
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setError(error instanceof Error ? error.message : 'Failed to load conversation messages.');
          setMessagesLoadedForThreadId(selectedThreadId);
        }
      } finally {
        if (!isCancelled) {
          setIsBusy(null);
        }
      }
    };

    void loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToMessages = async () => {
      const session = await getCachedSession();

      if (isCancelled || !session) {
        return;
      }

      channel = supabase
        .channel(`conversation-messages:${selectedThreadId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_messages',
            filter: `thread_id=eq.${selectedThreadId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const deletedId =
                payload.old && typeof payload.old === 'object' && 'id' in payload.old
                  ? String(payload.old.id)
                  : null;

              if (deletedId) {
                setMessages((current) => removeConversationMessage(current, deletedId));
              }

              return;
            }

            if (!payload.new || Array.isArray(payload.new)) {
              return;
            }

            const message = mapConversationMessageRecord(payload.new as Record<string, unknown>);
            setMessages((current) => upsertConversationMessage(current, message));

            setBootstrap((current) => {
              if (!current) {
                return current;
              }

              const thread = current.conversations.find((item) => item.id === selectedThreadId);

              if (!thread) {
                return current;
              }

              return {
                ...current,
                conversations: upsertConversationThread(current.conversations, {
                  ...thread,
                  lastMessageText: message.body || thread.lastMessageText,
                  lastMessageAt: message.createdAt,
                  unreadCount: 0,
                }),
              };
            });
          },
        )
        .subscribe();
    };

    void subscribeToMessages();

    return () => {
      isCancelled = true;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    let isCancelled = false;
    let isSyncing = false;

    const syncActiveThread = async () => {
      if (isSyncing) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      isSyncing = true;

      try {
        const response = await appApi.getMessages(selectedThreadId, { markRead: true });

        if (isCancelled) {
          return;
        }

        setMessages((current) => {
          const currentThreadMessages = current.filter((message) => message.threadId === selectedThreadId);
          const mergedMessages = mergeConversationMessages(currentThreadMessages, response.messages);
          return areMessagesEquivalent(current, mergedMessages) ? current : mergedMessages;
        });
        setMessagesLoadedForThreadId(selectedThreadId);
        setBootstrap((current) => {
          if (!current) {
            return current;
          }

          const existingThread = current.conversations.find((thread) => thread.id === response.thread.id);

          if (existingThread && areThreadsEquivalent(existingThread, response.thread)) {
            return current;
          }

          return {
            ...current,
            conversations: upsertConversationThread(current.conversations, response.thread),
          };
        });
      } catch {
        return;
      } finally {
        isSyncing = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void syncActiveThread();
    }, ACTIVE_THREAD_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || !shouldStickToBottomRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });
  }, [messages, selectedThreadId]);

  useEffect(() => {
    const content = messagesContentRef.current;

    if (!content || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!shouldStickToBottomRef.current) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollMessagesToBottom();
      });
    });

    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [selectedThreadId]);

  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [attachment]);

  const filteredThreads = useMemo(() => {
    return conversations
      .filter((thread) => {
        const threadChannel = getThreadChannel(thread);

        if (channelFilter !== 'all' && threadChannel !== channelFilter) {
          return false;
        }

        if (threadFilter === 'unread' && thread.unreadCount === 0) {
          return false;
        }

        if (threadFilter === 'starred' && !starredThreadIdSet.has(thread.id)) {
          return false;
        }

        if (!deferredQuery.trim()) {
          return true;
        }

        const haystack = `${getConversationDisplayName(thread)} ${thread.contactName || ''} ${thread.username || ''} ${thread.lastMessageText || ''} ${thread.displayPhone || ''}`.toLowerCase();
        return haystack.includes(deferredQuery.trim().toLowerCase());
      })
      .sort(sortThreadsReverseChronological);
  }, [channelFilter, conversations, deferredQuery, starredThreadIdSet, threadFilter]);

  useEffect(() => {
    if (filteredThreads.length === 0) {
      if (selectedThreadId !== null) {
        setSelectedThreadId(null);
      }
      setMobileView('threads');
      return;
    }

    if (!selectedThreadId || !filteredThreads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId]);

  const openThread = (threadId: string) => {
    setSelectedThreadId(threadId);

    if (isMobileViewport) {
      setMobileView('chat');
    }
  };

  const returnToThreadList = () => {
    setMobileView('threads');
    setIsContactPanelOpen(false);
  };

  const toggleStarThread = (threadId: string) => {
    setStarredThreadIds((current) =>
      current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId],
    );
  };

  const clearAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearReplyTarget = () => {
    setReplyToWaMessageId(null);
  };

  useEffect(() => {
    if (!activeThreadHasExpiredCustomerServiceWindow) {
      return;
    }

    setMessageInput('');
    setIsComposerActionsOpen(false);
    setIsEmojiOpen(false);
    setReplyToWaMessageId(null);

    if (attachment) {
      clearAttachment();
    }
  }, [activeThreadHasExpiredCustomerServiceWindow, selectedThreadId]);

  const handleReplyToMessage = (message: ConversationMessage) => {
    if (!activeThreadSupportsWhatsAppActions) {
      return;
    }

    if (!getConversationWindowState(activeThreadMessages, Date.now()).isActive) {
      return;
    }

    if (!isContextualReplyableMessage(message) || !message.waMessageId) {
      return;
    }

    setReplyToWaMessageId(message.waMessageId);
    setIsTemplateTrayOpen(false);
    setIsEmojiOpen(false);
    setIsComposerActionsOpen(false);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const toggleComposerActions = () => {
    setIsComposerActionsOpen((current) => {
      const next = !current;

      if (!next) {
        setIsEmojiOpen(false);
        setIsTemplateTrayOpen(false);
      }

      return next;
    });
  };

  const handleTextFormatting = (wrapper: '*' | '_') => {
    const element = textareaRef.current;

    if (!element) {
      setMessageInput((current) => `${current}${wrapper}${wrapper}`);
      return;
    }

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const selected = messageInput.slice(start, end);
    const nextValue = `${messageInput.slice(0, start)}${wrapper}${selected}${wrapper}${messageInput.slice(end)}`;
    setMessageInput(nextValue);

    window.requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + 1, end + 1);
    });
  };

  const handleEmojiInsert = (emoji: string) => {
    setMessageInput((current) => `${current}${emoji}`);
    setIsEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const handleAttachmentPicked = async (file: File) => {
    try {
      setError(null);
      setIsBusy('upload');
      const previewUrl =
        file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
          ? URL.createObjectURL(file)
          : null;

      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      const uploaded = await appApi.uploadMedia(file);
      setAttachment({
        mediaId: uploaded.mediaId,
        mediaType: uploaded.mediaType,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        previewUrl,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload attachment.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleStartCallFromInbox = async () => {
    if (!activeThreadSupportsWhatsAppActions) {
      setError('Calls are currently available only for WhatsApp conversations.');
      return;
    }

    if (!bootstrap?.channel) {
      setError('Connect your WhatsApp channel before starting a call.');
      return;
    }

    if (!activeThread) {
      return;
    }

    const targetWaId = activeThread.contactWaId || activeThread.displayPhone;

    if (!targetWaId) {
      setError('No WhatsApp number is available for this contact.');
      return;
    }

    if (blockedUserWaIdSet.has(targetWaId)) {
      setError('This WhatsApp user is blocked. Unblock the user before placing a call.');
      return;
    }

    try {
      setIsBusy('call');
      setError(null);
      setNotice(null);

      const permissionResponse = await appApi.getCallPermissions(targetWaId);

      if (!canStartCallFromPermissionResponse(permissionResponse)) {
        if (canRequestCallPermissionFromResponse(permissionResponse)) {
          const response = await appApi.requestCallPermission({
            userWaId: targetWaId,
            threadId: activeThread.id,
          });

          if (selectedThreadIdRef.current === activeThread.id) {
            setMessages((current) => upsertConversationMessage(current, response.message));
          }
          setBootstrap((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              conversations: upsertConversationThread(current.conversations, response.thread),
            };
          });
          setNotice('Call permission request sent. Ask the contact to approve it in WhatsApp, then try the call again.');
          return;
        }

        setError(getCallPermissionUnavailableMessage(permissionResponse));
        return;
      }

      await startOutgoingCall(targetWaId, `inbox:${activeThread.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start the WhatsApp call.');
    } finally {
      setIsBusy((current) => (current === 'call' ? null : current));
    }
  };

  const handleSend = async () => {
    if (!activeThread) {
      return;
    }

    if (activeThreadIsBlocked) {
      setError('This WhatsApp user is blocked. Unblock the user before sending a message.');
      return;
    }

    if (
      activeThreadUsesCustomerServiceWindow &&
      !getConversationWindowState(activeThreadMessages, Date.now()).isActive
    ) {
      if (activeThreadSupportsWhatsAppActions) {
        setError('This chat has expired. Send an approved template to continue the WhatsApp conversation.');
        setIsTemplateTrayOpen(true);
      } else {
        setError(`This ${activeThreadChannelLabel} chat has expired. You can reply after the customer sends a new message.`);
      }
      setIsComposerActionsOpen(false);
      return;
    }

    const to = activeThread.displayPhone || activeThread.contactWaId;
    const trimmedBody = messageInput.trim();
    const pendingAttachment = attachment;
    const replyToMessageId = replyTargetMessage?.waMessageId || undefined;

    if (!pendingAttachment && !trimmedBody) {
      return;
    }

    if (pendingAttachment && !activeThreadSupportsWhatsAppActions) {
      setError(`${activeThreadChannelLabel} replies currently support text messages only.`);
      return;
    }

    const createdAt = new Date().toISOString();
    const clientTempId = createClientTempId();
    const previewText = pendingAttachment
      ? trimmedBody || pendingAttachment.fileName || `${pendingAttachment.mediaType} attachment`
      : trimmedBody;
    const optimisticThread = createOptimisticThread(activeThread, previewText, createdAt);
    const optimisticMessage = createOptimisticMessage({
      clientTempId,
      threadId: activeThread.id,
      messageType: pendingAttachment?.mediaType || 'text',
      body: previewText || null,
      currentUserName,
      senderWaId: currentUserWaId,
      recipientWaId: to,
      createdAt,
      templateName: null,
      raw: pendingAttachment
        ? {
            ...(replyToMessageId
              ? {
                  context: {
                    message_id: replyToMessageId,
                  },
                }
              : {}),
            type: pendingAttachment.mediaType,
            [pendingAttachment.mediaType]: {
              id: pendingAttachment.mediaId,
              mime_type: pendingAttachment.mimeType,
              filename: pendingAttachment.fileName,
              caption: trimmedBody || null,
            },
          }
        : replyToMessageId
          ? {
              context: {
                message_id: replyToMessageId,
              },
            }
          : {},
    });

    try {
      setIsBusy('send');
      setError(null);
      setMessages((current) => upsertConversationMessage(current, optimisticMessage));
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, optimisticThread),
        };
      });

      if (pendingAttachment) {
        const response = await appApi.sendMediaMessage(activeThread.id, {
          to,
          mediaId: pendingAttachment.mediaId,
          mediaType: pendingAttachment.mediaType,
          caption: trimmedBody || undefined,
          fileName: pendingAttachment.fileName,
          mimeType: pendingAttachment.mimeType,
          replyToMessageId,
          clientTempId,
        });
        if (selectedThreadIdRef.current === activeThread.id) {
          setMessages((current) => replaceConversationMessage(current, optimisticMessage.id, response.message));
        }
        setBootstrap((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            conversations: upsertConversationThread(current.conversations, response.thread),
          };
        });
        setMessageInput('');
        clearAttachment();
        clearReplyTarget();
      } else {
        setMessageInput('');

        const response = await appApi.sendTextMessage(activeThread.id, {
          body: trimmedBody,
          to,
          replyToMessageId,
          clientTempId,
        });
        if (selectedThreadIdRef.current === activeThread.id) {
          setMessages((current) => replaceConversationMessage(current, optimisticMessage.id, response.message));
        }
        setBootstrap((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            conversations: upsertConversationThread(current.conversations, response.thread),
          };
        });
        clearReplyTarget();
      }
    } catch (error) {
      if (selectedThreadIdRef.current === activeThread.id) {
        setMessages((current) => removeConversationMessage(current, optimisticMessage.id));
      }

      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, activeThread),
        };
      });

      if (!pendingAttachment) {
        setMessageInput(trimmedBody);
      }

      setError(error instanceof Error ? error.message : 'Failed to send the message.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleToggleActiveThreadBlock = async (shouldBlock: boolean, targetWaIdOverride?: string) => {
    if (!targetWaIdOverride && !activeThreadSupportsWhatsAppActions) {
      setError('Blocking is currently available only for WhatsApp conversations.');
      return false;
    }

    const targetWaId = targetWaIdOverride || activeThreadWaId;

    if (!targetWaId) {
      return false;
    }

    try {
      setBlockActionWaId(targetWaId);
      setError(null);

      if (shouldBlock) {
        await appApi.blockUsers([targetWaId]);
        setBlockedUsers((current) =>
          current.some((entry) => entry.waId === targetWaId)
            ? current
            : [...current, { waId: targetWaId, messagingProduct: 'whatsapp' }],
        );
        return true;
      }

      await appApi.unblockUsers([targetWaId]);
      setBlockedUsers((current) => current.filter((entry) => entry.waId !== targetWaId));
      return true;
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : 'Failed to update the WhatsApp block list.';
      setError(message);
      return false;
    } finally {
      setBlockActionWaId(null);
    }
  };

  const handleSendTemplateInConversation = async () => {
    if (!activeThreadSupportsWhatsAppActions) {
      setError('Templates can only be sent in WhatsApp conversations.');
      return;
    }

    const selectedTemplate = selectedComposerTemplate;

    if (!activeThread || !selectedTemplate) {
      return;
    }

    const to = activeThread.displayPhone || activeThread.contactWaId;
    const createdAt = new Date().toISOString();
    const clientTempId = createClientTempId();
    const canUseContextualReply = getConversationWindowState(activeThreadMessages, Date.now()).isActive;
    const replyToMessageId = canUseContextualReply ? replyTargetMessage?.waMessageId || undefined : undefined;
    const templateSnapshot = normalizeTemplateSnapshot(selectedTemplate.raw, {
      name: selectedTemplate.name,
      language: selectedTemplate.language,
    });
    const previewText = getTemplatePreviewText(templateSnapshot, selectedTemplate.name);
    const optimisticMessage = createOptimisticMessage({
      clientTempId,
      threadId: activeThread.id,
      messageType: 'template',
      body: previewText,
      currentUserName,
      senderWaId: currentUserWaId,
      recipientWaId: to,
      createdAt,
      templateName: selectedTemplate.name,
      raw: {
        ...(replyToMessageId
          ? {
              context: {
                message_id: replyToMessageId,
              },
            }
          : {}),
        ...(templateSnapshot ? { template_snapshot: templateSnapshot } : {}),
      },
    });
    const optimisticThread = createOptimisticThread(activeThread, previewText, createdAt);

    try {
      setIsBusy('template');
      setError(null);
      setMessages((current) => upsertConversationMessage(current, optimisticMessage));
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, optimisticThread),
        };
      });

      const response = await appApi.sendTemplateMessage({
        to,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        replyToMessageId,
        clientTempId,
      });

      if (selectedThreadIdRef.current === activeThread.id) {
        setMessages((current) => replaceConversationMessage(current, optimisticMessage.id, response.message));
      }
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, response.thread),
        };
      });
      setComposerTemplateId('');
      setIsTemplateTrayOpen(false);
      setIsTemplateSendModalOpen(false);
      clearReplyTarget();
    } catch (error) {
      if (selectedThreadIdRef.current === activeThread.id) {
        setMessages((current) => removeConversationMessage(current, optimisticMessage.id));
      }

      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, activeThread),
        };
      });
      setError(error instanceof Error ? error.message : 'Failed to send template.');
    } finally {
      setIsBusy(null);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleStartConversation = async () => {
    const selectedTemplate = sendableTemplates.find((template) => template.id === selectedTemplateId);
    const destination = newChatOption === 'existing' ? selectedContact : manualNumber.trim();

    if (!selectedTemplate || !destination) {
      return;
    }

    try {
      setIsBusy('start');
      setError(null);
      const response = await appApi.startConversation({
        to: destination,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        contactName: newChatOption === 'manual' ? manualName.trim() : undefined,
        clientTempId: createClientTempId(),
      });
      setBootstrap((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          conversations: upsertConversationThread(current.conversations, response.thread),
        };
      });
      setMessages([response.message]);
      setIsNewChatModalOpen(false);
      setSelectedContact('');
      setManualName('');
      setManualNumber('');
      setSelectedTemplateId('');
      openThread(response.threadId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start the new conversation.');
    } finally {
      setIsBusy(null);
    }
  };

  const activeContactName = getConversationDisplayName(activeThread);
  const openBlockContactConfirmation = () => {
    if (!activeThreadSupportsWhatsAppActions) {
      setError('Blocking is currently available only for WhatsApp conversations.');
      setIsConversationActionsOpen(false);
      return;
    }

    const targetWaId = getThreadWaId(activeThread);

    if (!targetWaId) {
      setError('This conversation does not have a WhatsApp contact number to block.');
      setIsConversationActionsOpen(false);
      return;
    }

    setPendingBlockConfirmation({
      waId: targetWaId,
      contactName: getConversationDisplayName(activeThread),
    });
    setIsConversationActionsOpen(false);
  };

  const handleConfirmBlockContact = async () => {
    if (!pendingBlockConfirmation) {
      return;
    }

    const didBlock = await handleToggleActiveThreadBlock(true, pendingBlockConfirmation.waId);

    if (didBlock) {
      setPendingBlockConfirmation(null);
    }
  };

  const renderReplyTargetChip = (): ReactNode => {
    if (!replyTargetMessage) {
      return null;
    }

    return (
      <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-[#d6dce7] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1381FF]">
            Replying to {getContextualReplySenderLabel(replyTargetMessage, activeContactName)}
          </p>
          <p className="mt-1 text-sm text-slate-600 break-words">
            {getContextualReplyPreviewText(replyTargetMessage, templates)}
          </p>
        </div>
        <button
          type="button"
          onClick={clearReplyTarget}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Clear reply target"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderAttachmentChip = (): ReactNode => {
    if (!attachment) {
      return null;
    }

    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#d6dce7] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p>
          <p className="text-xs text-slate-500">
            {attachment.mediaType} &bull; {attachment.mimeType}
          </p>
        </div>
        <button
          onClick={clearAttachment}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const openTemplateSendModal = () => {
    setIsTemplateTrayOpen(false);
    setIsTemplateSendModalOpen(true);
  };

  const renderTemplateSendModal = (): ReactNode => {
    if (!isTemplateSendModalOpen || !activeThreadSupportsWhatsAppActions || !modalRoot) {
      return null;
    }

    const templateOptions = [
      { value: '', label: 'Choose a template...', disabled: true },
      ...(sendableTemplates.length === 0
        ? [{ value: '__empty', label: 'No approved templates available', disabled: true }]
        : sendableTemplates.map((template) => ({
            value: template.id,
            label: `${template.name} (${template.language})`,
          }))),
    ];
    const selectedTemplateSnapshot = selectedComposerTemplate
      ? normalizeTemplateSnapshot(selectedComposerTemplate.raw, {
          name: selectedComposerTemplate.name,
          language: selectedComposerTemplate.language,
        })
      : null;
    const hasSelectedTemplatePreview = Boolean(selectedTemplateSnapshot?.components.length);

    return createPortal(
      <AnimatePresence>
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6">
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsTemplateSendModalOpen(false)}
          className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm"
          aria-label="Close template sender"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">WhatsApp template</p>
              <h3 className="mt-2 text-xl font-bold text-gray-900">Send template message</h3>
              <p className="mt-1 text-sm text-gray-500">Choose an approved template to reopen this expired conversation.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsTemplateSendModalOpen(false)}
              className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close template sender"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">Approved template</label>
            <DropdownSelect
              value={composerTemplateId}
              onChange={setComposerTemplateId}
              options={templateOptions}
              placeholder="Choose a template..."
              icon={<MessageSquareText className="h-5 w-5" />}
              ariaLabel="Select approved template to send"
              buttonClassName="rounded-xl border-gray-200 bg-white px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            />

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-gray-700">Preview</p>
              <div className="rounded-[24px] border border-slate-200 bg-[#f4f6f8] p-4">
                <div className="mx-auto w-full max-w-[380px] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                  {selectedTemplateSnapshot && hasSelectedTemplatePreview ? (
                    <TemplateMessageCard snapshot={selectedTemplateSnapshot} isOutbound={false} isPending={false} />
                  ) : selectedComposerTemplate ? (
                    <p className="text-sm leading-6 text-slate-600">
                      {getTemplatePreviewText(selectedTemplateSnapshot, selectedComposerTemplate.name)}
                    </p>
                  ) : (
                    <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                      <MessageSquareText className="h-6 w-6 text-slate-400" />
                      <p className="mt-3 text-sm font-medium text-slate-700">Select a template to preview it here.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 p-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsTemplateSendModalOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSendTemplateInConversation()}
              disabled={!selectedComposerTemplate || isBusy === 'template'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/30 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span>{isBusy === 'template' ? 'Sending...' : 'Send Template'}</span>
            </button>
          </div>
        </motion.div>
        </div>
      </AnimatePresence>,
      modalRoot,
    );
  };

  const renderComposerTemplateTray = (): ReactNode => {
    if (!isTemplateTrayOpen || !activeThreadSupportsWhatsAppActions) {
      return null;
    }

    const hasSelectedTemplate = sendableTemplates.some((template) => template.id === composerTemplateId);
    const templateOptions = [
      { value: '', label: 'Choose a template' },
      ...(sendableTemplates.length === 0
        ? [{ value: '__empty', label: 'No approved templates available', disabled: true }]
        : sendableTemplates.map((template) => ({
            value: template.id,
            label: `${template.name} (${template.language})`,
          }))),
    ];

    return (
      <div ref={templateTrayRef} className="absolute bottom-full left-0 z-20 mb-3 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:left-28">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900">Send approved template</p>
          <button
            type="button"
            onClick={() => setIsTemplateTrayOpen(false)}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close template selector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <DropdownSelect
          value={composerTemplateId}
          onChange={setComposerTemplateId}
          options={templateOptions}
          placeholder="Choose a template"
          className="mt-3"
          buttonClassName="border-[#d8d2ff] px-3 focus:border-[#1381FF]"
        />
        <button
          type="button"
          onClick={() => void handleSendTemplateInConversation()}
          disabled={!hasSelectedTemplate || isBusy === 'template'}
          className="mt-3 w-full rounded-xl bg-[#1381FF] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4a35e8] disabled:opacity-60"
        >
          {isBusy === 'template' ? 'Sending...' : 'Send template'}
        </button>
      </div>
    );
  };

  const composerIconButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d6dce7] bg-white text-slate-600 shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';
  const composerChipButtonClass =
    'inline-flex h-10 items-center justify-center rounded-2xl border border-[#d6dce7] bg-white px-4 text-sm font-semibold text-slate-600 shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0';

  return (
    <motion.div
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      variants={layoutStaggerVariants}
      className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-[2rem] bg-gray-50 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.07)] ring-1 ring-gray-100 lg:flex-row lg:gap-3"
    >
      <motion.div
        variants={panelRiseVariants}
        className={`${
          shouldHideThreadList ? 'hidden' : 'flex'
        } w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 lg:w-[21rem]`}
      >
        <div className="border-b border-gray-100 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900">Inbox</h2>
              <p className="mt-0.5 text-xs text-gray-500">{filteredThreads.length} conversations</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                disabled={!canUseWhatsAppActions}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/30 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#4a35e8] active:translate-y-0 active:scale-[0.98] sm:w-auto"
              >
                <Plus className="w-4 h-4" /> New chat
              </button>
              <button
                type="button"
                onClick={() => setIsThreadListCollapsed(true)}
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97] lg:inline-flex"
                aria-label="Collapse inbox list"
                title="Collapse inbox list"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-transparent bg-gray-50 py-2.5 pl-9 pr-4 text-sm transition-[border-color,box-shadow,background-color] duration-200 ease-out focus:border-[#1381FF] focus:bg-white focus:outline-none focus:shadow-[0_0_0_4px_rgba(19,129,255,0.08)]"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 rounded-xl bg-gray-100 p-1">
            {THREAD_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setThreadFilter(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.97] ${
                  threadFilter === option.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {CHANNEL_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setChannelFilter(option.id)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-[0.96] ${
                  channelFilter === option.id
                    ? 'bg-[#1381FF] text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                }`}
                aria-label={`Show ${option.label}`}
                title={option.label}
              >
                {option.icon ? <ChannelBrandIcon channel={option.icon} className="h-5 w-5" alt="" /> : <MessageSquareText className="h-4 w-4" />}
              </button>
              ))}
            </div>
            <span className="truncate text-[11px] font-medium text-gray-500">{selectedChannelFilterLabel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {filteredThreads.map((thread, index) => {
            const threadChannel = getThreadChannel(thread);

            return (
              <motion.div
                key={thread.id}
                role="button"
                tabIndex={0}
                onClick={() => openThread(thread.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openThread(thread.id);
                  }
                }}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(index * 0.018, 0.14), ease: MOTION_EASE }}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
                className={`group flex w-full cursor-pointer gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors duration-200 ease-out ${
                  selectedThreadId === thread.id ? 'bg-[#f3f1ff]' : 'hover:bg-gray-50'
                }`}
              >
                <ConversationAvatar thread={thread} />
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold text-gray-900">{getConversationDisplayName(thread)}</h4>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-[11px] text-gray-400">
                        {formatMessageTime(thread.lastMessageAt)}
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleStarThread(thread.id);
                        }}
                        className={`rounded-lg p-1 transition hover:bg-gray-100 hover:text-amber-400 ${
                          starredThreadIdSet.has(thread.id)
                            ? 'text-amber-400 opacity-100'
                            : 'text-gray-300 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                        }`}
                        aria-label={starredThreadIdSet.has(thread.id) ? 'Unstar conversation' : 'Star conversation'}
                      >
                        <Star
                          className={`h-4 w-4 ${
                            starredThreadIdSet.has(thread.id) ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <ChannelBrandIcon channel={threadChannel} className="h-4 w-4 shrink-0 opacity-80" alt={getChannelLabel(threadChannel)} />
                    <p className="truncate text-xs text-gray-500">{thread.lastMessageText || 'No messages yet'}</p>
                    {thread.unreadCount > 0 ? (
                      <motion.span
                        animate={shouldReduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: MOTION_EASE }}
                        className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#1381FF] px-1.5 text-[10px] font-semibold text-white"
                      >
                        {thread.unreadCount}
                      </motion.span>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredThreads.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              {getEmptyThreadMessage({
                channelFilter,
                threadFilter,
                hasWhatsAppChannel: Boolean(bootstrap?.channel),
                hasInstagramChannel: Boolean(bootstrap?.instagramChannel),
                hasMessengerChannel: Boolean(bootstrap?.messengerChannel),
              })}
            </div>
          ) : null}
        </div>
      </motion.div>

      <motion.div
        variants={panelRiseVariants}
        className={`${
          isMobileViewport && mobileView === 'threads' ? 'hidden' : 'flex'
        } min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100`}
      >
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 shrink-0 sm:px-6 lg:flex-nowrap">
          <div className="flex min-w-0 items-center gap-3">
            {!isMobileViewport && isThreadListCollapsed ? (
              <button
                type="button"
                onClick={() => setIsThreadListCollapsed(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97]"
                aria-label="Show inbox list"
                title="Show inbox list"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}
            {isMobileViewport ? (
              <button
                type="button"
                onClick={returnToThreadList}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-50 hover:text-gray-900 active:translate-y-0 active:scale-[0.97] lg:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900">
                {activeThread ? getConversationDisplayName(activeThread) : 'Select a conversation'}
              </h2>
              {activeThread ? (
                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-gray-500">
                  {activeThreadChannel ? <ChannelBrandIcon channel={activeThreadChannel} className="h-4 w-4 shrink-0" alt="" /> : null}
                  <span className="truncate">{activeThreadChannelLabel}</span>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeConversationWindow.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className="truncate">{activeThreadWindowStatus}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeThread ? (
              <button
                onClick={() => toggleStarThread(activeThread.id)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-amber-400 active:translate-y-0 active:scale-[0.97]"
                aria-label={activeThreadIsStarred ? 'Unstar conversation' : 'Star conversation'}
                title={activeThreadIsStarred ? 'Unstar' : 'Star'}
              >
                <Star className={`h-4 w-4 ${activeThreadIsStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            ) : null}
            {activeThread && activeThreadSupportsWhatsAppActions ? (
              <button
                onClick={() => void handleStartCallFromInbox()}
                disabled={!activeThread || isBusy === 'call' || activeThreadIsBlocked}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-600 active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {isBusy === 'call' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="w-5 h-5" />}
              </button>
            ) : null}
            <button
              onClick={() => setIsContactPanelOpen((current) => !current)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97]"
              aria-label={isContactPanelOpen ? 'Hide details' : 'Show details'}
              title={isContactPanelOpen ? 'Hide details' : 'Show details'}
            >
              {isContactPanelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            {activeThread ? (
              <div ref={conversationActionsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsConversationActionsOpen((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:text-gray-700 active:translate-y-0 active:scale-[0.97]"
                  aria-label="More conversation actions"
                  title="More actions"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                <AnimatePresence initial={false}>
                {isConversationActionsOpen ? (
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: -4 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.16, ease: MOTION_EASE }}
                    className="absolute right-0 top-12 z-30 w-56 origin-top-right overflow-hidden rounded-2xl bg-white py-2 shadow-xl ring-1 ring-gray-100"
                  >
                    {activeThreadSupportsWhatsAppActions ? (
                      <button
                        type="button"
                        onPointerDown={(event) => {
                          if (activeThreadIsBlocked) {
                            return;
                          }

                          event.preventDefault();
                          event.stopPropagation();
                          openBlockContactConfirmation();
                        }}
                        onClick={() => {
                          if (activeThreadIsBlocked) {
                            setIsConversationActionsOpen(false);
                            void handleToggleActiveThreadBlock(false);
                            return;
                          }

                          openBlockContactConfirmation();
                        }}
                        disabled={Boolean(blockActionWaId && blockActionWaId === activeThreadWaId)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          activeThreadIsBlocked
                            ? 'text-gray-700 hover:bg-gray-50'
                            : 'font-medium text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        {blockActionWaId === activeThreadWaId ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : (
                          <AlertCircle className={`h-4 w-4 ${activeThreadIsBlocked ? 'text-gray-400' : 'text-rose-500'}`} />
                        )}
                        <span>{activeThreadIsBlocked ? 'Unblock Contact' : 'Block Contact'}</span>
                      </button>
                    ) : (
                      <div className="px-4 py-2.5 text-sm text-gray-500">No extra actions</div>
                    )}
                  </motion.div>
                ) : null}
                </AnimatePresence>
              </div>
            ) : null}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: MOTION_EASE }}
              className="mx-4 mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
            >
              {error}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {notice ? (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: MOTION_EASE }}
              className="mx-4 mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-6"
            >
              {notice}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          ref={messagesViewportRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto bg-[#f7f8fa] p-4 scrollbar-hide sm:p-6"
        >
          <div ref={messagesContentRef} className="space-y-4">
            {activeThreadMessages.map((message, index) => {
              const messageDateKey = getMessageDateKey(message.createdAt);
              const previousMessage = index > 0 ? activeThreadMessages[index - 1] : null;
              const previousDateKey = previousMessage ? getMessageDateKey(previousMessage.createdAt) : null;
              const showDateHeader = messageDateKey !== previousDateKey;
              const currentMessageTimestampMs = getMessageTimestampMs(message.createdAt);
              const previousMessageTimestampMs = previousMessage ? getMessageTimestampMs(previousMessage.createdAt) : null;
              const isGroupedWithPrevious = Boolean(
                previousMessage &&
                  previousMessage.direction === message.direction &&
                  messageDateKey === previousDateKey &&
                  currentMessageTimestampMs !== null &&
                  previousMessageTimestampMs !== null &&
                  Math.abs(currentMessageTimestampMs - previousMessageTimestampMs) <= 5 * 60 * 1000,
              );
              const messageIsOutbound = message.direction === 'outbound';

              return (
                <motion.div
                  key={message.id}
                  initial={shouldReduceMotion ? false : { opacity: 0, x: messageIsOutbound ? 12 : -12 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(index * 0.012, 0.12), ease: MOTION_EASE }}
                  className={showDateHeader ? 'space-y-4' : 'space-y-1'}
                >
                  {showDateHeader ? (
                    <div className="flex justify-center">
                      <div className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-gray-100">
                        {formatMessageDateHeader(message.createdAt)}
                      </div>
                    </div>
                  ) : null}
                  <MessageBubble
                    message={message}
                    currentUserName={currentUserName}
                    contactName={activeContactName}
                    contactAvatarUrl={activeThread?.avatarUrl || null}
                    templates={templates}
                    messageLookupByWaId={messageLookupByWaId}
                    showAvatar={!isGroupedWithPrevious}
                    onReply={
                      activeThreadSupportsWhatsAppActions && activeConversationWindow.isActive
                        ? handleReplyToMessage
                        : undefined
                    }
                  />
                </motion.div>
              );
            })}

            {isBusy === 'messages' ? (
              <div className="text-sm text-gray-500">Loading messages...</div>
            ) : null}

            {selectedThreadId && activeThreadMessages.length === 0 && activeThreadMessagesReady && isBusy !== 'messages' ? (
              <div className="text-sm text-gray-500">No messages recorded for this conversation yet.</div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white p-3">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleAttachmentPicked(file);
              }
            }}
          />

          <div className="relative">
            {activeThreadIsBlocked ? (
              <div className="rounded-[26px] border border-red-200 bg-red-50 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-red-700">This user has been blocked</p>
                  <button
                    type="button"
                    onClick={() => void handleToggleActiveThreadBlock(false)}
                    disabled={!activeThreadWaId || blockActionWaId === activeThreadWaId}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {blockActionWaId === activeThreadWaId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {blockActionWaId === activeThreadWaId ? 'Unblocking...' : 'Unblock Now'}
                  </button>
                </div>
              </div>
            ) : activeThreadIsCheckingCustomerServiceWindow ? (
              <div className="rounded-[26px] border border-[#d6dce7] bg-[#f6f8fb] px-5 py-4">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking {activeThreadChannelLabel} conversation window...
                </div>
              </div>
            ) : activeThreadHasExpiredCustomerServiceWindow ? (
              <>
                <div className="rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,#fffdf6_0%,#fff8e8_100%)] px-3.5 py-3 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Clock className="h-4 w-4" />
                      </div>
                      <p className="min-w-0 truncate text-sm font-semibold text-amber-900">This chat is resolved and expired</p>
                      <button
                        type="button"
                        onClick={() => setIsExpiredWindowInfoOpen(true)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-[13px] font-semibold leading-none text-amber-800 transition hover:border-amber-300 hover:bg-amber-50"
                        aria-label="Why this chat is expired"
                        title="Why this chat is expired"
                      >
                        i
                      </button>
                    </div>
                    {activeThreadSupportsWhatsAppActions ? (
                      <button
                        type="button"
                        onClick={openTemplateSendModal}
                        disabled={sendableTemplates.length === 0 || isBusy === 'template'}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Select Template to Send
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <AnimatePresence initial={false}>
                  {isComposerActionsOpen ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      className="mb-3 flex flex-wrap items-center gap-2"
                    >
                      <button
                        onClick={() => setIsEmojiOpen((current) => !current)}
                        disabled={!activeThread}
                        className={composerIconButtonClass}
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!activeThread || !activeThreadSupportsWhatsAppActions || isBusy === 'upload'}
                        className={composerIconButtonClass}
                        title={
                          activeThreadSupportsWhatsAppActions
                            ? 'Attach file'
                            : `${activeThreadChannelLabel} media replies are not wired yet`
                        }
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setIsTemplateTrayOpen((current) => !current)}
                        disabled={!activeThread || !activeThreadSupportsWhatsAppActions || sendableTemplates.length === 0}
                        className={`${composerChipButtonClass} ${isTemplateTrayOpen ? 'border-[#c9d4e8] bg-slate-50 text-slate-900' : ''}`}
                      >
                        Templates
                      </button>
                      <button disabled className={`${composerChipButtonClass} text-slate-400 hover:bg-white hover:text-slate-400`}>
                        Catalog
                      </button>
                      <button
                        onClick={() => handleTextFormatting('*')}
                        disabled={!activeThread}
                        className={composerIconButtonClass}
                      >
                        <span className="text-base font-semibold">B</span>
                      </button>
                      <button
                        onClick={() => handleTextFormatting('_')}
                        disabled={!activeThread}
                        className={composerIconButtonClass}
                      >
                        <span className="text-base italic">I</span>
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {isEmojiOpen ? (
                  <div className="absolute bottom-full left-0 z-20 mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
                    <div className="grid grid-cols-6 gap-2">
                      {EMOJI_CHOICES.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleEmojiInsert(emoji)}
                          className="rounded-lg p-2 text-xl hover:bg-gray-100"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {renderComposerTemplateTray()}

                {renderReplyTargetChip()}
                {renderAttachmentChip()}

                {activeThreadUsesCustomerServiceWindow && activeConversationWindowTimeLeft ? (
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Window closes in {activeConversationWindowTimeLeft}</span>
                  </div>
                ) : null}

                <div className="flex min-h-9 items-center gap-2 rounded-xl border border-[#d6dce7] bg-[#f6f8fb] px-2 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-[border-color,box-shadow,background-color] duration-200 ease-out focus-within:border-[#1381FF]/60 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(19,129,255,0.08)]">
                  <button
                    onClick={toggleComposerActions}
                    disabled={!activeThread}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150 ease-out hover:scale-105 active:scale-[0.97] ${
                      isComposerActionsOpen
                        ? 'border-[#0d8d60] bg-[#12c07a] text-white shadow-[0_12px_24px_rgba(18,192,122,0.24)]'
                        : 'border-transparent bg-transparent text-slate-500 hover:bg-white hover:text-slate-800'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    aria-label="Open composer tools"
                  >
                    {isComposerActionsOpen ? <X className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={activeThread ? 'Type a message...' : 'Select a conversation first'}
                    disabled={!activeThread}
                    className="h-8 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                  />

                  {messageInput.trim() ? <TypingDots shouldReduceMotion={shouldReduceMotion} /> : null}

                  <button
                    onClick={() => void handleSend()}
                    disabled={!activeThread || (!messageInput.trim() && !attachment) || isBusy === 'send' || isBusy === 'upload'}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 ease-out hover:scale-105 hover:bg-white hover:text-slate-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {isContactPanelOpen ? (
          isMobileViewport ? (
            <div className="fixed inset-0 z-40 lg:hidden">
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsContactPanelOpen(false)}
                className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
                aria-label="Close contact details"
              />
              <motion.div
                initial={shouldReduceMotion ? false : { x: '100%' }}
                animate={shouldReduceMotion ? undefined : { x: 0 }}
                exit={shouldReduceMotion ? undefined : { x: '100%' }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeInOut' }}
                className="absolute inset-y-0 right-0 z-10 w-full max-w-sm overflow-hidden border-l border-gray-200 bg-white"
              >
                <div className="h-full overflow-y-auto scrollbar-hide">
                  <div className="flex items-center justify-between border-b border-gray-100 p-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Contact details</p>
                      <h3 className="mt-1 text-lg font-bold text-gray-900">{getConversationDisplayName(activeThread)}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsContactPanelOpen(false)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <ContactDetailsContent
                    activeThread={activeThread}
                    activeThreadChannel={activeThreadChannel}
                    activeThreadChannelLabel={activeThreadChannelLabel}
                    ownerName={bootstrap?.profile?.fullName || 'Unassigned'}
                    openSections={openContactDetailSections}
                    onToggleSection={toggleContactDetailSection}
                    onAddLabel={openAddLabelModal}
                    onAssignOwner={() => void handleAssignActiveThreadOwner()}
                    onToggleMarketingOptIn={() => void handleToggleActiveThreadMarketingOptIn()}
                    isMarketingOptUpdating={isBusy === 'contact-update'}
                  />
                </div>
              </motion.div>
            </div>
          ) : (
          <motion.div
            initial={shouldReduceMotion ? false : { width: 0, opacity: 0 }}
            animate={shouldReduceMotion ? { width: 320, opacity: 1 } : { width: 320, opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { width: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeInOut' }}
            className="hidden shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 lg:block"
          >
            <div className="h-full w-80 flex flex-col overflow-y-auto scrollbar-hide">
              <ContactDetailsContent
                activeThread={activeThread}
                activeThreadChannel={activeThreadChannel}
                activeThreadChannelLabel={activeThreadChannelLabel}
                ownerName={bootstrap?.profile?.fullName || 'Unassigned'}
                openSections={openContactDetailSections}
                onToggleSection={toggleContactDetailSection}
                onAddLabel={openAddLabelModal}
                onAssignOwner={() => void handleAssignActiveThreadOwner()}
                onToggleMarketingOptIn={() => void handleToggleActiveThreadMarketingOptIn()}
                isMarketingOptUpdating={isBusy === 'contact-update'}
              />
            </div>
          </motion.div>
          )
        ) : null}
      </AnimatePresence>

      {isAddLabelModalOpen && modalRoot
        ? createPortal(
          <AnimatePresence>
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAddLabelModal}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              aria-label="Close add label dialog"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Add label</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Save a label for {activeThread ? getConversationDisplayName(activeThread) : 'this conversation'}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAddLabelModal}
                  className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close add label dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddActiveThreadLabel} className="flex flex-col">
                <div className="space-y-5 overflow-y-auto p-6">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Label name</label>
                    <div className="relative">
                      <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={labelDraft}
                        onChange={(event) => {
                          setLabelDraft(event.target.value);
                          if (labelModalError) {
                            setLabelModalError(null);
                          }
                        }}
                        placeholder="e.g. VIP, Follow-up, Hot lead"
                        autoFocus
                        maxLength={40}
                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
                      />
                    </div>
                    {labelModalError ? (
                      <p className="mt-2 text-sm text-rose-600">{labelModalError}</p>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500">Labels help organize conversations across your inbox and CRM.</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Current labels</p>
                    <div className="flex flex-wrap gap-2">
                      {(activeThread?.labels || []).length > 0 ? (
                        activeThread?.labels.map((label) => (
                          <span key={label} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                            <Tag className="h-3 w-3 text-gray-400" />
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500">No labels added yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={closeAddLabelModal}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isBusy === 'contact-update'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy === 'contact-update' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span>{isBusy === 'contact-update' ? 'Saving...' : 'Add label'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
            </div>
          </AnimatePresence>,
            modalRoot,
          )
        : null}

      {renderTemplateSendModal()}

      <ConfirmationDialog
        isOpen={Boolean(pendingBlockConfirmation)}
        title={`Block '${pendingBlockConfirmation?.contactName || 'Contact'}'?`}
        description="This person won't be able to message or call you. They won't know that you blocked them."
        cancelLabel="Cancel"
        confirmLabel="Block"
        tone="danger"
        isLoading={Boolean(pendingBlockConfirmation && blockActionWaId === pendingBlockConfirmation.waId)}
        onClose={() => setPendingBlockConfirmation(null)}
        onConfirm={() => void handleConfirmBlockContact()}
      />

      {isExpiredWindowInfoOpen && modalRoot
        ? createPortal(
          <AnimatePresence>
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpiredWindowInfoOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              aria-label="Close expired chat explanation"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Expired chat</h3>
                  <p className="mt-1 text-sm text-gray-500">Why this conversation can no longer receive a regular reply.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExpiredWindowInfoOpen(false)}
                  className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close expired chat explanation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900">This chat is resolved and expired</p>
                    <p className="mt-1 text-sm leading-6 text-amber-800">{expiredWindowNotice}</p>
                  </div>
                </div>

                {activeThreadSupportsWhatsAppActions ? (
                  <p className="text-sm text-gray-600">
                    Use an approved template to reopen the conversation and send the next message.
                  </p>
                ) : null}
              </div>
            </motion.div>
            </div>
          </AnimatePresence>,
            modalRoot,
          )
        : null}

      {isNewChatModalOpen && modalRoot
        ? createPortal(
          <AnimatePresence>
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewChatModalOpen(false)} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />

            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden relative z-10 flex max-h-[88vh] flex-col">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold text-gray-900">Start New Chat</h3>
                <button onClick={() => setIsNewChatModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto scrollbar-hide">
                <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                  <button
                    onClick={() => setNewChatOption('existing')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newChatOption === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Existing Contact
                  </button>
                  <button
                    onClick={() => setNewChatOption('manual')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newChatOption === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Manual Entry
                  </button>
                </div>

                <div className="space-y-5">
                  {newChatOption === 'existing' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Contact</label>
                      <DropdownSelect
                        value={selectedContact}
                        onChange={setSelectedContact}
                        options={[
                          { value: '', label: 'Choose a contact...', disabled: true },
                          ...conversations.map((thread) => ({
                            value: thread.displayPhone || thread.contactWaId,
                            label: getConversationDisplayName(thread),
                          })),
                        ]}
                        placeholder="Choose a contact..."
                        icon={<User className="h-5 w-5" />}
                        ariaLabel="Select contact"
                        buttonClassName="rounded-xl border-gray-200 bg-white px-4 py-2.5 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            placeholder="e.g. John Doe"
                            value={manualName}
                            onChange={(event) => setManualName(event.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#1381FF] focus:border-[#1381FF] outline-none text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="tel"
                            placeholder="e.g. +1 234 567 8900"
                            value={manualNumber}
                            onChange={(event) => setManualNumber(event.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#1381FF] focus:border-[#1381FF] outline-none text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Approved Template</label>
                    <DropdownSelect
                      value={selectedTemplateId}
                      onChange={setSelectedTemplateId}
                      options={[
                        { value: '', label: 'Choose a template...', disabled: true },
                        ...sendableTemplates.map((template) => ({
                          value: template.id,
                          label: `${template.name} (${template.language})`,
                        })),
                      ]}
                      placeholder="Choose a template..."
                      icon={<MessageSquareText className="h-5 w-5" />}
                      ariaLabel="Select approved template"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Only approved templates should be used to start a new conversation outside the customer service window.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0">
                <div className="mb-4 text-sm text-gray-600 bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
                  Looking to contact people in bulk? Wire the campaigns flow next and use the{' '}
                  <Link to="/dashboard/campaigns" className="text-blue-600 font-bold hover:underline" onClick={() => setIsNewChatModalOpen(false)}>
                    Campaigns
                  </Link>{' '}
                  route for that flow.
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsNewChatModalOpen(false)} className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleStartConversation()}
                    disabled={
                      isBusy === 'start' ||
                      !sendableTemplates.some((template) => template.id === selectedTemplateId) ||
                      (newChatOption === 'existing' ? !selectedContact : !manualNumber.trim())
                    }
                    className="flex-1 py-2.5 bg-[#1381FF] hover:bg-[#4a35e8] text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#1381FF]/30 disabled:opacity-60"
                  >
                    {isBusy === 'start' ? 'Starting...' : 'Start Chat'}
                  </button>
                </div>
              </div>
            </motion.div>
            </div>
          </AnimatePresence>,
            modalRoot,
          )
        : null}
    </motion.div>
  );
}
