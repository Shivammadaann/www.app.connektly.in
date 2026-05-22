import notificationSoundUrl from '../../Notification.mp3';
import whatsappIncomingCallSoundUrl from '../../whatsapp_incoming_call.mp3';
import type { NotificationPreferences, NotificationSoundPreset } from './types';

type SoundKind = 'notification' | 'incoming_call' | 'outgoing_call' | 'call_connected';

type ToneSegment = {
  frequency: number | null;
  durationSeconds: number;
  gain: number;
};

const SAMPLE_RATE = 22_050;
const soundCache = new Map<string, string>();
const loopingAudios = new Map<'incoming_call' | 'outgoing_call', HTMLAudioElement>();

function getToneProfile(
  preset: NotificationSoundPreset,
  kind: SoundKind,
): ToneSegment[] {
  const profiles: Record<NotificationSoundPreset, Record<SoundKind, ToneSegment[]>> = {
    classic: {
      notification: [
        { frequency: 880, durationSeconds: 0.08, gain: 0.42 },
        { frequency: null, durationSeconds: 0.04, gain: 0 },
        { frequency: 1175, durationSeconds: 0.14, gain: 0.38 },
      ],
      incoming_call: [
        { frequency: 523, durationSeconds: 0.22, gain: 0.4 },
        { frequency: null, durationSeconds: 0.06, gain: 0 },
        { frequency: 659, durationSeconds: 0.24, gain: 0.42 },
        { frequency: null, durationSeconds: 0.36, gain: 0 },
      ],
      outgoing_call: [
        { frequency: 440, durationSeconds: 0.18, gain: 0.36 },
        { frequency: null, durationSeconds: 0.1, gain: 0 },
        { frequency: 440, durationSeconds: 0.18, gain: 0.36 },
        { frequency: null, durationSeconds: 0.22, gain: 0 },
      ],
      call_connected: [
        { frequency: 932, durationSeconds: 0.08, gain: 0.34 },
        { frequency: 1244, durationSeconds: 0.14, gain: 0.3 },
      ],
    },
    soft: {
      notification: [
        { frequency: 659, durationSeconds: 0.1, gain: 0.28 },
        { frequency: null, durationSeconds: 0.04, gain: 0 },
        { frequency: 784, durationSeconds: 0.16, gain: 0.25 },
      ],
      incoming_call: [
        { frequency: 392, durationSeconds: 0.25, gain: 0.28 },
        { frequency: null, durationSeconds: 0.06, gain: 0 },
        { frequency: 523, durationSeconds: 0.25, gain: 0.3 },
        { frequency: null, durationSeconds: 0.38, gain: 0 },
      ],
      outgoing_call: [
        { frequency: 349, durationSeconds: 0.18, gain: 0.25 },
        { frequency: null, durationSeconds: 0.12, gain: 0 },
        { frequency: 349, durationSeconds: 0.18, gain: 0.25 },
        { frequency: null, durationSeconds: 0.24, gain: 0 },
      ],
      call_connected: [
        { frequency: 698, durationSeconds: 0.08, gain: 0.24 },
        { frequency: 880, durationSeconds: 0.12, gain: 0.22 },
      ],
    },
    pulse: {
      notification: [
        { frequency: 740, durationSeconds: 0.06, gain: 0.38 },
        { frequency: null, durationSeconds: 0.03, gain: 0 },
        { frequency: 932, durationSeconds: 0.08, gain: 0.34 },
        { frequency: null, durationSeconds: 0.03, gain: 0 },
        { frequency: 1175, durationSeconds: 0.12, gain: 0.3 },
      ],
      incoming_call: [
        { frequency: 494, durationSeconds: 0.18, gain: 0.4 },
        { frequency: null, durationSeconds: 0.04, gain: 0 },
        { frequency: 740, durationSeconds: 0.18, gain: 0.4 },
        { frequency: null, durationSeconds: 0.04, gain: 0 },
        { frequency: 988, durationSeconds: 0.18, gain: 0.38 },
        { frequency: null, durationSeconds: 0.34, gain: 0 },
      ],
      outgoing_call: [
        { frequency: 523, durationSeconds: 0.14, gain: 0.32 },
        { frequency: null, durationSeconds: 0.08, gain: 0 },
        { frequency: 659, durationSeconds: 0.14, gain: 0.32 },
        { frequency: null, durationSeconds: 0.2, gain: 0 },
      ],
      call_connected: [
        { frequency: 988, durationSeconds: 0.08, gain: 0.28 },
        { frequency: 1318, durationSeconds: 0.14, gain: 0.26 },
      ],
    },
  };

  return profiles[preset][kind];
}

