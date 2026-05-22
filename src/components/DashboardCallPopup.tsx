import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Maximize2,
  Minimize2,
  Lock,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { useCallManager } from '../context/CallManagerContext';
import { getConversationDisplayName } from '../lib/conversation-display';
import { normalizePhoneLike } from '../lib/phone';
import type { WhatsAppCallState } from '../lib/types';

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getSessionLabel(state: WhatsAppCallState) {
  switch (state) {
    case 'incoming':
      return 'Incoming...';
    case 'dialing':
      return 'Dialing...';
    case 'ringing':
      return 'Ringing...';
    case 'connecting':
      return 'Connecting...';
    case 'ongoing':
      return 'Connected';
    case 'rejected':
      return 'Call rejected';
    case 'missed':
      return 'Missed call';
    case 'failed':
      return 'Call failed';
    case 'ended':
      return 'Call ended';
    default:
      return 'Call';
  }
}

function getContactInitials(label: string) {
  const words = label
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0] || label || 'WA').slice(0, 2).toUpperCase();
}

function getTimestampMs(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }

  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : Number.NaN;
}

function normalizeCallIdentity(value: string | null | undefined) {
  return normalizePhoneLike(value) || value?.trim().toLowerCase() || null;
}

export default function DashboardCallPopup() {
  const { bootstrap } = useAppData();
  const {
    activeSession,
    answerIncomingCall,
    rejectCall,
    terminateCall,
    toggleMute,
    isCallActionPending,
    isMuted,
    hasRemoteAudio,
    error,
  } = useCallManager();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    setIsCompact(false);
  }, [activeSession?.callId]);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }

    const connectedAtMs = getTimestampMs(activeSession.connectedAt);
    const shouldShowTimer =
      activeSession.state === 'ongoing' || Number.isFinite(connectedAtMs) || hasRemoteAudio;

    if (!shouldShowTimer) {
      setElapsedSeconds(0);
      return;
    }

    const fallbackStartMs = getTimestampMs(activeSession.startedAt);
    const timerStartMs = Number.isFinite(connectedAtMs)
      ? connectedAtMs
      : activeSession.state === 'ongoing' && Number.isFinite(fallbackStartMs)
        ? fallbackStartMs
        : Date.now();

    const updateElapsed = () => {
      if (!Number.isFinite(timerStartMs)) {
        setElapsedSeconds(0);
        return;
      }

      const endMs = activeSession.endedAt ? Date.parse(activeSession.endedAt) : Date.now();
      const safeEndMs = Number.isFinite(endMs) ? endMs : Date.now();
      setElapsedSeconds(Math.max(0, Math.round((safeEndMs - timerStartMs) / 1000)));
    };

    updateElapsed();

    if (activeSession.endedAt) {
      return;
    }

    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeSession, hasRemoteAudio]);

  if (!activeSession) {
    return null;
  }

  const contactLabel =
    activeSession.contactName ||
    (() => {
      const callbackThreadId =
        typeof activeSession.bizOpaqueCallbackData === 'string' &&
        activeSession.bizOpaqueCallbackData.startsWith('inbox:')
          ? activeSession.bizOpaqueCallbackData.slice('inbox:'.length)
          : null;
      const sessionIdentities = [
        activeSession.contactWaId,
        activeSession.displayPhone,
      ]
        .map(normalizeCallIdentity)
        .filter((value): value is string => Boolean(value));
      const matchingThread =
        (callbackThreadId
          ? bootstrap?.conversations.find((thread) => thread.id === callbackThreadId)
          : null) ||
        bootstrap?.conversations.find((thread) => {
          const threadIdentities = [thread.contactWaId, thread.displayPhone]
            .map(normalizeCallIdentity)
            .filter((value): value is string => Boolean(value));

          return threadIdentities.some((identity) => sessionIdentities.includes(identity));
        });

      return matchingThread ? getConversationDisplayName(matchingThread) : null;
    })() ||
    activeSession.displayPhone ||
    activeSession.contactWaId ||
    'WhatsApp contact';
  const contactMeta =
    activeSession.displayPhone && activeSession.displayPhone !== contactLabel
      ? activeSession.displayPhone
      : activeSession.contactWaId && activeSession.contactWaId !== contactLabel
        ? activeSession.contactWaId
        : null;
  const isIncoming = activeSession.state === 'incoming';
  const isConnected =
    activeSession.state === 'ongoing' || Boolean(activeSession.connectedAt) || hasRemoteAudio;
  const isDialing =
    !isConnected &&
    (activeSession.state === 'dialing' ||
      activeSession.state === 'ringing' ||
      activeSession.state === 'connecting');
  const contactInitials = getContactInitials(contactLabel);
  const headerLabel = isIncoming ? 'WhatsApp Audio' : 'WhatsApp Call';
  const showTimer = isConnected;
  const showAvatarPulse = isIncoming || isDialing;
  const showEncryption = isConnected || isDialing;
  const statusLabel = isConnected ? 'Connected' : getSessionLabel(activeSession.state);
  const canCompact = !isIncoming;

  return (
    <AnimatePresence>
      <motion.div
        key={activeSession.callId}
        layout
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={`fixed bottom-4 left-3 right-3 z-40 overflow-hidden rounded-[28px] border border-white/10 bg-[#1d2227] text-white shadow-[0_24px_70px_rgba(15,23,42,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-[calc(100vw-2rem)] ${
          isCompact ? 'sm:w-[224px]' : 'sm:w-[340px]'
        }`}
      >
        <div
          className={`bg-[linear-gradient(145deg,#22272c,#171b1f)] ${
            isCompact ? 'px-4 py-4' : 'px-5 pb-5 pt-4 sm:px-6'
          }`}
        >
          {isCompact ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCompact(false)}
                aria-label="Expand call popup"
                title="Expand call popup"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[#b8c2cc] transition hover:bg-white/[0.1] hover:text-white"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void terminateCall(activeSession)}
                disabled={isCallActionPending}
                aria-label={`End call with ${contactLabel}`}
                title="End call"
                className="inline-flex h-12 min-w-[140px] flex-1 items-center justify-center gap-2.5 rounded-full bg-[#f44336] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(244,67,54,0.28)] transition hover:bg-[#e53935] disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
                End Call
              </button>
            </div>
          ) : null}

          {!isCompact ? (
            <>
          <div className={`flex items-center gap-3 ${showTimer ? 'justify-between' : 'justify-center'}`}>
            <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.02em] text-[#b8c2cc]">
              {isIncoming ? (
                <PhoneIncoming className="h-4 w-4 text-[#9aa6b2]" />
              ) : isConnected ? (
                <PhoneCall className="h-4 w-4 text-[#9aa6b2]" />
              ) : (
                <PhoneOutgoing className="h-4 w-4 text-[#9aa6b2]" />
              )}
              <span>{headerLabel}</span>
            </div>
            {showTimer ? (
              <div className="rounded-full bg-[#25d366]/15 px-3 py-1.5 text-sm font-bold leading-none text-[#25d366] [font-variant-numeric:tabular-nums]">
                {formatDuration(elapsedSeconds)}
              </div>
            ) : null}
            {canCompact ? (
              <button
                type="button"
                onClick={() => setIsCompact(true)}
                aria-label="Minimize call popup"
                title="Minimize call popup"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-[#9aa6b2] transition hover:bg-white/[0.1] hover:text-white"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-col items-center px-1 pb-5 pt-6 text-center">
            <div className="relative mb-5 flex h-[78px] w-[78px] items-center justify-center">
              {showAvatarPulse ? (
                <>
                  <motion.div
                    className="absolute inset-2 rounded-full border-2 border-[#25d366]/70"
                    animate={{ opacity: [0.55, 0], scale: [1, 1.35] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="absolute inset-2 rounded-full border-2 border-[#25d366]/45"
                    animate={{ opacity: [0.36, 0], scale: [1, 1.55] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: 0.9 }}
                  />
                </>
              ) : null}
              <div className="relative z-10 flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[#373d43] text-[30px] font-medium tracking-[0.02em] text-[#b7c0ca] shadow-[0_8px_18px_rgba(0,0,0,0.22)]">
                {contactInitials}
              </div>
            </div>

            <h3 className="max-w-full truncate text-[22px] font-bold leading-tight tracking-[0.01em] text-white">
              {contactLabel}
            </h3>
            {contactMeta ? <p className="mt-1.5 text-sm leading-none tracking-[0.02em] text-[#b8c7d5]">{contactMeta}</p> : null}

            <div
              className={`mt-4 inline-flex min-h-8 items-center justify-center gap-2 rounded-full px-4 text-sm leading-none ${
                isConnected ? 'bg-transparent text-[#25d366]' : 'bg-white/[0.045] text-white shadow-inner shadow-white/[0.02]'
              }`}
            >
              {isConnected ? (
                <span className="h-2.5 w-2.5 rounded-full bg-[#25d366] shadow-[0_0_10px_rgba(37,211,102,0.85)]" />
              ) : isDialing ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#25d366]" />
              ) : null}
              <span>{statusLabel}</span>
            </div>

            {showEncryption ? (
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[#7f8994]">
                <Lock className="h-3 w-3" />
                <span>End-to-end encrypted</span>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {isIncoming ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void rejectCall(activeSession)}
                disabled={isCallActionPending}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#f44336] px-4 text-base font-bold text-white shadow-[0_12px_28px_rgba(244,67,54,0.28)] transition hover:-translate-y-0.5 hover:bg-[#e53935] disabled:translate-y-0 disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
                Decline
              </button>
              <button
                type="button"
                onClick={() => void answerIncomingCall(activeSession)}
                disabled={isCallActionPending}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 text-base font-bold text-white shadow-[0_12px_28px_rgba(37,211,102,0.26)] transition hover:-translate-y-0.5 hover:bg-[#20bd5a] disabled:translate-y-0 disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneCall className="h-5 w-5" />}
                Accept
              </button>
            </div>
          ) : null}

          {isDialing ? (
            <button
              type="button"
              onClick={() => void terminateCall(activeSession)}
              disabled={isCallActionPending}
              className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-[#f44336] px-6 text-base font-bold text-white shadow-[0_14px_32px_rgba(244,67,54,0.32)] transition hover:-translate-y-0.5 hover:bg-[#e53935] disabled:translate-y-0 disabled:opacity-60"
            >
              {isCallActionPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-6 w-6" />}
              End Call
            </button>
          ) : null}

          {isConnected ? (
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                title={isMuted ? 'Unmute' : 'Mute'}
                className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition hover:-translate-y-0.5 ${
                  isMuted ? 'bg-[#4a5159] text-[#25d366]' : 'bg-[#373d43] text-white hover:bg-[#454c54]'
                }`}
              >
                {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>
              <button
                type="button"
                onClick={() => void terminateCall(activeSession)}
                disabled={isCallActionPending}
                className="inline-flex h-14 min-w-[168px] items-center justify-center gap-2.5 rounded-full bg-[#f44336] px-6 text-lg font-bold text-white shadow-[0_16px_34px_rgba(244,67,54,0.34)] transition hover:-translate-y-0.5 hover:bg-[#e53935] disabled:translate-y-0 disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-6 w-6" />}
                End Call
              </button>
            </div>
          ) : null}
            </>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
