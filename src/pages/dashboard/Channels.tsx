import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BadgeCheck,
  CheckCircle2,
  Link2,
  Loader2,
  Mail,
  Power,
  RefreshCcw,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { appApi } from '../../lib/api';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import { useAppData } from '../../context/AppDataContext';
import { beginInstagramBusinessLogin, beginMessengerPageLogin } from '../../lib/meta-sdk';
import { hasInstagramBusinessLoginConfig, hasMessengerLoginConfig } from '../../lib/config';
import { useEscapeKey } from '../../lib/useEscapeKey';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import IntegrationBrandIcon from '../../components/IntegrationBrandIcon';
import MetaVerifiedIcon from '../../components/MetaVerifiedIcon';
import type { ChannelBrand } from '../../components/ChannelBrandIcon';
import type {
  EmailConnectionSummary,
  EmailConnectionUpsertInput,
  EmailConnectionVerifyResponse,
  InstagramConnectableAccount,
  MessengerConnectablePage,
  MetaChannelConnection,
} from '../../lib/types';

type ChannelId = 'whatsapp' | 'instagram' | 'messenger' | 'email';
type ChannelIcon = ChannelBrand | 'email';

type ChannelListItem = {
  id: ChannelId;
  name: string;
  shortStatus: string;
  connected: boolean;
  icon: ChannelIcon;
  description: string;
};

type StatusRow = {
  label: string;
  account: string;
  detail?: string;
  statusText: string;
  statusTone: string;
};

interface EmailConnectionFormState {
  displayName: string;
  emailAddress: string;
  authUser: string;
  password: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
}

type InstagramSelectionState = {
  accessToken: string | null;
  longLivedToken: string | null;
  flowState: string | null;
  oauthState: string | null;
  accounts: InstagramConnectableAccount[];
};

type MessengerSelectionState = {
  accessToken: string | null;
  flowState: string | null;
  oauthState: string | null;
  pages: MessengerConnectablePage[];
};

type ChannelConfirmationAction =
  | 'disconnect-whatsapp'
  | 'disconnect-instagram'
  | 'disconnect-messenger'
  | 'turn-off-whatsapp-two-step'
  | 'unsubscribe-whatsapp-webhooks';

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

function getQualityMeta(qualityRating: string | null) {
  switch ((qualityRating || '').toLowerCase()) {
    case 'green':
    case 'high':
      return {
        label: 'High Quality',
        tone: 'text-green-700 bg-green-50 border-green-200',
      };
    case 'yellow':
    case 'medium':
      return {
        label: 'Medium Quality',
        tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      };
    case 'red':
    case 'low':
      return {
        label: 'Low Quality',
        tone: 'text-red-700 bg-red-50 border-red-200',
      };
    default:
      return {
        label: qualityRating || 'Unknown',
        tone: 'text-gray-700 bg-gray-50 border-gray-200',
      };
  }
}

function getDisplayNameApproval(
  verifiedName: string | null,
  isConnected: boolean,
  displayNameStatus: string | null,
  needsRegistration: boolean,
) {
  if (!isConnected) {
    return {
      label: 'Not connected',
      tone: 'text-gray-700 bg-gray-50 border-gray-200',
    };
  }

  if (needsRegistration) {
    return {
      label: 'Auto-registering',
      tone: 'text-amber-700 bg-amber-50 border-amber-200',
    };
  }

  const normalizedStatus = (displayNameStatus || '').toUpperCase();

  if (normalizedStatus.includes('REJECT') || normalizedStatus.includes('DECLIN')) {
    return {
      label: 'Rejected',
      tone: 'text-red-700 bg-red-50 border-red-200',
    };
  }

  if (normalizedStatus.includes('PENDING') || normalizedStatus.includes('REVIEW')) {
    return {
      label: 'Under review',
      tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    };
  }

  if (verifiedName || normalizedStatus.includes('APPROVED') || normalizedStatus.includes('AVAILABLE')) {
    return {
      label: 'Approved',
      tone: 'text-green-700 bg-green-50 border-green-200',
    };
  }

  return {
    label: 'Pending / not returned yet',
    tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  };
}

function getStringRecordValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getWhatsAppDisplayNameState(channel: MetaChannelConnection | null) {
  const metadata = channel?.metadata || {};
  const requestRecord =
    metadata.displayNameRequest &&
    typeof metadata.displayNameRequest === 'object' &&
    !Array.isArray(metadata.displayNameRequest)
      ? (metadata.displayNameRequest as Record<string, unknown>)
      : null;
  const approvalRecord =
    metadata.displayNameApproval &&
    typeof metadata.displayNameApproval === 'object' &&
    !Array.isArray(metadata.displayNameApproval)
      ? (metadata.displayNameApproval as Record<string, unknown>)
      : null;

  return {
    requestedName: requestRecord ? getStringRecordValue(requestRecord, 'requestedName') : null,
    requestedAt: requestRecord ? getStringRecordValue(requestRecord, 'requestedAt') : null,
    status:
      (approvalRecord ? getStringRecordValue(approvalRecord, 'status') : null) ||
      (requestRecord ? getStringRecordValue(requestRecord, 'status') : null),
    approvedAt:
      (approvalRecord ? getStringRecordValue(approvalRecord, 'approvedAt') : null) ||
      (requestRecord ? getStringRecordValue(requestRecord, 'approvedAt') : null),
    lastCheckedAt:
      (approvalRecord ? getStringRecordValue(approvalRecord, 'lastCheckedAt') : null) ||
      (requestRecord ? getStringRecordValue(requestRecord, 'lastCheckedAt') : null),
  };
}

function isApprovedDisplayNameStatus(status: string | null | undefined) {
  const normalized = (status || '').toUpperCase();
  return normalized.includes('APPROVED') || normalized.includes('AVAILABLE');
}

function isTimestampBefore(value: string | null | undefined, reference: string | null | undefined) {
  if (!value || !reference) {
    return false;
  }

  const valueTime = Date.parse(value);
  const referenceTime = Date.parse(reference);

  return Number.isFinite(valueTime) && Number.isFinite(referenceTime) && valueTime < referenceTime;
}

function buildEmailConnectionForm(
  connection: EmailConnectionSummary | null,
  fallbackDisplayName: string,
  fallbackEmailAddress: string,
): EmailConnectionFormState {
  return {
    displayName: connection?.displayName || fallbackDisplayName,
    emailAddress: connection?.emailAddress || fallbackEmailAddress,
    authUser: connection?.authUser || connection?.emailAddress || fallbackEmailAddress,
    password: '',
    smtpHost: connection?.smtpHost || '',
    smtpPort: connection?.smtpPort ? String(connection.smtpPort) : '465',
    smtpSecure: connection?.smtpSecure ?? true,
    imapHost: connection?.imapHost || '',
    imapPort: connection?.imapPort ? String(connection.imapPort) : '993',
    imapSecure: connection?.imapSecure ?? true,
  };
}

function getDefaultEmailSecureForPort(port: string, protocol: 'smtp' | 'imap') {
  const normalizedPort = Number(port);

  if (protocol === 'smtp') {
    return normalizedPort === 465;
  }

  return normalizedPort === 993;
}

function buildEmailConnectionPayload(form: EmailConnectionFormState): EmailConnectionUpsertInput {
  return {
    displayName: form.displayName.trim(),
    emailAddress: form.emailAddress.trim(),
    authUser: form.authUser.trim(),
    password: form.password,
    smtpHost: form.smtpHost.trim(),
    smtpPort: Number(form.smtpPort),
    smtpSecure: form.smtpSecure,
    imapHost: form.imapHost.trim(),
    imapPort: Number(form.imapPort),
    imapSecure: form.imapSecure,
  };
}

