import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Clock,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { appApi } from '../../lib/api';
import {
  canRequestCallPermissionFromResponse,
  canStartCallFromPermissionResponse,
  getCallPermissionUnavailableMessage,
} from '../../lib/call-permissions';
import { useAppData } from '../../context/AppDataContext';
import { useCallManager } from '../../context/CallManagerContext';
import { normalizeContactIdentity } from '../../lib/phone';
import { useEscapeKey } from '../../lib/useEscapeKey';
import FeedbackPopupStack from '../../components/FeedbackPopupStack';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import type {
  ConversationThread,
  WhatsAppCallHolidaySchedule,
  WhatsAppCallHoursWindow,
  WhatsAppCallSessionRecord,
  WhatsAppCallSettings,
  WhatsAppCallSettingsUpdateInput,
  WhatsAppCallState,
} from '../../lib/types';

const CALL_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

type CallSettingsDraft = {
  status: 'enabled' | 'disabled';
  callIconVisibility: 'visible' | 'hidden';
  callbackPermissionStatus: 'enabled' | 'disabled';
  callHours: {
    status: 'enabled' | 'disabled';
    timezoneId: string;
    weeklyOperatingHours: WhatsAppCallHoursWindow[];
    holidaySchedule: WhatsAppCallHolidaySchedule[];
  };
};

function isEnabledStatus(value: string | null | undefined) {
  return String(value || '').toLowerCase() === 'enabled';
}

function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

function formatTimeInput(value: string | null | undefined, fallback: string) {
  const normalized = String(value || '').replace(':', '');

  if (/^\d{4}$/.test(normalized)) {
    return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
  }

  return fallback;
}

function toMetaTime(value: string) {
  return value.replace(':', '');
}

function buildDefaultWeeklyHours(): WhatsAppCallHoursWindow[] {
  return CALL_DAYS.slice(0, 5).map((dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
  }));
}

function createDefaultCallSettingsDraft(): CallSettingsDraft {
  return {
    status: 'disabled',
    callIconVisibility: 'hidden',
    callbackPermissionStatus: 'disabled',
    callHours: {
      status: 'disabled',
      timezoneId: getLocalTimezone(),
      weeklyOperatingHours: buildDefaultWeeklyHours(),
      holidaySchedule: [],
    },
  };
}

function createCallSettingsDraft(settings: WhatsAppCallSettings | null): CallSettingsDraft {
  if (!settings) {
    return createDefaultCallSettingsDraft();
  }

  const callHours = settings.callHours;
  const weeklyOperatingHours =
    callHours?.weeklyOperatingHours && callHours.weeklyOperatingHours.length > 0
      ? callHours.weeklyOperatingHours.map((entry) => ({
          dayOfWeek: entry.dayOfWeek.toUpperCase(),
          openTime: formatTimeInput(entry.openTime, '09:00'),
          closeTime: formatTimeInput(entry.closeTime, '18:00'),
        }))
      : buildDefaultWeeklyHours();

  return {
    status: isEnabledStatus(settings.status) ? 'enabled' : 'disabled',
    callIconVisibility: String(settings.callIconVisibility || '').toLowerCase() === 'hidden' ? 'hidden' : 'visible',
    callbackPermissionStatus: isEnabledStatus(settings.callbackPermissionStatus) ? 'enabled' : 'disabled',
    callHours: {
      status: isEnabledStatus(callHours?.status) ? 'enabled' : 'disabled',
      timezoneId: callHours?.timezoneId || getLocalTimezone(),
      weeklyOperatingHours,
      holidaySchedule:
        callHours?.holidaySchedule.map((entry) => ({
          date: entry.date,
          startTime: formatTimeInput(entry.startTime, '00:00'),
          endTime: formatTimeInput(entry.endTime, '23:59'),
        })) || [],
    },
  };
}

