import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appApi } from '../lib/api';
import { upsertCallLog, upsertCallSession } from '../lib/calls';
import { getDefaultNotificationPreferences } from '../lib/notifications';
import { normalizeSdpString } from '../lib/sdp';
import {
  playCallConnectedSound,
  startCallLoopSound,
  stopCallLoopSound,
} from '../lib/soundManager';
import { useAppData } from './AppDataContext';
import type {
  WhatsAppCallManageInput,
  WhatsAppCallManageResponse,
  WhatsAppCallSessionRecord,
} from '../lib/types';

function getCallPriority(session: WhatsAppCallSessionRecord) {
  switch (session.state) {
    case 'incoming':
      return 6;
    case 'ongoing':
      return 5;
    case 'connecting':
    case 'ringing':
      return 4;
    case 'dialing':
      return 3;
    case 'ended':
    case 'rejected':
    case 'missed':
    case 'failed':
      return 2;
    default:
      return 1;
  }
}

function waitForIceGatheringComplete(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (connection.iceGatheringState !== 'complete') {
        return;
      }

      window.clearTimeout(timeoutId);
      connection.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    };

    const timeoutId = window.setTimeout(() => {
      connection.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    }, 1500);

    connection.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

function normalizeCallActionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

interface CallManagerContextValue {
  activeSession: WhatsAppCallSessionRecord | null;
  sessionDescription: string;
  isGeneratingSessionDescription: boolean;
  isCallActionPending: boolean;
  isMuted: boolean;
  hasRemoteAudio: boolean;
  error: string | null;
  clearError: () => void;
  generateBrowserOffer: () => Promise<string>;
  clearBrowserSession: () => void;
  sendCallAction: (payload: WhatsAppCallManageInput) => Promise<WhatsAppCallManageResponse>;
  startOutgoingCall: (to: string, callbackData?: string) => Promise<WhatsAppCallManageResponse>;
  answerIncomingCall: (session?: WhatsAppCallSessionRecord | null) => Promise<WhatsAppCallManageResponse>;
  rejectCall: (session?: WhatsAppCallSessionRecord | null) => Promise<WhatsAppCallManageResponse>;
  terminateCall: (session?: WhatsAppCallSessionRecord | null) => Promise<WhatsAppCallManageResponse>;
  toggleMute: () => void;
}

const CallManagerContext = createContext<CallManagerContextValue | null>(null);