function EmailVerificationCard({
  label,
  result,
  isLoading,
}: {
  label: string;
  result: EmailConnectionVerifyResponse['smtp'] | null;
  isLoading: boolean;
}) {
  const ok = result?.ok;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {isLoading ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking
          </span>
        ) : (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              ok
                ? 'border-green-100 bg-green-50 text-green-700'
                : result
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-gray-50 text-gray-500'
            }`}
          >
            {ok ? 'Ready' : result ? 'Needs attention' : 'Waiting'}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        {result?.message || 'Fill out the setup form to verify this connection.'}
      </p>
    </div>
  );
}

function getMessengerPermissionStatus(pageTasks: string[]) {
  if (pageTasks.length === 0) {
    return {
      label: 'Task visibility unavailable',
      tone: 'text-blue-700 bg-blue-50 border-blue-200',
      detail:
        'Meta did not return Page task visibility from this endpoint. Use the webhook subscription result below as the readiness signal.',
    };
  }

  const hasMessagingTask = pageTasks.some((task) => task === 'MESSAGE' || task === 'MESSAGING');
  const hasModerationTask = pageTasks.includes('MODERATE');

  if (hasMessagingTask && hasModerationTask) {
    return {
      label: 'Ready',
      tone: 'text-green-700 bg-green-50 border-green-200',
      detail: 'This Page can send messages and manage Messenger webhook subscriptions.',
    };
  }

  if (hasMessagingTask || hasModerationTask) {
    return {
      label: 'Partial access',
      tone: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      detail:
        'Messenger is connected, but Meta did not return the full Page task set needed for both messaging and webhook management.',
    };
  }

  return {
    label: 'Limited access',
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    detail:
      'Meta did not return the Page tasks required for Messenger sends or webhook subscription management.',
  };
}

function getWhatsAppSenderRegistrationState(channel: MetaChannelConnection | null) {
  const senderRegistration = channel?.metadata?.senderRegistration;

  if (
    !senderRegistration ||
    typeof senderRegistration !== 'object' ||
    Array.isArray(senderRegistration)
  ) {
    return null;
  }

  const registrationRecord = senderRegistration as Record<string, unknown>;

  return {
    registeredAt:
      typeof registrationRecord.registeredAt === 'string'
        ? registrationRecord.registeredAt
        : null,
    deregisteredAt:
      typeof registrationRecord.deregisteredAt === 'string'
        ? registrationRecord.deregisteredAt
        : null,
  };
}

function getWhatsAppTwoStepVerificationState(channel: MetaChannelConnection | null) {
  const twoStepVerification = channel?.metadata?.twoStepVerification;
  const senderRegistration = getWhatsAppSenderRegistrationState(channel);
  const twoStepRecord =
    twoStepVerification &&
    typeof twoStepVerification === 'object' &&
    !Array.isArray(twoStepVerification)
      ? (twoStepVerification as Record<string, unknown>)
      : null;
  const enabledAt =
    typeof twoStepRecord?.enabledAt === 'string'
      ? twoStepRecord.enabledAt
      : senderRegistration?.registeredAt || null;
  const disabledAt =
    typeof twoStepRecord?.disabledAt === 'string'
      ? twoStepRecord.disabledAt
      : senderRegistration?.deregisteredAt || null;
  const lastPinUpdatedAt =
    typeof twoStepRecord?.lastPinUpdatedAt === 'string'
      ? twoStepRecord.lastPinUpdatedAt
      : enabledAt;
  const liveIsEnabled =
    typeof twoStepRecord?.isPinEnabled === 'boolean'
      ? twoStepRecord.isPinEnabled
      : typeof twoStepRecord?.codeVerificationStatus === 'string'
        ? twoStepRecord.codeVerificationStatus.toUpperCase() === 'VERIFIED'
        : null;
  const liveStatusCheckedAt =
    typeof twoStepRecord?.liveStatusCheckedAt === 'string'
      ? twoStepRecord.liveStatusCheckedAt
      : null;
  const enabledAtMs = enabledAt ? Date.parse(enabledAt) : Number.NaN;
  const disabledAtMs = disabledAt ? Date.parse(disabledAt) : Number.NaN;
  const isEnabled =
    liveIsEnabled ??
    (Boolean(enabledAt) &&
      (!Number.isFinite(disabledAtMs) ||
        !Number.isFinite(enabledAtMs) ||
        enabledAtMs >= disabledAtMs));

  return {
    enabledAt,
    disabledAt,
    lastPinUpdatedAt,
    liveStatusCheckedAt,
    isEnabled,
  };
}

function getWhatsAppWebhookSubscription(channel: MetaChannelConnection | null) {
  const webhookSubscription = channel?.metadata?.webhookSubscription;

  if (
    !webhookSubscription ||
    typeof webhookSubscription !== 'object' ||
    Array.isArray(webhookSubscription)
  ) {
    return null;
  }

  const subscriptionRecord = webhookSubscription as Record<string, unknown>;

  return {
    isSubscribed: subscriptionRecord.isSubscribed === true,
    callbackUrl:
      typeof subscriptionRecord.overrideCallbackUri === 'string'
        ? subscriptionRecord.overrideCallbackUri
        : typeof subscriptionRecord.callbackUrl === 'string'
          ? subscriptionRecord.callbackUrl
          : null,
    lastCheckedAt:
      typeof subscriptionRecord.lastCheckedAt === 'string'
        ? subscriptionRecord.lastCheckedAt
        : typeof subscriptionRecord.subscribedAt === 'string'
          ? subscriptionRecord.subscribedAt
          : null,
    lastError:
      typeof subscriptionRecord.lastError === 'string' ? subscriptionRecord.lastError : null,
  };
}

function getWhatsAppVerificationCodeRequestState(channel: MetaChannelConnection | null) {
  const verificationCodeRequest = channel?.metadata?.verificationCodeRequest;

  if (
    !verificationCodeRequest ||
    typeof verificationCodeRequest !== 'object' ||
    Array.isArray(verificationCodeRequest)
  ) {
    return null;
  }

  const requestRecord = verificationCodeRequest as Record<string, unknown>;

  return {
    lastRequestedAt:
      typeof requestRecord.lastRequestedAt === 'string'
        ? requestRecord.lastRequestedAt
        : null,
    lastVerifiedAt:
      typeof requestRecord.lastVerifiedAt === 'string'
        ? requestRecord.lastVerifiedAt
        : null,
    codeMethod:
      requestRecord.codeMethod === 'SMS' || requestRecord.codeMethod === 'VOICE'
        ? requestRecord.codeMethod
        : null,
    language:
      typeof requestRecord.language === 'string' ? requestRecord.language : null,
    verifiedPhoneNumberId:
      typeof requestRecord.verifiedPhoneNumberId === 'string'
        ? requestRecord.verifiedPhoneNumberId
        : null,
  };
}

function PinDialog({
  isOpen,
  title,
  description,
  submitLabel,
  value,
  isSubmitting = false,
  onChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  submitLabel: string;
  value: string;
  isSubmitting?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEscapeKey(isOpen && !isSubmitting, onClose);

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <motion.button
            type="button"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isSubmitting ? undefined : onClose}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 18 }}
            className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-6 block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Six-digit PIN</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={value}
                onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit PIN"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#2364ff] focus:ring-2 focus:ring-[#2364ff]/15"
              />
            </label>

            <p className="mt-2 text-xs leading-5 text-gray-500">
              Use a PIN that your team can store safely. Meta requires this code whenever the number is registered again.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2364ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function VerificationCodeDialog({
  isOpen,
  method,
  language,
  isSubmitting = false,
  onChangeLanguage,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  method: 'SMS' | 'VOICE' | null;
  language: string;
  isSubmitting?: boolean;
  onChangeLanguage: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEscapeKey(isOpen && !isSubmitting, onClose);

  if (!method) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <motion.button
            type="button"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isSubmitting ? undefined : onClose}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 18 }}
            className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Request verification code by {method === 'SMS' ? 'SMS' : 'voice'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Meta will send a one-time verification code to the connected WhatsApp number. This starts the phone number verification step only.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-6 block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Language locale</span>
              <input
                type="text"
                autoFocus
                value={language}
                onChange={(event) => onChangeLanguage(event.target.value.trimStart().slice(0, 32))}
                placeholder="en_US"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#2364ff] focus:ring-2 focus:ring-[#2364ff]/15"
              />
            </label>

            <p className="mt-2 text-xs leading-5 text-gray-500">
              Use the locale Meta expects for the verification message, such as <span className="font-medium">en_US</span>.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2364ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Requesting...' : `Request via ${method === 'SMS' ? 'SMS' : 'voice'}`}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function VerifyCodeDialog({
  isOpen,
  value,
  isSubmitting = false,
  onChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  value: string;
  isSubmitting?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEscapeKey(isOpen && !isSubmitting, onClose);

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <motion.button
            type="button"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isSubmitting ? undefined : onClose}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 18 }}
            className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Verify phone number code</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Enter the one-time code Meta sent by SMS or voice to complete WhatsApp phone number verification.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-6 block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={value}
                onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Enter code"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#2364ff] focus:ring-2 focus:ring-[#2364ff]/15"
              />
            </label>

            <p className="mt-2 text-xs leading-5 text-gray-500">
              Verification codes are short-lived and usually expire within a few minutes.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2364ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition hover:bg-[#1d54d9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Verifying...' : 'Verify code'}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function getStatusDotClassName(statusTone: string) {
  if (statusTone.includes('green')) {
    return 'bg-emerald-500 ring-emerald-100';
  }

  if (statusTone.includes('yellow') || statusTone.includes('amber')) {
    return 'bg-amber-500 ring-amber-100';
  }

  if (statusTone.includes('red') || statusTone.includes('rose')) {
    return 'bg-rose-500 ring-rose-100';
  }

  if (statusTone.includes('blue')) {
    return 'bg-blue-500 ring-blue-100';
  }

  return 'bg-gray-400 ring-gray-100';
}

function ChannelListIcon({
  icon,
  className,
}: {
  icon: ChannelIcon;
  className: string;
}) {
  if (icon === 'email') {
    return <IntegrationBrandIcon brand="email" className={className} alt="" />;
  }

  return <ChannelBrandIcon channel={icon} className={className} alt="" />;
}

// Keep the cleanup presentational: these local helpers simplify JSX without changing channel data flow.
function ChannelListButton({
  item,
  isActive,
  reduceMotion = false,
  onClick,
}: {
  item: ChannelListItem;
  isActive: boolean;
  reduceMotion?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -1, scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.18, ease: MOTION_EASE }}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-[background-color,color,box-shadow] duration-200 ease-out ${
        isActive
          ? 'bg-[#eff5ff] text-[#0f2e82] shadow-sm'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <ChannelListIcon icon={item.icon} className="h-9 w-9 shrink-0" />

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${isActive ? 'text-[#0f2e82]' : 'text-gray-900'}`}>
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{item.shortStatus}</p>
      </div>

      <div className="flex items-center gap-2">
        {item.connected ? (
          <MetaVerifiedIcon className="h-5 w-5 shrink-0" alt="Connected via Meta" />
        ) : null}
        <span
          className={`h-2 w-2 rounded-full transition-colors duration-200 ${
            item.connected ? 'bg-emerald-500' : 'bg-gray-300'
          }`}
        />
      </div>
    </motion.button>
  );
}

