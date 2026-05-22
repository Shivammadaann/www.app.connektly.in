import { Fragment, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BadgeCheck,
  BellRing,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Globe,
  ImagePlus,
  KeyRound,
  Languages,
  LayoutGrid,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Phone,
  PhoneMissed,
  Plus,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  TicketPercent,
  Trash2,
  User,
  UserPlus,
  Users,
  Volume2,
  WalletCards,
  Webhook,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { User as SupabaseUser, type Factor } from '@supabase/supabase-js';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import UserAvatar from '../../components/UserAvatar';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { getCachedSession, supabase } from '../../lib/supabase';
import { appApi } from '../../lib/api';
import { clientConfig } from '../../lib/config';
import { useAppData } from '../../context/AppDataContext';
import {
  formatTrialDaysLeft,
  getTrialDaysLeft,
  getTrialRemainingMs,
  isFreeTrialExpired,
  isFreeTrialPlan,
} from '../../lib/billing';
import { playNotificationChime, previewNotificationSound } from '../../lib/soundManager';
import { WALLET_CURRENCY_OPTIONS } from '../../lib/wallet';
import {
  getAuthUserDisplayName,
  getAuthUserProfilePictureUrl,
  getAuthUserProviderLabel,
} from '../../lib/userProfile';
import type {
  DeveloperApiCredential,
  DeveloperApiCredentialCreateInput,
  DeveloperApiScope,
  DeveloperWebhookCreateInput,
  DeveloperWebhookEndpoint,
  DeveloperWebhookEvent,
  InviteWorkspaceUserInput,
  NotificationPreferencesUpdateInput,
  UpdateWorkspaceTeamMemberInput,
  WorkspaceTeamMember,
} from '../../lib/types';

const USER_ROLE_OPTIONS: Array<{
  value: InviteWorkspaceUserInput['role'];
  label: string;
  description: string;
}> = [
  { value: 'Admin', label: 'Admin', description: 'Full workspace access and team visibility.' },
  { value: 'Manager', label: 'Manager', description: 'Operational access to leads, inbox, and reports.' },
  { value: 'Agent', label: 'Agent', description: 'Day-to-day inbox and CRM execution access.' },
];

const SETTINGS_TAB_IDS = [
  'profile',
  'security',
  'notifications',
  'organization',
  'team',
  'roles',
  'subscription',
  'payment-methods',
  'invoices',
  'integrations',
  'api-keys',
  'webhooks',
  'language-region',
  'timezone',
  'default-settings',
  'data-export',
  'delete-account',
] as const;
type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

type SettingsNavItem = {
  id: SettingsTabId;
  label: string;
  icon: typeof User;
};

const SETTINGS_GROUPS: Array<{
  title: string;
  icon: typeof User;
  items: SettingsNavItem[];
}> = [
  {
    title: 'Account',
    icon: User,
    items: [
      { id: 'profile', label: 'Profile', icon: User },
      { id: 'security', label: 'Security', icon: ShieldCheck },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'Workspace',
    icon: Globe,
    items: [
      { id: 'organization', label: 'Organization Details', icon: Globe },
      { id: 'team', label: 'Team / Users', icon: Users },
      { id: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
    ],
  },
  {
    title: 'Billing',
    icon: CreditCard,
    items: [
      { id: 'subscription', label: 'Subscription', icon: CreditCard },
      { id: 'payment-methods', label: 'Payment Methods', icon: WalletCards },
      { id: 'invoices', label: 'Invoices', icon: ReceiptText },
    ],
  },
  {
    title: 'System',
    icon: KeyRound,
    items: [
      { id: 'integrations', label: 'Integrations', icon: LayoutGrid },
      { id: 'api-keys', label: 'API Keys', icon: KeyRound },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
  {
    title: 'Preferences',
    icon: SlidersHorizontal,
    items: [
      { id: 'language-region', label: 'Language / Region', icon: Languages },
      { id: 'timezone', label: 'Timezone', icon: Globe },
      { id: 'default-settings', label: 'Default Settings', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Privacy & Data',
    icon: ShieldCheck,
    items: [
      { id: 'data-export', label: 'Data Export', icon: Download },
      { id: 'delete-account', label: 'Delete Account', icon: Trash2 },
    ],
  },
];

const NOTIFICATION_SOUND_OPTIONS = [
  { value: 'classic', label: 'Connektly default (Notification.mp3)' },
  { value: 'soft', label: 'Soft tone' },
  { value: 'pulse', label: 'Pulse alert' },
] as const;

type NotificationControlKey =
  | 'enabled'
  | 'soundEnabled'
  | 'callSoundEnabled'
  | 'incomingMessageEnabled'
  | 'incomingEmailEnabled'
  | 'templateReviewEnabled'
  | 'missedCallEnabled'
  | 'leadEnabled'
  | 'campaignSentEnabled'
  | 'emailCampaignEnabled'
  | 'displayNameApprovedEnabled'
  | 'teamJoinedEnabled';

const NOTIFICATION_CORE_CONTROLS: Array<{
  key: 'enabled' | 'soundEnabled' | 'callSoundEnabled';
  title: string;
  description: string;
  icon: typeof Bell;
}> = [
  {
    key: 'enabled',
    title: 'In-app notifications',
    description: 'Show live alerts in the header feed and notification center.',
    icon: BellRing,
  },
  {
    key: 'soundEnabled',
    title: 'Notification sounds',
    description: 'Play the default Notification.mp3 chime for live activity alerts.',
    icon: Volume2,
  },
  {
    key: 'callSoundEnabled',
    title: 'WhatsApp call sounds',
    description: 'Keep ringing and connected tones active for WhatsApp call popups.',
    icon: Phone,
  },
];

const NOTIFICATION_TRIGGER_GROUPS: Array<{
  title: string;
  description: string;
  accentClassName: string;
  items: Array<{
    key: NotificationControlKey;
    title: string;
    description: string;
    icon: typeof Bell;
  }>;
}> = [
  {
    title: 'CRM and inbox activity',
    description: 'Stay on top of new leads and active conversations across channels.',
    accentClassName: 'from-[#fff3d6] to-white',
    items: [
      {
        key: 'leadEnabled',
        title: 'New leads captured or assigned',
        description: 'Trigger when a lead lands in CRM, gets captured, or is newly assigned into the workspace.',
        icon: LayoutGrid,
      },
      {
        key: 'incomingMessageEnabled',
        title: 'New incoming messages',
        description: 'Trigger for fresh inbound WhatsApp and Messenger conversations in Inbox.',
        icon: MessageSquare,
      },
      {
        key: 'incomingEmailEnabled',
        title: 'New incoming emails',
        description: 'Trigger when a new unread email reaches the connected inbox.',
        icon: Mail,
      },
      {
        key: 'missedCallEnabled',
        title: 'WhatsApp missed calls',
        description: 'Trigger when a WhatsApp call ends as missed.',
        icon: PhoneMissed,
      },
    ],
  },
  {
    title: 'Campaigns and approvals',
    description: 'Know when outbound execution and Meta review events complete.',
    accentClassName: 'from-[#ecf7ff] to-white',
    items: [
      {
        key: 'templateReviewEnabled',
        title: 'Template approved or rejected',
        description: 'Trigger when WhatsApp template review returns an approval or rejection.',
        icon: BadgeCheck,
      },
      {
        key: 'campaignSentEnabled',
        title: 'WhatsApp campaigns sent',
        description: 'Trigger when a marketing campaign is successfully sent to recipients.',
        icon: Megaphone,
      },
      {
        key: 'emailCampaignEnabled',
        title: 'Email campaigns sent',
        description: 'Trigger when an email campaign is delivered successfully.',
        icon: Mail,
      },
      {
        key: 'displayNameApprovedEnabled',
        title: 'Display name approved',
        description: 'Trigger when Meta approves the WhatsApp display name tied to your sender.',
        icon: CheckCircle2,
      },
    ],
  },
  {
    title: 'Workspace updates',
    description: 'Keep team-level operational changes visible as they happen.',
    accentClassName: 'from-[#f4f0ff] to-white',
    items: [
      {
        key: 'teamJoinedEnabled',
        title: 'New user joins the workspace',
        description: 'Trigger when an invited teammate accepts and joins the workspace.',
        icon: Users,
      },
    ],
  },
];

const DEVELOPER_API_SCOPE_OPTIONS: Array<{
  value: DeveloperApiScope;
  label: string;
  description: string;
}> = [
  {
    value: 'messages:read',
    label: 'Read messages',
    description: 'Fetch conversations, messages, and delivery status through REST endpoints.',
  },
  {
    value: 'messages:write',
    label: 'Send messages',
    description: 'Create outbound text, media, and template messages from your own code.',
  },
  {
    value: 'contacts:read',
    label: 'Read contacts',
    description: 'Read CRM contacts and conversation profiles.',
  },
  {
    value: 'contacts:write',
    label: 'Manage contacts',
    description: 'Create or update CRM contact records from external systems.',
  },
  {
    value: 'webhooks:manage',
    label: 'Manage webhooks',
    description: 'Register and update callback endpoints for event delivery.',
  },
];

const DEVELOPER_WEBHOOK_EVENT_OPTIONS: Array<{
  value: DeveloperWebhookEvent;
  label: string;
  description: string;
}> = [
  {
    value: 'message.received',
    label: 'New message received',
    description: 'Fires when a customer sends a new inbound message.',
  },
  {
    value: 'message.read',
    label: 'Message read',
    description: 'Fires when a sent message is marked as read.',
  },
  {
    value: 'message.delivered',
    label: 'Message delivered',
    description: 'Fires when a sent message reaches the recipient device.',
  },
  {
    value: 'message.failed',
    label: 'Message failed',
    description: 'Fires when delivery fails for an outbound message.',
  },
  {
    value: 'conversation.created',
    label: 'Conversation created',
    description: 'Fires when a new inbox thread is created.',
  },
  {
    value: 'contact.created',
    label: 'Contact created',
    description: 'Fires when a new CRM contact record is created.',
  },
  {
    value: 'template.status_updated',
    label: 'Template status updated',
    description: 'Fires when a WhatsApp template review status changes.',
  },
  {
    value: 'campaign.sent',
    label: 'Campaign sent',
    description: 'Fires when a campaign send job completes.',
  },
];

const ORGANIZATION_INDUSTRY_OPTIONS = [
  'Automative',
  'Beauty, spa nd salon',
  'Clothing',
  'Education',
  'Entertainment',
  'Online gambling and gaming',
  'Non-online gambling and gaming (e.g. brick and mortar)',
  'Event planning and service',
  'Matrimonial Service',
  'Finance and Banking',
  'Food and groceries',
  'Alcoholic drinks',
  'Public service',
  'Hotel and lodging',
  'Medical and health',
  'Over-the-counter medicine',
  'Charity',
  'Professional services',
  'Shopping and retail',
  'Travel and transportation',
  'Restaurant',
  'Other',
] as const;

const INITIAL_INVITE_FORM: InviteWorkspaceUserInput = {
  fullName: '',
  email: '',
  role: 'Admin',
};

const INITIAL_TEAM_EDIT_FORM: UpdateWorkspaceTeamMemberInput = {
  fullName: '',
  role: 'Agent',
};

const INITIAL_WEBHOOK_FORM: DeveloperWebhookCreateInput = {
  name: '',
  url: '',
  events: ['message.received', 'message.read'],
};

type SecurityFactor = Factor<'totp' | 'phone' | 'webauthn', 'verified' | 'unverified'>;

interface PendingTotpEnrollment {
  factorId: string;
  friendlyName: string;
  qrCode: string;
  secret: string;
  uri: string;
  challengeId: string;
}

function NotificationSettingSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-[#5b45ff]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function NotificationSettingRow({
  title,
  description,
  category,
  icon: Icon,
  checked,
  disabled,
  statusText,
  onChange,
}: {
  title: string;
  description: string;
  category: string;
  icon: typeof Bell;
  checked: boolean;
  disabled?: boolean;
  statusText?: string;
  onChange: (nextValue: boolean) => void;
}) {
  const resolvedStatusText = statusText || (checked ? 'Enabled' : 'Disabled');

  return (
    <tr className={`align-top transition-colors ${disabled ? 'bg-gray-50/70' : 'hover:bg-gray-50'}`}>
      <td className="px-6 py-4">
        <div className="flex min-w-[280px] items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500">{description}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-gray-700">{category}</td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            disabled
              ? 'border border-slate-200 bg-slate-100 text-slate-700'
              : checked
                ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border border-slate-200 bg-slate-100 text-slate-700'
          }`}
        >
          {resolvedStatusText}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <NotificationSettingSwitch
          checked={checked}
          disabled={disabled}
          label={title}
          onChange={onChange}
        />
      </td>
    </tr>
  );
}

function formatAssuranceLevel(level: string | null) {
  if (level === 'aal2') {
    return 'Protected';
  }

  return 'Standard';
}

function formatSettingsDateTime(value: string | null) {
  if (!value) {
    return 'Not used yet';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProfileIdentity(currentUser: SupabaseUser | null, fullName: string, email: string | null) {
  return {
    displayName:
      fullName.trim() ||
      getAuthUserDisplayName(currentUser) ||
      email ||
      'Workspace User',
    pictureUrl: getAuthUserProfilePictureUrl(currentUser),
  };
}

function SettingsModal({
  title,
  subtitle,
  onClose,
  children,
  size = 'default',
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'wide';
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className={`w-full ${size === 'wide' ? 'max-w-4xl' : 'max-w-xl'} max-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

function TeamRoleBadge({ role }: { role: WorkspaceTeamMember['role'] }) {
  const tone =
    role === 'Owner'
      ? 'bg-slate-900 text-white'
      : role === 'Admin'
        ? 'bg-violet-100 text-violet-700'
        : role === 'Manager'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-700';

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{role}</span>;
}

function TeamStatusBadge({ status }: { status: WorkspaceTeamMember['status'] }) {
  const tone =
    status === 'active'
      ? 'border border-green-200 bg-green-50 text-green-700'
      : 'border border-amber-200 bg-amber-50 text-amber-700';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {status === 'active' ? 'Active' : 'Invite sent'}
    </span>
  );
}

function TeamInviteModal({
  form,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  form: InviteWorkspaceUserInput;
  isSubmitting: boolean;
  onChange: (field: keyof InviteWorkspaceUserInput, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5b45ff]">User Management</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Add User</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Invite a teammate with their name, email address, and assigned role.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={form.fullName}
              onChange={(event) => onChange('fullName', event.target.value)}
              placeholder="Enter full name"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange('email', event.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
          <div className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Role Assigned</span>
            <DropdownSelect
              value={form.role}
              onChange={(nextRole) => onChange('role', nextRole)}
              options={USER_ROLE_OPTIONS.map((role) => ({
                value: role.value,
                label: role.label,
              }))}
              ariaLabel="Select assigned role"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
          {USER_ROLE_OPTIONS.find((option) => option.value === form.role)?.description}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const normalizedRequestedTab: SettingsTabId = SETTINGS_TAB_IDS.includes((requestedTab as SettingsTabId) || 'profile')
    ? ((requestedTab as SettingsTabId) || 'profile')
    : 'profile';
  const { bootstrap, refresh, setBootstrap } = useAppData();
  const billingDateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const [billingNow, setBillingNow] = useState(() => new Date());
  const teamDateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const [activeTab, setActiveTab] = useState<SettingsTabId>(normalizedRequestedTab);
  const [expandedSettingsGroups, setExpandedSettingsGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    preferredCurrency: 'USD',
    companyName: '',
    companyWebsite: '',
    industry: '',
  });
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);
  const [companyLogoPreviewUrl, setCompanyLogoPreviewUrl] = useState<string | null>(null);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [isUploadingCompanyLogo, setIsUploadingCompanyLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileSecurityError, setProfileSecurityError] = useState<string | null>(null);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isResendingEmailChange, setIsResendingEmailChange] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordNonce, setPasswordNonce] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSendingPasswordCode, setIsSendingPasswordCode] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<SecurityFactor[]>([]);
  const [isSecurityLoading, setIsSecurityLoading] = useState(false);
  const [mfaCurrentLevel, setMfaCurrentLevel] = useState<string | null>(null);
  const [mfaNextLevel, setMfaNextLevel] = useState<string | null>(null);
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [isSendingMfaNotice, setIsSendingMfaNotice] = useState(false);
  const [mfaNoticeSent, setMfaNoticeSent] = useState(false);
  const [mfaOtpCode, setMfaOtpCode] = useState('');
  const [isMfaOtpConfirmed, setIsMfaOtpConfirmed] = useState(false);
  const [mfaFriendlyName, setMfaFriendlyName] = useState('Connektly Authenticator');
  const [pendingTotpEnrollment, setPendingTotpEnrollment] = useState<PendingTotpEnrollment | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false);
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);
  const [isDisableMfaConfirmationOpen, setIsDisableMfaConfirmationOpen] = useState(false);
  const [isDeleteAccountConfirmationOpen, setIsDeleteAccountConfirmationOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [teamMembers, setTeamMembers] = useState<WorkspaceTeamMember[] | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteWorkspaceUserInput>(INITIAL_INVITE_FORM);
  const [isInviting, setIsInviting] = useState(false);
  const [teamMemberBeingEdited, setTeamMemberBeingEdited] = useState<WorkspaceTeamMember | null>(null);
  const [teamEditForm, setTeamEditForm] =
    useState<UpdateWorkspaceTeamMemberInput>(INITIAL_TEAM_EDIT_FORM);
  const [isUpdatingTeamMember, setIsUpdatingTeamMember] = useState(false);
  const [teamMemberBeingRemoved, setTeamMemberBeingRemoved] = useState<WorkspaceTeamMember | null>(null);
  const [isRemovingTeamMember, setIsRemovingTeamMember] = useState(false);
  const [notificationSettingsForm, setNotificationSettingsForm] =
    useState<NotificationPreferencesUpdateInput>({
      enabled: true,
      soundEnabled: true,
      callSoundEnabled: true,
      soundPreset: 'classic',
      volume: 0.8,
      incomingMessageEnabled: true,
      incomingEmailEnabled: true,
      templateReviewEnabled: true,
      missedCallEnabled: true,
      leadEnabled: true,
      campaignSentEnabled: true,
      emailCampaignEnabled: true,
      displayNameApprovedEnabled: true,
      teamJoinedEnabled: true,
    });
  const [notificationSettingsNotice, setNotificationSettingsNotice] = useState<string | null>(null);
  const [notificationSettingsError, setNotificationSettingsError] = useState<string | null>(null);
  const [isSavingNotificationSettings, setIsSavingNotificationSettings] = useState(false);
  const [apiCredentials, setApiCredentials] = useState<DeveloperApiCredential[] | null>(null);
  const [apiCredentialName, setApiCredentialName] = useState('Production REST API key');
  const [apiCredentialScopes, setApiCredentialScopes] = useState<DeveloperApiScope[]>(
    () => DEVELOPER_API_SCOPE_OPTIONS.map((option) => option.value),
  );
  const [apiCredentialSecret, setApiCredentialSecret] = useState<{
    apiKey: string;
    secret: string;
  } | null>(null);
  const [apiCredentialsError, setApiCredentialsError] = useState<string | null>(null);
  const [apiCredentialsNotice, setApiCredentialsNotice] = useState<string | null>(null);
  const [isApiCredentialsLoading, setIsApiCredentialsLoading] = useState(false);
  const [isCreatingApiCredential, setIsCreatingApiCredential] = useState(false);
  const [regeneratingApiCredentialId, setRegeneratingApiCredentialId] = useState<string | null>(null);
  const [deletingApiCredentialId, setDeletingApiCredentialId] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<DeveloperWebhookEndpoint[] | null>(null);
  const [webhookForm, setWebhookForm] = useState<DeveloperWebhookCreateInput>(INITIAL_WEBHOOK_FORM);
  const [webhookSigningSecret, setWebhookSigningSecret] = useState<{
    name: string;
    signingSecret: string;
  } | null>(null);
  const [webhooksError, setWebhooksError] = useState<string | null>(null);
  const [webhooksNotice, setWebhooksNotice] = useState<string | null>(null);
  const [isWebhooksLoading, setIsWebhooksLoading] = useState(false);
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [updatingWebhookId, setUpdatingWebhookId] = useState<string | null>(null);
  const [deletingWebhookId, setDeletingWebhookId] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const companyLogoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getCachedSession().then((session) => {
      setCurrentUser(session?.user ?? null);
      setEmailDraft(session?.user?.new_email || session?.user?.email || '');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        setEmailDraft(session.user.new_email || session.user.email || '');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setForm({
      fullName: bootstrap?.profile?.fullName || getAuthUserDisplayName(currentUser) || '',
      phone: bootstrap?.profile?.phone || '',
      preferredCurrency: bootstrap?.profile?.preferredCurrency || bootstrap?.wallet?.preferredCurrency || 'USD',
      companyName: bootstrap?.profile?.companyName || '',
      companyWebsite: bootstrap?.profile?.companyWebsite || '',
      industry: bootstrap?.profile?.industry || '',
    });
  }, [
    bootstrap?.profile?.companyName,
    bootstrap?.profile?.companyWebsite,
    bootstrap?.profile?.fullName,
    bootstrap?.profile?.industry,
    bootstrap?.profile?.phone,
    bootstrap?.profile?.preferredCurrency,
    bootstrap?.wallet?.preferredCurrency,
    currentUser,
  ]);

  useEffect(() => {
    if (!profilePhotoPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(profilePhotoPreviewUrl);
    };
  }, [profilePhotoPreviewUrl]);

  useEffect(() => {
    if (!companyLogoPreviewUrl?.startsWith('blob:')) {
      return;
    }

    return () => {
      URL.revokeObjectURL(companyLogoPreviewUrl);
    };
  }, [companyLogoPreviewUrl]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setBillingNow(new Date());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (normalizedRequestedTab !== activeTab) {
      setActiveTab(normalizedRequestedTab);
    }
  }, [normalizedRequestedTab]);

  useEffect(() => {
    const currentQueryTab = searchParams.get('tab');

    if (currentQueryTab === activeTab) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('tab', activeTab);
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    const preferences = bootstrap?.notificationPreferences;

    if (!preferences) {
      return;
    }

    setNotificationSettingsForm({
      enabled: preferences.enabled,
      soundEnabled: preferences.soundEnabled,
      callSoundEnabled: preferences.callSoundEnabled,
      soundPreset: preferences.soundPreset,
      volume: preferences.volume,
      incomingMessageEnabled: preferences.incomingMessageEnabled,
      incomingEmailEnabled: preferences.incomingEmailEnabled,
      templateReviewEnabled: preferences.templateReviewEnabled,
      missedCallEnabled: preferences.missedCallEnabled,
      leadEnabled: preferences.leadEnabled,
      campaignSentEnabled: preferences.campaignSentEnabled,
      emailCampaignEnabled: preferences.emailCampaignEnabled,
      displayNameApprovedEnabled: preferences.displayNameApprovedEnabled,
      teamJoinedEnabled: preferences.teamJoinedEnabled,
    });
  }, [bootstrap?.notificationPreferences]);

  useEffect(() => {
    if (!['team', 'roles'].includes(activeTab) || teamMembers !== null) {
      return;
    }

    let isCancelled = false;

    const loadTeamMembers = async () => {
      try {
        setIsTeamLoading(true);
        setTeamError(null);
        const response = await appApi.getTeamMembers();
        if (!isCancelled) {
          setTeamMembers(response.members);
        }
      } catch (error) {
        if (!isCancelled) {
          setTeamError(error instanceof Error ? error.message : 'Failed to load workspace users.');
        }
      } finally {
        if (!isCancelled) {
          setIsTeamLoading(false);
        }
      }
    };

    void loadTeamMembers();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, teamMembers]);

  useEffect(() => {
    if (activeTab !== 'api-keys' || apiCredentials !== null) {
      return;
    }

    let isCancelled = false;

    const loadApiCredentials = async () => {
      try {
        setIsApiCredentialsLoading(true);
        setApiCredentialsError(null);
        const response = await appApi.getDeveloperApiCredentials();

        if (!isCancelled) {
          setApiCredentials(response.credentials);
        }
      } catch (error) {
        if (!isCancelled) {
          setApiCredentialsError(
            error instanceof Error ? error.message : 'Failed to load API credentials.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsApiCredentialsLoading(false);
        }
      }
    };

    void loadApiCredentials();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, apiCredentials]);

  useEffect(() => {
    if (activeTab !== 'webhooks' || webhooks !== null) {
      return;
    }

    let isCancelled = false;

    const loadWebhooks = async () => {
      try {
        setIsWebhooksLoading(true);
        setWebhooksError(null);
        const response = await appApi.getDeveloperWebhooks();

        if (!isCancelled) {
          setWebhooks(response.webhooks);
        }
      } catch (error) {
        if (!isCancelled) {
          setWebhooksError(error instanceof Error ? error.message : 'Failed to load webhooks.');
        }
      } finally {
        if (!isCancelled) {
          setIsWebhooksLoading(false);
        }
      }
    };

    void loadWebhooks();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, webhooks]);

  useEffect(() => {
    if (!['profile', 'security'].includes(activeTab)) {
      return;
    }

    void refreshProfileSecurityState();
  }, [activeTab]);
  const emailAddress = currentUser?.email || bootstrap?.profile?.email || null;
  const { displayName, pictureUrl: authProfilePictureUrl } = getProfileIdentity(
    currentUser,
    form.fullName || bootstrap?.profile?.fullName || '',
    emailAddress,
  );
  const authProfileProviderLabel = getAuthUserProviderLabel(currentUser);
  const resolvedProfilePictureUrl =
    profilePhotoPreviewUrl || bootstrap?.profile?.profilePictureUrl || authProfilePictureUrl;
  const resolvedCompanyLogoUrl = companyLogoPreviewUrl || bootstrap?.profile?.companyLogoUrl || null;
  const notificationTriggerItems = NOTIFICATION_TRIGGER_GROUPS.flatMap((group) => group.items);
  const activeNotificationTriggerCount = notificationTriggerItems.filter(
    (item) => notificationSettingsForm[item.key] !== false,
  ).length;
  const notificationsMasterEnabled = notificationSettingsForm.enabled !== false;
  const notificationSoundInteractive =
    notificationsMasterEnabled && notificationSettingsForm.soundEnabled !== false;
  const notificationSoundLabel =
    notificationSettingsForm.soundPreset === 'classic'
      ? 'Notification.mp3'
      : NOTIFICATION_SOUND_OPTIONS.find((option) => option.value === notificationSettingsForm.soundPreset)?.label ||
        'Custom tone';
  const teamMemberStats = {
    total: teamMembers?.length ?? 0,
    active: teamMembers?.filter((member) => member.status === 'active').length ?? 0,
    invited: teamMembers?.filter((member) => member.status === 'invited').length ?? 0,
    admins: teamMembers?.filter((member) => member.role === 'Admin').length ?? 0,
  };
  const isCurrentPlanFreeTrial =
    isFreeTrialPlan(bootstrap?.profile?.selectedPlan) && !bootstrap?.profile?.razorpaySubscriptionId;
  const freeTrialExpired = isFreeTrialExpired(bootstrap?.profile, billingNow);
  const trialDaysLeft = getTrialDaysLeft(bootstrap?.profile?.trialEndsAt, billingNow);
  const trialRemainingMs = getTrialRemainingMs(bootstrap?.profile?.trialEndsAt, billingNow);
  const trialStartedTime = bootstrap?.profile?.freeTrialStartedAt
    ? new Date(bootstrap.profile.freeTrialStartedAt).getTime()
    : null;
  const trialEndTime = bootstrap?.profile?.trialEndsAt
    ? new Date(bootstrap.profile.trialEndsAt).getTime()
    : null;
  const freeTrialProgressPercent =
    trialStartedTime !== null &&
    trialEndTime !== null &&
    Number.isFinite(trialStartedTime) &&
    Number.isFinite(trialEndTime) &&
    trialEndTime > trialStartedTime
      ? Math.min(
          100,
          Math.max(
            0,
            ((billingNow.getTime() - trialStartedTime) / (trialEndTime - trialStartedTime)) * 100,
          ),
        )
      : 0;
  const activeSettingsItem =
    SETTINGS_GROUPS.flatMap((group) => group.items).find((item) => item.id === activeTab) ||
    SETTINGS_GROUPS[0].items[0];
  const activeSettingsGroup =
    SETTINGS_GROUPS.find((group) => group.items.some((item) => item.id === activeTab)) ||
    SETTINGS_GROUPS[0];
  const hasVerifiedTotp = mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified');
  const rolePermissionRows = [
    { area: 'Inbox and conversations', Owner: true, Admin: true, Manager: true, Agent: true },
    { area: 'Campaigns and templates', Owner: true, Admin: true, Manager: true, Agent: false },
    { area: 'Connections and channels', Owner: true, Admin: true, Manager: false, Agent: false },
    { area: 'Billing and subscription', Owner: true, Admin: false, Manager: false, Agent: false },
    { area: 'Team and roles', Owner: true, Admin: true, Manager: false, Agent: false },
  ];
  const recentTeamActivity = (teamMembers || [])
    .slice()
    .sort((first, second) => new Date(second.invitedAt).getTime() - new Date(first.invitedAt).getTime())
    .slice(0, 4);
  const developerApiBaseUrl =
    typeof window !== 'undefined'
      ? new URL(clientConfig.apiBaseUrl, window.location.origin).toString().replace(/\/$/, '')
      : clientConfig.apiBaseUrl.replace(/\/$/, '');
  const apiCredentialUsageExample = `fetch('${developerApiBaseUrl}/conversations', {
  headers: {
    'X-Connektly-Api-Key': '<API_KEY>',
    'X-Connektly-Api-Secret': '<SECRET_KEY>'
  }
})`;

  const handleProfilePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Profile picture must be a PNG or JPEG image.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile picture must be 5 MB or smaller.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    setError(null);
    setProfileNotice(null);
    setIsUploadingProfilePhoto(true);
    setProfilePhotoPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadProfilePhoto(file);

      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfilePhotoPreviewUrl(response.profile?.profilePictureUrl || null);
      setProfileNotice('Profile picture updated.');
    } catch (uploadError) {
      setProfilePhotoPreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload profile picture.');
    } finally {
      setIsUploadingProfilePhoto(false);
      input.value = '';
    }
  };

  const handleCompanyLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Company logo must be a PNG or JPEG image.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Company logo must be 5 MB or smaller.');
      setProfileNotice(null);
      input.value = '';
      return;
    }

    setError(null);
    setProfileNotice(null);
    setIsUploadingCompanyLogo(true);
    setCompanyLogoPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await appApi.uploadCompanyLogo(file);

      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setCompanyLogoPreviewUrl(response.profile?.companyLogoUrl || null);
      setProfileNotice('Company logo updated.');
    } catch (uploadError) {
      setCompanyLogoPreviewUrl(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload company logo.');
    } finally {
      setIsUploadingCompanyLogo(false);
      input.value = '';
    }
  };

  const handleSaveProfileDetails = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setProfileNotice(null);
      const response = await appApi.saveProfile({
        fullName: form.fullName,
        preferredCurrency: form.preferredCurrency,
      });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfileNotice('Profile details updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrganizationDetails = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setProfileNotice(null);
      const response = await appApi.saveProfile({
        companyName: form.companyName,
        companyWebsite: form.companyWebsite,
        industry: form.industry,
      });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setProfileNotice('Organization details updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save organization details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePhone = async () => {
    try {
      setIsUpdatingPhone(true);
      setError(null);
      setProfileNotice(null);
      const response = await appApi.saveProfile({
        phone: phoneDraft,
      });
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: response.profile,
            }
          : current,
      );
      setForm((current) => ({
        ...current,
        phone: response.profile?.phone || '',
      }));
      setPhoneDraft(response.profile?.phone || '');
      setIsPhoneModalOpen(false);
      setProfileNotice('Contact number updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update contact number.');
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  const updateNotificationSetting = <K extends keyof NotificationPreferencesUpdateInput>(
    key: K,
    value: NotificationPreferencesUpdateInput[K],
  ) => {
    setNotificationSettingsNotice(null);
    setNotificationSettingsError(null);
    setNotificationSettingsForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSaveNotificationSettings = async () => {
    try {
      setIsSavingNotificationSettings(true);
      setNotificationSettingsError(null);
      setNotificationSettingsNotice(null);
      const response = await appApi.saveNotificationPreferences(notificationSettingsForm);
      setNotificationSettingsForm({
        enabled: response.preferences.enabled,
        soundEnabled: response.preferences.soundEnabled,
        callSoundEnabled: response.preferences.callSoundEnabled,
        soundPreset: response.preferences.soundPreset,
        volume: response.preferences.volume,
        incomingMessageEnabled: response.preferences.incomingMessageEnabled,
        incomingEmailEnabled: response.preferences.incomingEmailEnabled,
        templateReviewEnabled: response.preferences.templateReviewEnabled,
        missedCallEnabled: response.preferences.missedCallEnabled,
        leadEnabled: response.preferences.leadEnabled,
        campaignSentEnabled: response.preferences.campaignSentEnabled,
        emailCampaignEnabled: response.preferences.emailCampaignEnabled,
        displayNameApprovedEnabled: response.preferences.displayNameApprovedEnabled,
        teamJoinedEnabled: response.preferences.teamJoinedEnabled,
      });
      setNotificationSettingsNotice('Notification settings updated.');
      await refresh();
    } catch (error) {
      setNotificationSettingsError(
        error instanceof Error ? error.message : 'Failed to update notification settings.',
      );
    } finally {
      setIsSavingNotificationSettings(false);
    }
  };

  const refreshProfileSecurityState = async (options?: { quiet?: boolean }) => {
    try {
      if (!options?.quiet) {
        setIsSecurityLoading(true);
      }

      const [session, factorsResult, assuranceResult] = await Promise.all([
        getCachedSession(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      setCurrentUser(session?.user ?? null);
      setEmailDraft(session?.user?.new_email || session?.user?.email || '');
      setMfaFactors(
        ((factorsResult.data?.all as SecurityFactor[] | undefined) || []).filter((factor) =>
          factor.factor_type === 'totp' || factor.factor_type === 'phone' || factor.factor_type === 'webauthn',
        ),
      );
      setMfaCurrentLevel(assuranceResult.data?.currentLevel || null);
      setMfaNextLevel(assuranceResult.data?.nextLevel || null);
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to load profile security settings.',
      );
    } finally {
      if (!options?.quiet) {
        setIsSecurityLoading(false);
      }
    }
  };

  const handleRequestEmailChange = async () => {
    try {
      const nextEmail = emailDraft.trim().toLowerCase();
      if (!nextEmail) {
        throw new Error('Enter the email address you want to use.');
      }

      if (nextEmail === (currentUser?.email || '').toLowerCase()) {
        throw new Error('Enter a different email address to request a change.');
      }

      setIsUpdatingEmail(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { data, error } = await supabase.auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: `${window.location.origin}/login` },
      );

      if (error) {
        throw error;
      }

      setCurrentUser(data.user ?? currentUser);
      setProfileNotice('Email change requested. Check your inbox to complete the update.');
      setIsEmailModalOpen(false);
      await refreshProfileSecurityState({ quiet: true });
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to request an email change.',
      );
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleResendEmailChange = async () => {
    try {
      if (!currentUser?.new_email) {
        throw new Error('There is no pending email change to resend.');
      }

      setIsResendingEmailChange(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.resend({
        type: 'email_change',
        email: currentUser.new_email,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        throw error;
      }

      setProfileNotice('Confirmation email resent for the pending email change.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to resend the email change confirmation.',
      );
    } finally {
      setIsResendingEmailChange(false);
    }
  };

  const handleSendPasswordCode = async () => {
    try {
      setIsSendingPasswordCode(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        throw error;
      }

      setProfileNotice('A password change verification code has been sent to your email.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to send the password change code.',
      );
    } finally {
      setIsSendingPasswordCode(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      if (!passwordNonce.trim()) {
        throw new Error('Enter the verification code sent to your email.');
      }

      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
      }

      if (newPassword !== confirmPassword) {
        throw new Error('The new password and confirmation password do not match.');
      }

      setIsUpdatingPassword(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        nonce: passwordNonce.trim(),
      });

      if (error) {
        throw error;
      }

      setPasswordNonce('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordModalOpen(false);
      setProfileNotice('Password updated successfully.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to update the password.',
      );
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleStartMfaSetup = async () => {
    try {
      setIsSendingMfaNotice(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        throw error;
      }

      setMfaNoticeSent(true);
      setIsMfaOtpConfirmed(false);
      setMfaOtpCode('');
      setPendingTotpEnrollment(null);
      setProfileNotice('An 8-digit verification code has been sent to your email address.');
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to send the verification code email.',
      );
    } finally {
      setIsSendingMfaNotice(false);
    }
  };

  const handleConfirmMfaOtp = () => {
    const normalizedOtp = mfaOtpCode.trim();

    if (!/^\d{8}$/.test(normalizedOtp)) {
      setProfileSecurityError('Enter the 8-digit numeric code from your email.');
      return;
    }

    setProfileSecurityError(null);
    setIsMfaOtpConfirmed(true);
    setProfileNotice('OTP received. You can continue to authenticator setup.');
  };

  const handleGenerateTotp = async () => {
    try {
      if (!mfaNoticeSent) {
        throw new Error('Send the verification code email before generating the authenticator QR code.');
      }

      if (!isMfaOtpConfirmed) {
        throw new Error('Enter and confirm the 8-digit OTP before generating the authenticator QR code.');
      }

      setIsSettingUpMfa(true);
      setProfileSecurityError(null);
      setProfileNotice(null);
      setPendingTotpEnrollment(null);

      const staleFactors = mfaFactors.filter(
        (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
      );
      for (const factor of staleFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) {
          throw error;
        }
      }

      const friendlyName = mfaFriendlyName.trim() || 'Connektly Authenticator';
      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (enrollError) {
        throw enrollError;
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.id,
      });

      if (challengeError) {
        throw challengeError;
      }

      setPendingTotpEnrollment({
        factorId: enrollment.id,
        friendlyName,
        qrCode: enrollment.totp.qr_code,
        secret: enrollment.totp.secret,
        uri: enrollment.totp.uri,
        challengeId: challenge.id,
      });
      setProfileNotice('Scan the QR code with your authenticator app, then enter the 6-digit code.');
      await refreshProfileSecurityState({ quiet: true });
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to prepare MFA enrollment.',
      );
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleVerifyTotp = async () => {
    try {
      if (!pendingTotpEnrollment) {
        throw new Error('Generate a new authenticator QR code first.');
      }

      if (!mfaVerificationCode.trim()) {
        throw new Error('Enter the 6-digit code from your authenticator app.');
      }

      setIsSettingUpMfa(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      const { error } = await supabase.auth.mfa.verify({
        factorId: pendingTotpEnrollment.factorId,
        challengeId: pendingTotpEnrollment.challengeId,
        code: mfaVerificationCode.trim(),
      });

      if (error) {
        throw error;
      }

      setPendingTotpEnrollment(null);
      setMfaVerificationCode('');
      setMfaNoticeSent(false);
      setIsMfaModalOpen(false);
      setProfileNotice('Multi-factor authentication is now enabled.');
      await refreshProfileSecurityState({ quiet: true });
    } catch (error) {
      setProfileSecurityError(
        error instanceof Error ? error.message : 'Failed to verify the authenticator code.',
      );
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleDisableMfa = () => {
    const enabledFactors = mfaFactors.filter(
      (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
    );

    if (!enabledFactors.length) {
      setProfileSecurityError('No authenticator app is enabled on this account right now.');
      return;
    }

    setIsDisableMfaConfirmationOpen(true);
  };

  const confirmDisableMfa = async () => {
    const enabledFactors = mfaFactors.filter(
      (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
    );

    if (!enabledFactors.length) {
      setProfileSecurityError('No authenticator app is enabled on this account right now.');
      setIsDisableMfaConfirmationOpen(false);
      return;
    }

    try {
      setIsDisablingMfa(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      for (const factor of enabledFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) {
          throw error;
        }
      }

      setPendingTotpEnrollment(null);
      setMfaVerificationCode('');
      setMfaNoticeSent(false);
      setIsMfaOtpConfirmed(false);
      setMfaOtpCode('');
      setIsMfaModalOpen(false);
      setProfileNotice('Multi-factor authentication has been disabled.');
      await refreshProfileSecurityState({ quiet: true });
    } catch (disableError) {
      setProfileSecurityError(
        disableError instanceof Error ? disableError.message : 'Failed to disable MFA.',
      );
    } finally {
      setIsDisablingMfa(false);
      setIsDisableMfaConfirmationOpen(false);
    }
  };

  const handleDeleteAccount = () => {
    setProfileSecurityError(null);
    setProfileNotice(null);
    setIsDeleteAccountConfirmationOpen(true);
  };

  const confirmDeleteAccount = async () => {
    try {
      setIsDeletingAccount(true);
      setProfileSecurityError(null);
      setProfileNotice(null);

      await appApi.deleteAccount();
      setBootstrap(() => null);
      setCurrentUser(null);

      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        console.error('Failed to sign out after account deletion:', signOutError);
      }

      window.location.assign('/login');
    } catch (deleteError) {
      setProfileSecurityError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete this account.',
      );
    } finally {
      setIsDeletingAccount(false);
      setIsDeleteAccountConfirmationOpen(false);
    }
  };

  const handleCopyTotpSecret = async () => {
    try {
      if (!pendingTotpEnrollment) {
        return;
      }

      await navigator.clipboard.writeText(pendingTotpEnrollment.secret);
      setProfileNotice('Authenticator secret copied to the clipboard.');
    } catch {
      setProfileSecurityError('Failed to copy the authenticator secret.');
    }
  };

  const handleCopyDeveloperValue = async (
    value: string,
    successMessage: string,
    setNotice: (message: string | null) => void,
    setErrorMessage: (message: string | null) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setErrorMessage(null);
      setNotice(successMessage);
    } catch {
      setNotice(null);
      setErrorMessage('Failed to copy the value.');
    }
  };

  const toggleApiCredentialScope = (scope: DeveloperApiScope) => {
    setApiCredentialScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope],
    );
  };

  const handleCreateApiCredential = async () => {
    if (apiCredentialScopes.length === 0) {
      setApiCredentialsError('Select at least one API permission scope.');
      setApiCredentialsNotice(null);
      return;
    }

    try {
      setIsCreatingApiCredential(true);
      setApiCredentialsError(null);
      setApiCredentialsNotice(null);
      const payload: DeveloperApiCredentialCreateInput = {
        name: apiCredentialName,
        scopes: apiCredentialScopes,
      };
      const response = await appApi.createDeveloperApiCredential(payload);
      setApiCredentials((current) => [response.credential, ...(current || [])]);
      setApiCredentialSecret({
        apiKey: response.credential.apiKey,
        secret: response.secret,
      });
      setApiCredentialName('Production REST API key');
      setApiCredentialScopes(DEVELOPER_API_SCOPE_OPTIONS.map((option) => option.value));
      setApiCredentialsNotice('API key created. Copy the secret key now; it will not be shown again.');
    } catch (error) {
      setApiCredentialsError(error instanceof Error ? error.message : 'Failed to create API key.');
    } finally {
      setIsCreatingApiCredential(false);
    }
  };

  const handleRegenerateApiCredentialSecret = async (credential: DeveloperApiCredential) => {
    try {
      setRegeneratingApiCredentialId(credential.id);
      setApiCredentialsError(null);
      setApiCredentialsNotice(null);
      const response = await appApi.regenerateDeveloperApiCredentialSecret(credential.id);
      setApiCredentials((current) =>
        current?.map((entry) => (entry.id === response.credential.id ? response.credential : entry)) || current,
      );
      setApiCredentialSecret({
        apiKey: response.credential.apiKey,
        secret: response.secret,
      });
      setApiCredentialsNotice('Secret key regenerated. Update any external code that uses this API key.');
    } catch (error) {
      setApiCredentialsError(error instanceof Error ? error.message : 'Failed to regenerate API secret.');
    } finally {
      setRegeneratingApiCredentialId(null);
    }
  };

  const handleDeleteApiCredential = async (credential: DeveloperApiCredential) => {
    try {
      setDeletingApiCredentialId(credential.id);
      setApiCredentialsError(null);
      setApiCredentialsNotice(null);
      await appApi.deleteDeveloperApiCredential(credential.id);
      setApiCredentials((current) => current?.filter((entry) => entry.id !== credential.id) || current);
      setApiCredentialsNotice('API key deleted.');
      setApiCredentialSecret((current) => (current?.apiKey === credential.apiKey ? null : current));
    } catch (error) {
      setApiCredentialsError(error instanceof Error ? error.message : 'Failed to delete API key.');
    } finally {
      setDeletingApiCredentialId(null);
    }
  };

  const toggleWebhookFormEvent = (eventName: DeveloperWebhookEvent) => {
    setWebhookForm((current) => {
      const nextEvents = current.events.includes(eventName)
        ? current.events.filter((entry) => entry !== eventName)
        : [...current.events, eventName];

      return {
        ...current,
        events: nextEvents,
      };
    });
  };

  const handleCreateWebhook = async () => {
    if (!webhookForm.url.trim()) {
      setWebhooksError('Webhook URL is required.');
      setWebhooksNotice(null);
      return;
    }

    if (webhookForm.events.length === 0) {
      setWebhooksError('Select at least one webhook event.');
      setWebhooksNotice(null);
      return;
    }

    try {
      setIsCreatingWebhook(true);
      setWebhooksError(null);
      setWebhooksNotice(null);
      const response = await appApi.createDeveloperWebhook(webhookForm);
      setWebhooks((current) => [response.webhook, ...(current || [])]);
      setWebhookSigningSecret({
        name: response.webhook.name,
        signingSecret: response.signingSecret,
      });
      setWebhookForm(INITIAL_WEBHOOK_FORM);
      setWebhooksNotice('Webhook added. Copy the signing secret now; it will not be shown again.');
    } catch (error) {
      setWebhooksError(error instanceof Error ? error.message : 'Failed to add webhook.');
    } finally {
      setIsCreatingWebhook(false);
    }
  };

  const handleToggleWebhookStatus = async (webhook: DeveloperWebhookEndpoint) => {
    const nextStatus = webhook.status === 'active' ? 'paused' : 'active';

    try {
      setUpdatingWebhookId(webhook.id);
      setWebhooksError(null);
      setWebhooksNotice(null);
      const response = await appApi.updateDeveloperWebhook(webhook.id, { status: nextStatus });
      setWebhooks((current) =>
        current?.map((entry) => (entry.id === response.webhook.id ? response.webhook : entry)) || current,
      );
      setWebhooksNotice(nextStatus === 'active' ? 'Webhook activated.' : 'Webhook paused.');
    } catch (error) {
      setWebhooksError(error instanceof Error ? error.message : 'Failed to update webhook.');
    } finally {
      setUpdatingWebhookId(null);
    }
  };

  const handleDeleteWebhook = async (webhook: DeveloperWebhookEndpoint) => {
    try {
      setDeletingWebhookId(webhook.id);
      setWebhooksError(null);
      setWebhooksNotice(null);
      await appApi.deleteDeveloperWebhook(webhook.id);
      setWebhooks((current) => current?.filter((entry) => entry.id !== webhook.id) || current);
      setWebhooksNotice('Webhook deleted.');
      setWebhookSigningSecret((current) => (current?.name === webhook.name ? null : current));
    } catch (error) {
      setWebhooksError(error instanceof Error ? error.message : 'Failed to delete webhook.');
    } finally {
      setDeletingWebhookId(null);
    }
  };

  const handleInviteFormChange = (field: keyof InviteWorkspaceUserInput, value: string) => {
    setInviteForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleTeamEditFormChange = (field: keyof UpdateWorkspaceTeamMemberInput, value: string) => {
    setTeamEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleOpenInviteModal = () => {
    setInviteForm(INITIAL_INVITE_FORM);
    setTeamError(null);
    setTeamSuccess(null);
    setIsInviteModalOpen(true);
  };

  const handleCloseInviteModal = () => {
    if (isInviting) {
      return;
    }

    setIsInviteModalOpen(false);
  };

  const handleOpenEditTeamMember = (member: WorkspaceTeamMember) => {
    if (member.isOwner) {
      return;
    }

    setTeamError(null);
    setTeamSuccess(null);
    setTeamMemberBeingEdited(member);
    setTeamEditForm({
      fullName: member.fullName || '',
      role: member.role === 'Owner' ? 'Agent' : member.role,
    });
  };

  const handleCloseEditTeamMember = () => {
    if (isUpdatingTeamMember) {
      return;
    }

    setTeamMemberBeingEdited(null);
    setTeamEditForm(INITIAL_TEAM_EDIT_FORM);
  };

  const handleInviteUser = async () => {
    try {
      setIsInviting(true);
      setTeamError(null);
      setTeamSuccess(null);

      await appApi.inviteTeamMember({
        fullName: inviteForm.fullName,
        email: inviteForm.email,
        role: inviteForm.role,
      });

      const response = await appApi.getTeamMembers();
      setTeamMembers(response.members);
      setTeamSuccess(`Invite email sent to ${inviteForm.email.trim()}.`);
      setIsInviteModalOpen(false);
      setInviteForm(INITIAL_INVITE_FORM);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'Failed to invite user.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateTeamMember = async () => {
    if (!teamMemberBeingEdited) {
      return;
    }

    try {
      setIsUpdatingTeamMember(true);
      setTeamError(null);
      setTeamSuccess(null);
      const response = await appApi.updateTeamMember(teamMemberBeingEdited.id, teamEditForm);
      setTeamMembers((current) =>
        current?.map((member) => (member.id === response.member.id ? response.member : member)) ?? [
          response.member,
        ],
      );
      setTeamSuccess('User updated successfully.');
      setTeamMemberBeingEdited(null);
      setTeamEditForm(INITIAL_TEAM_EDIT_FORM);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'Failed to update user.');
    } finally {
      setIsUpdatingTeamMember(false);
    }
  };

  const handleOpenRemoveTeamMember = (member: WorkspaceTeamMember) => {
    if (member.isOwner) {
      return;
    }

    setTeamError(null);
    setTeamSuccess(null);
    setTeamMemberBeingRemoved(member);
  };

  const confirmRemoveTeamMember = async () => {
    if (!teamMemberBeingRemoved) {
      return;
    }

    try {
      setIsRemovingTeamMember(true);
      setTeamError(null);
      setTeamSuccess(null);
      await appApi.removeTeamMember(teamMemberBeingRemoved.id);
      setTeamMembers((current) =>
        current?.filter((member) => member.id !== teamMemberBeingRemoved.id) ?? current,
      );
      setTeamSuccess('User removed from the workspace.');
      setTeamMemberBeingRemoved(null);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'Failed to remove user.');
    } finally {
      setIsRemovingTeamMember(false);
    }
  };

  const securityQuickActions = [
    {
      title: 'Change Password',
      description: 'Update account password using email verification.',
      icon: KeyRound,
      onClick: () => {
        setIsPasswordModalOpen(true);
        setProfileSecurityError(null);
      },
      actionLabel: 'Change',
    },
    {
      title: hasVerifiedTotp ? 'Manage 2FA' : 'Enable 2FA',
      description: hasVerifiedTotp ? 'Authenticator protection is active.' : 'Add an authenticator app for stronger sign-in security.',
      icon: ShieldCheck,
      onClick: hasVerifiedTotp ? handleDisableMfa : () => void handleStartMfaSetup(),
      actionLabel: hasVerifiedTotp ? 'Manage' : 'Enable',
    },
    {
      title: 'Active Sessions',
      description: currentUser?.last_sign_in_at
        ? `Current session started ${new Date(currentUser.last_sign_in_at).toLocaleString()}`
        : 'Review current browser session security.',
      icon: CheckCircle2,
      onClick: () => void refreshProfileSecurityState({ quiet: true }),
      actionLabel: 'Refresh',
    },
  ];

  const toggleSettingsGroup = (groupTitle: string) => {
    setExpandedSettingsGroups((current) => {
      const next = new Set(current);
      if (next.has(groupTitle)) {
        next.delete(groupTitle);
      } else {
        next.add(groupTitle);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage account access, workspace controls, billing, system connections, and data preferences.
          </p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-gray-100">
          {activeSettingsGroup.title} / <span className="text-gray-900">{activeSettingsItem.label}</span>
        </div>
      </div>

      <FeedbackPopupStack
        items={
          error
            ? [{ id: 'settings-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }]
            : []
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="w-full shrink-0 lg:w-72">
          <nav className="flex gap-3 overflow-x-auto pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
            {SETTINGS_GROUPS.map((group) => {
              const isGroupExpanded = expandedSettingsGroups.has(group.title);

              return (
                <div key={group.title} className="min-w-[240px] rounded-3xl border border-gray-100 bg-white p-2 shadow-sm lg:min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleSettingsGroup(group.title)}
                    aria-expanded={isGroupExpanded}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-gray-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <group.icon className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{group.title}</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
                        isGroupExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isGroupExpanded ? (
                      <motion.div
                        key={`${group.title}-items`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1 pt-2">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActiveTab(item.id)}
                              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all whitespace-nowrap ${
                                activeTab === item.id
                                  ? 'bg-[#5b45ff] text-white shadow-md shadow-[#5b45ff]/20'
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              }`}
                            >
                              <item.icon className={`h-4 w-4 ${activeTab === item.id ? 'text-white' : 'text-gray-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                {profileSecurityError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{profileSecurityError}</div>
                ) : null}

                {profileNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">Saved. {profileNotice}</div>
                ) : null}

                <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <UserAvatar
                        name={displayName}
                        imageUrl={resolvedProfilePictureUrl}
                        className="h-20 w-20 shrink-0 shadow-lg"
                        initialsClassName="text-2xl font-bold"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Identity</p>
                        <h2 className="mt-2 truncate text-xl font-bold text-gray-900">{displayName}</h2>
                        <p className="mt-1 truncate text-sm text-gray-500">{emailAddress || 'No email available'}</p>
                        <button
                          type="button"
                          onClick={() => profilePhotoInputRef.current?.click()}
                          disabled={isUploadingProfilePhoto}
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                        >
                          {isUploadingProfilePhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                          Change photo
                        </button>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-gray-500">
                      {authProfilePictureUrl && !bootstrap?.profile?.profilePictureUrl
                        ? `Using your ${authProfileProviderLabel} profile photo automatically.`
                        : 'Upload a PNG or JPEG image up to 5 MB.'}
                    </p>
                    <input
                      ref={profilePhotoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleProfilePhotoUpload}
                      className="hidden"
                    />

                    <div className="mt-5 grid gap-3">
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">2FA status</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{hasVerifiedTotp ? 'Enabled' : 'Not enabled'}</p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Last sign in</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {currentUser?.last_sign_in_at ? new Date(currentUser.last_sign_in_at).toLocaleString() : 'Not available'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Default currency</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{form.preferredCurrency || 'USD'}</p>
                        <p className="mt-1 text-xs text-gray-500">Used for wallet balance visibility and future top-up defaults.</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Editable fields</p>
                        <h2 className="mt-2 text-lg font-bold text-gray-900">Profile details</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveProfileDetails()}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Save
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            value={form.fullName}
                            onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                            onBlur={() => {
                              if ((form.fullName || '') !== (bootstrap?.profile?.fullName || '')) {
                                void handleSaveProfileDetails();
                              }
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </div>
                      </label>

                      <div className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Default currency</span>
                        <DropdownSelect
                          value={form.preferredCurrency}
                          onChange={(nextCurrency) => {
                            setForm((current) => ({ ...current, preferredCurrency: nextCurrency }));
                            setError(null);
                            setProfileNotice(null);
                            setProfileSecurityError(null);
                          }}
                          options={WALLET_CURRENCY_OPTIONS.map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                          ariaLabel="Select default billing currency"
                          icon={<WalletCards className="h-4 w-4" />}
                          buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-3 py-2.5 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                        />
                        <p className="mt-2 text-xs leading-5 text-gray-500">
                          This updates the default currency used for wallet balance display and credit top-up defaults. Existing balance is not converted automatically.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                              <Phone className="h-4 w-4 text-gray-400" />
                              Phone
                            </p>
                            <p className="mt-2 truncate text-sm text-gray-600">{form.phone || 'No phone added'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPhoneDraft(form.phone || bootstrap?.profile?.phone || '');
                              setIsPhoneModalOpen(true);
                              setError(null);
                            }}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-100 transition hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                              <Mail className="h-4 w-4 text-gray-400" />
                              Email
                            </p>
                            <p className="mt-2 truncate text-sm text-gray-600">{currentUser?.email || bootstrap?.profile?.email || 'No email available'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEmailDraft(currentUser?.new_email || currentUser?.email || '');
                              setIsEmailModalOpen(true);
                              setProfileSecurityError(null);
                            }}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-100 transition hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                              <KeyRound className="h-4 w-4 text-gray-400" />
                              Password
                            </p>
                            <p className="mt-2 text-sm text-gray-600">Protected by email verification</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsPasswordModalOpen(true);
                              setProfileSecurityError(null);
                            }}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-100 transition hover:bg-gray-50"
                          >
                            Change
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <ShieldCheck className="h-4 w-4 text-gray-400" />
                          2FA
                        </p>
                        <p className="mt-2 text-sm text-gray-600">{hasVerifiedTotp ? 'Authenticator enabled' : 'Authenticator not enabled'}</p>
                      </div>
                    </div>

                    {currentUser?.new_email ? (
                      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-amber-900">Pending email change</p>
                            <p className="mt-1 text-xs text-amber-800">
                              Waiting for confirmation to switch this account to {currentUser.new_email}.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isResendingEmailChange}
                            onClick={() => void handleResendEmailChange()}
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                          >
                            {isResendingEmailChange ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Resend confirmation
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Security Quick Actions</p>
                      <h2 className="mt-2 text-lg font-bold text-gray-900">Protect your account</h2>
                    </div>
                    {isSecurityLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {securityQuickActions.map((action) => (
                      <button
                        key={action.title}
                        type="button"
                        onClick={action.onClick}
                        className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                      >
                        <action.icon className="h-5 w-5 text-[#5b45ff]" />
                        <p className="mt-3 text-sm font-semibold text-gray-900">{action.title}</p>
                        <p className="mt-1 min-h-10 text-xs leading-5 text-gray-500">{action.description}</p>
                        <span className="mt-3 inline-flex text-xs font-semibold text-[#5b45ff]">{action.actionLabel}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'organization' ? (
              <motion.div key="organization" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {profileNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{profileNotice}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Company Logo</p>
                    <div className="mt-5 flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center">
                      {resolvedCompanyLogoUrl ? (
                        <img
                          src={resolvedCompanyLogoUrl}
                          alt="Company logo"
                          className="max-h-28 w-auto max-w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white text-gray-400">
                          <ImagePlus className="h-8 w-8" />
                        </div>
                      )}
                      <p className="mt-5 text-base font-semibold text-gray-900">
                        {resolvedCompanyLogoUrl ? 'Current company logo' : 'Upload your company logo'}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">Use a PNG or JPEG image up to 5 MB for your organization identity.</p>
                      <button
                        type="button"
                        onClick={() => companyLogoInputRef.current?.click()}
                        disabled={isUploadingCompanyLogo}
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                      >
                        {isUploadingCompanyLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {resolvedCompanyLogoUrl ? 'Change Logo' : 'Upload Logo'}
                      </button>
                    </div>
                    <input
                      ref={companyLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleCompanyLogoUpload}
                      className="hidden"
                    />
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
                    <h3 className="text-lg font-bold text-gray-900">Organization Details</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      Add the core company information your workspace should use across the platform.
                    </p>

                    <div className="mt-6 grid gap-6 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Company Name</span>
                        <input
                          type="text"
                          value={form.companyName}
                          onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          placeholder="Enter company name"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Company Website</span>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <input
                            type="url"
                            value={form.companyWebsite}
                            onChange={(event) => setForm((current) => ({ ...current, companyWebsite: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            placeholder="https://example.com"
                          />
                        </div>
                      </label>

                      <div className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Industry</span>
                        <DropdownSelect
                          value={form.industry}
                          onChange={(nextIndustry) => setForm((current) => ({ ...current, industry: nextIndustry }))}
                          options={[
                            { value: '', label: 'Select an industry' },
                            ...ORGANIZATION_INDUSTRY_OPTIONS.map((option) => ({
                              value: option,
                              label: option,
                            })),
                          ]}
                          placeholder="Select an industry"
                          ariaLabel="Select organization industry"
                          buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                        />
                      </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveOrganizationDetails()}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        Save Organization Details
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'security' ? (
              <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {profileSecurityError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{profileSecurityError}</div>
                ) : null}

                {profileNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{profileNotice}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <KeyRound className="h-4 w-4 text-gray-400" />
                            Change Password
                          </div>
                          <p className="mt-3 text-sm leading-6 text-gray-500">
                            Request a verification code by email before setting a new password for this account.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordNonce('');
                            setNewPassword('');
                            setConfirmPassword('');
                            setIsPasswordModalOpen(true);
                            setProfileSecurityError(null);
                          }}
                          className="shrink-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          Change Password
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <ShieldCheck className="h-4 w-4 text-gray-400" />
                            Multi-Factor Authentication
                          </div>
                          <p className="mt-3 text-sm leading-6 text-gray-500">
                            {mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                              ? 'Authenticator app protection is active on this account.'
                              : 'Add an authenticator app for an extra security layer.'}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-gray-500">
                            Current protection: {formatAssuranceLevel(mfaCurrentLevel)}
                            {mfaNextLevel ? ` | Next: ${formatAssuranceLevel(mfaNextLevel)}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setMfaNoticeSent(false);
                              setMfaOtpCode('');
                              setIsMfaOtpConfirmed(false);
                              setPendingTotpEnrollment(null);
                              setMfaVerificationCode('');
                              setMfaFriendlyName('Connektly Authenticator');
                              setIsMfaModalOpen(true);
                              setProfileSecurityError(null);
                            }}
                            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            {mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                              ? 'Manage MFA'
                              : 'Setup MFA'}
                          </button>
                          <button
                            type="button"
                            disabled={
                              isDisablingMfa ||
                              !mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                            }
                            onClick={handleDisableMfa}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDisablingMfa ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            Disable MFA
                          </button>
                        </div>
                      </div>

                      {mfaFactors.filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified').length > 0 ? (
                        <div className="mt-5 space-y-3">
                          {mfaFactors
                            .filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                            .map((factor) => (
                              <div key={factor.id} className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                                <div>
                                  <p className="text-sm font-semibold text-green-900">{factor.friendly_name || 'Authenticator app'}</p>
                                  <p className="mt-1 text-xs text-green-700">Verified TOTP factor</p>
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-700">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Enabled
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </div>

                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Security Summary</p>
                      {isSecurityLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
                    </div>
                    <div className="mt-5 space-y-4">
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Login email</p>
                        <p className="mt-2 break-all text-sm font-semibold text-gray-900">{currentUser?.email || bootstrap?.profile?.email || 'Not available'}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Authenticator status</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {mfaFactors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
                            ? 'Enabled'
                            : 'Not enabled'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Protection level</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{formatAssuranceLevel(mfaCurrentLevel)}</p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-xs leading-6 text-gray-500">
                      Email confirmations, password reset codes, and MFA verification codes are sent automatically during each security step.
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {['team', 'roles'].includes(activeTab) ? (
              <motion.div key="team" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {activeTab === 'roles' ? 'Roles & Permissions' : 'Team / Users'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Invite users, assign roles, review permissions, and track recent team activity.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenInviteModal}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
                  >
                    <Plus className="h-4 w-4" />
                    Add User
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Total users', value: teamMemberStats.total, icon: Users },
                    { label: 'Active users', value: teamMemberStats.active, icon: CheckCircle2 },
                    { label: 'Pending invites', value: teamMemberStats.invited, icon: UserPlus },
                    { label: 'Admins', value: teamMemberStats.admins, icon: ShieldCheck },
                  ].map((item) => (
                    <div key={item.label} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-500">{item.label}</p>
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
                          <item.icon className="h-4 w-4" />
                        </div>
                      </div>
                      <p className="mt-4 text-2xl font-bold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Workspace access</p>
                      <p className="mt-1 text-sm text-gray-500">Manage teammate roles and workspace access from this table.</p>
                    </div>
                    {isTeamLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">Permissions matrix</p>
                      <p className="mt-1 text-sm text-gray-500">Quick reference for what each role can access.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Area', 'Owner', 'Admin', 'Manager', 'Agent'].map((label) => (
                              <th key={label} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rolePermissionRows.map((row) => (
                            <tr key={row.area} className="hover:bg-gray-50">
                              <td className="px-5 py-4 text-sm font-medium text-gray-900">{row.area}</td>
                              {(['Owner', 'Admin', 'Manager', 'Agent'] as const).map((role) => (
                                <td key={role} className="px-5 py-4">
                                  {row[role] ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <span className="block h-1.5 w-1.5 rounded-full bg-gray-300" />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-gray-900">Activity logs</p>
                    <div className="mt-4 space-y-3">
                      {recentTeamActivity.length ? (
                        recentTeamActivity.map((member) => (
                          <div key={member.id} className="rounded-2xl bg-gray-50 px-4 py-3">
                            <p className="text-sm font-semibold text-gray-900">{member.fullName || member.email}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {member.status === 'active' ? 'Accepted invite' : 'Invited'} as {member.role} on{' '}
                              {teamDateFormatter.format(new Date(member.acceptedAt || member.invitedAt))}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-gray-50 px-4 py-6 text-sm text-gray-500">
                          Invite activity will appear here after users are added.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {teamError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{teamError}</div>
                ) : null}

                {teamSuccess ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{teamSuccess}</div>
                ) : null}

                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                  {isTeamLoading && !teamMembers ? (
                    <div className="space-y-3 p-6">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
                      ))}
                    </div>
                  ) : teamMembers && teamMembers.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Name', 'Email Address', 'Role Assigned', 'Status', 'Invite Date'].map((label) => (
                              <th key={label} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                {label}
                              </th>
                            ))}
                            <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {teamMembers.map((member) => (
                            <tr key={member.id} className="align-top transition-colors hover:bg-gray-50">
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    name={member.fullName || member.email}
                                    imageUrl={member.profilePictureUrl}
                                    className="h-11 w-11 shrink-0 shadow-sm"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900">{member.fullName || 'Invited teammate'}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {member.isOwner ? 'Workspace owner' : member.status === 'active' ? 'Accepted invite' : 'Awaiting acceptance'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-sm text-gray-600">{member.email}</td>
                              <td className="px-6 py-5"><TeamRoleBadge role={member.role} /></td>
                              <td className="px-6 py-5"><TeamStatusBadge status={member.status} /></td>
                              <td className="px-6 py-5 text-sm text-gray-600">
                                {teamDateFormatter.format(new Date(member.invitedAt))}
                              </td>
                              <td className="px-6 py-5">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={member.isOwner}
                                    onClick={() => handleOpenEditTeamMember(member)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={member.isOwner}
                                    onClick={() => handleOpenRemoveTeamMember(member)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#5b45ff]/10 text-[#5b45ff]">
                        <Users className="h-7 w-7" />
                      </div>
                      <h3 className="mt-5 text-lg font-bold text-gray-900">No invited users yet</h3>
                      <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                        Start by inviting your first teammate. They will receive an email invite and appear here with their assigned role.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenInviteModal}
                        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8]"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add User
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'notifications' ? (
              <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {notificationSettingsError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{notificationSettingsError}</div>
                ) : null}

                {notificationSettingsNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{notificationSettingsNotice}</div>
                ) : null}

                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Notification Settings</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Manage live alerts, notification events, and sound preferences for this workspace.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveNotificationSettings()}
                    disabled={isSavingNotificationSettings}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingNotificationSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                    Save Settings
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: 'Live alerts',
                      value: notificationsMasterEnabled ? 'Enabled' : 'Disabled',
                      icon: BellRing,
                    },
                    {
                      label: 'Active events',
                      value: `${activeNotificationTriggerCount} / ${notificationTriggerItems.length}`,
                      icon: LayoutGrid,
                    },
                    {
                      label: 'Sound preset',
                      value: notificationSoundLabel,
                      icon: Volume2,
                    },
                    {
                      label: 'Call tones',
                      value: notificationSettingsForm.callSoundEnabled !== false ? 'Enabled' : 'Disabled',
                      icon: Phone,
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-500">{item.label}</p>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
                          <item.icon className="h-5 w-5" />
                        </div>
                      </div>
                      <p className="mt-5 truncate text-2xl font-bold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Sound preset</span>
                      <DropdownSelect
                        value={notificationSettingsForm.soundPreset}
                        disabled={!notificationSoundInteractive}
                        onChange={(nextSoundPreset) =>
                          updateNotificationSetting(
                            'soundPreset',
                            nextSoundPreset as NotificationPreferencesUpdateInput['soundPreset'],
                          )
                        }
                        options={NOTIFICATION_SOUND_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        ariaLabel="Select notification sound preset"
                        buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15 disabled:opacity-60"
                      />
                    </div>
                    <label className="block">
                      <span className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
                        <span>Volume</span>
                        <span>{Math.round((notificationSettingsForm.volume || 0) * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        disabled={!notificationSoundInteractive}
                        value={notificationSettingsForm.volume}
                        onChange={(event) => updateNotificationSetting('volume', Number(event.target.value))}
                        className="mt-3 w-full accent-[#5b45ff] disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={!notificationSoundInteractive}
                      onClick={() =>
                        previewNotificationSound('notification', {
                          soundPreset: notificationSettingsForm.soundPreset || 'classic',
                          volume: notificationSettingsForm.volume || 0.8,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Volume2 className="h-4 w-4" />
                      Preview notification
                    </button>
                    <button
                      type="button"
                      disabled={!notificationSettingsForm.callSoundEnabled}
                      onClick={() =>
                        previewNotificationSound('incoming_call', {
                          soundPreset: notificationSettingsForm.soundPreset || 'classic',
                          volume: notificationSettingsForm.volume || 0.8,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Bell className="h-4 w-4" />
                      Preview call sound
                    </button>
                    <button
                      type="button"
                      disabled={!notificationSoundInteractive}
                      onClick={() =>
                        playNotificationChime({
                          enabled: true,
                          soundEnabled: true,
                          soundPreset: notificationSettingsForm.soundPreset || 'classic',
                          volume: notificationSettingsForm.volume || 0.8,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Volume2 className="h-4 w-4" />
                      Test saved chime
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Notification', 'Category', 'Status'].map((label) => (
                            <th key={label} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                              {label}
                            </th>
                          ))}
                          <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                            Toggle
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {NOTIFICATION_CORE_CONTROLS.map((item) => {
                          const isEnabled = notificationSettingsForm[item.key] !== false;

                          return (
                            <Fragment key={item.key}>
                              <NotificationSettingRow
                                title={item.title}
                                description={item.description}
                                category="Delivery"
                                icon={item.icon}
                                checked={isEnabled}
                                onChange={(nextValue) => updateNotificationSetting(item.key, nextValue)}
                              />
                            </Fragment>
                          );
                        })}
                        {NOTIFICATION_TRIGGER_GROUPS.flatMap((group) =>
                          group.items.map((item) => {
                            const isEnabled = notificationSettingsForm[item.key] !== false;

                            return (
                              <Fragment key={item.key}>
                                <NotificationSettingRow
                                  title={item.title}
                                  description={item.description}
                                  category={group.title}
                                  icon={item.icon}
                                  checked={isEnabled}
                                  disabled={!notificationsMasterEnabled}
                                  statusText={!notificationsMasterEnabled ? 'Paused' : undefined}
                                  onChange={(nextValue) => updateNotificationSetting(item.key, nextValue)}
                                />
                              </Fragment>
                            );
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {['subscription', 'payment-methods', 'invoices'].includes(activeTab) ? (
              <motion.div key="subscription" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="bg-gradient-to-br from-[#111827] to-[#1f2937] rounded-2xl p-8 text-white relative overflow-hidden shadow-lg">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#5b45ff] rounded-full blur-[80px] opacity-20 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-[#25D366] font-semibold tracking-wider uppercase text-sm mb-2">Current Plan</p>
                    <h2 className="text-3xl font-bold mb-2">{bootstrap?.profile?.selectedPlan || 'No active subscription'}</h2>
                    <p className="text-gray-400 text-sm max-w-md">
                      {isCurrentPlanFreeTrial
                        ? formatTrialDaysLeft(bootstrap?.profile?.trialEndsAt, billingNow)
                        : 'Billing state is persisted against the workspace profile after Razorpay checkout verification.'}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        to="/onboarding/plans"
                        className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
                      >
                        Upgrade / Downgrade
                      </Link>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        Manage payment method
                      </button>
                    </div>
                  </div>
                </div>

                {isCurrentPlanFreeTrial || freeTrialExpired ? (
                  <div
                    className={`rounded-3xl border p-6 shadow-sm ${
                      freeTrialExpired
                        ? 'border-rose-200 bg-rose-50'
                        : isCurrentPlanFreeTrial
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p
                          className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                            freeTrialExpired ? 'text-rose-600' : isCurrentPlanFreeTrial ? 'text-emerald-700' : 'text-gray-400'
                          }`}
                        >
                          Free trial timer
                        </p>
                        <h3 className="mt-2 text-2xl font-bold text-gray-900">
                          {formatTrialDaysLeft(bootstrap?.profile?.trialEndsAt, billingNow)}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                          {freeTrialExpired
                            ? 'Your 168-hour trial window is over. Choose a paid plan to continue using the dashboard.'
                            : isCurrentPlanFreeTrial
                              ? 'Your 168-hour trial countdown started when you selected the free trial.'
                              : 'The free trial has already been used on this workspace.'}
                        </p>
                      </div>
                      <div className="min-w-[180px] rounded-2xl bg-white/80 px-5 py-4 text-center shadow-sm">
                        <p className="text-3xl font-bold text-gray-900">{trialDaysLeft ?? 0}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                          Days left
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/80">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          freeTrialExpired ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${freeTrialExpired ? 100 : freeTrialProgressPercent}%`,
                        }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                      <span>
                        Started:{' '}
                        {bootstrap?.profile?.freeTrialStartedAt
                          ? billingDateFormatter.format(new Date(bootstrap.profile.freeTrialStartedAt))
                          : 'Not available'}
                      </span>
                      <span>
                        Remaining:{' '}
                        {trialRemainingMs === null
                          ? 'Not available'
                          : trialRemainingMs <= 0
                            ? '0 hours'
                            : `${Math.ceil(trialRemainingMs / (60 * 60 * 1000))} hours`}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Billing cycle</p>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.billingCycle === 'annual'
                        ? 'Annual'
                        : bootstrap?.profile?.billingCycle === 'monthly'
                          ? 'Monthly'
                          : 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      <CalendarDays className="w-4 h-4" />
                      Trial end
                    </div>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.trialEndsAt
                        ? billingDateFormatter.format(new Date(bootstrap.profile.trialEndsAt))
                        : 'Not available'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Subscription status</p>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.billingStatus
                        ? bootstrap.profile.billingStatus.charAt(0).toUpperCase() + bootstrap.profile.billingStatus.slice(1)
                        : 'Inactive'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      <TicketPercent className="w-4 h-4" />
                      Coupon code
                    </div>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {bootstrap?.profile?.couponCode || 'None'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900">Payment method</h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Razorpay subscription ID</p>
                      <p className="mt-2 break-all text-sm font-medium text-gray-900">
                        {bootstrap?.profile?.razorpaySubscriptionId || 'No Razorpay subscription has been verified yet.'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Workspace behavior</p>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        This record now drives onboarding access, billing cycle visibility, and the trial-state messaging in the product.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-6 py-4">
                    <h3 className="text-lg font-bold text-gray-900">Billing history</h3>
                    <p className="mt-1 text-sm text-gray-500">Invoices will appear here after successful paid billing events.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Invoice', 'Date', 'Amount', 'Status', 'Action'].map((label) => (
                            <th key={label} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-6 py-8 text-sm font-medium text-gray-900">No invoices yet</td>
                          <td className="px-6 py-8 text-sm text-gray-500">-</td>
                          <td className="px-6 py-8 text-sm text-gray-500">-</td>
                          <td className="px-6 py-8">
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Pending</span>
                          </td>
                          <td className="px-6 py-8 text-sm text-gray-400">Available after payment</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'integrations' ? (
              <motion.div key="integrations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Integrations</h2>
                  <p className="mt-1 text-sm text-gray-500">Manage connected channels, providers, and advanced workspace integrations.</p>
                </div>
                <Link
                  to="/dashboard/connections"
                  className="block rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
                        <LayoutGrid className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Connection Center</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                          Open Connections to manage Meta, WhatsApp, Email Provider, WooCommerce, and Advanced integrations.
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20">
                      Open Connections <ExternalLink className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ) : null}

            {activeTab === 'api-keys' ? (
              <motion.div key="api-keys" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">API Keys</h2>
                  <p className="mt-1 text-sm text-gray-500">Create REST API credentials for using Connektly from your own code.</p>
                </div>

                {apiCredentialsError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{apiCredentialsError}</div>
                ) : null}

                {apiCredentialsNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{apiCredentialsNotice}</div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    { label: 'Active API keys', value: String(apiCredentials?.length || 0), icon: KeyRound },
                    { label: 'Authentication', value: 'API key + secret', icon: ShieldCheck },
                    { label: 'REST base URL', value: developerApiBaseUrl, icon: Globe },
                  ].map((item) => (
                    <div key={item.label} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{item.label}</p>
                          <p className="mt-2 break-all text-sm font-semibold text-gray-900">{item.value}</p>
                        </div>
                        <item.icon className="h-5 w-5 shrink-0 text-[#5b45ff]" />
                      </div>
                    </div>
                  ))}
                </div>

                {apiCredentialSecret ? (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-bold text-emerald-900">One-time credential details</p>
                        <p className="mt-1 text-sm leading-6 text-emerald-700">Copy the secret key now. It is stored as a hash and cannot be shown again.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setApiCredentialSecret(null)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        <X className="h-4 w-4" />
                        Dismiss
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {[
                        { label: 'API Key', value: apiCredentialSecret.apiKey },
                        { label: 'Secret Key', value: apiCredentialSecret.secret },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">{item.label}</p>
                          <div className="mt-2 flex items-center gap-3">
                            <code className="min-w-0 flex-1 break-all rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900">{item.value}</code>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyDeveloperValue(
                                  item.value,
                                  `${item.label} copied.`,
                                  setApiCredentialsNotice,
                                  setApiCredentialsError,
                                )
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              <Copy className="h-4 w-4" />
                              Copy
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                  <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
                        <KeyRound className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Create REST API credentials</h3>
                        <p className="mt-1 text-sm leading-6 text-gray-500">Use the API key and secret key as server-side credentials in your own integration code.</p>
                      </div>
                    </div>

                    <label className="mt-5 block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Key name</span>
                      <input
                        type="text"
                        value={apiCredentialName}
                        onChange={(event) => setApiCredentialName(event.target.value)}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        placeholder="Production REST API key"
                      />
                    </label>

                    <div className="mt-5">
                      <p className="text-sm font-medium text-gray-700">Permission scopes</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {DEVELOPER_API_SCOPE_OPTIONS.map((scope) => {
                          const isSelected = apiCredentialScopes.includes(scope.value);

                          return (
                            <label
                              key={scope.value}
                              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                                isSelected
                                  ? 'border-[#5b45ff]/30 bg-[#f4f2ff]'
                                  : 'border-gray-200 bg-gray-50 hover:bg-white'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleApiCredentialScope(scope.value)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                              />
                              <span>
                                <span className="block text-sm font-semibold text-gray-900">{scope.label}</span>
                                <span className="mt-1 block text-xs leading-5 text-gray-500">{scope.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isCreatingApiCredential}
                      onClick={() => void handleCreateApiCredential()}
                      className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                    >
                      {isCreatingApiCredential ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Generate API key
                    </button>
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600">
                        <ReceiptText className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900">REST usage</h3>
                        <p className="mt-1 text-sm leading-6 text-gray-500">Send both credentials from backend code. Do not expose the secret in browser JavaScript.</p>
                      </div>
                    </div>
                    <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-gray-100">
                      <code>{apiCredentialUsageExample}</code>
                    </pre>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyDeveloperValue(
                          apiCredentialUsageExample,
                          'REST usage example copied.',
                          setApiCredentialsNotice,
                          setApiCredentialsError,
                        )
                      }
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      <Copy className="h-4 w-4" />
                      Copy example
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-4">
                    <h3 className="text-base font-bold text-gray-900">Issued API keys</h3>
                    <p className="mt-1 text-sm text-gray-500">Regenerate a secret if it is exposed, or delete credentials that are no longer used.</p>
                  </div>
                  {isApiCredentialsLoading ? (
                    <div className="p-5 text-sm text-gray-500">Loading API keys...</div>
                  ) : apiCredentials && apiCredentials.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {apiCredentials.map((credential) => (
                        <div key={credential.id} className="p-5">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-bold text-gray-900">{credential.name}</h4>
                                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{credential.status}</span>
                              </div>
                              <p className="mt-2 break-all font-mono text-xs font-semibold text-gray-700">{credential.apiKey}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {credential.scopes.map((scope) => (
                                  <span key={scope} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{scope}</span>
                                ))}
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                                <span>Secret ends in {credential.secretLast4}</span>
                                <span>Created {formatSettingsDateTime(credential.createdAt)}</span>
                                <span>Last used {formatSettingsDateTime(credential.lastUsedAt)}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopyDeveloperValue(
                                    credential.apiKey,
                                    'API key copied.',
                                    setApiCredentialsNotice,
                                    setApiCredentialsError,
                                  )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                              >
                                <Copy className="h-4 w-4" />
                                Copy key
                              </button>
                              <button
                                type="button"
                                disabled={regeneratingApiCredentialId === credential.id}
                                onClick={() => void handleRegenerateApiCredentialSecret(credential)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-70"
                              >
                                {regeneratingApiCredentialId === credential.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Regenerate secret
                              </button>
                              <button
                                type="button"
                                disabled={deletingApiCredentialId === credential.id}
                                onClick={() => void handleDeleteApiCredential(credential)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-70"
                              >
                                {deletingApiCredentialId === credential.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <KeyRound className="mx-auto h-10 w-10 text-gray-300" />
                      <p className="mt-3 text-sm font-semibold text-gray-900">No API keys yet</p>
                      <p className="mt-1 text-sm text-gray-500">Generate a key and secret to start integrating with the REST API.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}

            {activeTab === 'webhooks' ? (
              <motion.div key="webhooks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Webhooks</h2>
                  <p className="mt-1 text-sm text-gray-500">Add callback URLs that receive event payloads when messages, contacts, and campaigns change.</p>
                </div>

                {webhooksError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{webhooksError}</div>
                ) : null}

                {webhooksNotice ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{webhooksNotice}</div>
                ) : null}

                {webhookSigningSecret ? (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-bold text-emerald-900">{webhookSigningSecret.name} signing secret</p>
                        <p className="mt-1 text-sm leading-6 text-emerald-700">Use this secret to verify callback signatures in your webhook receiver.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWebhookSigningSecret(null)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        <X className="h-4 w-4" />
                        Dismiss
                      </button>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 break-all rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900">{webhookSigningSecret.signingSecret}</code>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyDeveloperValue(
                            webhookSigningSecret.signingSecret,
                            'Webhook signing secret copied.',
                            setWebhooksNotice,
                            setWebhooksError,
                          )
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]">
                      <Webhook className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Add webhook endpoint</h3>
                      <p className="mt-1 text-sm leading-6 text-gray-500">Callbacks are sent to your URL for selected events such as new message received and message read.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Webhook name</span>
                      <input
                        type="text"
                        value={webhookForm.name || ''}
                        onChange={(event) => setWebhookForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        placeholder="Production message webhook"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Callback URL</span>
                      <input
                        type="url"
                        value={webhookForm.url}
                        onChange={(event) => setWebhookForm((current) => ({ ...current, url: event.target.value }))}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        placeholder="https://example.com/connektly/webhook"
                      />
                    </label>
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-medium text-gray-700">Events</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {DEVELOPER_WEBHOOK_EVENT_OPTIONS.map((eventOption) => {
                        const isSelected = webhookForm.events.includes(eventOption.value);

                        return (
                          <label
                            key={eventOption.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                              isSelected
                                ? 'border-[#5b45ff]/30 bg-[#f4f2ff]'
                                : 'border-gray-200 bg-gray-50 hover:bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleWebhookFormEvent(eventOption.value)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                            />
                            <span>
                              <span className="block text-sm font-semibold text-gray-900">{eventOption.label}</span>
                              <span className="mt-1 block text-xs leading-5 text-gray-500">{eventOption.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isCreatingWebhook}
                    onClick={() => void handleCreateWebhook()}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                  >
                    {isCreatingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add webhook
                  </button>
                </div>

                <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-4">
                    <h3 className="text-base font-bold text-gray-900">Configured webhooks</h3>
                    <p className="mt-1 text-sm text-gray-500">Pause callbacks during maintenance or delete endpoints that should no longer receive events.</p>
                  </div>
                  {isWebhooksLoading ? (
                    <div className="p-5 text-sm text-gray-500">Loading webhooks...</div>
                  ) : webhooks && webhooks.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {webhooks.map((webhook) => (
                        <div key={webhook.id} className="p-5">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-bold text-gray-900">{webhook.name}</h4>
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                    webhook.status === 'active'
                                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                      : 'border-gray-200 bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {webhook.status === 'active' ? 'Active' : 'Paused'}
                                </span>
                              </div>
                              <p className="mt-2 break-all font-mono text-xs font-semibold text-gray-700">{webhook.url}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {webhook.events.map((eventName) => (
                                  <span key={eventName} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{eventName}</span>
                                ))}
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                                <span>Secret ends in {webhook.signingSecretLast4}</span>
                                <span>Last delivery {formatSettingsDateTime(webhook.lastDeliveryAt)}</span>
                                <span>{webhook.lastError ? `Last error ${webhook.lastError}` : 'No delivery errors'}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={updatingWebhookId === webhook.id}
                                onClick={() => void handleToggleWebhookStatus(webhook)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-70"
                              >
                                {updatingWebhookId === webhook.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                {webhook.status === 'active' ? 'Pause' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                disabled={deletingWebhookId === webhook.id}
                                onClick={() => void handleDeleteWebhook(webhook)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-70"
                              >
                                {deletingWebhookId === webhook.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Webhook className="mx-auto h-10 w-10 text-gray-300" />
                      <p className="mt-3 text-sm font-semibold text-gray-900">No webhooks yet</p>
                      <p className="mt-1 text-sm text-gray-500">Add a callback URL to receive events from Connektly.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}

            {['language-region', 'timezone', 'default-settings'].includes(activeTab) ? (
              <motion.div key="preferences" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Preferences</h2>
                  <p className="mt-1 text-sm text-gray-500">Set defaults for language, dates, timezone, and workspace behavior.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { label: 'Language', value: 'English', icon: Languages },
                    { label: 'Region', value: 'India', icon: Globe },
                    { label: 'Date format', value: 'DD MMM YYYY', icon: CalendarDays },
                    { label: 'Timezone', value: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata', icon: Globe },
                  ].map((item) => (
                    <div key={item.label} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                          <p className="mt-2 text-sm text-gray-500">{item.value}</p>
                        </div>
                        <item.icon className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-bold text-gray-900">Default Settings</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {[
                      'Default channel: WhatsApp',
                      'Default campaign mode: Draft',
                      'Default notification sound: Notification.mp3',
                    ].map((item) => (
                      <div key={item} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : null}

            {['data-export', 'delete-account'].includes(activeTab) ? (
              <motion.div key="privacy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Privacy & Data</h2>
                  <p className="mt-1 text-sm text-gray-500">Export workspace data or permanently delete the account.</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <Download className="h-6 w-6 text-[#5b45ff]" />
                    <h3 className="mt-4 text-base font-bold text-gray-900">Data Export</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      Downloadable exports can include profile, workspace, channel, CRM, and message metadata when wired to the export service.
                    </p>
                    <button
                      type="button"
                      className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Request export
                    </button>
                  </div>
                  <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
                    <Trash2 className="h-6 w-6 text-rose-600" />
                    <h3 className="mt-4 text-base font-bold text-rose-950">Delete Account</h3>
                    <p className="mt-2 text-sm leading-6 text-rose-800">
                      Permanently remove your account, workspace profile, channel connections, inbox history, and saved settings.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      className="mt-4 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
                    >
                      Delete account
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : null}

          </AnimatePresence>
        </div>
      </div>

      {isPhoneModalOpen ? (
        <SettingsModal
          title="Change contact number"
          subtitle="Update the contact number shown in your profile."
          onClose={() => {
            if (isUpdatingPhone) {
              return;
            }

            setIsPhoneModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Contact number</span>
              <input
                type="tel"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Enter contact number"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsPhoneModalOpen(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingPhone}
                onClick={() => void handleUpdatePhone()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isUpdatingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                Save contact number
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isEmailModalOpen ? (
        <SettingsModal
          title="Change email address"
          subtitle="Enter the new email address."
          onClose={() => {
            if (isUpdatingEmail) {
              return;
            }

            setIsEmailModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">New email address</span>
              <input
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="name@company.com"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingEmail}
                onClick={() => void handleRequestEmailChange()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isUpdatingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send confirmation email
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isPasswordModalOpen ? (
        <SettingsModal
          title="Change password"
          subtitle="Request a verification code by email, then set your new password."
          onClose={() => {
            if (isSendingPasswordCode || isUpdatingPassword) {
              return;
            }

            setIsPasswordModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              We will email a verification code before your new password is saved.
            </div>
            <button
              type="button"
              disabled={isSendingPasswordCode}
              onClick={() => void handleSendPasswordCode()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-70"
            >
              {isSendingPasswordCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send verification code
            </button>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Email verification code</span>
              <input
                type="text"
                value={passwordNonce}
                onChange={(event) => setPasswordNonce(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Enter the code from your email"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Minimum 8 characters"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Re-enter the new password"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingPassword}
                onClick={() => void handleChangePassword()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
              >
                {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Update password
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isMfaModalOpen ? (
        <SettingsModal
          title="Set up multi-factor authentication"
          subtitle="Request the email code, enter the 8-digit number, then connect an authenticator app."
          size="wide"
          onClose={() => {
            if (isSendingMfaNotice || isSettingUpMfa) {
              return;
            }

            setIsMfaModalOpen(false);
          }}
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Enter the 8-digit numeric code from your email before continuing.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Step 1. Request email code</p>
                <p className="mt-1 text-xs text-gray-500">We will send a one-time code to your current email address.</p>
              </div>
              <button
                type="button"
                disabled={isSendingMfaNotice}
                onClick={() => void handleStartMfaSetup()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white disabled:opacity-70"
              >
                {isSendingMfaNotice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {mfaNoticeSent ? 'Resend OTP' : 'Send OTP'}
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <label className="block flex-1">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Step 2. Enter OTP</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={mfaOtpCode}
                    onChange={(event) => {
                      const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 8);
                      setMfaOtpCode(digitsOnly);
                      if (isMfaOtpConfirmed) {
                        setIsMfaOtpConfirmed(false);
                      }
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    placeholder="8-digit OTP"
                  />
                  <p className="mt-2 text-xs text-gray-500">Only numeric 8-digit codes are accepted.</p>
                </label>
                <button
                  type="button"
                  onClick={handleConfirmMfaOtp}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-white"
                >
                  {isMfaOtpConfirmed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <ShieldCheck className="h-4 w-4" />}
                  {isMfaOtpConfirmed ? 'OTP confirmed' : 'Confirm OTP'}
                </button>
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Authenticator label</span>
              <input
                type="text"
                value={mfaFriendlyName}
                onChange={(event) => setMfaFriendlyName(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Connektly Authenticator"
              />
            </label>
            <button
              type="button"
              disabled={isSettingUpMfa}
              onClick={() => void handleGenerateTotp()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
            >
              {isSettingUpMfa && !pendingTotpEnrollment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Continue to authenticator setup
            </button>
            {pendingTotpEnrollment ? (
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                  <div className="rounded-2xl border border-gray-200 bg-white p-3">
                    <img src={pendingTotpEnrollment.qrCode} alt="Authenticator QR code" className="mx-auto h-44 w-44" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Step 3. Scan the QR code</p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Use Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP-compatible app.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Manual secret</p>
                          <p className="mt-2 break-all text-sm font-medium text-gray-900">{pendingTotpEnrollment.secret}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyTotpSecret()}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Authenticator code</span>
                      <input
                        type="text"
                        value={mfaVerificationCode}
                        onChange={(event) => setMfaVerificationCode(event.target.value)}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        placeholder="Enter the 6-digit code"
                      />
                    </label>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingTotpEnrollment(null);
                          setMfaVerificationCode('');
                        }}
                        className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Start over
                      </button>
                      <button
                        type="button"
                        disabled={isSettingUpMfa}
                        onClick={() => void handleVerifyTotp()}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:opacity-70"
                      >
                        {isSettingUpMfa ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                        Verify and enable MFA
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </SettingsModal>
      ) : null}

      {isInviteModalOpen ? (
        <TeamInviteModal
          form={inviteForm}
          isSubmitting={isInviting}
          onChange={handleInviteFormChange}
          onClose={handleCloseInviteModal}
          onSubmit={() => void handleInviteUser()}
        />
      ) : null}

      {teamMemberBeingEdited ? (
        <SettingsModal
          title="Edit user"
          subtitle={`Update access for ${teamMemberBeingEdited.email}.`}
          onClose={handleCloseEditTeamMember}
        >
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <UserAvatar
                name={teamMemberBeingEdited.fullName || teamMemberBeingEdited.email}
                imageUrl={teamMemberBeingEdited.profilePictureUrl}
                className="h-12 w-12 shrink-0 shadow-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {teamMemberBeingEdited.fullName || 'Invited teammate'}
                </p>
                <p className="mt-1 truncate text-xs text-gray-500">{teamMemberBeingEdited.email}</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
                <input
                  type="text"
                  value={teamEditForm.fullName}
                  onChange={(event) => handleTeamEditFormChange('fullName', event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  placeholder="Enter full name"
                />
              </label>
              <div className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Role Assigned</span>
                <DropdownSelect
                  value={teamEditForm.role}
                  onChange={(nextRole) => handleTeamEditFormChange('role', nextRole)}
                  options={USER_ROLE_OPTIONS.map((role) => ({
                    value: role.value,
                    label: role.label,
                  }))}
                  ariaLabel="Select team member role"
                  buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
              {USER_ROLE_OPTIONS.find((option) => option.value === teamEditForm.role)?.description}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseEditTeamMember}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingTeamMember}
                onClick={() => void handleUpdateTeamMember()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isUpdatingTeamMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      <ConfirmationDialog
        isOpen={Boolean(teamMemberBeingRemoved)}
        title="Remove user?"
        description={
          teamMemberBeingRemoved
            ? `${teamMemberBeingRemoved.fullName || teamMemberBeingRemoved.email} will lose access to this workspace. Their Connektly account will not be deleted.`
            : 'This user will lose access to this workspace.'
        }
        confirmLabel="Remove user"
        tone="danger"
        isLoading={isRemovingTeamMember}
        onClose={() => {
          if (!isRemovingTeamMember) {
            setTeamMemberBeingRemoved(null);
          }
        }}
        onConfirm={() => void confirmRemoveTeamMember()}
      />

      <ConfirmationDialog
        isOpen={isDisableMfaConfirmationOpen}
        title="Disable multi-factor authentication?"
        description="This will remove the verified authenticator app from your account and sign-in will go back to password-only protection."
        confirmLabel="Disable MFA"
        tone="warning"
        isLoading={isDisablingMfa}
        onClose={() => setIsDisableMfaConfirmationOpen(false)}
        onConfirm={() => void confirmDisableMfa()}
      />

      <ConfirmationDialog
        isOpen={isDeleteAccountConfirmationOpen}
        title="Delete account?"
        description={
          <>
            This permanently deletes your Connektly account and workspace data.
            {currentUser?.email ? ` The signed-in email ${currentUser.email} will lose access immediately.` : ''}
          </>
        }
        confirmLabel="Delete account"
        tone="danger"
        isLoading={isDeletingAccount}
        onClose={() => setIsDeleteAccountConfirmationOpen(false)}
        onConfirm={() => void confirmDeleteAccount()}
      />
    </div>
  );
}