function buildCallSettingsPayload(draft: CallSettingsDraft): WhatsAppCallSettingsUpdateInput {
  return {
    status: draft.status,
    callIconVisibility: draft.callIconVisibility,
    callbackPermissionStatus: draft.callbackPermissionStatus,
    callHours: {
      status: draft.callHours.status,
      timezoneId: draft.callHours.timezoneId,
      weeklyOperatingHours: draft.callHours.weeklyOperatingHours.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        openTime: toMetaTime(entry.openTime),
        closeTime: toMetaTime(entry.closeTime),
      })),
      holidaySchedule: draft.callHours.holidaySchedule
        .filter((entry) => entry.date)
        .map((entry) => ({
          date: entry.date,
          startTime: toMetaTime(entry.startTime),
          endTime: toMetaTime(entry.endTime),
        })),
    },
  };
}

function buildContactLabel(thread: ConversationThread) {
  const primary = thread.contactName || thread.displayPhone || thread.contactWaId;
  const secondaryCandidate =
    thread.displayPhone && thread.displayPhone !== primary ? thread.displayPhone : thread.contactWaId;
  const primaryIdentity = normalizeContactIdentity(primary);
  const secondaryIdentity = normalizeContactIdentity(secondaryCandidate);
  const secondary =
    secondaryCandidate && primaryIdentity && secondaryIdentity && primaryIdentity === secondaryIdentity
      ? null
      : secondaryCandidate;

  return secondary ? `${primary} | ${secondary}` : primary;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getCallStateMeta(state: WhatsAppCallState) {
  switch (state) {
    case 'incoming':
      return {
        label: 'Incoming',
        className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'dialing':
      return {
        label: 'Dialing',
        className: 'border border-violet-200 bg-violet-50 text-violet-700',
      };
    case 'ringing':
      return {
        label: 'Ringing',
        className: 'border border-blue-200 bg-blue-50 text-blue-700',
      };
    case 'connecting':
      return {
        label: 'Connecting',
        className: 'border border-sky-200 bg-sky-50 text-sky-700',
      };
    case 'ongoing':
      return {
        label: 'Ongoing',
        className: 'border border-green-200 bg-green-50 text-green-700',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'border border-red-200 bg-red-50 text-red-700',
      };
    case 'missed':
      return {
        label: 'Missed',
        className: 'border border-rose-200 bg-rose-50 text-rose-700',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'border border-orange-200 bg-orange-50 text-orange-700',
      };
    case 'ended':
      return {
        label: 'Ended',
        className: 'border border-slate-200 bg-slate-100 text-slate-700',
      };
    case 'ending':
      return {
        label: 'Ending',
        className: 'border border-slate-200 bg-slate-50 text-slate-700',
      };
    default:
      return {
        label: state,
        className: 'border border-slate-200 bg-slate-50 text-slate-700',
      };
  }
}

function getDirectionMeta(direction: 'incoming' | 'outgoing' | 'missed') {
  switch (direction) {
    case 'incoming':
      return {
        icon: PhoneIncoming,
        label: 'Incoming',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
      };
    case 'missed':
      return {
        icon: PhoneMissed,
        label: 'Missed',
        color: 'text-rose-600',
        bg: 'bg-rose-50',
      };
    default:
      return {
        icon: PhoneOutgoing,
        label: 'Outgoing',
        color: 'text-violet-600',
        bg: 'bg-violet-50',
      };
  }
}

function getDurationFromSession(session: WhatsAppCallSessionRecord) {
  if (!session.connectedAt || !session.endedAt) {
    return 0;
  }

  const connectedAtMs = Date.parse(session.connectedAt);
  const endedAtMs = Date.parse(session.endedAt);

  if (!Number.isFinite(connectedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < connectedAtMs) {
    return 0;
  }

  return Math.round((endedAtMs - connectedAtMs) / 1000);
}

export default function Calls() {
  const { bootstrap } = useAppData();
  const { startOutgoingCall, isCallActionPending } = useCallManager();
  const callHistory = bootstrap?.callHistory || [];
  const callSessions = bootstrap?.callSessions || [];
  const conversations = bootstrap?.conversations || [];
  const [isNewCallModalOpen, setIsNewCallModalOpen] = useState(false);
  const [callMode, setCallMode] = useState<'contact' | 'manual'>('contact');
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [isCallSettingsModalOpen, setIsCallSettingsModalOpen] = useState(false);
  const [callSettings, setCallSettings] = useState<WhatsAppCallSettings | null>(null);
  const [callSettingsDraft, setCallSettingsDraft] = useState<CallSettingsDraft>(() =>
    createDefaultCallSettingsDraft(),
  );
  const [isLoadingCallSettings, setIsLoadingCallSettings] = useState(false);
  const [isSavingCallSettings, setIsSavingCallSettings] = useState(false);
  const [callSettingsError, setCallSettingsError] = useState<string | null>(null);

  const summary = {
    total: callHistory.length,
    incoming: callHistory.filter((call) => call.type === 'incoming').length,
    outgoing: callHistory.filter((call) => call.type === 'outgoing').length,
    missed: callHistory.filter((call) => call.type === 'missed').length,
  };

  const stats = [
    { label: 'Total Calls', value: summary.total, icon: Phone, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Incoming Calls', value: summary.incoming, icon: PhoneIncoming, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Outgoing Calls', value: summary.outgoing, icon: PhoneOutgoing, color: 'text-violet-500', bg: 'bg-violet-50' },
    { label: 'Missed Calls', value: summary.missed, icon: PhoneMissed, color: 'text-rose-500', bg: 'bg-rose-50' },
  ];

  const contactOptions = useMemo(() => {
    const seen = new Set<string>();

    return conversations.flatMap((thread) => {
      const waId = (thread.contactWaId || thread.displayPhone || '').trim();

      if (!waId || seen.has(waId)) {
        return [];
      }

      seen.add(waId);

      return [
        {
          id: thread.id,
          waId,
          label: buildContactLabel(thread),
          contactName: thread.contactName,
        },
      ];
    });
  }, [conversations]);

  const historyEntries = useMemo(() => {
    const sessionByCallId = new Map<string, WhatsAppCallSessionRecord>(
      callSessions.map((session) => [session.callId, session]),
    );
    const linkedCallIds = new Set<string>();

    const sessionEntries = callSessions.map((session) => {
      const matchingLog = callHistory.find((entry) => entry.callId && entry.callId === session.callId) || null;

      if (matchingLog?.callId) {
        linkedCallIds.add(matchingLog.callId);
      }

      const durationSeconds = matchingLog?.durationSeconds || getDurationFromSession(session);
      const stateMeta = getCallStateMeta(session.state);
      const directionMeta = getDirectionMeta(
        session.direction === 'incoming'
          ? session.state === 'missed' || session.state === 'rejected'
            ? 'missed'
            : 'incoming'
          : 'outgoing',
      );

      return {
        key: `session:${session.id}`,
        title: session.contactName || matchingLog?.name || session.displayPhone || session.contactWaId || 'Unknown contact',
        phone: session.displayPhone || session.contactWaId || matchingLog?.phone || 'Unknown number',
        startedAt: session.startedAt,
        connectedAt: session.connectedAt,
        updatedAt: session.updatedAt,
        durationSeconds,
        callId: session.callId,
        lastEvent: session.lastEvent,
        stateLabel: stateMeta.label,
        stateClassName: stateMeta.className,
        directionLabel: directionMeta.label,
        directionIcon: directionMeta.icon,
        directionColor: directionMeta.color,
        directionBg: directionMeta.bg,
      };
    });

    const orphanLogEntries = callHistory
      .filter((entry) => !entry.callId || !linkedCallIds.has(entry.callId))
      .map((entry) => {
        const linkedSession = entry.callId ? sessionByCallId.get(entry.callId) || null : null;
        const inferredState: WhatsAppCallState =
          linkedSession?.state ||
          (entry.type === 'missed' ? 'missed' : entry.type === 'incoming' ? 'ended' : 'ended');
        const stateMeta = getCallStateMeta(inferredState);
        const directionMeta = getDirectionMeta(entry.type);

        return {
          key: `log:${entry.id}`,
          title: entry.name || entry.phone,
          phone: entry.phone,
          startedAt: entry.createdAt,
          connectedAt: linkedSession?.connectedAt || null,
          updatedAt: linkedSession?.updatedAt || entry.createdAt,
          durationSeconds: entry.durationSeconds,
          callId: entry.callId,
          lastEvent: linkedSession?.lastEvent || null,
          stateLabel: stateMeta.label,
          stateClassName: stateMeta.className,
          directionLabel: directionMeta.label,
          directionIcon: directionMeta.icon,
          directionColor: directionMeta.color,
          directionBg: directionMeta.bg,
        };
      });

    return [...sessionEntries, ...orphanLogEntries].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }, [callHistory, callSessions]);

  const weeklyHoursByDay = useMemo(
    () =>
      new Map(
        callSettingsDraft.callHours.weeklyOperatingHours.map((entry) => [
          entry.dayOfWeek,
          entry,
        ]),
      ),
    [callSettingsDraft.callHours.weeklyOperatingHours],
  );

  const resetNewCallModal = () => {
    setCallMode('contact');
    setSelectedThreadId('');
    setManualNumber('');
    setModalError(null);
  };

  const openNewCallModal = () => {
    setSuccess(null);
    setModalError(null);
    setIsNewCallModalOpen(true);
  };

  const closeNewCallModal = () => {
    setIsNewCallModalOpen(false);
    resetNewCallModal();
  };

  const loadCallSettings = async () => {
    try {
      setIsLoadingCallSettings(true);
      setCallSettingsError(null);

      const response = await appApi.getCallSettings();
      setCallSettings(response.settings);
      setCallSettingsDraft(createCallSettingsDraft(response.settings));
    } catch (error) {
      setCallSettingsError(error instanceof Error ? error.message : 'Failed to load WhatsApp call settings.');
    } finally {
      setIsLoadingCallSettings(false);
    }
  };

  const openCallSettingsModal = () => {
    setSuccess(null);
    setCallSettingsError(null);
    setIsCallSettingsModalOpen(true);

    if (callSettings) {
      setCallSettingsDraft(createCallSettingsDraft(callSettings));
    }

    void loadCallSettings();
  };

  const closeCallSettingsModal = () => {
    setIsCallSettingsModalOpen(false);
    setCallSettingsError(null);
  };

  const updateWeeklyHour = (
    dayOfWeek: string,
    field: 'openTime' | 'closeTime',
    value: string,
  ) => {
    setCallSettingsDraft((current) => {
      const existing = current.callHours.weeklyOperatingHours.find((entry) => entry.dayOfWeek === dayOfWeek);
      const nextEntry = {
        dayOfWeek,
        openTime: existing?.openTime || '09:00',
        closeTime: existing?.closeTime || '18:00',
        [field]: value,
      };
      const nextHours = existing
        ? current.callHours.weeklyOperatingHours.map((entry) =>
            entry.dayOfWeek === dayOfWeek ? nextEntry : entry,
          )
        : [...current.callHours.weeklyOperatingHours, nextEntry];

      return {
        ...current,
        callHours: {
          ...current.callHours,
          weeklyOperatingHours: nextHours,
        },
      };
    });
  };

  const setWeeklyDayEnabled = (dayOfWeek: string, enabled: boolean) => {
    setCallSettingsDraft((current) => {
      const hasDay = current.callHours.weeklyOperatingHours.some((entry) => entry.dayOfWeek === dayOfWeek);
      const nextHours = enabled
        ? hasDay
          ? current.callHours.weeklyOperatingHours
          : [
              ...current.callHours.weeklyOperatingHours,
              { dayOfWeek, openTime: '09:00', closeTime: '18:00' },
            ]
        : current.callHours.weeklyOperatingHours.filter((entry) => entry.dayOfWeek !== dayOfWeek);

      return {
        ...current,
        callHours: {
          ...current.callHours,
          weeklyOperatingHours: nextHours,
        },
      };
    });
  };

  const addHolidaySchedule = () => {
    setCallSettingsDraft((current) => ({
      ...current,
      callHours: {
        ...current.callHours,
        status: 'enabled',
        holidaySchedule: [
          ...current.callHours.holidaySchedule,
          {
            date: new Date().toISOString().slice(0, 10),
            startTime: '00:00',
            endTime: '23:59',
          },
        ],
      },
    }));
  };

  const updateHolidaySchedule = (
    index: number,
    field: keyof WhatsAppCallHolidaySchedule,
    value: string,
  ) => {
    setCallSettingsDraft((current) => ({
      ...current,
      callHours: {
        ...current.callHours,
        holidaySchedule: current.callHours.holidaySchedule.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry,
        ),
      },
    }));
  };

  const removeHolidaySchedule = (index: number) => {
    setCallSettingsDraft((current) => ({
      ...current,
      callHours: {
        ...current.callHours,
        holidaySchedule: current.callHours.holidaySchedule.filter((_, entryIndex) => entryIndex !== index),
      },
    }));
  };

  const saveCallSettings = async () => {
    try {
      setIsSavingCallSettings(true);
      setCallSettingsError(null);

      const response = await appApi.updateCallSettings(buildCallSettingsPayload(callSettingsDraft));
      setCallSettings(response.settings);
      setCallSettingsDraft(createCallSettingsDraft(response.settings));
      setSuccess('WhatsApp call settings updated.');
      closeCallSettingsModal();
    } catch (error) {
      setCallSettingsError(error instanceof Error ? error.message : 'Failed to update WhatsApp call settings.');
    } finally {
      setIsSavingCallSettings(false);
    }
  };

  useEscapeKey(isNewCallModalOpen, closeNewCallModal);
  useEscapeKey(isCallSettingsModalOpen, closeCallSettingsModal);

  if (!bootstrap?.channel) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Phone className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-5 text-2xl font-bold text-gray-900">Connect WhatsApp first</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
            The calling console uses your connected WhatsApp Business phone number. Connect the channel first, then permission checks and call actions can be sent through the Graph API.
          </p>
          <Link
            to="/onboarding/channel-connection"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8]"
          >
            Open channel setup
          </Link>
        </div>
      </div>
    );
  }

  const handleStartCall = async () => {
    const selectedContact = contactOptions.find((entry) => entry.id === selectedThreadId) || null;
    const targetWaId = (callMode === 'contact' ? selectedContact?.waId || '' : manualNumber).trim();

    if (!targetWaId) {
      setModalError(
        callMode === 'contact'
          ? 'Choose a contact before starting the call.'
          : 'Enter a WhatsApp number before starting the call.',
      );
      return;
    }

    try {
      setIsCheckingPermission(true);
      setModalError(null);
      setSuccess(null);

      const permissionResponse = await appApi.getCallPermissions(targetWaId);

      if (!canStartCallFromPermissionResponse(permissionResponse)) {
        if (canRequestCallPermissionFromResponse(permissionResponse)) {
          await appApi.requestCallPermission({
            userWaId: targetWaId,
            threadId: selectedContact?.id,
          });
          setSuccess(
            `Call permission request sent to ${selectedContact?.contactName || selectedContact?.waId || targetWaId}. Ask them to approve it in WhatsApp, then try the call again.`,
          );
          closeNewCallModal();
          return;
        }

        setModalError(getCallPermissionUnavailableMessage(permissionResponse));
        return;
      }

      await startOutgoingCall(targetWaId);

      setSuccess(
        `Calling ${selectedContact?.contactName || selectedContact?.waId || targetWaId}.`,
      );
      closeNewCallModal();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to start the WhatsApp call.');
    } finally {
      setIsCheckingPermission(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Calls</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review recent call activity and start a new WhatsApp call from one place.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={openCallSettingsModal}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
          >
            <Settings className="h-4 w-4" /> Call Settings
          </button>
          <button
            type="button"
            onClick={openNewCallModal}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8]"
          >
            <Plus className="h-4 w-4" /> New WhatsApp Call
          </button>
        </div>
      </div>

      <FeedbackPopupStack
        items={
          success
            ? [{ id: 'calls-success', tone: 'success' as const, message: success, onDismiss: () => setSuccess(null) }]
            : []
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Call History</h2>
          <p className="mt-1 text-sm text-gray-500">
            Connected number: {bootstrap.channel.displayPhoneNumber || bootstrap.channel.phoneNumberId}
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="p-4 pl-6 font-medium">Contact</th>
                <th className="p-4 font-medium">Direction</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Call Time</th>
                <th className="p-4 font-medium">Duration</th>
                <th className="p-4 pr-6 font-medium">Last Event</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {historyEntries.map((entry) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    key={entry.key}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50"
                  >
                    <td className="p-4 pl-6">
                      <p className="max-w-[240px] truncate text-sm font-semibold text-gray-900">{entry.title}</p>
                      <p className="mt-1 max-w-[240px] truncate text-xs text-gray-500">{entry.phone}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${entry.directionBg} ${entry.directionColor}`}>
                          <entry.directionIcon className="h-4 w-4" />
                        </span>
                        {entry.directionLabel}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.stateClassName}`}>
                        {entry.stateLabel}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-600">{formatDateTime(entry.startedAt)}</td>
                    <td className="p-4 text-sm text-gray-600">{formatDuration(entry.durationSeconds)}</td>
                    <td className="p-4 pr-6 text-sm text-gray-500">{entry.lastEvent || 'None'}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {historyEntries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
                <Phone className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-1 text-lg font-bold text-gray-900">No call logs yet</h3>
              <p className="text-sm text-gray-500">
                Start a WhatsApp call and the history will show the full log here.
              </p>
            </div>
          ) : null}
        </div>
      </motion.div>

      <AnimatePresence>
        {isNewCallModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeNewCallModal}
              className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.96 }}
              className="relative z-10 w-full max-w-xl rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-400">Actions</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">New WhatsApp Call</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Choose an existing contact or type a number manually. We will check permission automatically before calling.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeNewCallModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 inline-flex rounded-2xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setCallMode('contact')}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    callMode === 'contact' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Choose contact
                </button>
                <button
                  type="button"
                  onClick={() => setCallMode('manual')}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    callMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Type number
                </button>
              </div>

              <div className="mt-5">
                {callMode === 'contact' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Contact</label>
                    <DropdownSelect
                      value={selectedThreadId}
                      onChange={setSelectedThreadId}
                      options={[
                        { value: '', label: 'Select a contact' },
                        ...contactOptions.map((option) => ({
                          value: option.id,
                          label: option.label,
                        })),
                      ]}
                      placeholder="Select a contact"
                      ariaLabel="Select call contact"
                      buttonClassName="rounded-2xl border-gray-200 bg-white px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">WhatsApp number</label>
                    <input
                      type="text"
                      value={manualNumber}
                      onChange={(event) => setManualNumber(event.target.value)}
                      placeholder="919999999999"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>
                )}
              </div>

              {modalError ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Call permission is checked automatically when you tap <span className="font-medium text-gray-900">Call Now</span>.
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeNewCallModal}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartCall()}
                  disabled={isCheckingPermission || isCallActionPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8] disabled:opacity-60"
                >
                  {isCheckingPermission || isCallActionPending ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      Checking permission...
                    </>
                  ) : (
                    'Call Now'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isCallSettingsModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCallSettingsModal}
              className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.96 }}
              className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-400">
                    WhatsApp Calls
                  </p>
                  <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
                    <Settings className="h-5 w-5 text-[#5b45ff]" />
                    Call Settings
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeCallSettingsModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {callSettingsError ? (
                <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {callSettingsError}
                </div>
              ) : null}

              {isLoadingCallSettings ? (
                <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-10 text-sm text-gray-500">
                  <Clock className="h-4 w-4 animate-spin" />
                  Loading call settings...
                </div>
              ) : (
                <>
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() =>
                        setCallSettingsDraft((current) => ({
                          ...current,
                          status: current.status === 'enabled' ? 'disabled' : 'enabled',
                        }))
                      }
                      className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">Allow voice calls</span>
                        <span className="mt-1 block text-xs text-gray-500">Make, receive and request calls.</span>
                      </span>
                      <span
                        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${
                          callSettingsDraft.status === 'enabled' ? 'bg-[#5b45ff]' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white transition ${
                            callSettingsDraft.status === 'enabled' ? 'translate-x-5' : ''
                          }`}
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCallSettingsDraft((current) => ({
                          ...current,
                          callIconVisibility:
                            current.callIconVisibility === 'visible' ? 'hidden' : 'visible',
                        }))
                      }
                      className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">Display call buttons</span>
                        <span className="mt-1 block text-xs text-gray-500">Show call buttons in WhatsApp.</span>
                      </span>
                      <span
                        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${
                          callSettingsDraft.callIconVisibility === 'visible' ? 'bg-[#5b45ff]' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white transition ${
                            callSettingsDraft.callIconVisibility === 'visible' ? 'translate-x-5' : ''
                          }`}
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCallSettingsDraft((current) => ({
                          ...current,
                          callbackPermissionStatus:
                            current.callbackPermissionStatus === 'enabled' ? 'disabled' : 'enabled',
                        }))
                      }
                      className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">Allow callbacks</span>
                        <span className="mt-1 block text-xs text-gray-500">Let customers request a callback.</span>
                      </span>
                      <span
                        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${
                          callSettingsDraft.callbackPermissionStatus === 'enabled' ? 'bg-[#5b45ff]' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white transition ${
                            callSettingsDraft.callbackPermissionStatus === 'enabled' ? 'translate-x-5' : ''
                          }`}
                        />
                      </span>
                    </button>
                  </div>

                  <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Available Call Hours</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Calls are accepted only during the selected windows.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCallSettingsDraft((current) => ({
                            ...current,
                            callHours: {
                              ...current.callHours,
                              status: current.callHours.status === 'enabled' ? 'disabled' : 'enabled',
                              weeklyOperatingHours:
                                current.callHours.weeklyOperatingHours.length > 0
                                  ? current.callHours.weeklyOperatingHours
                                  : buildDefaultWeeklyHours(),
                            },
                          }))
                        }
                        className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition ${
                          callSettingsDraft.callHours.status === 'enabled'
                            ? 'bg-[#5b45ff] text-white'
                            : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {callSettingsDraft.callHours.status === 'enabled' ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    {callSettingsDraft.callHours.status === 'enabled' ? (
                      <div className="mt-5 space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">Timezone</label>
                          <input
                            type="text"
                            value={callSettingsDraft.callHours.timezoneId}
                            onChange={(event) =>
                              setCallSettingsDraft((current) => ({
                                ...current,
                                callHours: {
                                  ...current.callHours,
                                  timezoneId: event.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                          />
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-gray-200">
                          {CALL_DAYS.map((dayOfWeek) => {
                            const entry = weeklyHoursByDay.get(dayOfWeek);

                            return (
                              <div
                                key={dayOfWeek}
                                className="grid gap-3 border-b border-gray-100 p-3 last:border-b-0 sm:grid-cols-[140px_1fr_1fr]"
                              >
                                <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(entry)}
                                    onChange={(event) =>
                                      setWeeklyDayEnabled(dayOfWeek, event.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                                  />
                                  {dayOfWeek.slice(0, 3)}
                                </label>
                                <input
                                  type="time"
                                  value={entry?.openTime || '09:00'}
                                  disabled={!entry}
                                  onChange={(event) =>
                                    updateWeeklyHour(dayOfWeek, 'openTime', event.target.value)
                                  }
                                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] disabled:bg-gray-50 disabled:text-gray-400"
                                />
                                <input
                                  type="time"
                                  value={entry?.closeTime || '18:00'}
                                  disabled={!entry}
                                  onChange={(event) =>
                                    updateWeeklyHour(dayOfWeek, 'closeTime', event.target.value)
                                  }
                                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] disabled:bg-gray-50 disabled:text-gray-400"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Temporary Stops</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Add holidays or custom windows when incoming calls are unavailable.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addHolidaySchedule}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Plus className="h-4 w-4" />
                        Add Stop
                      </button>
                    </div>

                    {callSettingsDraft.callHours.holidaySchedule.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {callSettingsDraft.callHours.holidaySchedule.map((entry, index) => (
                          <div
                            key={`${entry.date}-${index}`}
                            className="grid gap-3 rounded-2xl bg-gray-50 p-3 sm:grid-cols-[1.3fr_1fr_1fr_auto]"
                          >
                            <input
                              type="date"
                              value={entry.date}
                              onChange={(event) =>
                                updateHolidaySchedule(index, 'date', event.target.value)
                              }
                              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                            <input
                              type="time"
                              value={entry.startTime}
                              onChange={(event) =>
                                updateHolidaySchedule(index, 'startTime', event.target.value)
                              }
                              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                            <input
                              type="time"
                              value={entry.endTime}
                              onChange={(event) =>
                                updateHolidaySchedule(index, 'endTime', event.target.value)
                              }
                              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                            <button
                              type="button"
                              onClick={() => removeHolidaySchedule(index)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        No temporary stops configured.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeCallSettingsModal}
                      className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveCallSettings()}
                      disabled={isSavingCallSettings}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8] disabled:opacity-60"
                    >
                      {isSavingCallSettings ? (
                        <>
                          <Clock className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Settings
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