function StatusTable({
  rows,
  isQualityTable = false,
  reduceMotion = false,
}: {
  rows: StatusRow[];
  isQualityTable?: boolean;
  reduceMotion?: boolean;
}) {
  return (
    <motion.div
      variants={slideUp}
      className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
    >
      {rows.map((row) => (
        <motion.div
          key={row.label}
          whileHover={reduceMotion ? undefined : { y: -1 }}
          transition={{ duration: 0.16, ease: MOTION_EASE }}
          className="grid grid-cols-1 gap-4 border-b border-gray-100 px-5 py-4 transition-colors duration-200 ease-out last:border-b-0 hover:bg-gray-50/70 md:grid-cols-[minmax(0,1fr)_220px]"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{row.label}</p>
            <p className="mt-1 truncate text-sm font-medium text-gray-700">{row.account}</p>
            {row.detail ? <p className="mt-1 text-sm leading-6 text-gray-500">{row.detail}</p> : null}
          </div>

          <div className="flex items-start md:justify-end">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">
              <span className={`h-2 w-2 shrink-0 rounded-full ring-4 ${getStatusDotClassName(row.statusTone)}`} />
              <span className="truncate">{row.statusText}</span>
            </div>
          </div>
        </motion.div>
      ))}

      {isQualityTable ? (
        <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-4 text-sm leading-6 text-gray-600">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Quality guide</p>
          <p className="mt-2">
            <span className="font-semibold text-green-700">Green: High Quality</span>{' '}
            Indicates strong message performance, minimal user complaints, and high user interaction (replies/clicks).
          </p>
          <p className="mt-2">
            <span className="font-semibold text-yellow-700">Yellow: Medium Quality</span>{' '}
            Suggests moderate performance, with some user feedback indicating low engagement or minor complaints.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-red-700">Red: Low Quality</span>{' '}
            Indicates poor performance and high user dissatisfaction (spam-like behavior, frequent blocks).
          </p>
        </div>
      ) : null}
    </motion.div>
  );
}