function createWavDataUri(segments: ToneSegment[]) {
  const totalSamples = Math.max(
    1,
    Math.round(
      segments.reduce((duration, segment) => duration + segment.durationSeconds, 0) * SAMPLE_RATE,
    ),
  );
  const pcmData = new Int16Array(totalSamples);
  let cursor = 0;

  for (const segment of segments) {
    const segmentSamples = Math.max(1, Math.round(segment.durationSeconds * SAMPLE_RATE));

    for (let index = 0; index < segmentSamples && cursor < totalSamples; index += 1) {
      if (!segment.frequency || segment.gain <= 0) {
        pcmData[cursor] = 0;
        cursor += 1;
        continue;
      }

      const progress = index / segmentSamples;
      const envelope = Math.min(progress / 0.08, 1) * Math.min((1 - progress) / 0.08, 1);
      const amplitude = Math.sin((2 * Math.PI * segment.frequency * index) / SAMPLE_RATE);
      pcmData[cursor] = Math.round(amplitude * 32767 * segment.gain * Math.max(envelope, 0.35));
      cursor += 1;
    }
  }

  const bytesPerSample = 2;
  const dataSize = pcmData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of pcmData) {
    view.setInt16(offset, sample, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

function getSoundDataUri(preset: NotificationSoundPreset, kind: SoundKind) {
  const cacheKey = `${preset}:${kind}`;
  const cached = soundCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const nextUri = createWavDataUri(getToneProfile(preset, kind));
  soundCache.set(cacheKey, nextUri);
  return nextUri;
}

function getAudioSource(preset: NotificationSoundPreset, kind: SoundKind) {
  if (kind === 'incoming_call') {
    return whatsappIncomingCallSoundUrl;
  }

  if (preset === 'classic' && kind === 'notification') {
    return notificationSoundUrl;
  }

  return getSoundDataUri(preset, kind);
}

function buildAudioElement(
  preset: NotificationSoundPreset,
  kind: SoundKind,
  volume: number,
  options?: { loop?: boolean },
) {
  const audio = new Audio(getAudioSource(preset, kind));
  audio.preload = 'auto';
  audio.loop = Boolean(options?.loop);
  audio.volume = Math.max(0, Math.min(1, volume));
  return audio;
}

export function previewNotificationSound(
  kind: SoundKind,
  preferences: Pick<NotificationPreferences, 'soundPreset' | 'volume'>,
) {
  const audio = buildAudioElement(preferences.soundPreset, kind, preferences.volume);
  void audio.play().catch(() => undefined);
}

export function playNotificationChime(
  preferences: Pick<NotificationPreferences, 'enabled' | 'soundEnabled' | 'soundPreset' | 'volume'>,
) {
  if (!preferences.enabled || !preferences.soundEnabled) {
    return;
  }

  previewNotificationSound('notification', preferences);
}

export function startCallLoopSound(
  kind: 'incoming_call' | 'outgoing_call',
  preferences: Pick<
    NotificationPreferences,
    'callSoundEnabled' | 'soundPreset' | 'volume'
  >,
) {
  if (!preferences.callSoundEnabled) {
    return;
  }

  const existing = loopingAudios.get(kind);

  if (existing) {
    existing.volume = Math.max(0, Math.min(1, preferences.volume));
    return;
  }

  const audio = buildAudioElement(kind === 'incoming_call' ? preferences.soundPreset : preferences.soundPreset, kind, preferences.volume, {
    loop: true,
  });
  loopingAudios.set(kind, audio);
  void audio.play().catch(() => undefined);
}

export function stopCallLoopSound(kind?: 'incoming_call' | 'outgoing_call') {
  const sounds = kind ? [kind] : Array.from(loopingAudios.keys());

  for (const soundKind of sounds) {
    const audio = loopingAudios.get(soundKind);

    if (!audio) {
      continue;
    }

    audio.pause();
    audio.currentTime = 0;
    loopingAudios.delete(soundKind);
  }
}

export function playCallConnectedSound(
  preferences: Pick<NotificationPreferences, 'callSoundEnabled' | 'soundPreset' | 'volume'>,
) {
  if (!preferences.callSoundEnabled) {
    return;
  }

  previewNotificationSound('call_connected', preferences);
}
