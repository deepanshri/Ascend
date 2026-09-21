/**
 * Procedural audio chime & throttled haptic feedback utility for Ascend.
 * Pure Web Audio API synthesis (zero external audio files) + Capacitor Haptics.
 * Safe for rapid multi-swiping: throttled to prevent continuous vibration queues.
 * Does NOT mutate momentum_events.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const SOUND_SETTING_STORAGE_KEY = 'ascend_setting_sound';
export const COMPLETION_SOUND_STORAGE_KEY = 'ascend_completion_sound';
export const VIBRATION_SETTING_STORAGE_KEY = 'ascend_setting_vibration';

/**
 * Check if sound effects are enabled in user preferences.
 * Defaults to true for new installs.
 */
export function isCompletionSoundEnabled(): boolean {
  try {
    const setting = localStorage.getItem(SOUND_SETTING_STORAGE_KEY);
    if (setting !== null) {
      return setting !== 'false' && setting !== '0';
    }
    const legacy = localStorage.getItem(COMPLETION_SOUND_STORAGE_KEY);
    if (legacy !== null) {
      return legacy !== 'false' && legacy !== '0';
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Set sound effects preference in localStorage.
 */
export function setCompletionSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_SETTING_STORAGE_KEY, enabled ? 'true' : 'false');
    localStorage.setItem(COMPLETION_SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Check if haptic vibration is enabled in user preferences.
 * Defaults to true for new installs.
 */
export function isHapticVibrationEnabled(): boolean {
  try {
    const setting = localStorage.getItem(VIBRATION_SETTING_STORAGE_KEY);
    if (setting !== null) {
      return setting !== 'false' && setting !== '0';
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Set haptic vibration preference in localStorage.
 */
export function setHapticVibrationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VIBRATION_SETTING_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore storage errors */
  }
}

// Lazy AudioContext singleton (respects browser autoplay/suspend restrictions)
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Triumphant high-register Web Audio victory chime (< 1 second).
 * Sequence: C6 (1046.50 Hz) -> E6 (1318.51 Hz) -> G6 (1567.98 Hz)
 * Rapid 120ms step spacing with smooth exponential decay.
 * Boosted master gain (0.80) ensures a rich, crisp level-up arpeggio
 * that finishes in ~420ms (strictly < 600ms) with zero distortion or overlap clipping.
 */
export function playCompletionSound(): void {
  if (!isCompletionSoundEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t0 = ctx.currentTime;

    // Master gain node with ceiling protection (0.80 gain)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.80, t0);
    masterGain.connect(ctx.destination);

    const notes = [
      { freq: 1046.50, start: 0, peakGain: 0.78, dur: 0.16 },       // C6
      { freq: 1318.51, start: 0.12, peakGain: 0.80, dur: 0.16 },    // E6
      { freq: 1567.98, start: 0.24, peakGain: 0.82, dur: 0.18 },    // G6
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteStart = t0 + note.start;
      const noteEnd = noteStart + note.dur;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, noteStart);

      // Smooth exponential envelope: rapid 12ms attack -> decay to 0.0001
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(note.peakGain, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(noteStart);
      osc.stop(noteEnd + 0.02);
    }
  } catch {
    /* AudioContext might be blocked before first user gesture — silently ignore */
  }
}

// 100ms throttle timestamp to protect against queued vibrations during rapid multi-swipes
let lastHapticTimestamp = 0;
const HAPTIC_THROTTLE_MS = 100;

/**
 * Throttled, ultra-short haptic pulse.
 * Respects user vibration preference (ascend_setting_vibration).
 * Uses Capacitor Haptics (ImpactStyle.Light) with a 100ms throttle guard.
 * Rapidly swiping 2–3 cards in sequence produces distinct, crisp taps
 * instead of stacking into an unbroken vibration queue.
 */
export async function triggerCompletionHaptic(_kind?: 'full' | 'fallback'): Promise<void> {
  if (!isHapticVibrationEnabled()) return;

  const now = Date.now();
  if (now - lastHapticTimestamp < HAPTIC_THROTTLE_MS) {
    return;
  }
  lastHapticTimestamp = now;

  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: _kind === 'fallback' ? ImpactStyle.Light : ImpactStyle.Medium });
      return;
    }
  } catch {
    /* fall back to web vibration if plugin fails */
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(_kind === 'fallback' ? 8 : 12);
    }
  } catch {
    /* ignore unsupported devices */
  }
}

/**
 * Convenience helper to fire both haptic and sound in one call.
 */
export function triggerCompletionFeedback(_kind?: 'full' | 'fallback'): void {
  void triggerCompletionHaptic(_kind);
  playCompletionSound();
}