export default function Channels({ hideHeader = false }: { hideHeader?: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const { bootstrap, businessProfile, refresh, refreshBusinessProfile } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedChannelId, setSelectedChannelId] = useState<ChannelId>('whatsapp');
  const [isWhatsAppDisconnecting, setIsWhatsAppDisconnecting] = useState(false);
  const [isInstagramConnecting, setIsInstagramConnecting] = useState(false);
  const [isInstagramDisconnecting, setIsInstagramDisconnecting] = useState(false);
  const [isSavingInstagramSelection, setIsSavingInstagramSelection] = useState(false);
  const [instagramSelection, setInstagramSelection] = useState<InstagramSelectionState | null>(null);
  const [isMessengerConnecting, setIsMessengerConnecting] = useState(false);
  const [isMessengerDisconnecting, setIsMessengerDisconnecting] = useState(false);
  const [isSavingMessengerSelection, setIsSavingMessengerSelection] = useState(false);
  const [messengerSelection, setMessengerSelection] = useState<MessengerSelectionState | null>(null);
  const [pendingConfirmationAction, setPendingConfirmationAction] =
    useState<ChannelConfirmationAction | null>(null);
  const [twoStepVerificationPin, setTwoStepVerificationPin] = useState('');
  const [twoStepVerificationDialogMode, setTwoStepVerificationDialogMode] = useState<
    'enable' | 'change' | null
  >(null);
  const [verificationCodeDialogMethod, setVerificationCodeDialogMethod] = useState<
    'SMS' | 'VOICE' | null
  >(null);
  const [verificationCodeLanguage, setVerificationCodeLanguage] = useState('en_US');
  const [isVerifyCodeDialogOpen, setIsVerifyCodeDialogOpen] = useState(false);
  const [verificationCodeValue, setVerificationCodeValue] = useState('');
  const [isSavingTwoStepVerification, setIsSavingTwoStepVerification] = useState(false);
  const [isRequestingVerificationCode, setIsRequestingVerificationCode] = useState(false);
  const [isVerifyingVerificationCode, setIsVerifyingVerificationCode] = useState(false);
  const [isWhatsAppWebhookUpdating, setIsWhatsAppWebhookUpdating] = useState(false);
  const [emailConnection, setEmailConnection] = useState<EmailConnectionSummary | null>(null);
  const [isEmailSetupOpen, setIsEmailSetupOpen] = useState(false);
  const [emailConnectionForm, setEmailConnectionForm] = useState<EmailConnectionFormState>(() =>
    buildEmailConnectionForm(null, bootstrap?.profile?.fullName || '', bootstrap?.profile?.email || ''),
  );
  const [emailVerification, setEmailVerification] = useState<EmailConnectionVerifyResponse | null>(null);
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);
  const [isEmailVerifying, setIsEmailVerifying] = useState(false);
  const [isEmailSaving, setIsEmailSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const whatsappChannel = bootstrap?.channel || null;
  const instagramChannel = bootstrap?.instagramChannel || null;
  const messengerChannel = bootstrap?.messengerChannel || null;
  const isWhatsAppConnected = Boolean(whatsappChannel);
  const isInstagramConnected = Boolean(instagramChannel);
  const isMessengerConnected = Boolean(messengerChannel);
  const emailConnectionFormIsComplete = useMemo(
    () =>
      Boolean(
        emailConnectionForm.displayName.trim() &&
          emailConnectionForm.emailAddress.trim() &&
          emailConnectionForm.authUser.trim() &&
          emailConnectionForm.password &&
          emailConnectionForm.smtpHost.trim() &&
          emailConnectionForm.smtpPort.trim() &&
          emailConnectionForm.imapHost.trim() &&
          emailConnectionForm.imapPort.trim(),
      ),
    [emailConnectionForm],
  );
  const activeBusinessProfile =
    businessProfile && whatsappChannel?.phoneNumberId === businessProfile.phoneNumberId
      ? businessProfile
      : null;
  const metadataDisplayNameState = getWhatsAppDisplayNameState(whatsappChannel);
  const displayNameRequest = activeBusinessProfile?.displayNameRequest || null;
  const displayNameRequestedName =
    displayNameRequest?.requestedName || metadataDisplayNameState.requestedName;
  const displayNameStatus =
    activeBusinessProfile?.displayNameStatus ||
    displayNameRequest?.status ||
    metadataDisplayNameState.status;
  const quality = getQualityMeta(whatsappChannel?.qualityRating || null);
  const messengerPermissionStatus = getMessengerPermissionStatus(messengerChannel?.pageTasks || []);
  const whatsappSenderRegistration = getWhatsAppSenderRegistrationState(whatsappChannel);
  const whatsappSenderRegistrationTimestamp = whatsappSenderRegistration?.registeredAt || null;
  const whatsappSenderDeregistrationTimestamp = whatsappSenderRegistration?.deregisteredAt || null;
  const displayNameRegistrationReference =
    metadataDisplayNameState.approvedAt ||
    metadataDisplayNameState.lastCheckedAt ||
    displayNameRequest?.requestedAt ||
    metadataDisplayNameState.requestedAt;
  const displayNameNeedsRegistration =
    Boolean(displayNameRequestedName) &&
    isApprovedDisplayNameStatus(displayNameStatus) &&
    (!whatsappSenderRegistrationTimestamp ||
      isTimestampBefore(whatsappSenderRegistrationTimestamp, displayNameRegistrationReference));
  const displayNameApproval = getDisplayNameApproval(
    whatsappChannel?.verifiedName || null,
    isWhatsAppConnected,
    displayNameStatus || null,
    displayNameNeedsRegistration,
  );
  const whatsappTwoStepVerification = getWhatsAppTwoStepVerificationState(whatsappChannel);
  const whatsappTwoStepVerificationEnabled =
    whatsappTwoStepVerification?.isEnabled || false;
  const whatsappTwoStepVerificationTimestamp =
    whatsappTwoStepVerification?.lastPinUpdatedAt ||
    whatsappTwoStepVerification?.enabledAt ||
    null;
  const whatsappTwoStepVerificationLiveCheckedAt =
    whatsappTwoStepVerification?.liveStatusCheckedAt || null;
  const whatsappWebhookSubscription = getWhatsAppWebhookSubscription(whatsappChannel);
  const whatsappVerificationCodeRequest = getWhatsAppVerificationCodeRequestState(whatsappChannel);
  const whatsappVerificationCodeVerified =
    Boolean(whatsappVerificationCodeRequest?.lastVerifiedAt) &&
    (!whatsappVerificationCodeRequest?.lastRequestedAt ||
      Date.parse(whatsappVerificationCodeRequest.lastVerifiedAt || '') >=
        Date.parse(whatsappVerificationCodeRequest.lastRequestedAt || ''));
  const whatsappTwoStepPhoneLabel =
    whatsappChannel?.displayPhoneNumber ||
    whatsappChannel?.phoneNumberId ||
    'this WhatsApp phone number';

  const channels = useMemo<ChannelListItem[]>(
    () => [
      {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        shortStatus: isWhatsAppConnected
          ? whatsappChannel?.displayPhoneNumber || 'Connected'
          : 'Not connected',
        connected: isWhatsAppConnected,
        icon: 'whatsapp',
        description: 'Manage the live WhatsApp Business account connected to this workspace.',
      },
      {
        id: 'instagram',
        name: 'Instagram',
        shortStatus: isInstagramConnected
          ? `@${instagramChannel?.instagramUsername || instagramChannel?.instagramAccountId}`
          : 'Not connected',
        connected: isInstagramConnected,
        icon: 'instagram',
        description: isInstagramConnected
          ? 'Instagram is connected through Instagram Login.'
          : 'Connect an Instagram Professional account through Instagram Login.',
      },
      {
        id: 'messenger',
        name: 'Facebook Messenger',
        shortStatus: isMessengerConnected
          ? messengerChannel?.pageName || messengerChannel?.pageId || 'Connected'
          : 'Not connected',
        connected: isMessengerConnected,
        icon: 'messenger',
        description: isMessengerConnected
          ? 'Messenger is connected to the selected Facebook Page and the Page token is stored on the server.'
          : 'Connect a Facebook Page through Meta Login so this workspace can start the Messenger Platform setup.',
      },
      {
        id: 'email',
        name: 'Email',
        shortStatus: emailConnection?.emailAddress || 'Not connected',
        connected: Boolean(emailConnection),
        icon: 'email',
        description: emailConnection
          ? 'Email provider is connected for campaigns, templates, and follow-up workflows.'
          : 'Connect an email provider to send campaigns, save templates, and manage email follow-ups.',
      },
    ],
    [
      emailConnection,
      instagramChannel,
      isInstagramConnected,
      isMessengerConnected,
      isWhatsAppConnected,
      messengerChannel,
      whatsappChannel,
    ],
  );

  const selectedChannel = channels.find((entry) => entry.id === selectedChannelId) || channels[0];
  const connectedChannelCount = channels.filter((channel) => channel.connected).length;
  const selectedConnectionStatusLabel = selectedChannel.connected ? 'Connected' : 'Not connected';

  const whatsappRows: StatusRow[] = [
    {
      label: 'Account Connection',
      account:
        whatsappChannel?.displayPhoneNumber ||
        whatsappChannel?.phoneNumberId ||
        'No WhatsApp number connected',
      detail: whatsappChannel?.businessAccountName
        ? `Business account: ${whatsappChannel.businessAccountName}`
        : 'Connect a real Meta WhatsApp account to load live channel details.',
      statusText: isWhatsAppConnected ? 'Connected' : 'Disconnected',
      statusTone: isWhatsAppConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'WhatsApp Display Name',
      account:
        displayNameNeedsRegistration && displayNameRequestedName
          ? displayNameRequestedName
          : whatsappChannel?.verifiedName || displayNameRequestedName || 'Display name not returned yet',
      detail: displayNameNeedsRegistration
        ? `Approved by Meta. The server will automatically register ${whatsappTwoStepPhoneLabel} again to apply this display name to Cloud API messaging.`
        : 'Shows approval status and the current display name returned by Meta.',
      statusText: displayNameApproval.label,
      statusTone: displayNameApproval.tone,
    },
    {
      label: 'Message Limit',
      account: whatsappChannel?.messagingLimitTier || 'Unknown',
      detail: 'Shows the current messaging tier for the connected WhatsApp account.',
      statusText: whatsappChannel?.messagingLimitTier || 'Unknown',
      statusTone: 'text-[#0f2e82] bg-[#eff5ff] border-[#cdddff]',
    },
  ];

  const qualityRows: StatusRow[] = [
    {
      label: 'Quality Rating',
      account: quality.label,
      detail: 'Current WhatsApp account quality rating returned by Meta.',
      statusText: quality.label,
      statusTone: quality.tone,
    },
  ];

  const instagramRows: StatusRow[] = isInstagramConnected
    ? [
        {
          label: 'Account Connection',
          account:
            instagramChannel?.instagramUsername
              ? `@${instagramChannel.instagramUsername}`
              : instagramChannel?.instagramAccountId || 'Instagram account connected',
          detail: instagramChannel?.instagramName
            ? `Display name: ${instagramChannel.instagramName}`
            : `Instagram account ID: ${instagramChannel?.instagramAccountId}`,
          statusText: 'Connected',
          statusTone: 'text-green-700 bg-green-50 border-green-200',
        },
        {
          label: 'Connection Method',
          account: 'Instagram Login',
          detail:
            'The workspace uses Instagram Login and an Instagram user token. A linked Facebook Page is not required.',
          statusText: 'Live',
          statusTone: 'text-pink-700 bg-pink-50 border-pink-200',
        },
        {
          label: 'Incoming DM Webhooks',
          account: instagramChannel?.webhookSubscribed
            ? 'Subscribed to Instagram message events.'
            : 'Webhook subscription has not been confirmed yet.',
          detail:
            instagramChannel?.webhookLastError ||
            (instagramChannel?.webhookFields?.length
              ? `Fields: ${instagramChannel.webhookFields.join(', ')}`
              : 'Reconnect the Instagram channel if DM webhook subscription needs to be refreshed.'),
          statusText: instagramChannel?.webhookSubscribed ? 'Subscribed' : 'Needs attention',
          statusTone: instagramChannel?.webhookSubscribed
            ? 'text-green-700 bg-green-50 border-green-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ]
    : [
        {
          label: 'Account Connection',
          account: 'Instagram is not connected to this workspace.',
          detail: 'Connect a Professional Instagram account with Instagram Login.',
          statusText: 'Not connected',
          statusTone: 'text-gray-700 bg-gray-50 border-gray-200',
        },
        {
          label: 'Connection Flow',
          account: hasInstagramBusinessLoginConfig
            ? 'Instagram Login is configured for this workspace.'
            : 'Instagram Login is not configured yet.',
          detail: hasInstagramBusinessLoginConfig
            ? 'The Connect button will open Instagram in a popup and return the Professional account.'
            : 'Add the Instagram App ID to enable this channel.',
          statusText: hasInstagramBusinessLoginConfig ? 'Ready' : 'Blocked',
          statusTone: hasInstagramBusinessLoginConfig
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ];

  const messengerRows: StatusRow[] = isMessengerConnected
    ? [
        {
          label: 'Page Connection',
          account: messengerChannel?.pageName || messengerChannel?.pageId || 'Facebook Page connected',
          detail: `Page ID: ${messengerChannel?.pageId}`,
          statusText: 'Connected',
          statusTone: 'text-green-700 bg-green-50 border-green-200',
        },
        {
          label: 'Page Tasks',
          account:
            messengerChannel?.pageTasks.length
              ? messengerChannel.pageTasks.join(', ')
              : 'Meta did not return Page task visibility.',
          detail: messengerPermissionStatus.detail,
          statusText: messengerPermissionStatus.label,
          statusTone: messengerPermissionStatus.tone,
        },
        {
          label: 'Webhook Subscription',
          account: messengerChannel?.webhookSubscribed
            ? messengerChannel.webhookFields.join(', ')
            : 'Messenger webhook subscription is not confirmed yet.',
          detail:
            messengerChannel?.webhookLastError ||
            'The Page is connected, but Meta did not confirm the Messenger webhook subscription.',
          statusText: messengerChannel?.webhookSubscribed ? 'Subscribed' : 'Needs attention',
          statusTone: messengerChannel?.webhookSubscribed
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ]
    : [
        {
          label: 'Page Connection',
          account: 'Messenger is not connected to this workspace.',
          detail: 'Connect a Facebook Page to start the Messenger Platform setup for this workspace.',
          statusText: 'Not connected',
          statusTone: 'text-gray-700 bg-gray-50 border-gray-200',
        },
        {
          label: 'Connection Flow',
          account: hasMessengerLoginConfig
            ? 'Meta Login is configured for Facebook Page selection.'
            : 'Messenger login is not configured yet.',
          detail: hasMessengerLoginConfig
            ? 'The Connect button will open Meta, return the Pages you can manage, and save the selected Page token on the server.'
            : 'Set VITE_META_APP_ID to enable the Messenger login flow.',
          statusText: hasMessengerLoginConfig ? 'Ready' : 'Blocked',
          statusTone: hasMessengerLoginConfig
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ];

  const emailRows: StatusRow[] = emailConnection
    ? [
        {
          label: 'Connection Status',
          account: emailConnection.emailAddress,
          detail: `Sender name: ${emailConnection.displayName || emailConnection.authUser}`,
          statusText: emailConnection.status === 'connected' ? 'Connected' : 'Needs attention',
          statusTone:
            emailConnection.status === 'connected'
              ? 'text-green-700 bg-green-50 border-green-200'
              : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
        {
          label: 'Provider Settings',
          account: `${emailConnection.smtpHost}:${emailConnection.smtpPort}`,
          detail: `IMAP: ${emailConnection.imapHost}:${emailConnection.imapPort}`,
          statusText: emailConnection.lastVerifiedAt ? 'Verified' : 'Pending verification',
          statusTone: emailConnection.lastVerifiedAt
            ? 'text-blue-700 bg-blue-50 border-blue-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200',
        },
      ]
    : [
        {
          label: 'Connection Status',
          account: 'Email provider is not connected to this workspace.',
          detail: 'Connect an SMTP/IMAP provider before sending email campaigns or using email templates.',
          statusText: 'Not connected',
          statusTone: 'text-gray-700 bg-gray-50 border-gray-200',
        },
      ];

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  useEscapeKey(Boolean(instagramSelection), () => setInstagramSelection(null));
  useEscapeKey(Boolean(messengerSelection), () => setMessengerSelection(null));

  useEffect(() => {
    const channelParam = searchParams.get('channel');
    const shouldOpenEmailSetup = searchParams.get('setup') === '1';

    if (channelParam === 'email' || shouldOpenEmailSetup) {
      setSelectedChannelId('email');
    }

    if (shouldOpenEmailSetup) {
      setIsEmailSetupOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadEmailConnection = async () => {
      try {
        const response = await appApi.getEmailConnection();

        if (!cancelled) {
          setEmailConnection(response.connection);
          setEmailConnectionForm(
            buildEmailConnectionForm(
              response.connection,
              bootstrap?.profile?.fullName || '',
              bootstrap?.profile?.email || '',
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setEmailConnection(null);
        }
      }
    };

    void loadEmailConnection();

    return () => {
      cancelled = true;
    };
  }, [bootstrap?.profile?.email, bootstrap?.profile?.fullName]);

  useEffect(() => {
    if (!isEmailSetupOpen) {
      return;
    }

    setEmailVerification(null);
    setEmailVerificationError(null);
    setIsEmailVerifying(false);
  }, [emailConnectionForm, isEmailSetupOpen]);

  const closeEmailSetupModal = () => {
    setIsEmailSetupOpen(false);
    setEmailVerificationError(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('setup');
      next.set('channel', 'email');
      return next;
    });
  };

  const openEmailSetupModal = () => {
    clearMessages();
    setSelectedChannelId('email');
    setEmailVerification(null);
    setEmailVerificationError(null);
    setEmailConnectionForm(
      buildEmailConnectionForm(emailConnection, bootstrap?.profile?.fullName || '', bootstrap?.profile?.email || ''),
    );
    setIsEmailSetupOpen(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('channel', 'email');
      next.set('setup', '1');
      return next;
    });
  };

  const handleSaveEmailConnection = async () => {
    try {
      setIsEmailSaving(true);
      clearMessages();
      const response = await appApi.saveEmailConnection(buildEmailConnectionPayload(emailConnectionForm));
      setEmailConnection(response.connection);
      setSuccess('Email account connected successfully.');
      closeEmailSetupModal();
    } catch (nextError) {
      setEmailVerificationError(nextError instanceof Error ? nextError.message : 'Failed to connect email.');
    } finally {
      setIsEmailSaving(false);
    }
  };

  const handleVerifyEmailConnection = async () => {
    if (!emailConnectionFormIsComplete) {
      setEmailVerification(null);
      setEmailVerificationError('Fill all email connection fields before verifying.');
      return;
    }

    try {
      setIsEmailVerifying(true);
      setEmailVerificationError(null);
      const response = await appApi.verifyEmailConnection(buildEmailConnectionPayload(emailConnectionForm));
      setEmailVerification(response);

      if (!response.canConnect) {
        setEmailVerificationError('Email verification needs attention. Review the SMTP and IMAP status details.');
      }
    } catch (nextError) {
      setEmailVerification(null);
      setEmailVerificationError(
        nextError instanceof Error ? nextError.message : 'Connection verification failed.',
      );
    } finally {
      setIsEmailVerifying(false);
    }
  };

  useEscapeKey(isEmailSetupOpen && !isEmailSaving, closeEmailSetupModal);

  const disconnectWhatsAppChannel = async () => {
    if (!whatsappChannel) {
      return;
    }

    try {
      setIsWhatsAppDisconnecting(true);
      clearMessages();
      await appApi.disconnectMetaChannel();
      await refresh();
      setSuccess('WhatsApp channel disconnected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to disconnect the WhatsApp channel.',
      );
    } finally {
      setIsWhatsAppDisconnecting(false);
      setPendingConfirmationAction(null);
    }
  };

  const handleDisconnectWhatsApp = () => {
    if (!whatsappChannel) {
      return;
    }

    setPendingConfirmationAction('disconnect-whatsapp');
  };

  const handleCheckWhatsAppWebhookSubscription = async () => {
    if (!whatsappChannel) {
      return;
    }

    try {
      setIsWhatsAppWebhookUpdating(true);
      clearMessages();
      await appApi.checkWhatsAppWebhookSubscription();
      await refresh();
      setSuccess('WhatsApp webhook subscription status refreshed.');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to refresh the WhatsApp webhook subscription.',
      );
    } finally {
      setIsWhatsAppWebhookUpdating(false);
    }
  };

  const handleSubscribeWhatsAppWebhook = async () => {
    if (!whatsappChannel) {
      return;
    }

    try {
      setIsWhatsAppWebhookUpdating(true);
      clearMessages();
      await appApi.subscribeWhatsAppWebhook();
      await refresh();
      setSuccess('WhatsApp webhook subscription activated.');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to activate the WhatsApp webhook subscription.',
      );
    } finally {
      setIsWhatsAppWebhookUpdating(false);
    }
  };

  const handleUnsubscribeWhatsAppWebhook = async () => {
    if (!whatsappChannel) {
      return;
    }

    try {
      setIsWhatsAppWebhookUpdating(true);
      clearMessages();
      await appApi.unsubscribeWhatsAppWebhook();
      await refresh();
      setSuccess('WhatsApp webhook subscription removed.');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to remove the WhatsApp webhook subscription.',
      );
    } finally {
      setIsWhatsAppWebhookUpdating(false);
      setPendingConfirmationAction(null);
    }
  };

  const handleConfirmUnsubscribeWhatsAppWebhook = () => {
    if (!whatsappChannel) {
      return;
    }

    setPendingConfirmationAction('unsubscribe-whatsapp-webhooks');
  };

  const handleInstagramConnect = async () => {
    try {
      setIsInstagramConnecting(true);
      clearMessages();
      const session = await beginInstagramBusinessLogin({ flowState: 'instagram_flow' });
      const token = await appApi.exchangeMetaOAuthCode({
        code: session.code,
        redirectUri: session.redirectUri,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });
      const instagramLongLivedToken = token.accessToken;
      const { accounts } = await appApi.getInstagramConnectionOptions({
        longLivedToken: instagramLongLivedToken,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });

      if (accounts.length === 1) {
        await appApi.connectInstagramBusinessLogin({
          longLivedToken: instagramLongLivedToken,
          pageId: accounts[0].pageId,
          flowState: session.flowState,
          oauthState: session.oauthState,
        });
        await refresh();
        setSuccess('Instagram channel connected.');
        setSelectedChannelId('instagram');
        return;
      }

      setInstagramSelection({
        accessToken: null,
        longLivedToken: instagramLongLivedToken,
        flowState: session.flowState,
        oauthState: session.oauthState,
        accounts,
      });
      setSelectedChannelId('instagram');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to connect the Instagram channel.',
      );
    } finally {
      setIsInstagramConnecting(false);
    }
  };

  const handleInstagramSelection = async (pageId: string) => {
    if (!instagramSelection) {
      return;
    }

    try {
      setIsSavingInstagramSelection(true);
      clearMessages();
      await appApi.connectInstagramBusinessLogin({
        ...(instagramSelection.longLivedToken
          ? {
              longLivedToken: instagramSelection.longLivedToken,
              flowState: instagramSelection.flowState || undefined,
              oauthState: instagramSelection.oauthState || undefined,
            }
          : {}),
        pageId,
        ...(!instagramSelection.longLivedToken && instagramSelection.accessToken
          ? {
              accessToken: instagramSelection.accessToken,
              flowState: instagramSelection.flowState || undefined,
              oauthState: instagramSelection.oauthState || undefined,
            }
          : {}),
        ...(!instagramSelection.longLivedToken && !instagramSelection.accessToken
          ? {
              flowState: instagramSelection.flowState || undefined,
              oauthState: instagramSelection.oauthState || undefined,
            }
          : {}),
      });
      await refresh();
      setInstagramSelection(null);
      setSuccess('Instagram channel connected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to save the Instagram channel.',
      );
    } finally {
      setIsSavingInstagramSelection(false);
    }
  };

  const disconnectInstagramChannel = async () => {
    if (!instagramChannel) {
      return;
    }

    try {
      setIsInstagramDisconnecting(true);
      clearMessages();
      await appApi.disconnectInstagramChannel();
      await refresh();
      setSuccess('Instagram channel disconnected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to disconnect the Instagram channel.',
      );
    } finally {
      setIsInstagramDisconnecting(false);
      setPendingConfirmationAction(null);
    }
  };

  const handleDisconnectInstagram = () => {
    if (!instagramChannel) {
      return;
    }

    setPendingConfirmationAction('disconnect-instagram');
  };

  const openTwoStepVerificationDialog = (mode: 'enable' | 'change') => {
    if (!whatsappChannel) {
      return;
    }

    clearMessages();
    setTwoStepVerificationPin('');
    setTwoStepVerificationDialogMode(mode);
  };

  const closeTwoStepVerificationDialog = () => {
    if (isSavingTwoStepVerification) {
      return;
    }

    setTwoStepVerificationDialogMode(null);
    setTwoStepVerificationPin('');
  };

  const openVerificationCodeDialog = (method: 'SMS' | 'VOICE') => {
    if (!whatsappChannel) {
      return;
    }

    clearMessages();
    setVerificationCodeDialogMethod(method);
    setVerificationCodeLanguage(
      whatsappVerificationCodeRequest?.language || verificationCodeLanguage || 'en_US',
    );
  };

  const closeVerificationCodeDialog = () => {
    if (isRequestingVerificationCode) {
      return;
    }

    setVerificationCodeDialogMethod(null);
  };

  const openVerifyCodeDialog = () => {
    if (!whatsappChannel) {
      return;
    }

    clearMessages();
    setVerificationCodeValue('');
    setIsVerifyCodeDialogOpen(true);
  };

  const closeVerifyCodeDialog = () => {
    if (isVerifyingVerificationCode) {
      return;
    }

    setIsVerifyCodeDialogOpen(false);
    setVerificationCodeValue('');
  };

  const handleRequestVerificationCode = async () => {
    if (!whatsappChannel || !verificationCodeDialogMethod) {
      return;
    }

    const normalizedLanguage = verificationCodeLanguage.trim();

    if (!normalizedLanguage) {
      setError('Enter the language locale Meta should use for the verification message.');
      setSuccess(null);
      return;
    }

    try {
      setIsRequestingVerificationCode(true);
      clearMessages();
      await appApi.requestMetaVerificationCode({
        codeMethod: verificationCodeDialogMethod,
        language: normalizedLanguage,
      });
      await refresh();
      setVerificationCodeDialogMethod(null);
      setSuccess(
        `Verification code requested by ${
          verificationCodeDialogMethod === 'SMS' ? 'SMS' : 'voice'
        } for ${whatsappTwoStepPhoneLabel}. Complete the remaining Meta verification step after the code arrives.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to request the WhatsApp verification code.',
      );
    } finally {
      setIsRequestingVerificationCode(false);
    }
  };

  const handleVerifyVerificationCode = async () => {
    if (!whatsappChannel) {
      return;
    }

    const normalizedCode = verificationCodeValue.trim();

    if (!/^\d{4,10}$/.test(normalizedCode)) {
      setError('Enter the numeric verification code Meta sent to this phone number.');
      setSuccess(null);
      return;
    }

    try {
      setIsVerifyingVerificationCode(true);
      clearMessages();
      await appApi.verifyMetaVerificationCode({
        code: normalizedCode,
      });
      await refresh();
      setIsVerifyCodeDialogOpen(false);
      setVerificationCodeValue('');
      setSuccess(
        `Phone verification completed for ${whatsappTwoStepPhoneLabel}. You can continue with sender setup if Meta still requires it.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to verify the WhatsApp phone number code.',
      );
    } finally {
      setIsVerifyingVerificationCode(false);
    }
  };

  const handleSaveTwoStepVerification = async () => {
    if (!whatsappChannel || !twoStepVerificationDialogMode) {
      return;
    }

    const normalizedPin = twoStepVerificationPin.trim();

    if (!/^\d{6}$/.test(normalizedPin)) {
      setError('Enter the 6-digit PIN Meta should use for WhatsApp two-step verification.');
      setSuccess(null);
      return;
    }

    try {
      setIsSavingTwoStepVerification(true);
      clearMessages();
      if (twoStepVerificationDialogMode === 'change') {
        await appApi.updateMetaTwoStepVerification({ pin: normalizedPin });
      } else {
        await appApi.registerMetaSender({ pin: normalizedPin });
      }
      await refresh();
      await refreshBusinessProfile({ silent: true });
      setTwoStepVerificationDialogMode(null);
      setTwoStepVerificationPin('');
      setSuccess(
        twoStepVerificationDialogMode === 'change'
          ? 'Two-step verification PIN updated.'
          : 'Two-step verification enabled and WhatsApp sender registration completed.',
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : twoStepVerificationDialogMode === 'change'
            ? 'Failed to update the two-step verification PIN.'
            : 'Failed to enable two-step verification for this WhatsApp sender.',
      );
    } finally {
      setIsSavingTwoStepVerification(false);
    }
  };

  const handleTurnOffTwoStepVerification = () => {
    if (!whatsappChannel) {
      return;
    }

    clearMessages();
    setPendingConfirmationAction('turn-off-whatsapp-two-step');
  };

  const handleMessengerConnect = async () => {
    try {
      setIsMessengerConnecting(true);
      clearMessages();
      const session = await beginMessengerPageLogin({ flowState: 'messenger_flow' });
      const token = await appApi.exchangeMetaOAuthCode({
        code: session.code,
        redirectUri: session.redirectUri,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });
      const { pages } = await appApi.getMessengerConnectionOptions({
        accessToken: token.accessToken,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });

      if (pages.length === 1) {
        await appApi.connectMessengerPageLogin({
          accessToken: token.accessToken,
          pageId: pages[0].pageId,
          flowState: session.flowState,
          oauthState: session.oauthState,
        });
        await refresh();
        setSuccess('Messenger channel connected.');
        setSelectedChannelId('messenger');
        return;
      }

      setMessengerSelection({
        accessToken: token.accessToken,
        flowState: session.flowState,
        oauthState: session.oauthState,
        pages,
      });
      setSelectedChannelId('messenger');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to connect the Messenger channel.',
      );
    } finally {
      setIsMessengerConnecting(false);
    }
  };

  const handleMessengerSelection = async (pageId: string) => {
    if (!messengerSelection) {
      return;
    }

    try {
      setIsSavingMessengerSelection(true);
      clearMessages();
      await appApi.connectMessengerPageLogin({
        ...(messengerSelection.accessToken
          ? {
              accessToken: messengerSelection.accessToken,
              flowState: messengerSelection.flowState || undefined,
              oauthState: messengerSelection.oauthState || undefined,
            }
          : {}),
        pageId,
        ...(!messengerSelection.accessToken
          ? {
              flowState: messengerSelection.flowState || undefined,
              oauthState: messengerSelection.oauthState || undefined,
            }
          : {}),
      });
      await refresh();
      setMessengerSelection(null);
      setSuccess('Messenger channel connected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to save the Messenger channel.',
      );
    } finally {
      setIsSavingMessengerSelection(false);
    }
  };

  const disconnectMessengerChannel = async () => {
    if (!messengerChannel) {
      return;
    }

    try {
      setIsMessengerDisconnecting(true);
      clearMessages();
      await appApi.disconnectMessengerChannel();
      await refresh();
      setSuccess('Messenger channel disconnected.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to disconnect the Messenger channel.',
      );
    } finally {
      setIsMessengerDisconnecting(false);
      setPendingConfirmationAction(null);
    }
  };

  const handleDisconnectMessenger = () => {
    if (!messengerChannel) {
      return;
    }

    setPendingConfirmationAction('disconnect-messenger');
  };

  const pendingConfirmationIsLoading =
    (pendingConfirmationAction === 'disconnect-whatsapp' && isWhatsAppDisconnecting) ||
    (pendingConfirmationAction === 'disconnect-instagram' && isInstagramDisconnecting) ||
    (pendingConfirmationAction === 'disconnect-messenger' && isMessengerDisconnecting) ||
    (pendingConfirmationAction === 'unsubscribe-whatsapp-webhooks' && isWhatsAppWebhookUpdating);

  const confirmationDialogContent =
    pendingConfirmationAction === 'disconnect-whatsapp'
      ? {
          title: 'Disconnect WhatsApp channel?',
          description: whatsappChannel?.displayPhoneNumber
            ? `This will disconnect ${whatsappChannel.displayPhoneNumber} from this workspace.`
            : 'This will disconnect the current WhatsApp channel from this workspace.',
          confirmLabel: 'Disconnect channel',
          tone: 'danger' as const,
        }
      : pendingConfirmationAction === 'disconnect-instagram'
        ? {
            title: 'Disconnect Instagram channel?',
            description: instagramChannel?.instagramUsername
              ? `This will disconnect @${instagramChannel.instagramUsername} from this workspace.`
              : 'This will disconnect the current Instagram channel from this workspace.',
            confirmLabel: 'Disconnect channel',
            tone: 'danger' as const,
          }
        : pendingConfirmationAction === 'disconnect-messenger'
          ? {
              title: 'Disconnect Messenger channel?',
              description: messengerChannel?.pageName
                ? `This will disconnect ${messengerChannel.pageName} from this workspace.`
                : 'This will disconnect the current Messenger channel from this workspace.',
              confirmLabel: 'Disconnect channel',
              tone: 'danger' as const,
            }
          : pendingConfirmationAction === 'turn-off-whatsapp-two-step'
            ? {
                title: 'Turn off two-step verification?',
                description: `Meta handles this flow in WhatsApp Manager. Follow the instructions in the email sent to your Meta business account email to turn off two-step verification for ${whatsappTwoStepPhoneLabel}.`,
                confirmLabel: 'Open WhatsApp Manager',
                tone: 'default' as const,
              }
            : pendingConfirmationAction === 'unsubscribe-whatsapp-webhooks'
              ? {
                  title: 'Unsubscribe WhatsApp webhooks?',
                  description:
                    'This will stop incoming WhatsApp webhook deliveries for this WABA until webhooks are activated again.',
                  confirmLabel: 'Unsubscribe webhooks',
                  tone: 'danger' as const,
                }
              : null;

  const handleConfirmPendingAction = () => {
    if (pendingConfirmationAction === 'disconnect-whatsapp') {
      void disconnectWhatsAppChannel();
      return;
    }

    if (pendingConfirmationAction === 'disconnect-instagram') {
      void disconnectInstagramChannel();
      return;
    }

    if (pendingConfirmationAction === 'disconnect-messenger') {
      void disconnectMessengerChannel();
      return;
    }

    if (pendingConfirmationAction === 'turn-off-whatsapp-two-step') {
      setPendingConfirmationAction(null);
      window.open(
        'https://business.facebook.com/settings/whatsapp-business-accounts/',
        '_blank',
        'noopener,noreferrer',
      );
    }

    if (pendingConfirmationAction === 'unsubscribe-whatsapp-webhooks') {
      void handleUnsubscribeWhatsAppWebhook();
    }
  };

  const renderPrimaryAction = () => {
    if (selectedChannel.id === 'whatsapp') {
      return isWhatsAppConnected ? (
        <>
          <Link
            to="/dashboard/profile"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2364ff]/20 bg-[#eff3ff] px-3 py-2 text-xs font-semibold text-[#1d54d9] transition duration-200 hover:-translate-y-px hover:bg-[#e3ebff] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Edit Business Profile
          </Link>
          <button
            type="button"
            onClick={() => void handleDisconnectWhatsApp()}
            disabled={isWhatsAppDisconnecting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition duration-200 hover:-translate-y-px hover:bg-red-100 active:scale-[0.97] disabled:opacity-60 sm:w-auto"
          >
            <Power className="h-3.5 w-3.5" />
            {isWhatsAppDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </>
      ) : (
        <Link
          to="/onboarding/channel-connection"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <Link2 className="h-4 w-4" />
          Connect
        </Link>
      );
    }

    if (selectedChannel.id === 'instagram') {
      return isInstagramConnected ? (
        <button
          type="button"
          onClick={() => void handleDisconnectInstagram()}
          disabled={isInstagramDisconnecting}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition duration-200 hover:-translate-y-px hover:bg-red-100 active:scale-[0.97] disabled:opacity-60 sm:w-auto"
        >
          <Power className="h-3.5 w-3.5" />
          {isInstagramDisconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleInstagramConnect()}
          disabled={isInstagramConnecting || !hasInstagramBusinessLoginConfig}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isInstagramConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {hasInstagramBusinessLoginConfig ? 'Connect' : 'Instagram login not configured'}
        </button>
      );
    }

    if (selectedChannel.id === 'email') {
      return emailConnection ? null : (
        <button
          type="button"
          onClick={openEmailSetupModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <Link2 className="h-4 w-4" />
          Connect provider
        </button>
      );
    }

    return isMessengerConnected ? (
      <button
        type="button"
        onClick={() => void handleDisconnectMessenger()}
        disabled={isMessengerDisconnecting}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition duration-200 hover:-translate-y-px hover:bg-red-100 active:scale-[0.97] disabled:opacity-60 sm:w-auto"
      >
        <Power className="h-3.5 w-3.5" />
        {isMessengerDisconnecting ? 'Disconnecting...' : 'Disconnect'}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => void handleMessengerConnect()}
        disabled={isMessengerConnecting || !hasMessengerLoginConfig}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isMessengerConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        {hasMessengerLoginConfig ? 'Connect' : 'Messenger login not configured'}
      </button>
    );
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      variants={staggerContainer}
      className="mx-auto max-w-7xl space-y-6"
    >
      {!hideHeader ? (
        <motion.div variants={slideUp} className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Channels</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              Manage WhatsApp Business, Instagram Messaging, and Facebook Messenger from one structured workspace.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-100">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {connectedChannelCount} of {channels.length} connected
          </div>
        </motion.div>
      ) : null}

      <FeedbackPopupStack
        items={[
          ...(error ? [{ id: 'channels-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []),
          ...(success ? [{ id: 'channels-success', tone: 'success' as const, message: success, onDismiss: () => setSuccess(null) }] : []),
        ]}
      />

      <motion.div variants={staggerContainer} className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <motion.aside
          variants={slideUp}
          className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
        >
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Connected channels</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">Select a channel to review setup, health, and actions.</p>
          </div>
          <div className="space-y-1 p-3">
            {channels.map((item) => (
              <div key={item.id}>
                <ChannelListButton
                  item={item}
                  isActive={item.id === selectedChannel.id}
                  reduceMotion={Boolean(shouldReduceMotion)}
                  onClick={() => setSelectedChannelId(item.id)}
                />
              </div>
            ))}
          </div>
        </motion.aside>

        <motion.section
          key={selectedChannel.id}
          initial={shouldReduceMotion ? false : 'hidden'}
          animate="visible"
          variants={staggerContainer}
          className="space-y-6"
        >
          <motion.div variants={slideUp} className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <ChannelListIcon icon={selectedChannel.icon} className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">{selectedChannel.name}</h2>
                    {selectedChannel.connected ? (
                      <MetaVerifiedIcon className="h-5 w-5 shrink-0" alt="Connected via Meta" />
                    ) : null}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{selectedChannel.description}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:items-end">
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <span className="mr-2 text-gray-400">Connection Status</span>
                  <span className={selectedChannel.connected ? 'text-emerald-700' : 'text-gray-500'}>
                    {selectedConnectionStatusLabel}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  {renderPrimaryAction()}
                </div>
              </div>
            </div>
          </motion.div>

          {selectedChannel.id === 'whatsapp' ? (
            <>
              <StatusTable rows={whatsappRows} reduceMotion={Boolean(shouldReduceMotion)} />
              <StatusTable rows={qualityRows} isQualityTable reduceMotion={Boolean(shouldReduceMotion)} />
              {isWhatsAppConnected ? (
                <motion.div variants={slideUp} className="space-y-6">
                  <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm">
                    <div className="flex flex-col gap-5">
                      <div className="max-w-4xl">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <h3 className="text-base font-semibold text-gray-900">Two-step verification</h3>
                          <span
                            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                              whatsappTwoStepVerificationEnabled
                                ? 'bg-green-50 text-green-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                whatsappTwoStepVerificationEnabled ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                            />
                            {whatsappTwoStepVerificationEnabled ? 'Enabled' : 'Not enabled'}
                          </span>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-gray-600">
                          Any attempt to register your phone number on WhatsApp must be accompanied by the six-digit PIN that you created.
                          If you forget or misplace your PIN, you can turn off two-step verification or change your PIN.
                        </p>

                        {whatsappTwoStepVerificationTimestamp ? (
                          <p className="mt-3 text-xs leading-5 text-gray-500">
                            {whatsappTwoStepVerificationEnabled ? 'Last updated' : 'Last known PIN update'} on{' '}
                            {new Date(whatsappTwoStepVerificationTimestamp).toLocaleString()}.
                          </p>
                        ) : (
                          <p className="mt-3 text-xs leading-5 text-gray-500">
                            Set a 6-digit PIN here if Meta asks you to complete sender registration before messages can flow.
                          </p>
                        )}
                        {whatsappTwoStepVerificationLiveCheckedAt ? (
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            Live status checked from Meta on{' '}
                            {new Date(whatsappTwoStepVerificationLiveCheckedAt).toLocaleString()}.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {whatsappTwoStepVerificationEnabled ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleTurnOffTwoStepVerification()}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-800 transition duration-200 hover:-translate-y-px hover:bg-gray-50 active:scale-[0.97]"
                            >
                              Turn off two-step verification
                            </button>
                            <button
                              type="button"
                              onClick={() => openTwoStepVerificationDialog('change')}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2364ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
                            >
                              Change PIN
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openTwoStepVerificationDialog('enable')}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#2364ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97] disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Enable two-step verification
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </>
          ) : null}

          {selectedChannel.id === 'instagram' ? (
            <>
              <StatusTable rows={instagramRows} reduceMotion={Boolean(shouldReduceMotion)} />
              {isInstagramConnected ? (
                <motion.div variants={slideUp} className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Instagram DM flow</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Incoming DMs are routed into Inbox and text replies are sent from the connected Instagram account.
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </>
          ) : null}
          {selectedChannel.id === 'messenger' ? (
            <StatusTable rows={messengerRows} reduceMotion={Boolean(shouldReduceMotion)} />
          ) : null}

          {selectedChannel.id === 'messenger' ? (
            <motion.div
              variants={slideUp}
              className="rounded-3xl border border-dashed border-gray-200 bg-white px-5 py-4 text-sm leading-6 text-gray-500"
            >
              Messenger connection is wired for Facebook Page selection, Page token storage, webhook subscription,
              Inbox ingestion, and text replies.
            </motion.div>
          ) : null}

          {selectedChannel.id === 'email' ? (
            <StatusTable rows={emailRows} reduceMotion={Boolean(shouldReduceMotion)} />
          ) : null}
        </motion.section>
      </motion.div>

      <PinDialog
        isOpen={Boolean(twoStepVerificationDialogMode)}
        title={
          twoStepVerificationDialogMode === 'change'
            ? 'Change two-step verification PIN'
            : 'Set up two-step verification'
        }
        description={
          twoStepVerificationDialogMode === 'change'
            ? `Enter a new 6-digit PIN for ${whatsappTwoStepPhoneLabel}.`
            : `Create the 6-digit PIN Meta should use when registering ${whatsappTwoStepPhoneLabel} for WhatsApp messaging.`
        }
        submitLabel={
          isSavingTwoStepVerification
            ? twoStepVerificationDialogMode === 'change'
              ? 'Saving...'
              : 'Enabling...'
            : twoStepVerificationDialogMode === 'change'
              ? 'Change PIN'
              : 'Enable verification'
        }
        value={twoStepVerificationPin}
        isSubmitting={isSavingTwoStepVerification}
        onChange={setTwoStepVerificationPin}
        onClose={closeTwoStepVerificationDialog}
        onSubmit={() => void handleSaveTwoStepVerification()}
      />
      <VerificationCodeDialog
        isOpen={Boolean(verificationCodeDialogMethod)}
        method={verificationCodeDialogMethod}
        language={verificationCodeLanguage}
        isSubmitting={isRequestingVerificationCode}
        onChangeLanguage={setVerificationCodeLanguage}
        onClose={closeVerificationCodeDialog}
        onSubmit={() => void handleRequestVerificationCode()}
      />
      <VerifyCodeDialog
        isOpen={isVerifyCodeDialogOpen}
        value={verificationCodeValue}
        isSubmitting={isVerifyingVerificationCode}
        onChange={setVerificationCodeValue}
        onClose={closeVerifyCodeDialog}
        onSubmit={() => void handleVerifyVerificationCode()}
      />

      {instagramSelection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Choose Instagram account</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Meta returned multiple Instagram/Page pairs. Select the one you want to connect to this workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInstagramSelection(null)}
                disabled={isSavingInstagramSelection}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {instagramSelection.accounts.map((account) => (
                <button
                  key={account.pageId}
                  type="button"
                  onClick={() => void handleInstagramSelection(account.pageId)}
                  disabled={isSavingInstagramSelection}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-[#2364ff] hover:bg-[#f7faff] disabled:opacity-60"
                >
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {account.instagramUsername
                        ? `@${account.instagramUsername}`
                        : account.instagramName || account.instagramAccountId}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Instagram ID {account.instagramAccountId}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2364ff]">
                    {isSavingInstagramSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Connect
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {messengerSelection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Choose Facebook Page</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Meta returned multiple Pages. Select the Facebook Page you want to connect to Messenger in this workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMessengerSelection(null)}
                disabled={isSavingMessengerSelection}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {messengerSelection.pages.map((page) => (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => void handleMessengerSelection(page.pageId)}
                  disabled={isSavingMessengerSelection}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-[#2364ff] hover:bg-[#f7faff] disabled:opacity-60"
                >
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {page.pageName || page.pageId}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Page ID {page.pageId}
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                      {page.pageTasks.length
                        ? `Tasks ${page.pageTasks.join(', ')}`
                        : 'Task visibility unavailable'}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2364ff]">
                    {isSavingMessengerSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Connect
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {typeof document !== 'undefined' ? createPortal(
      <AnimatePresence>
        {isEmailSetupOpen ? (
          <div className="fixed inset-0 z-[130] overflow-y-auto">
            <motion.button
              type="button"
              aria-label="Close email connection setup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={isEmailSaving ? undefined : closeEmailSetupModal}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
            />

            <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Email channel</p>
                  <h2 className="mt-1 text-xl font-bold text-gray-900">Connect Email Account</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Set up SMTP and IMAP credentials so Connektly can verify the mailbox and load email inbox messages.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEmailSetupModal}
                  disabled={isEmailSaving}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close email connection setup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Display Name</span>
                          <input
                            type="text"
                            value={emailConnectionForm.displayName}
                            onChange={(event) => setEmailConnectionForm((current) => ({ ...current, displayName: event.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Email Address</span>
                          <input
                            type="email"
                            value={emailConnectionForm.emailAddress}
                            onChange={(event) => setEmailConnectionForm((current) => ({ ...current, emailAddress: event.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">SMTP / IMAP Username</span>
                          <input
                            type="text"
                            value={emailConnectionForm.authUser}
                            onChange={(event) => setEmailConnectionForm((current) => ({ ...current, authUser: event.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Password</span>
                          <input
                            type="password"
                            value={emailConnectionForm.password}
                            onChange={(event) => setEmailConnectionForm((current) => ({ ...current, password: event.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">SMTP</p>
                          <h3 className="mt-1 text-lg font-bold text-gray-900">Outgoing mail</h3>
                        </div>
                        <div className="space-y-4">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">SMTP Host</span>
                            <input
                              type="text"
                              value={emailConnectionForm.smtpHost}
                              onChange={(event) => setEmailConnectionForm((current) => ({ ...current, smtpHost: event.target.value }))}
                              placeholder="smtp.example.com"
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-gray-700">Port</span>
                              <input
                                type="number"
                                value={emailConnectionForm.smtpPort}
                                onChange={(event) => {
                                  const smtpPort = event.target.value;
                                  setEmailConnectionForm((current) => ({
                                    ...current,
                                    smtpPort,
                                    smtpSecure: getDefaultEmailSecureForPort(smtpPort, 'smtp'),
                                  }));
                                }}
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                              />
                            </label>
                            <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={emailConnectionForm.smtpSecure}
                                onChange={(event) => setEmailConnectionForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                              />
                              Secure
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">IMAP</p>
                          <h3 className="mt-1 text-lg font-bold text-gray-900">Incoming mail</h3>
                        </div>
                        <div className="space-y-4">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">IMAP Host</span>
                            <input
                              type="text"
                              value={emailConnectionForm.imapHost}
                              onChange={(event) => setEmailConnectionForm((current) => ({ ...current, imapHost: event.target.value }))}
                              placeholder="imap.example.com"
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-gray-700">Port</span>
                              <input
                                type="number"
                                value={emailConnectionForm.imapPort}
                                onChange={(event) => {
                                  const imapPort = event.target.value;
                                  setEmailConnectionForm((current) => ({
                                    ...current,
                                    imapPort,
                                    imapSecure: getDefaultEmailSecureForPort(imapPort, 'imap'),
                                  }));
                                }}
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                              />
                            </label>
                            <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={emailConnectionForm.imapSecure}
                                onChange={(event) => setEmailConnectionForm((current) => ({ ...current, imapSecure: event.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                              />
                              Secure
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {emailVerificationError ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {emailVerificationError}
                      </div>
                    ) : null}
                  </div>

                  <aside className="space-y-4">
                    <EmailVerificationCard
                      label="SMTP status"
                      result={emailVerification?.smtp || null}
                      isLoading={isEmailVerifying}
                    />
                    <EmailVerificationCard
                      label="IMAP status"
                      result={emailVerification?.imap || null}
                      isLoading={isEmailVerifying}
                    />
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                        <Mail className="h-4 w-4" />
                        Setup flow
                      </div>
                      <p className="mt-3 text-sm leading-6 text-blue-900/75">
                        Fill the form, verify SMTP and IMAP, then save once both checks are ready.
                      </p>
                    </div>
                  </aside>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={closeEmailSetupModal}
                  disabled={isEmailSaving}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerifyEmailConnection()}
                  disabled={!emailConnectionFormIsComplete || isEmailVerifying || isEmailSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isEmailVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Verify Connection
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEmailConnection()}
                  disabled={!emailVerification?.canConnect || isEmailSaving || isEmailVerifying}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5b45ff] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isEmailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  Connect Email Account
                </button>
              </div>
            </motion.div>
            </div>
          </div>
        ) : null}
      </AnimatePresence>,
      document.body,
      ) : null}

      <ConfirmationDialog
        isOpen={Boolean(confirmationDialogContent)}
        title={confirmationDialogContent?.title || ''}
        description={confirmationDialogContent?.description || ''}
        confirmLabel={confirmationDialogContent?.confirmLabel || 'Confirm'}
        tone={confirmationDialogContent?.tone || 'danger'}
        isLoading={pendingConfirmationIsLoading}
        onClose={() => setPendingConfirmationAction(null)}
        onConfirm={handleConfirmPendingAction}
      />
    </motion.div>
  );
}
