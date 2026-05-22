import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Radio,
} from 'lucide-react';
import { useCallManager } from '../context/CallManagerContext';
import type { WhatsAppCallState } from '../lib/types';

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getSessionLabel(state: WhatsAppCallState) {
  switch (state) {
    case 'incoming':
      return 'Incoming call';
    case 'dialing':
      return 'Dialing';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting audio';
    case 'ongoing':
      return 'Ongoing call';
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

export default function DashboardCallPopup() {
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

  useEffect(() => {
    if (!activeSession || activeSession.state !== 'ongoing' || !activeSession.connectedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const startedAtMs = Date.parse(activeSession.connectedAt || activeSession.startedAt);

      if (!Number.isFinite(startedAtMs)) {
        setElapsedSeconds(0);
        return;
      }

      const endMs = activeSession.endedAt ? Date.parse(activeSession.endedAt) : Date.now();
      const safeEndMs = Number.isFinite(endMs) ? endMs : Date.now();
      setElapsedSeconds(Math.max(0, Math.round((safeEndMs - startedAtMs) / 1000)));
    };

    updateElapsed();

    if (activeSession.endedAt) {
      return;
    }

    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeSession]);

  if (!activeSession) {
    return null;
  }

  const contactLabel =
    activeSession.contactName || activeSession.displayPhone || activeSession.contactWaId || 'WhatsApp contact';
  const contactMeta =
    activeSession.displayPhone && activeSession.displayPhone !== contactLabel
      ? activeSession.displayPhone
      : activeSession.contactWaId && activeSession.contactWaId !== contactLabel
        ? activeSession.contactWaId
        : null;
  const isIncoming = activeSession.state === 'incoming';
  const isOngoing = activeSession.state === 'ongoing';
  const isDialing =
    activeSession.state === 'dialing' ||
    activeSession.state === 'ringing' ||
    activeSession.state === 'connecting';

  return (
    <AnimatePresence>
      <motion.div
        key={activeSession.callId}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        className="fixed bottom-4 left-4 right-4 z-40 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[360px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="bg-[radial-gradient(circle_at_top,_rgba(37,211,102,0.18),_transparent_52%),linear-gradient(135deg,#111827,#1f2937)] px-5 pb-5 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                {isIncoming ? (
                  <PhoneIncoming className="h-6 w-6 text-[#86efac]" />
                ) : isOngoing ? (
                  <PhoneCall className="h-6 w-6 text-white" />
                ) : (
                  <PhoneOutgoing className="h-6 w-6 text-[#c4b5fd]" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">WhatsApp call</p>
                <p className="mt-1 text-sm font-medium text-white/80">{getSessionLabel(activeSession.state)}</p>
              </div>
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              {formatDuration(elapsedSeconds)}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-2xl font-semibold tracking-tight">{contactLabel}</h3>
            {contactMeta ? <p className="mt-1 text-sm text-white/65">{contactMeta}</p> : null}
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-white/75">
            <Radio className="h-4 w-4" />
            <span>
              {activeSession.state === 'ongoing' && hasRemoteAudio
                ? 'Voice path active'
                : activeSession.state === 'incoming'
                  ? 'Waiting for your answer'
                  : activeSession.state === 'connecting'
                    ? 'Negotiating media'
                    : activeSession.state === 'ringing'
                      ? 'The recipient is being alerted'
                      : activeSession.state === 'dialing'
                        ? 'Placing the call'
                        : 'Realtime call state is synced from Meta'}
            </span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {isIncoming ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void rejectCall(activeSession)}
                disabled={isCallActionPending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                Decline
              </button>
              <button
                type="button"
                onClick={() => void answerIncomingCall(activeSession)}
                disabled={isCallActionPending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#16a34a] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#16a34a]/25 transition hover:bg-[#15803d] disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneIncoming className="h-4 w-4" />}
                Answer
              </button>
            </div>
          ) : null}

          {isDialing ? (
            <button
              type="button"
              onClick={() => void terminateCall(activeSession)}
              disabled={isCallActionPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#dc2626] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#dc2626]/25 transition hover:bg-[#b91c1c] disabled:opacity-60"
            >
              {isCallActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
              End call
            </button>
          ) : null}

          {isOngoing ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={() => void terminateCall(activeSession)}
                disabled={isCallActionPending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#dc2626] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#dc2626]/25 transition hover:bg-[#b91c1c] disabled:opacity-60"
              >
                {isCallActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                End call
              </button>
            </div>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