export function CallManagerProvider({ children }: { children: ReactNode }) {
  const { bootstrap, setBootstrap } = useAppData();
  const callSessions = bootstrap?.callSessions || [];
  const notificationPreferences =
    bootstrap?.notificationPreferences ||
    getDefaultNotificationPreferences(bootstrap?.profile?.userId || '');
  const [sessionDescription, setSessionDescription] = useState('');
  const [isGeneratingSessionDescription, setIsGeneratingSessionDescription] = useState(false);
  const [isCallActionPending, setIsCallActionPending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const appliedAnswerCallIdsRef = useRef(new Set<string>());
  const previousStateRef = useRef<string | null>(null);

  const topPrioritySession = useMemo(() => {
    const visibleSessions = callSessions.filter(
      (session) =>
        session.state !== 'ended' &&
        session.state !== 'rejected' &&
        session.state !== 'missed' &&
        session.state !== 'failed',
    );

    if (visibleSessions.length === 0) {
      return null;
    }

    return [...visibleSessions].sort((left, right) => {
      const priorityDelta = getCallPriority(right) - getCallPriority(left);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })[0];
  }, [callSessions]);

  const trackedSession = useMemo(
    () => (currentCallId ? callSessions.find((session) => session.callId === currentCallId) || null : null),
    [callSessions, currentCallId],
  );
  const activeSession = trackedSession || topPrioritySession;

  const syncResponse = (response: WhatsAppCallManageResponse) => {
    setBootstrap((current) => {
      if (!current) {
        return current;
      }

      let next = current;

      if (response.callLog) {
        next = {
          ...next,
          callHistory: upsertCallLog(next.callHistory, response.callLog),
        };
      }

      if (response.callSession) {
        next = {
          ...next,
          callSessions: upsertCallSession(next.callSessions, response.callSession),
        };
      }

      return next;
    });
  };

  const releaseBrowserSession = (options?: { clearSessionDescription?: boolean; clearCallId?: boolean }) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    appliedAnswerCallIdsRef.current.clear();
    setHasRemoteAudio(false);
    setIsMuted(false);

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (options?.clearSessionDescription) {
      setSessionDescription('');
    }

    if (options?.clearCallId) {
      setCurrentCallId(null);
    }
  };

  const ensurePeerConnection = async (options?: { reset?: boolean }) => {
    if (options?.reset) {
      releaseBrowserSession({ clearSessionDescription: true, clearCallId: true });
    }

    if (peerConnectionRef.current && localStreamRef.current) {
      return peerConnectionRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      throw new Error('This browser does not support WebRTC calling.');
    }

    const stream =
      localStreamRef.current ||
      (await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      }));
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStreamRef.current = stream;
    peerConnectionRef.current = connection;

    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });

    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;

      if (!remoteStream || !remoteAudioRef.current) {
        return;
      }

      remoteAudioRef.current.srcObject = remoteStream;
      void remoteAudioRef.current.play().catch(() => undefined);
      setHasRemoteAudio(true);
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        setHasRemoteAudio(false);
      }
    };

    return connection;
  };

  const generateBrowserOffer = async () => {
    setIsGeneratingSessionDescription(true);
    setError(null);

    try {
      const connection = await ensurePeerConnection({ reset: true });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIceGatheringComplete(connection);

      const nextSdp = normalizeSdpString(connection.localDescription?.sdp) || '';

      if (!nextSdp) {
        throw new Error('WebRTC did not return an SDP offer.');
      }

      setSessionDescription(nextSdp);
      return nextSdp;
    } catch (nextError) {
      releaseBrowserSession({ clearSessionDescription: true });
      const message = normalizeCallActionError(nextError, 'Failed to generate a browser SDP offer.');
      setError(message);
      throw new Error(message);
    } finally {
      setIsGeneratingSessionDescription(false);
    }
  };

  const generateIncomingAnswer = async (session: WhatsAppCallSessionRecord) => {
    if (!session.offerSdp) {
      throw new Error('The incoming call does not have a remote SDP offer yet.');
    }

    setIsGeneratingSessionDescription(true);
    setError(null);

    try {
      const connection = await ensurePeerConnection({ reset: true });
      const normalizedRemoteOffer = normalizeSdpString(session.offerSdp);

      if (!normalizedRemoteOffer) {
        throw new Error('The incoming call offer SDP is empty or malformed.');
      }

      await connection.setRemoteDescription({
        type: 'offer',
        sdp: normalizedRemoteOffer,
      });

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await waitForIceGatheringComplete(connection);

      const nextSdp = normalizeSdpString(connection.localDescription?.sdp) || '';

      if (!nextSdp) {
        throw new Error('WebRTC did not return an SDP answer.');
      }

      setCurrentCallId(session.callId);
      setSessionDescription(nextSdp);
      return nextSdp;
    } catch (nextError) {
      releaseBrowserSession({ clearSessionDescription: true });
      const message = normalizeCallActionError(nextError, 'Failed to create an SDP answer for the incoming call.');
      setError(message);
      throw new Error(message);
    } finally {
      setIsGeneratingSessionDescription(false);
    }
  };

  const sendCallAction = async (payload: WhatsAppCallManageInput) => {
    setIsCallActionPending(true);
    setError(null);

    try {
      const nextPayload: WhatsAppCallManageInput = {
        ...payload,
      };

      if (payload.action === 'connect' && !payload.session) {
        nextPayload.session = {
          sdpType: 'offer',
          sdp: await generateBrowserOffer(),
        };
      }

      if (payload.action === 'accept' && !payload.session) {
        const targetSession =
          (payload.callId ? callSessions.find((session) => session.callId === payload.callId) : null) ||
          activeSession;

        if (!targetSession) {
          throw new Error('No incoming call is available to accept.');
        }

        nextPayload.callId = targetSession.callId;
        nextPayload.to = targetSession.contactWaId || payload.to;
        nextPayload.session = {
          sdpType: 'answer',
          sdp: await generateIncomingAnswer(targetSession),
        };
      }

      const response = await appApi.manageCall(nextPayload);
      syncResponse(response);

      if (response.callId) {
        setCurrentCallId(response.callId);
      }

      if (nextPayload.action === 'reject' || nextPayload.action === 'terminate') {
        releaseBrowserSession({ clearSessionDescription: true });
      }

      return response;
    } catch (nextError) {
      const message = normalizeCallActionError(nextError, 'Failed to send the call action.');
      setError(message);
      throw new Error(message);
    } finally {
      setIsCallActionPending(false);
    }
  };

  const startOutgoingCall = (to: string, callbackData?: string) =>
    sendCallAction({
      action: 'connect',
      to,
      bizOpaqueCallbackData: callbackData,
    });

  const answerIncomingCall = (session?: WhatsAppCallSessionRecord | null) =>
    sendCallAction({
      action: 'accept',
      callId: session?.callId || activeSession?.callId,
      to: session?.contactWaId || activeSession?.contactWaId || undefined,
    });

  const rejectCall = (session?: WhatsAppCallSessionRecord | null) =>
    sendCallAction({
      action: 'reject',
      callId: session?.callId || activeSession?.callId,
      to: session?.contactWaId || activeSession?.contactWaId || undefined,
    });

  const terminateCall = (session?: WhatsAppCallSessionRecord | null) =>
    sendCallAction({
      action: 'terminate',
      callId: session?.callId || activeSession?.callId,
    });

  const toggleMute = () => {
    const nextMuted = !isMuted;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    setIsMuted(nextMuted);
  };

  useEffect(() => {
    if (!activeSession?.callId) {
      return;
    }

    if (!currentCallId) {
      setCurrentCallId(activeSession.callId);
    }
  }, [activeSession, currentCallId]);

  useEffect(() => {
    let isCancelled = false;

    const applyRemoteAnswer = async () => {
      if (!trackedSession?.answerSdp || !peerConnectionRef.current) {
        return;
      }

      if (trackedSession.direction !== 'outgoing') {
        return;
      }

      if (appliedAnswerCallIdsRef.current.has(trackedSession.callId)) {
        return;
      }

      if (peerConnectionRef.current.signalingState === 'stable') {
        appliedAnswerCallIdsRef.current.add(trackedSession.callId);
        return;
      }

      if (peerConnectionRef.current.signalingState !== 'have-local-offer') {
        return;
      }

      try {
        const normalizedRemoteAnswer = normalizeSdpString(trackedSession.answerSdp);

        if (!normalizedRemoteAnswer) {
          throw new Error('The remote SDP answer is empty or malformed.');
        }

        await peerConnectionRef.current.setRemoteDescription({
          type: 'answer',
          sdp: normalizedRemoteAnswer,
        });
        appliedAnswerCallIdsRef.current.add(trackedSession.callId);
      } catch (nextError) {
        if (!isCancelled) {
          setError(normalizeCallActionError(nextError, 'Failed to apply the remote SDP answer.'));
        }
      }
    };

    void applyRemoteAnswer();

    return () => {
      isCancelled = true;
    };
  }, [trackedSession]);

  useEffect(() => {
    if (!trackedSession) {
      return;
    }

    if (
      trackedSession.state === 'ended' ||
      trackedSession.state === 'rejected' ||
      trackedSession.state === 'missed' ||
      trackedSession.state === 'failed'
    ) {
      releaseBrowserSession({ clearSessionDescription: true, clearCallId: true });

      return;
    }

    return undefined;
  }, [trackedSession]);

  useEffect(() => {
    const sessionKey = activeSession ? `${activeSession.callId}:${activeSession.state}` : null;
    const previousSessionKey = previousStateRef.current;

    if (!activeSession) {
      stopCallLoopSound();
      previousStateRef.current = null;
      return;
    }

    if (sessionKey === previousSessionKey) {
      return;
    }

    previousStateRef.current = sessionKey;

    if (activeSession.state === 'incoming') {
      stopCallLoopSound('outgoing_call');
      startCallLoopSound('incoming_call', notificationPreferences);
      return;
    }

    if (
      activeSession.direction === 'outgoing' &&
      (activeSession.state === 'dialing' ||
        activeSession.state === 'ringing' ||
        activeSession.state === 'connecting')
    ) {
      stopCallLoopSound('incoming_call');
      startCallLoopSound('outgoing_call', notificationPreferences);
      return;
    }

    stopCallLoopSound();

    if (activeSession.state === 'ongoing') {
      playCallConnectedSound(notificationPreferences);
      return;
    }

    if (
      activeSession.state === 'ended' ||
      activeSession.state === 'rejected' ||
      activeSession.state === 'missed' ||
      activeSession.state === 'failed'
    ) {
      return;
    }
  }, [activeSession, notificationPreferences]);

  useEffect(() => {
    return () => {
      stopCallLoopSound();
      releaseBrowserSession({ clearSessionDescription: true, clearCallId: true });
    };
  }, []);

  const value: CallManagerContextValue = {
    activeSession,
    sessionDescription,
    isGeneratingSessionDescription,
    isCallActionPending,
    isMuted,
    hasRemoteAudio,
    error,
    clearError: () => setError(null),
    generateBrowserOffer,
    clearBrowserSession: () => releaseBrowserSession({ clearSessionDescription: true, clearCallId: true }),
    sendCallAction,
    startOutgoingCall,
    answerIncomingCall,
    rejectCall,
    terminateCall,
    toggleMute,
  };

  return (
    <CallManagerContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </CallManagerContext.Provider>
  );
}

export function useCallManager() {
  const context = useContext(CallManagerContext);

  if (!context) {
    throw new Error('useCallManager must be used inside CallManagerProvider.');
  }

  return context;
}
